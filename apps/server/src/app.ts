import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { analyzeBinary, srmCheck, verdict, MIN_EXPOSURES, SRM_P_THRESHOLD, WINNER_PROB_BEST } from '@cep/stats';
import { compileConfig, getResults, getWeights, listExperiments } from './db.ts';

const EVENT_TYPES = new Set(['exposure', 'track', 'identify']);
const MAX_BATCH = 100;
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const str = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : null);

export function createApp(db: DatabaseSync, opts: { demoDir: string; sdkFile: string; dashboardDir?: string }) {
  const app = new Hono();
  app.use('/v1/*', cors());

  app.get('/v1/config/:envKey', (c) => c.json(compileConfig(db)));

  app.post('/v1/events', async (c) => {
    // SDK sends text/plain (avoids CORS preflight, works with sendBeacon), so parse manually.
    let body: any;
    try {
      body = JSON.parse(await c.req.text());
    } catch {
      return c.json({ error: 'invalid json' }, 400);
    }
    const events = body?.events;
    if (!Array.isArray(events) || events.length > MAX_BATCH) {
      return c.json({ error: 'events must be an array of <= 100' }, 400);
    }

    const rows: unknown[][] = [];
    for (const e of events) {
      const unitId = str(e?.unitId);
      if (!EVENT_TYPES.has(e?.type) || !unitId || !Number.isFinite(e?.ts)) {
        return c.json({ error: 'invalid event', event: e }, 400);
      }
      if (e.type === 'exposure' && (!str(e.experimentKey) || !str(e.variantKey))) {
        return c.json({ error: 'exposure needs experimentKey and variantKey' }, 400);
      }
      if (e.type === 'track' && !str(e.name)) return c.json({ error: 'track needs name' }, 400);
      rows.push([
        e.type, unitId, str(e.userId), str(e.experimentKey), str(e.variantKey), str(e.name),
        e.props && typeof e.props === 'object' ? JSON.stringify(e.props).slice(0, 4000) : null,
        Math.trunc(e.ts), Date.now(),
      ]);
    }
    const insert = db.prepare(
      'INSERT INTO event (type, unit_id, user_id, experiment_key, variant_key, name, props_json, ts, received_at) VALUES (?,?,?,?,?,?,?,?,?)',
    );
    db.exec('BEGIN');
    try {
      for (const r of rows) insert.run(...(r as any[]));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return c.json({ accepted: rows.length });
  });

  app.get('/v1/results/:experimentKey', (c) => {
    const key = c.req.param('experimentKey');
    const variants = getResults(db, key);
    if (!variants) return c.json({ error: 'not found' }, 404);
    const counts = variants.map((v) => ({ key: v.variant, exposures: v.exposures, conversions: v.conversions }));
    const stats = analyzeBinary(counts);
    const weights = getWeights(db, key);
    const wsum = weights.reduce((a, b) => a + b, 0) || 1;
    const srm = srmCheck(counts.map((v) => v.exposures), weights);
    return c.json({
      experiment: key,
      variants: variants.map((v, i) => ({
        ...v,
        probBeatControl: stats[i].probBeatControl,
        probBest: stats[i].probBest,
        lift: stats[i].lift,
        expectedLoss: stats[i].expectedLoss,
        expectedWeight: weights[i] / wsum,
      })),
      srm,
      verdict: verdict(counts, stats, srm),
      thresholds: { minExposures: MIN_EXPOSURES, srmPValue: SRM_P_THRESHOLD, winnerProbBest: WINNER_PROB_BEST },
    });
  });

  app.get('/v1/experiments', (c) => c.json({ experiments: listExperiments(db) }));

  app.get('/dashboard', async (c) => {
    try {
      return c.body(await readFile(join(opts.dashboardDir ?? '', 'dashboard.html')), 200, { 'Content-Type': MIME['.html'] });
    } catch {
      return c.text('dashboard not found', 404);
    }
  });

  app.get('/sdk/cep.js', async (c) => {
    try {
      return c.body(await readFile(opts.sdkFile), 200, { 'Content-Type': MIME['.js'] });
    } catch {
      return c.text('sdk not built: run npm run build -w @cep/sdk', 404);
    }
  });

  app.get('/*', async (c) => {
    let path = normalize(c.req.path).replace(/^([/\\])+/, '');
    if (!path || path.endsWith('/') || path.endsWith('\\')) path += 'index.html';
    if (path.includes('..')) return c.text('not found', 404);
    try {
      const data = await readFile(join(opts.demoDir, path));
      return c.body(data, 200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    } catch {
      return c.text('not found', 404);
    }
  });

  return app;
}
