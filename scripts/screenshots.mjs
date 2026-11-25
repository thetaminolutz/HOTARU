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

const M10_SHOTS = [
  ...['castle-approach', 'castle-courtyard', 'keep-balcony', 'temple-stair', 'waterfall-cave', 'ice-cave', 'sea-cave'].map((n) => ({ name: n, q: 'shot=' + n })),
  { name: 'shrine-island', q: 'shot=shrine-island', action: setup(() => { const s = window.__hotaru.game.world.secrets; s.shrineState['shrine-island'] = { level: 3, lastDay: 0 }; s.refresh(); }) },
  { name: 'viewpoint-haiku', q: 'play=1', wait: 9000, action: setup(() => {
    const h = window.__hotaru, g = h.game;
    h.clock.setHour(17.4); h.clock.paused = true; g.pipeline.buildLutNow(17.4);
    const it = g.interactions.items.find((i) => i.id === 'view-pier');
    g.controller.placeAt(it.pos.x, it.pos.z); it.use();
  }) },
  { name: 'tablet', q: 'play=1', wait: 3500, action: setup(() => {
    const h = window.__hotaru, g = h.game;
    h.clock.setHour(15); h.clock.paused = true; g.pipeline.buildLutNow(15);
    const it = g.interactions.items.find((i) => i.id === 'tablet-4');
    g.controller.placeAt(it.pos.x + 1.5, it.pos.z + 1.5); g.controller.lookAt(it.pos); it.use(); g.dialogue.shown = 999;
  }) },
];

const M13_SHOTS = [
  { name: 'settings-sound', q: '', wait: 1500, action: setup(() => { const u = window.__hotaru.ui; u.show('settings'); u.settings.tab = 'sound'; }) },
];


// M11: items, journal, map, photo mode, sketchbook, fishing, rowing, your garden
const prep = `
  const h = window.__hotaru, g = h.game, c = g.controller, d = g.world.dock, A = g.adv, inv = A.inv, ui = h.ui;
  const hour = (x) => { h.clock.setHour(x); h.clock.paused = true; g.pipeline.buildLutNow(x); };
  for (const t of ['lantern', 'rod', 'flute', 'boat', 'umbrella']) inv.give(t);
  for (const k of ['shell', 'feather', 'flower', 'persimmon', 'crane', 'omamori', 'foxMask', 'tea']) inv.add(k);
  inv.stored.push('stone', 'coin', 'chime');
  for (const s of ['sikaDeer', 'tanuki', 'fox', 'macaque']) A.journey.see(s, 0);
  A.journey.caught('carp', 62, 0); A.journey.caught('ayu', 18, 1); A.journey.caught('lanternFish', 9, 2);
`;
const act = (body) => setup(new Function(prep + body));
const M11_SHOTS = [
  { name: 'journal-items', q: 'play=1', wait: 3000, action: act(`hour(18); const e = d.anchors.pierEnd; c.placeAt(e.x, e.z + 2); inv.current = 'lantern'; g.input.journalPressed = true;
    setTimeout(() => { ui.journal.sel = { kind: 'slot', i: 6 }; }, 300);`) },
  { name: 'journal-creatures', q: 'play=1', wait: 3000, action: act(`hour(18); g.input.journalPressed = true; setTimeout(() => { ui.journal.tab = 'Creatures'; }, 300);`) },
  { name: 'map', q: 'play=1', wait: 9000, action: act(`hour(18);
    const path = [[0, 300], [400, 300], [900, 600], [1500, 1500], [1500, 2400], [-200, 3050], [-200, 1200], [-150, -900], [-150, -1250], [-1200, -800], [-1800, -1400]];
    for (let i = 1; i < path.length; i++) for (let k = 0; k <= 40; k++) { const [x0, z0] = path[i - 1], [x1, z1] = path[i]; A.journey.revealAt(x0 + (x1 - x0) * k / 40, z0 + (z1 - z0) * k / 40, 220); }
    for (const id of ['lake', 'market', 'rice', 'castle', 'wisteria']) A.journey.visit(id, 0);
    A.journey.visit('v-ichiba', 0); A.journey.visit('v-inaho', 1);
    A.journey.stamps.push({ x: 1500, z: 1500, icon: 6 }, { x: -150, z: -1250, icon: 2 }, { x: 200, z: 40, icon: 3 }, { x: -1800, z: -1400, icon: 4 });
    A.journey.strokes.push({ pts: [300, 200, 500, 260, 700, 420, 820, 520], w: [1, 1.6, 2.2, 1.4], color: 0x2a1e24 });
    g.input.mapPressed = true;`) },
  { name: 'fishing-bite', q: 'play=1', wait: 4000, action: act(`hour(18.2); const e = d.anchors.pierEnd; c.placeAt(e.x + 1.2, e.z - 1.5); c.yaw = 0.15; c.pitch = -0.28; inv.current = 'rod'; A.useTool();
    setTimeout(() => { const F = A.fishing; F.state = 'bite'; F.t = 0.3; F.fish = null; F.note = 'A bite!'; const orig = F.update.bind(F); F.update = (...a) => { F.t = 0.3; return orig(...a); }; }, 1500);`) },
  { name: 'fish-landed', q: 'play=1', wait: 3000, action: act(`hour(7.5); const e = d.anchors.pierEnd; c.placeAt(e.x + 1.2, e.z - 1.5); c.yaw = 0.15; c.pitch = -0.1; inv.current = 'rod';
    const f = { id: 'lanternFish', name: 'Lantern fish', text: 'A little light swims under the pier at night.', colors: ['#3a4a6a', '#ffd070'] }; A.landed = { fish: f, size: 11, best: true, t: -60 };`) },
  { name: 'rowing-dusk', q: 'play=1', wait: 4000, action: act(`hour(17.6); A.boardBoat(); A.boat.x -= 30; A.boat.z -= 60; A.boat.heading = Math.PI * 0.9; c.yaw = A.boat.heading + Math.PI + 0.3; c.pitch = -0.15; inv.current = 'lantern';`) },
  { name: 'lantern-night', q: 'play=1', wait: 4000, action: act(`hour(22.5); const s = d.anchors.shore; c.placeAt(s.x + 22, s.z + 40); c.yaw = 2.6; c.pitch = -0.12; inv.current = 'lantern';`) },
  { name: 'photo-ukiyoe', q: 'play=1', wait: 4000, action: act(`hour(17.2); const s = d.anchors.shore; c.placeAt(s.x + 1, s.z + 3); c.lookAt(d.anchors.pierEnd.clone().setY(2)); g.input.photoPressed = true;
    setTimeout(() => { g.photo.filter = 2; g.photo.frame = 2; }, 300);`) },
  { name: 'photo-self-portrait', q: 'play=1', wait: 4000, action: act(`hour(16.5); const s = d.anchors.shore; c.placeAt(s.x + 1, s.z + 3); c.lookAt(d.anchors.pierEnd.clone().setY(2)); g.input.photoPressed = true;
    setTimeout(() => { g.photo.selfie = true; c.position.x += 3.2; c.position.z -= 3.5; c.position.y += 0.3; c.yaw += 2.4; c.pitch = -0.1; }, 300);`) },
  { name: 'album-sketch', q: 'play=1', wait: 6000, action: act(`hour(16); const s = d.anchors.shore; c.placeAt(s.x + 1, s.z + 3); c.lookAt(d.anchors.pierEnd.clone().setY(2));
    setTimeout(() => { g.photo.enter(); g.photo.shoot('sketch'); g.photo.shoot('photo'); g.photo.exit(); g.input.journalPressed = true; }, 1500);
    setTimeout(() => { ui.journal.tab = 'Album'; }, 2000);`) },
  { name: 'garden-chest', q: 'play=1', wait: 4000, action: act(`hour(10); A.garden = [0, 0, 1, 2]; h.clock.day = 4; const G = A.gardenPos; c.placeAt(G.x + 5, G.z + 4); c.lookAt(G.clone().setY(G.y + 1.6));`) },
];

// M12: festivals, spirits, world events, the ending
const prep12 = `
  const h = window.__hotaru, g = h.game, c = g.controller, d = g.world.dock, M = g.mystic, S = g.world.secrets, ui = h.ui;
  const at = (day, hour, lock) => { g.weather.seasonLock = lock ?? null; g.weather.set('clear', 99); h.clock.day = day; h.clock.setHour(hour); h.clock.paused = true; g.pipeline.buildLutNow(hour); };
  g.onToast = () => {};
  const step = (n = 20) => { for (let i = 0; i < n; i++) { M.update(0.1); g.world.people.update(0.1, c.position, h.clock.hour, h.clock.day, { rain: 0, snow: 0, storm: 0 }); } };
`;
const act12 = (body) => setup(new Function(prep12 + body));
const M12_SHOTS = [
  { name: 'lantern-festival', q: 'play=1', wait: 6000, action: act12(`at(3, 21.3, 'summer'); const pe = d.anchors.pierEnd; c.placeAt(pe.x - 1, pe.z + 4); c.lookAt(pe.clone().add(new h.THREE.Vector3(-30, 22, -150))); step(40);`) },
  { name: 'festival-stalls', q: 'play=1', wait: 6000, action: act12(`at(3, 19.6, 'summer'); const sp = M.festivals.spotOf('tanabata'); c.placeAt(sp.x - 14, sp.z + 2); c.lookAt(sp.clone().add(new h.THREE.Vector3(8, 1.5, 4))); step(60);`) },
  { name: 'tsukimi', q: 'play=1', wait: 6000, action: act12(`at(3, 20.2); const sp = M.festivals.spotOf('tsukimi'); c.placeAt(sp.x - 3, sp.z + 5); step(60); setTimeout(() => { const m = g.tod.moonDir; c.yaw = Math.atan2(-m.x, -m.z); c.pitch = 0.22; }, 300);`) },
  { name: 'hanami-night', q: 'play=1', wait: 6000, action: act12(`at(3, 20.5, 'spring'); g.onToast = () => {}; const sp = M.festivals.spotOf('hanami'); c.placeAt(sp.x - 22, sp.z + 6); c.lookAt(sp.clone().setY(sp.y + 2)); step(60);`) },
  { name: 'snow-lanterns', q: 'play=1', wait: 6000, action: act12(`at(3, 21.5, 'winter'); g.weather.set('snow', 99); const sp = M.festivals.spotOf('yukitoro'); c.placeAt(sp.x + 6, sp.z + 6); c.yaw = 0.8; c.pitch = -0.15; step(30);`) },
  { name: 'lantern-spirits', q: 'play=1', wait: 5000, action: act12(`at(4, 22); const pe = d.anchors.pierEnd; c.placeAt(pe.x, pe.z); c.yaw = 0.2; c.pitch = 0.02; step(10); h.clock.elapsed += 30; step(5);`) },
  { name: 'kodama', q: 'play=1', wait: 6000, action: act12(`at(5, 10.5); c.placeAt(-3500, -200); g.world.update(c.position); const look = new h.THREE.Vector3(0, 0, -1); for (let i = 0; i < 90; i++) M.spirits.update(0.1, i * 0.1, c.position, look, 10.5, 5, { cloud: 0.2, fog: 0, rain: 0 }, 0, false); c.yaw = 0; c.pitch = -0.35;`) },
  { name: 'forest-guardian', q: 'play=1', wait: 6000, action: act12(`at(5, 6.2); c.placeAt(-3500, -200); g.world.update(c.position); c.yaw = 0; c.pitch = 0.18; step(10);`) },
  { name: 'castle-echo', q: 'play=1', wait: 6000, action: act12(`at(5, 18.2); const C = g.world.world.sites.castle; c.placeAt(C.x + 6, C.z + 30); c.lookAt(new h.THREE.Vector3(C.x + 10, C.level + 0.8, C.z + 22)); for (let i = 0; i < 60; i++) M.update(0.1);`) },
  { name: 'aurora', q: 'play=1', wait: 6000, action: act12(`at(6, 23, 'winter'); const s = d.anchors.shore; c.placeAt(s.x + 4, s.z); c.yaw = 0; c.pitch = 0.35; for (let i = 0; i < 300; i++) M.update(0.1);`) },
  { name: 'red-moon', q: 'play=1', wait: 5000, action: act12(`const day = [...Array(300).keys()].find((k) => window.__ev && 0) ?? 0; M.events.eclipse = 1; at(4, 1.5); const s = d.anchors.shore; c.placeAt(s.x + 4, s.z); M.update = () => {}; g.world.sky.uniforms.uEclipse.value = 1; g.world.sky.uniforms.uMoonScale.value = 1.3; setTimeout(() => c.lookAt(c.position.clone().add(g.tod.moonDir.clone().multiplyScalar(100)).add(new h.THREE.Vector3(0, -12, 0))), 300);`) },
  { name: 'ending-firefly-path', q: 'play=1', wait: 6000, action: act12(`at(3, 21.4, 'summer'); for (let i = 0; i < 15; i++) S.found.add('tablet-' + i); const m = g.world.people.people.find((p) => p.wanderer?.id === 'masked'); g.talkTo(m); g.dialogue = null; const pe = d.anchors.pierEnd; c.placeAt(pe.x, pe.z); step(5); g.interactions.items.find((i) => i.id === 'float-lantern').use(); for (let i = 0; i < 100; i++) M.update(0.25);`) },
  { name: 'ending-unmasked', q: 'play=1', wait: 5000, action: act12(`at(3, 21.4, 'summer'); for (let i = 0; i < 15; i++) S.found.add('tablet-' + i); const m = g.world.people.people.find((p) => p.wanderer?.id === 'masked'); g.talkTo(m); g.dialogue = null; const pe = d.anchors.pierEnd; c.placeAt(pe.x, pe.z); step(5); g.interactions.items.find((i) => i.id === 'float-lantern').use(); for (let i = 0; i < 180; i++) M.update(0.25); if (g.dialogue) { g.dialogue.index = 2; g.dialogue.shown = 200; } c.lookAt(m.pos.clone().setY(m.pos.y + 1.5));`) },
  { name: 'garden-bloom', q: 'play=1', wait: 5000, action: act12(`at(7, 10, 'summer'); g.world.landmarks.setBloom(1); g.world.landmarks.openGate(); M.update = () => {}; const C = g.world.world.sites.castle; c.placeAt(C.x - 18, C.z - 37); c.lookAt(new h.THREE.Vector3(C.x - 16, C.level + 0.2, C.z - 46));`) },
];

// M14: settings & comfort, saves, gentle hints, touch layouts, the title
const M14_SHOTS = [
  { name: 'title', q: '', wait: 3500 },
  { name: 'settings-graphics', q: '', wait: 1500, action: setup(() => { const u = window.__hotaru.ui; u.show('settings'); u.settings.tab = 'graphics'; }) },
  { name: 'settings-comfort', q: '', wait: 1500, action: setup(() => { const u = window.__hotaru.ui; u.show('settings'); u.settings.tab = 'comfort'; }) },
  { name: 'settings-saves', q: '', wait: 2500, action: setup(() => { const u = window.__hotaru.ui; u.show('settings'); u.settings.tab = 'saves'; }) },
  { name: 'settings-keys', q: '', wait: 1500, action: setup(() => { const u = window.__hotaru.ui; u.show('settings'); u.settings.tab = 'keys'; }) },
  { name: 'hint-akari', q: 'play=1', wait: 3000, action: setup(() => { const h = window.__hotaru, g = h.game; h.clock.setHour(18.4); h.clock.paused = true; g.pipeline.buildLutNow(18.4); localStorage.removeItem('hotaru.hints.v1'); h.ui.hud.toast('Akari: "It is getting dark. Come to the pier, I have a lantern for you."', 90); h.ui.hud.caption('a bush warbler sings', performance.now() / 1000 + 80); localStorage.setItem('hotaru.hints.v1', JSON.stringify(['welcome', 'journal', 'dusk', 'sit'])); }) },
  { name: 'touch-left-handed', q: 'play=1', touch: true, wait: 3000, action: setup(() => { const h = window.__hotaru; h.ui.hud.leftHanded = true; h.ui.hud.highContrast = true; h.clock.setHour(16); h.clock.paused = true; h.game.pipeline.buildLutNow(16); h.game.adv.inv.give('lantern'); h.game.adv.inv.current = 'lantern'; }) },
  { name: 'large-text-journal', q: 'play=1', wait: 3000, action: setup(() => { const h = window.__hotaru; localStorage.setItem('hotaru.settings.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('hotaru.settings.v1') ?? '{}') })); h.ui.ui.resize(h.game.pipeline.scale + 1); h.game.input.journalPressed = true; }) },
];

const SHOTS = { M1: M1_SHOTS, M2: M2_SHOTS, M3: M3_SHOTS, M4: M4_SHOTS, M5: M5_SHOTS, M6: M6_SHOTS, M7: M7_SHOTS, M8: M8_SHOTS, M9: M9_SHOTS, M10: M10_SHOTS, M11: M11_SHOTS, M12: M12_SHOTS, M14: M14_SHOTS, M13: M13_SHOTS }[milestone] ?? M3_SHOTS;

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
