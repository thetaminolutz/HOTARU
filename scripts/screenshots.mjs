// Milestone screenshots (SPEC §29): fixed seed/time/camera at iPad Air resolution (2360×1640).
// Usage: node scripts/screenshots.mjs [M1]   → docs/screenshots/M1/*.png
import { mkdirSync } from 'node:fs';
import { launch, waitReady } from './browser.mjs';
import { serve } from './serve.mjs';

const milestone = process.argv[2] ?? 'M1';
const out = new URL(`../docs/screenshots/${milestone}/`, import.meta.url);
mkdirSync(out, { recursive: true });

const M1_SHOTS = [
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

const M2_SHOTS = [
  { name: 'dock-night', q: 'shot=dock-night' },
  { name: 'lake-dusk', q: 'shot=lake-dusk' },
  { name: 'castle-view', q: 'shot=castle-view' },
  { name: 'maple-golden', q: 'shot=maple-golden' },
  { name: 'cedar-forest', q: 'shot=cedar-forest' },
  { name: 'coast-day', q: 'shot=coast-day' },
  { name: 'snow-pass', q: 'shot=snow-pass' },
  { name: 'rice-valley', q: 'shot=rice-valley' },
  { name: 'flyover', q: 'shot=flyover' },
  { name: 'dock-day', q: 'shot=dock-day' },
];

// M3: the player. Each shot starts a game (?play=1) and poses the player.
const setup = (fn, arg) => async (page) => page.evaluate(fn, arg);
const pose = (hour, body) => setup(new Function('hour', `
  const h = window.__hotaru, g = h.game, c = g.controller, d = g.world.dock;
  h.clock.setHour(hour); h.clock.paused = true; g.pipeline.buildLutNow(hour);
  ${body}
`), hour);
const M3_SHOTS = [
  { name: 'pier-prompt', q: 'play=1', wait: 2500, action: pose(18.3, `const e = d.anchors.pierEnd; c.placeAt(e.x + 0.4, e.z + 1.4); c.yaw = 0; c.pitch = -0.32;`) },
  { name: 'sitting-dusk', q: 'play=1', wait: 2500, action: pose(17.7, `g.interactions.nearest('sit', d.anchors.pierEnd).use();`) },
  { name: 'lying-night', q: 'play=1', wait: 2500, action: pose(22.2, `const s = d.anchors.shore; c.placeAt(s.x + 14, s.z + 30); c.cyclePose(); c.cyclePose(); c.yaw = 0.6;`) },
  { name: 'swimming', q: 'play=1', wait: 3000, action: pose(16.2, `c.placeAt(-40, 150); c.yaw = 0.3; c.pitch = 0.05;`) },
  { name: 'touch-hud', q: 'play=1', touch: true, wait: 2500, action: pose(18.3, `const e = d.anchors.pierEnd; c.placeAt(e.x + 0.4, e.z + 1.4); c.yaw = 0; c.pitch = -0.32;`) },
  { name: 'settings-camera', q: '', wait: 1500, action: setup(() => { const u = window.__hotaru.ui; u.show('settings'); u.settings.tab = 'camera'; }) },
  { name: 'settings-keys', q: '', wait: 1500, action: setup(() => { const u = window.__hotaru.ui; u.show('settings'); u.settings.tab = 'keys'; }) },
];

const M4_SHOTS = ['lake-dusk', 'dock-night', 'great-waterfall', 'mountain-river', 'river-dusk', 'forest-pond', 'coast-surf']
  .map((n) => ({ name: n, q: 'shot=' + n }));

const M5_SHOTS = ['dock-night', 'dock-day', 'cedar-forest', 'meadow-flowers', 'cherry-hills', 'bamboo-grove', 'pampas-moor', 'reed-marsh', 'hydrangea-hills', 'rice-valley']
  .map((n) => ({ name: n, q: 'shot=' + n }));

const M7_SHOTS = ['market-street', 'market-dusk', 'villages-night', 'interior-day', 'interior-night', 'thatch-village', 'harbour', 'onsen-village', 'shrine-torii']
  .map((n) => ({ name: n, q: 'shot=' + n }));

const M8_SHOTS = ['temple-deer', 'village-cats', 'farm-animals', 'lake-ducks', 'onsen-macaques', 'marsh-cranes', 'meadow-wildlife', 'forest-night']
  .map((n) => ({ name: n, q: 'shot=' + n }));

const M6_SHOTS = ['spring-cherry', 'summer-rice', 'maple-golden', 'winter-village', 'winter-lake', 'rain-market', 'storm-lake', 'fog-cedar', 'sunshower', 'snow-onsen', 'summer-night']
  .map((n) => ({ name: n, q: 'shot=' + n }));

const M9_SHOTS = [
  ...['plaza-evening', 'lantern-round', 'farm-work', 'rain-umbrellas', 'children-play', 'shrine-monk'].map((n) => ({ name: n, q: 'shot=' + n })),
  { name: 'talk', q: 'play=1', wait: 3500, action: setup(() => {
    const h = window.__hotaru, g = h.game, c = g.controller;
    h.clock.setHour(10.5); h.clock.paused = true; g.pipeline.buildLutNow(10.5);
    const akari = g.world.people.people.find((p) => p.wanderer?.id === 'akari');
    akari.pos.set(c.position.x + 2, c.position.y - 1.6, c.position.z - 0.5); akari.visible = true;
    c.lookAt(akari.pos.clone().setY(akari.pos.y + 1.4));
    g.talkTo(akari); g.dialogue.shown = 999;
  }) },
];

const M13_SHOTS = [
  { name: 'settings-sound', q: '', wait: 1500, action: setup(() => { const u = window.__hotaru.ui; u.show('settings'); u.settings.tab = 'sound'; }) },
];

const SHOTS = { M1: M1_SHOTS, M2: M2_SHOTS, M3: M3_SHOTS, M4: M4_SHOTS, M5: M5_SHOTS, M6: M6_SHOTS, M7: M7_SHOTS, M8: M8_SHOTS, M9: M9_SHOTS, M13: M13_SHOTS }[milestone] ?? M3_SHOTS;

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
  await page.screenshot({ path: new URL(`${s.name}.png`, out).pathname, timeout: 180000 });
  console.log(`${s.name}: ${((Date.now() - t0) / 1000).toFixed(1)}s${errors.length ? ' ERRORS: ' + errors.join(' | ') : ''}`);
  await context.close();
}
await browser.close();
server.stop();
