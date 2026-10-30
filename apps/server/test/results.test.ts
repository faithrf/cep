import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, seed, getResults } from '../src/db.ts';

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
