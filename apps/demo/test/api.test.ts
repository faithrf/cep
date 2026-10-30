import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';
import { openDb } from '../src/db.ts';

const setup = () => {
  const app = createApp(openDb(':memory:'));
  return async (user: string | null, method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { ...(user ? { 'x-demo-user': user } : {}), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };
};

test('requires user header', async () => {
  const call = setup();
  assert.equal((await call(null, 'GET', '/api/summary')).status, 401);
});

test('projects, tasks and summary counts', async () => {
  const call = setup();
  assert.deepEqual((await call('u1', 'GET', '/api/summary')).json, { projects: 0, openTasks: 0, members: 1 });
  const p = await call('u1', 'POST', '/api/projects', { name: '  Launch  ' });
  assert.equal(p.status, 201);
  assert.equal(p.json.name, 'Launch');
  const t1 = await call('u1', 'POST', `/api/projects/${p.json.id}/tasks`, { title: 'a' });
  await call('u1', 'POST', `/api/projects/${p.json.id}/tasks`, { title: 'b' });
  assert.deepEqual((await call('u1', 'GET', '/api/summary')).json, { projects: 1, openTasks: 2, members: 1 });
  assert.equal((await call('u1', 'POST', `/api/tasks/${t1.json.id}/toggle`)).json.done, true);
  assert.equal((await call('u1', 'GET', '/api/summary')).json.openTasks, 1);
  assert.equal((await call('u1', 'POST', `/api/tasks/${t1.json.id}/toggle`)).json.done, false);
  const list = (await call('u1', 'GET', '/api/projects')).json.projects;
  assert.equal(list.length, 1);
  assert.equal(list[0].tasks.length, 2);
});

test('users are isolated', async () => {
  const call = setup();
  const p = await call('u1', 'POST', '/api/projects', { name: 'x' });
  assert.equal((await call('u2', 'GET', '/api/projects')).json.projects.length, 0);
  assert.equal((await call('u2', 'POST', `/api/projects/${p.json.id}/tasks`, { title: 't' })).status, 404);
});

test('validation', async () => {
  const call = setup();
  assert.equal((await call('u1', 'POST', '/api/projects', { name: '   ' })).status, 400);
  assert.equal((await call('u1', 'POST', '/api/projects', { name: 'x'.repeat(81) })).status, 400);
  assert.equal((await call('u1', 'POST', '/api/projects', {})).status, 400);
  const p = await call('u1', 'POST', '/api/projects', { name: 'ok' });
  assert.equal((await call('u1', 'POST', `/api/projects/${p.json.id}/tasks`, { title: '' })).status, 400);
  assert.equal((await call('u1', 'POST', '/api/tasks/999/toggle')).status, 404);
});
