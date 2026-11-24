// Quick single screenshot: node scripts/shot.mjs "<query>" out.png [width height dpr]
import { launch, waitReady } from './browser.mjs';
const [, , query = 'shot=dock-night', out = 'shot.png', w = '1180', h = '820', dpr = '2'] = process.argv;
const base = process.env.URL ?? 'http://localhost:5173/';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(base + '?' + query, { waitUntil: 'load' });
await waitReady(page);
await page.waitForTimeout(+(process.env.WAIT ?? 2500));
await page.screenshot({ path: out });
if (errors.length) console.log(errors.slice(0, 20).join('\n'));
await browser.close();
