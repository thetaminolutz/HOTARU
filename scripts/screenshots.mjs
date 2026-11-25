// Milestone screenshots (SPEC §29): fixed seed/time/camera at iPad Air resolution (2360×1640).
// Usage: node scripts/screenshots.mjs [M1]   → docs/screenshots/M1/*.png
import { mkdirSync } from 'node:fs';
import { launch, waitReady } from './browser.mjs';
import { serve } from './serve.mjs';

const milestone = process.argv[2] ?? 'M1';
const out = new URL(`../docs/screenshots/${milestone}/`, import.meta.url);
mkdirSync(out, { recursive: true });

const SHOTS = [
  { name: 'dock-night', q: 'shot=dock-night' },
  { name: 'lake-dusk', q: 'shot=lake-dusk' },
  { name: 'dock-golden', q: 'shot=dock-golden' },
  { name: 'dock-day', q: 'shot=dock-day' },
  { name: 'lake-night', q: 'shot=lake-night' },
  { name: 'pier-end-night', q: 'shot=pier-end' },
  { name: 'title', q: '', wait: 2500 },
  { name: 'ui-gallery', q: 'ui=gallery', wait: 600 },
  { name: 'settings', q: '', wait: 1500, action: async (page) => page.evaluate(() => window.__hotaru.ui.show('settings')) },
  { name: 'play-touch-hud', q: 'play=1', touch: true, wait: 2500 },
];

const server = await serve();
const browser = await launch();
const only = process.env.ONLY?.split(',');
for (const s of SHOTS) {
  if (only && !only.includes(s.name)) continue;
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: !!s.touch, isMobile: false });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const t0 = Date.now();
  await page.goto(server.url + '?nosw=1&' + s.q, { waitUntil: 'load' });
  await waitReady(page, 240000);
  if (s.action) await s.action(page);
  await page.waitForTimeout(s.wait ?? 2000);
  await page.screenshot({ path: new URL(`${s.name}.png`, out).pathname });
  console.log(`${s.name}: ${((Date.now() - t0) / 1000).toFixed(1)}s${errors.length ? ' ERRORS: ' + errors.join(' | ') : ''}`);
  await context.close();
}
await browser.close();
server.stop();
