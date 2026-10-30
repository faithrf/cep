import { test } from 'node:test';
import assert from 'node:assert/strict';
import { murmur3, bucket } from '../src/bucketing.ts';

test('murmur3 matches known vectors', () => {
  assert.equal(murmur3('', 0), 0);
  assert.equal(murmur3('', 1), 0x514e28b7);
  assert.equal(murmur3('test', 0), 0xba6bd213);
  assert.equal(murmur3('Hello, world!', 0), 0xc0363e43);
  assert.equal(murmur3('The quick brown fox jumps over the lazy dog', 0), 0x2e4ff723);
  assert.equal(murmur3('aaaa', 0x9747b28c), 0x5a97808a);
});

const variants = [
  { key: 'control', weight: 5000 },
  { key: 'b', weight: 5000 },
];

test('bucketing is stable for the same unit', () => {
  const first = bucket('user-42', 'welcome-modal', 'salt1', variants);
  for (let i = 0; i < 100; i++) assert.equal(bucket('user-42', 'welcome-modal', 'salt1', variants), first);
});

test('50/50 split within 2% over 20k ids', () => {
  const n = 20000;
  let b = 0;
  for (let i = 0; i < n; i++) {
    const id = 'u_' + Math.random().toString(36).slice(2) + i;
    if (bucket(id, 'welcome-modal', 'salt1', variants) === 'b') b++;
  }
  assert.ok(Math.abs(b / n - 0.5) < 0.02, `b share was ${b / n}`);
});

test('uneven weights are respected', () => {
  const v = [{ key: 'a', weight: 1000 }, { key: 'b', weight: 9000 }];
  let a = 0;
  for (let i = 0; i < 20000; i++) if (bucket('x' + i, 'e', 's', v) === 'a') a++;
  assert.ok(Math.abs(a / 20000 - 0.1) < 0.02);
});
