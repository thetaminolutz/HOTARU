// Items e2e (SPEC §10–11, §21): keepsakes can be picked up (12 slots), given, stored at home;
// people hand you tools; fishing always lands a fish without fail states; the rowboat floats
// and lands; the journal, map and photo mode open; photos and sketches go into the album.
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
  const h = window.__hotaru, g = h.game, c = g.controller, A = g.adv, inv = A.inv, ui = h.ui;
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const out = { pickups: A.pickups.list.length, kinds: [...new Set(A.pickups.list.map((p) => p.item))].length };
  // pick up 13 things: the 13th doesn't fit
  const avail = A.pickups.available(A.journey.picked, h.clock.day);
  for (const p of avail.slice(0, 13)) A.pick(p);
  out.slots = 12 - inv.free; out.left = A.pickups.available(A.journey.picked, h.clock.day).length;
  out.rebuilt = !!A.pickups.group.children.length;
  // store one at home, take it back
  A.store(0); out.stored = inv.stored.length; A.take(0); out.back = 12 - inv.free;
  // tools from people: Genzō gives the rod, then (later) the boat
  const genzo = g.world.people.people.find((p) => p.wanderer?.id === 'oldFisher');
  g.talkTo(genzo); out.rod = inv.tools.has('rod'); g.dialogue = null;
  g.talkTo(genzo); out.boat = inv.tools.has('boat'); g.dialogue = null;
  // give a keepsake to Genzō
  const item = inv.slots.find((s) => s);
  out.gift = A.give(item, genzo).length > 0;
  // fishing at the end of the pier: cast, wait, bite, reel; missing a bite is harmless
  const pe = g.world.dock.anchors.pierEnd;
  c.placeAt(pe.x, pe.z - 1); c.yaw = 0; c.pitch = -0.2;
  inv.current = 'rod';
  A.useTool();
  out.cast = A.fishing.state;
  const F = A.fishing;
  let missed = false, landed = null;
  for (let i = 0; i < 2000 && !landed; i++) {
    const press = F.state === 'bite' && (missed || F.t > 1.7 ? true : false);
    if (F.state === 'bite' && !missed && F.t > 1.5) missed = true;
    const got = F.update(0.05, F.state === 'bite' && missed && F.t > 0.2, F.state === 'reel', 20, 2, false);
    if (got) landed = { id: got.id, size: F.size };
    void press;
  }
  out.fish = landed; out.water = F.water; out.missedBiteOk = missed;
  F.stop();
  // the rowboat: board, row out, come back and step ashore
  A.boardBoat();
  out.boating = A.boating && c.mode === 'boat';
  const b = A.boat, x0 = b.x, z0 = b.z;
  for (let i = 0; i < 200; i++) b.update(0.05, 1, 0);
  out.rowed = +Math.hypot(b.x - x0, b.z - z0).toFixed(1);
  out.floats = b.floats(b.x, b.z);
  b.x = x0; b.z = z0;
  out.ashore = A.leaveBoat(); out.walk = c.mode === 'walk';
  // journal, map, photo
  g.input.journalPressed = true; await wait(400); out.journal = ui.screen;
  ui.journal.tab = 'Creatures'; await wait(300);
  g.input.menuPressed = true; await wait(400); out.closed = ui.screen;
  g.input.mapPressed = true; await wait(1500); out.map = ui.screen;
  g.input.mapPressed = true; await wait(400);
  g.input.photoPressed = true; await wait(400); out.photo = ui.screen;
  g.photo.filter = 2; await wait(400);
  g.photo.shoot('photo'); g.photo.shoot('sketch');
  out.album = A.journey.album.map((e) => e.kind + ':' + e.w + 'x' + e.h);
  g.input.menuPressed = true; await wait(400); out.afterPhoto = ui.screen; out.filterReset = g.pipeline.filter;
  // the save round-trip
  const j = JSON.parse(JSON.stringify(A.toJSON()));
  out.saveKb = Math.round(JSON.stringify(j).length / 1024);
  A.load(j); out.reloaded = 12 - inv.free;
  out.explored = A.journey.explored > 0;
  return out;
});
console.log(JSON.stringify({ ...r, errors }, null, 1));
await browser.close();
server.stop();
const ok = r.pickups >= 60 && r.kinds >= 12 && r.slots === 12 && r.stored === 1 && r.back === 12 && r.rod && r.boat && r.gift
  && r.cast === 'cast' && r.fish && r.fish.size > 0 && r.missedBiteOk && r.boating && r.rowed > 5 && r.ashore && r.walk
  && r.journal === 'journal' && r.closed === 'play' && r.map === 'map' && r.photo === 'photo' && r.album.length === 2 && r.afterPhoto === 'play' && r.filterReset === 0
  && r.reloaded >= 11 && r.explored && errors.length === 0;
if (!ok) { console.error('ITEMS TEST FAILED'); process.exit(1); }
console.log('ITEMS TEST PASSED');
