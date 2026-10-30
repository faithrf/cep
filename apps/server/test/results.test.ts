import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, seed, getResults, compileConfig } from '../src/db.ts';
import { createApp } from '../src/app.ts';

function insert(db: ReturnType<typeof openDb>, type: string, unit: string, ts: number, extra: { v?: string; name?: string } = {}) {
  db.prepare('INSERT INTO event (type, unit_id, experiment_key, variant_key, name, ts, received_at) VALUES (?,?,?,?,?,?,0)')
    .run(type, unit, type === 'exposure' ? 'welcome-modal' : null, extra.v ?? null, extra.name ?? null, ts);
}

test('results count distinct exposed units and post-exposure conversions', () => {
  const db = openDb(':memory:');
  seed(db);
  // control: u1 exposed twice, converts after; u2 exposed, no conversion
  insert(db, 'exposure', 'u1', 100, { v: 'control' });
  insert(db, 'exposure', 'u1', 150, { v: 'control' });
  insert(db, 'track', 'u1', 200, { name: 'project_created' });
  insert(db, 'track', 'u1', 210, { name: 'project_created' });
  insert(db, 'exposure', 'u2', 100, { v: 'control' });
  // b: u3 converted BEFORE exposure (not counted); u4 converts after; u5 other event only
  insert(db, 'track', 'u3', 50, { name: 'project_created' });
  insert(db, 'exposure', 'u3', 100, { v: 'b' });
  insert(db, 'exposure', 'u4', 100, { v: 'b' });
  insert(db, 'track', 'u4', 120, { name: 'project_created' });
  insert(db, 'exposure', 'u5', 100, { v: 'b' });
  insert(db, 'track', 'u5', 130, { name: 'other' });
  // converter who was never exposed
  insert(db, 'track', 'u6', 300, { name: 'project_created' });

  const r = Object.fromEntries(getResults(db, 'welcome-modal')!.map((x) => [x.variant, x]));
  assert.deepEqual([r.control.exposures, r.control.conversions, r.control.conversionRate], [2, 1, 0.5]);
  assert.equal(r.b.exposures, 3);
  assert.equal(r.b.conversions, 1);
  assert.equal(getResults(db, 'nope'), null);
});

test('config orders variants by position, not key', () => {
  const db = openDb(':memory:');
  seed(db);
  // Rename 'b' so key order would flip; position must still win.
  db.prepare("UPDATE variant SET key = 'a-renamed' WHERE key = 'b'").run();
  const keys = compileConfig(db).experiments[0].variants.map((v) => v.key);
  assert.deepEqual(keys, ['control', 'a-renamed']);
  assert.deepEqual(getResults(db, 'welcome-modal')!.map((v) => v.variant), ['control', 'a-renamed']);
});

test('migrates an M1 database (no position column)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cep-'));
  const file = join(dir, 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE variant (experiment_key TEXT NOT NULL, key TEXT NOT NULL, weight INTEGER NOT NULL, flow_json TEXT NOT NULL, PRIMARY KEY (experiment_key, key));
    INSERT INTO variant VALUES ('e','b',1,'{}'),('e','control',1,'{}');`);
  old.close();
  const db = openDb(file);
  const rows = db.prepare('SELECT key FROM variant ORDER BY position').all() as { key: string }[];
  assert.deepEqual(rows.map((r) => r.key), ['control', 'b']);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('results include stats, srm, verdict and expected weights', async () => {
  const db = openDb(':memory:');
  seed(db);
  let u = 0;
  const fill = (v: string, n: number, conv: number) => {
    for (let i = 0; i < n; i++) {
      const id = `u${u++}`;
      insert(db, 'exposure', id, 100, { v });
      if (i < conv) insert(db, 'track', id, 200, { name: 'project_created' });
    }
  };
  fill('control', 1000, 100);
  fill('b', 1000, 140);
  const app = createApp(db, { demoDir: '.', sdkFile: '.' });
  const r: any = await (await app.request('/v1/results/welcome-modal')).json();
  assert.equal(r.variants[0].variant, 'control');
  assert.equal(r.variants[0].probBeatControl, null);
  assert.equal(r.variants[1].expectedWeight, 0.5);
  assert.ok(r.variants[1].probBeatControl > 0.95);
  assert.ok(r.variants[1].lift.low < r.variants[1].lift.mean && r.variants[1].lift.mean < r.variants[1].lift.high);
  assert.equal(r.srm.flagged, false);
  assert.ok(typeof r.srm.pValue === 'number' && typeof r.srm.chi2 === 'number');
  assert.ok(['winner', 'running'].includes(r.verdict));
  const exps: any = await (await app.request('/v1/experiments')).json();
  assert.equal(exps.experiments[0].key, 'welcome-modal');
});
