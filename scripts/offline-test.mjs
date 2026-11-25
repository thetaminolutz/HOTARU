// SPEC §29 offline test: load once (service worker precaches everything), start a game so a
// save exists, go offline, reload, and check the game boots, renders and the save loads.
import { launch, waitReady } from './browser.mjs';
import { serve } from './serve.mjs';

const server = await serve();
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let ok = false;
try {
  await page.goto(server.url, { waitUntil: 'load' });
  await waitReady(page);
  // wait until the service worker is active and controls the page
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: 'load' });
  await waitReady(page);
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  // start a journey and save
  await page.evaluate(async () => { const h = window.__hotaru; h.ui.title.widgets[1].onTap(); await h.save(); });
  const saved = await page.evaluate(async () => (await window.__hotaru.readSave()) !== null);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await waitReady(page);
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async () => {
    const h = window.__hotaru;
    const px = h.readInternal();
    let lit = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 30) lit++;
    return { saveLoaded: (await h.readSave()) !== null, litPixels: lit, mode: h.state.mode };
  });
  ok = controlled && saved && res.saveLoaded && res.litPixels > 1000;
  console.log(JSON.stringify({ controlled, saved, ...res, errors }, null, 1));
} finally {
  await browser.close();
  server.stop();
}
console.log(ok ? 'OFFLINE TEST PASSED' : 'OFFLINE TEST FAILED');
process.exit(ok ? 0 : 1);
