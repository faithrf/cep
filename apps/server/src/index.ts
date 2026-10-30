import { serve } from '@hono/node-server';
import { join } from 'node:path';
import { createApp } from './app.ts';
import { openDb, seed } from './db.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const db = openDb(join(import.meta.dirname, '..', 'data', 'cep.db'));
seed(db);

const app = createApp(db, {
  dashboardDir: join(import.meta.dirname, '..', 'public'),
  demoDir: join(root, 'apps', 'demo'),
  sdkFile: join(root, 'packages', 'sdk', 'dist', 'cep.js'),
});

serve({ fetch: app.fetch, port: 4000 }, () => console.log('cep server on http://localhost:4000'));
