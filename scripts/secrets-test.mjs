// Secrets e2e (SPEC §20): there are 50+ things to find; offerings restore a shrine over days;
// a viewpoint pans with a haiku; a tablet reads; walking into a cave counts; the hidden gate
// opens; the keep's floors are separate storeys you can stand on.
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
  const h = window.__hotaru, g = h.game, c = g.controller, S = g.world.secrets, L = g.world.landmarks;
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const use = (id) => g.interactions.items.find((i) => i.id === id).use();
  const out = { total: S.list.length, counts: S.counts() };
  // offerings on three days
  h.clock.day = 1; use('shrine-island'); const l1 = S.shrineState['shrine-island'].level;
  use('shrine-island'); const same = S.shrineState['shrine-island'].level;
  h.clock.day = 2; use('shrine-island'); h.clock.day = 3; use('shrine-island');
  out.shrine = [l1, same, S.shrineState['shrine-island'].level];
  g.dialogue = null;
  // a viewpoint
  const v = S.list.find((s) => s.id === 'view-pier');
  c.placeAt(v.pos.x, v.pos.z); use('view-pier');
  await wait(300);
  out.view = { sitting: c.sitting, pan: !!g.viewPan, haiku: g.viewPan?.haiku };
  c.cyclePose(); c.cyclePose(); c.mode = 'walk';
  // a tablet
  use('tablet-0'); out.tablet = g.dialogue?.lines[0]; g.dialogue = null;
  // walk into the waterfall cave
  const cave = g.world.world.sites.grottos.find((x) => x.id === 'waterfall');
  c.placeAt(cave.x, cave.z); await wait(800);
  out.cave = S.found.has('place-waterfall');
  out.caveFloor = +(c.position.y - cave.floor).toFixed(2);
  // the hidden gate
  const before = g.interactions.items.find((i) => i.id === 'hidden-gate');
  before.use(); out.gate = L.gateOpen;
  // keep storeys: standing on the ground floor isn't lifted to the top
  const px = L.keepCenter.x + 0.5, pz = L.keepCenter.z + 0.5;
  const floors = [...new Set(L.decks.filter((d) => px > d[0] && px < d[2] && pz > d[1] && pz < d[3]).map((d) => d[4]))].sort((a, b) => a - b);
  const base = floors[0];
  out.keep = { storeys: floors.length, ground: +(g.world.groundHeight(px, pz, base + 0.05) - base).toFixed(2), top: +(g.world.groundHeight(px, pz) - base).toFixed(1) };
  out.found = S.found.size;
  return out;
});
console.log(JSON.stringify({ ...r, errors }, null, 1));
await browser.close();
server.stop();
const ok = r.total >= 50 && r.shrine[0] === 1 && r.shrine[1] === 1 && r.shrine[2] === 3 && r.view.sitting && r.view.pan && r.tablet && r.cave && r.gate > 0
  && r.keep.storeys >= 5 && Math.abs(r.keep.ground) < 0.01 && r.keep.top > 10 && errors.length === 0;
if (!ok) { console.error('SECRETS TEST FAILED'); process.exit(1); }
console.log('SECRETS TEST PASSED');
