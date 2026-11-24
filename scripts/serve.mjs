// Starts `vite preview` on the built dist/ for e2e scripts (unless URL is given).
import { spawn } from 'node:child_process';
export async function serve(port = 4173) {
  if (process.env.URL) return { url: process.env.URL, stop: () => undefined };
  const p = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('preview did not start')), 20000);
    p.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); resolve(); } });
  });
  return { url: `http://localhost:${port}/`, stop: () => { try { process.kill(-p.pid, 'SIGTERM'); } catch { p.kill(); } } };
}
