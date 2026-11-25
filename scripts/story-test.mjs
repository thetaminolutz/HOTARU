// Story e2e (SPEC §19, §22, §23): 100+ secrets; festivals come from the calendar with scenery
// and crowds; the masked stranger gives the thousandth lantern once enough tablets are read;
// floating it on festival night plays the ending (the stranger unmasks, the garden blooms);
// kodama appear when you stand still in the cedar forest; dreams when you sleep at home.
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
  const h = window.__hotaru, g = h.game, c = g.controller, M = g.mystic, S = g.world.secrets, clock = h.clock;
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const out = { secrets: S.list.length, kinds: S.counts() };
  // tsukimi on day 3 of a new journey (autumn), in the evening, on the hill above Inaho
  clock.day = 3; clock.setHour(20);
  const spot = M.festivals.spotOf('tsukimi');
  c.placeAt(spot.x + 4, spot.z + 4);
  g.world.update(c.position);
  for (let i = 0; i < 30; i++) { M.update(0.1); g.world.people.update(0.1, c.position, clock.hour, clock.day, { rain: 0, snow: 0, storm: 0 }); }
  out.tsukimi = M.festivals.active?.id;
  out.crowd = g.world.people.people.filter((p) => p.visible && p.pos.distanceTo(spot) < 40).length;
  out.decor = !!g.world.scene.getObjectByName('festival-tsukimi')?.visible;
  out.festFound = S.found.has('fest-tsukimi');
  // the story: read 15 tablets, talk to the masked stranger
  for (let i = 0; i < 15; i++) S.found.add('tablet-' + i);
  const masked = g.world.people.people.find((p) => p.wanderer?.id === 'masked');
  g.talkTo(masked); g.dialogue = null;
  out.lantern = g.adv.inv.slots.includes('lantern1000');
  // the summer festival night: float it from the pier
  g.weather.seasonLock = 'summer'; clock.day = 3; clock.setHour(21);
  const pe = g.world.dock.anchors.pierEnd;
  c.placeAt(pe.x, pe.z); c.mode = 'walk';
  for (let i = 0; i < 5; i++) M.update(0.1);
  out.tanabata = M.festivals.active?.id;
  out.fireworks = M.festivals.group.children.some((o) => o.isPoints && o.visible);
  g.interactions.items.find((i) => i.id === 'float-lantern').use();
  out.started = M.ending.t >= 0;
  for (let i = 0; i < 400 && !M.ending.done; i++) { M.update(0.25); if (g.dialogue && M.ending.t > 46) g.dialogue = null; }
  out.done = M.ending.done; out.unmasked = !!masked.unmasked;
  out.bloom = !!g.world.scene.getObjectByName('castle-blooms')?.visible;
  out.sister = S.found.has('spirit-sister');
  // kodama: stand still in the cedar forest by day
  g.weather.seasonLock = null; clock.setHour(10);
  c.placeAt(-3500, -200);
  g.world.update(c.position);
  const look = new h.THREE.Vector3(0, 0, -1);
  for (let i = 0; i < 100; i++) M.spirits.update(0.1, i * 0.1, c.position, look, 10, 5, { cloud: 0.2, fog: 0, rain: 0 }, 0, false);
  out.kodama = M.spirits.group.children.filter((m) => m.visible && m.position.distanceTo(c.position) < 12).length;
  // dreams
  clock.setHour(23); const d0 = clock.day;
  g.interactions.items.find((i) => i.id === 'home-sleep').use();
  out.dream = { hour: +clock.hour.toFixed(1), nextDay: clock.day === d0 + 1, line: !!M.line };
  out.errorsInside = 0;
  await wait(200);
  return out;
});
console.log(JSON.stringify({ ...r, errors }, null, 1));
await browser.close();
server.stop();
const ok = r.secrets >= 100 && r.tsukimi === 'tsukimi' && r.crowd >= 5 && r.decor && r.festFound && r.lantern && r.tanabata === 'tanabata' && r.fireworks
  && r.started && r.done && r.unmasked && r.bloom && r.sister && r.kodama >= 3 && r.dream.nextDay && r.dream.line && errors.length === 0;
if (!ok) { console.error('STORY TEST FAILED'); process.exit(1); }
console.log('STORY TEST PASSED');
