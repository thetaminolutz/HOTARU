// Headless performance capture with the in-game benchmark (software GL here, so numbers only
// catch regressions; real numbers come from the iPad via the debug panel).
// Usage: SECONDS=20 node scripts/perf.mjs
import { launch, waitReady } from './browser.mjs';
import { serve } from './serve.mjs';
const seconds = Number(process.env.SECONDS ?? 20);
const server = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
await page.goto(server.url + '?nosw=1&play=1', { waitUntil: 'load' });
await waitReady(page, 240000);
const line = await page.evaluate((secs) => new Promise((resolve) => {
  const b = window.__hotaru.bench;
  b.duration = secs;
  b.onDone = (l) => resolve(l);
  b.start(['low', 'medium', 'high']);
}), seconds);
console.log(line);
await browser.close();
server.stop();
