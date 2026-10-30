import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBinary, chiSquarePValue, mulberry32, sampleBeta, srmCheck, verdict } from '../src/index.ts';

test('chi-square p-values at known critical values', () => {
  assert.ok(Math.abs(chiSquarePValue(3.841, 1) - 0.05) < 0.001);
  assert.ok(Math.abs(chiSquarePValue(5.991, 2) - 0.05) < 0.001);
});

test('SRM flags 5000 vs 4500 on 50/50 but not 5000 vs 4950', () => {
  assert.equal(srmCheck([5000, 4500], [1, 1]).flagged, true);
  assert.equal(srmCheck([5000, 4950], [1, 1]).flagged, false);
});

test('equal data gives P(beat) near 0.5', () => {
  const s = analyzeBinary([{ key: 'c', exposures: 1000, conversions: 100 }, { key: 'b', exposures: 1000, conversions: 100 }]);
  assert.ok(Math.abs(s[1].probBeatControl! - 0.5) < 0.03);
});

test('clear difference gives P(beat) > 0.99', () => {
  const s = analyzeBinary([{ key: 'c', exposures: 10000, conversions: 1000 }, { key: 'b', exposures: 10000, conversions: 1300 }]);
  assert.ok(s[1].probBeatControl! > 0.99);
  assert.ok(s[1].lift!.low > 0 && s[1].lift!.mean > 0.2 && s[1].lift!.mean < 0.4);
  assert.ok(s[0].expectedLoss > s[1].expectedLoss);
});

test('beta sampler mean is close to a/(a+b)', () => {
  const rng = mulberry32(7);
  let sum = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) sum += sampleBeta(rng, 3, 7);
  assert.ok(Math.abs(sum / n - 0.3) < 0.01);
  const rng2 = mulberry32(8); // shape < 1 path
  sum = 0;
  for (let i = 0; i < n; i++) sum += sampleBeta(rng2, 0.5, 1.5);
  assert.ok(Math.abs(sum / n - 0.25) < 0.01);
});

test('same seed gives identical results', () => {
  const v = [{ key: 'c', exposures: 500, conversions: 50 }, { key: 'b', exposures: 500, conversions: 60 }];
  assert.deepEqual(analyzeBinary(v, { seed: 1 }), analyzeBinary(v, { seed: 1 }));
});

test('verdict rules', () => {
  const ok = srmCheck([1000, 1000], [1, 1]);
  const mk = (e: number, c2: number) => [{ key: 'c', exposures: e, conversions: e / 10 }, { key: 'b', exposures: e, conversions: c2 }];
  const run = (v: ReturnType<typeof mk>, srm = ok) => verdict(v, analyzeBinary(v), srm);
  assert.equal(run(mk(50, 10)), 'not_enough_data');
  assert.equal(run(mk(1000, 100)), 'running');
  assert.equal(run(mk(1000, 160)), 'winner');
  assert.equal(run(mk(1000, 160), srmCheck([1000, 800], [1, 1])), 'srm');
});
