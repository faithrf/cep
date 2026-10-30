import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiment (
      key TEXT PRIMARY KEY, salt TEXT NOT NULL, status TEXT NOT NULL, primary_metric TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS variant (
      experiment_key TEXT NOT NULL, key TEXT NOT NULL, weight INTEGER NOT NULL, flow_json TEXT NOT NULL,
      PRIMARY KEY (experiment_key, key)
    );
    CREATE TABLE IF NOT EXISTS event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, unit_id TEXT NOT NULL, user_id TEXT,
      experiment_key TEXT, variant_key TEXT, name TEXT, props_json TEXT,
      ts INTEGER NOT NULL, received_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS event_exp ON event (experiment_key, type, unit_id);
  `);
  return db;
}

export function seed(db: DatabaseSync) {
  const exists = db.prepare('SELECT 1 FROM experiment WHERE key = ?').get('welcome-modal');
  if (exists) return;
  db.prepare('INSERT INTO experiment VALUES (?, ?, ?, ?)').run('welcome-modal', 'wm-salt-1', 'running', 'project_created');
  const ins = db.prepare('INSERT INTO variant VALUES (?, ?, ?, ?)');
  ins.run('welcome-modal', 'control', 5000, JSON.stringify({
    type: 'modal',
    headline: 'Welcome to TaskFlow',
    body: 'Organize your work in one place.',
    cta: 'Get started',
  }));
  ins.run('welcome-modal', 'b', 5000, JSON.stringify({
    type: 'modal',
    headline: 'Create your first project in 60 seconds',
    body: 'Pick a template and invite your team.',
    cta: 'Create a project',
  }));
}

export function compileConfig(db: DatabaseSync) {
  const exps = db.prepare("SELECT key, salt, primary_metric FROM experiment WHERE status = 'running'").all() as
    { key: string; salt: string; primary_metric: string }[];
  const getVariants = db.prepare('SELECT key, weight, flow_json FROM variant WHERE experiment_key = ?');
  return {
    experiments: exps.map((e) => ({
      key: e.key,
      salt: e.salt,
      primaryMetric: e.primary_metric,
      variants: (getVariants.all(e.key) as { key: string; weight: number; flow_json: string }[]).map((v) => ({
        key: v.key,
        weight: v.weight,
        flow: JSON.parse(v.flow_json),
      })),
    })),
  };
}

export interface VariantResult {
  variant: string;
  exposures: number;
  conversions: number;
  conversionRate: number;
}

/** Exposures = distinct exposed units; conversions = those who fired the primary metric at/after exposure. */
export function getResults(db: DatabaseSync, experimentKey: string): VariantResult[] | null {
  const exp = db.prepare('SELECT primary_metric FROM experiment WHERE key = ?').get(experimentKey) as
    { primary_metric: string } | undefined;
  if (!exp) return null;
  const rows = db.prepare(`
    SELECT v.key AS variant,
      (SELECT COUNT(DISTINCT e.unit_id) FROM event e
        WHERE e.type = 'exposure' AND e.experiment_key = v.experiment_key AND e.variant_key = v.key) AS exposures,
      (SELECT COUNT(DISTINCT e.unit_id) FROM event e
        WHERE e.type = 'exposure' AND e.experiment_key = v.experiment_key AND e.variant_key = v.key
          AND EXISTS (SELECT 1 FROM event c
            WHERE c.type = 'track' AND c.name = ? AND c.unit_id = e.unit_id AND c.ts >= e.ts)) AS conversions
    FROM variant v WHERE v.experiment_key = ? ORDER BY v.key
  `).all(exp.primary_metric, experimentKey) as { variant: string; exposures: number; conversions: number }[];
  return rows.map((r) => ({
    ...r,
    conversionRate: r.exposures ? r.conversions / r.exposures : 0,
  }));
}
