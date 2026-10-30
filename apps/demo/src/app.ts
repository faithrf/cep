import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';

export const MAX_NAME = 80;
const USER_RE = /^[A-Za-z0-9_-]{1,64}$/;

function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 && s.length <= MAX_NAME ? s : null;
}

export function createApp(db: DatabaseSync, opts: { indexFile?: string; cepHost?: string } = {}) {
  const app = new Hono<{ Variables: { userId: string } }>();

  app.get('/', async (c) => {
    try {
      const html = await readFile(opts.indexFile ?? '', 'utf8');
      return c.html(html.replaceAll('__CEP_HOST__', opts.cepHost ?? 'http://localhost:4000'));
    } catch {
      return c.text('not found', 404);
    }
  });

  app.use('/api/*', async (c, next) => {
    const id = c.req.header('x-demo-user') ?? '';
    if (!USER_RE.test(id)) return c.json({ error: 'missing or invalid X-Demo-User' }, 401);
    db.prepare('INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)').run(id, Date.now());
    db.prepare('INSERT OR IGNORE INTO members (user_id, name) VALUES (?, ?)').run(id, 'You');
    c.set('userId', id);
    await next();
  });

  const summary = (userId: string) => {
    const count = (sql: string) => (db.prepare(sql).get(userId) as { n: number }).n;
    return {
      projects: count('SELECT COUNT(*) n FROM projects WHERE user_id = ?'),
      openTasks: count('SELECT COUNT(*) n FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.user_id = ? AND t.done = 0'),
      members: count('SELECT COUNT(*) n FROM members WHERE user_id = ?'),
    };
  };

  const body = async (c: any): Promise<any> => {
    try {
      return await c.req.json();
    } catch {
      return null;
    }
  };

  app.get('/api/summary', (c) => c.json(summary(c.get('userId'))));

  app.get('/api/projects', (c) => {
    const projects = db
      .prepare('SELECT id, name, created_at AS createdAt FROM projects WHERE user_id = ? ORDER BY id DESC')
      .all(c.get('userId')) as any[];
    const tasks = db.prepare('SELECT id, title, done FROM tasks WHERE project_id = ? ORDER BY id');
    return c.json({
      projects: projects.map((p) => ({
        ...p,
        tasks: (tasks.all(p.id) as any[]).map((t) => ({ id: t.id, title: t.title, done: !!t.done })),
      })),
    });
  });

  app.post('/api/projects', async (c) => {
    const name = cleanName((await body(c))?.name);
    if (!name) return c.json({ error: `name required (1-${MAX_NAME} chars)` }, 400);
    const r = db.prepare('INSERT INTO projects (user_id, name, created_at) VALUES (?, ?, ?)').run(c.get('userId'), name, Date.now());
    return c.json({ id: Number(r.lastInsertRowid), name, tasks: [] }, 201);
  });

  app.post('/api/projects/:id/tasks', async (c) => {
    const pid = Number(c.req.param('id'));
    const owned = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(pid, c.get('userId'));
    if (!owned) return c.json({ error: 'project not found' }, 404);
    const title = cleanName((await body(c))?.title);
    if (!title) return c.json({ error: `title required (1-${MAX_NAME} chars)` }, 400);
    const r = db.prepare('INSERT INTO tasks (project_id, title, done, created_at) VALUES (?, ?, 0, ?)').run(pid, title, Date.now());
    return c.json({ id: Number(r.lastInsertRowid), title, done: false }, 201);
  });

  app.post('/api/tasks/:id/toggle', (c) => {
    const id = Number(c.req.param('id'));
    const t = db
      .prepare('SELECT t.id, t.done FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ? AND p.user_id = ?')
      .get(id, c.get('userId')) as { id: number; done: number } | undefined;
    if (!t) return c.json({ error: 'task not found' }, 404);
    const done = t.done ? 0 : 1;
    db.prepare('UPDATE tasks SET done = ? WHERE id = ?').run(done, id);
    return c.json({ id, done: !!done });
  });

  return app;
}
