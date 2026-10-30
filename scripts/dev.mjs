// Starts the cep server (4000) and the TaskFlow demo (3100) with prefixed logs.
import { spawn } from 'node:child_process';

let stopping = false;
const procs = [
  ['cep ', '@cep/server'],
  ['demo', '@cep/demo'],
].map(([tag, ws]) => {
  const p = spawn('npm', ['run', 'start', '-w', ws], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const pipe = (s, out) => {
    let buf = '';
    s.on('data', (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) out.write(`[${tag}] ${l}\n`);
    });
  };
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on('exit', (code) => {
    console.log(`[${tag}] exited ${code}`);
    shutdown();
  });
  return p;
});

function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    if (p.exitCode !== null) continue;
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/T', '/F']);
    else p.kill();
  }
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
