import { serve } from '@hono/node-server';
import { join } from 'node:path';
import { createApp } from './app.ts';
import { openDb } from './db.ts';

const db = openDb(join(import.meta.dirname, '..', 'data', 'demo.db'));
const app = createApp(db, {
  indexFile: join(import.meta.dirname, '..', 'public', 'index.html'),
  cepHost: process.env.CEP_HOST || 'http://localhost:4000', // where the cep SDK/API lives
});
const port = Number(process.env.PORT) || 3100;
serve({ fetch: app.fetch, port }, () => console.log(`TaskFlow demo on http://localhost:${port}`));
