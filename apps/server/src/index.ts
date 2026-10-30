import { serve } from '@hono/node-server';
import { join } from 'node:path';
import { createApp } from './app.ts';
import { openDb, seed } from './db.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const db = openDb(join(import.meta.dirname, '..', 'data', 'cep.db'));
seed(db);

const port = Number(process.env.PORT) || 4000;
const app = createApp(db, {
  dashboardDir: join(import.meta.dirname, '..', 'public'),
  sdkFile: join(root, 'packages', 'sdk', 'dist', 'cep.js'),
});

serve({ fetch: app.fetch, port }, () => console.log(`cep server on http://localhost:${port}`));
