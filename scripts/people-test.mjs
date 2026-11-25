// Villagers e2e (SPEC §16): the villages are inhabited through a day — people move between
// home, work and the plaza, the lantern maker lights every lantern at dusk, umbrellas come out
// in the rain, and you can talk to them.
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
  const h = window.__hotaru, g = h.game, c = g.controller, P = g.world.people, V = g.world.villages;
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const vil = V.villages.find((v) => v.layout.def.id === 'ichiba').layout.def;
  c.placeAt(vil.x + 15, vil.z + 15);
  h.clock.paused = false;
  const out = { total: P.people.length, wanderers: P.people.filter((p) => p.wanderer).length, hours: {} };
  for (const hour of [8, 12.5, 19.8, 23]) {
    h.clock.setHour(hour); h.clock.timeScale = 0; await wait(1500);
    const here = P.people.filter((p) => p.village === 'ichiba');
    const before = here.map((p) => p.pos.clone());
    for (let i = 0; i < 100; i++) P.update(0.1, c.position, hour, 0, g.weather.out);
    const moved = here.filter((p, i) => p.pos.distanceTo(before[i]) > 0.5).length;
    out.hours[hour] = { visible: here.filter((p) => p.visible).length, inside: here.filter((p) => p.inside).length, moving: moved, acts: [...new Set(here.map((p) => p.act))].join(',') };
  }
  // the lantern round: at 17.3 lanterns go on one by one
  h.clock.setHour(16.9); await wait(800);
  for (const l of V.lanterns.filter((l) => l.village === 'ichiba')) V.setLantern(l, false);
  h.clock.setHour(17.3); h.clock.timeScale = 0;
  const lm = P.people.find((p) => p.village === 'ichiba' && p.job === 'lanternMaker');
  // software GL renders ~1 fps here, so step the village simulation directly (90 s of game time)
  for (let i = 0; i < 900; i++) { P.update(0.1, c.position, 17.3, 0, g.weather.out); if (V.lanterns.filter((l) => l.village === 'ichiba' && l.lit).length >= 3) break; }
  out.litDuringRound = V.lanterns.filter((l) => l.village === 'ichiba' && l.lit).length;
  out.lanternMakerAct = lm?.act;
  // rain → umbrellas
  g.setClimate('autumn', 7, 'rain'); h.clock.setHour(13); g.weather.update(1, 0.016, 0, 13, 'market', 0, true); await wait(1500);
  out.umbrellas = P.people.filter((p) => p.village === 'ichiba' && p.visible && p.umbrella).length;
  // talk to someone nearby
  const someone = P.people.find((p) => p.village === 'ichiba' && p.visible && !p.inside);
  g.talkTo(someone);
  out.dialogue = g.dialogue ? g.dialogue.lines : null;
  out.met = P.memory.met[someone.id];
  return out;
});
console.log(JSON.stringify({ ...r, errors }, null, 1));
await browser.close();
server.stop();
const day = r.hours['12.5'], night = r.hours['23'];
const ok = r.total >= 60 && r.wanderers >= 15 && r.hours['8'].moving + day.moving + r.hours['19.8'].moving > 0 && night.visible < day.visible
  && r.litDuringRound >= 3 && r.umbrellas > 0 && r.dialogue && r.dialogue.length >= 1 && r.met === 1 && errors.length === 0;
if (!ok) { console.error('PEOPLE TEST FAILED'); process.exit(1); }
console.log('PEOPLE TEST PASSED');
