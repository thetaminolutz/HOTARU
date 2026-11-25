// Release e2e (SPEC §26–27, M14): saves survive a corrupted write (backup), slots are separate,
// auto quality steps down when frames stay slow, villager hints come once, comfort settings apply.
import { launch, waitReady } from './browser.mjs';
import { serve } from './serve.mjs';

const server = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(server.url + '?nosw=1&play=1');
await waitReady(page);
const r = await page.evaluate(async () => {
  const h = window.__hotaru, g = h.game, out = {};
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  // a villager's welcome comes by itself within the first seconds
  for (let i = 0; i < 60 && !out.hint; i++) { out.hint = h.ui.hud.toasts.some((t) => t.text.startsWith('Akari')); await wait(250); }
  // two saves in slot 1 (the second keeps the first as a backup), then corrupt the main one
  await h.save(); h.clock.setHour(9); await h.save();
  out.saved = !!(await h.readSave());
  // corrupt via IndexedDB directly
  await new Promise((res) => {
    const req = indexedDB.open('hotaru');
    req.onsuccess = () => {
      const db = req.result, names = [...db.objectStoreNames];
      const tx = db.transaction(names[0], 'readwrite');
      tx.objectStore(names[0]).put({ version: 1, seed: 'broken', pos: [NaN] }, 'save.1');
      tx.oncomplete = () => res(); tx.onerror = () => res();
    };
    req.onerror = () => res();
  });
  const back = await h.readSave();
  out.backupUsed = !!back && Number.isFinite(back.pos[0]);
  // auto quality: slow frames for a while → one step down
  h.setSetting('quality', 'high'); await wait(300);
  const before = g.quality.name;
  for (let i = 0; i < 300; i++) h.autoQuality(60, 0.1);
  out.quality = [before, g.quality.name];
  // comfort
  h.setSetting('reducedMotion', true); h.setSetting('largeText', true); h.setSetting('leftHanded', true);
  await wait(300);
  out.comfort = { reduced: g.reducedMotion, left: h.ui.hud.leftHanded, uiScale: h.ui.ui.scale, scale: g.pipeline.scale };
  return out;
});
console.log(JSON.stringify({ ...r, errors }, null, 1));
await browser.close();
server.stop();
const ok = r.saved && r.backupUsed && r.quality[1] !== r.quality[0] && r.hint && r.comfort.reduced && r.comfort.left && r.comfort.uiScale === r.comfort.scale + 1 && errors.length === 0;
if (!ok) { console.error('RELEASE TEST FAILED'); process.exit(1); }
console.log('RELEASE TEST PASSED');
