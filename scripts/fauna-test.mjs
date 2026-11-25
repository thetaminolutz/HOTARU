// Fauna e2e (SPEC §15): something alive nearly everywhere, animals flee a jogging player,
// petting builds trust, deer bow back.
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
const out = await page.evaluate(async () => {
  const h = window.__hotaru, g = h.game, c = g.controller, F = g.world.fauna;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const places = [['lake', 30, 330], ['ichiba', 1500, 1500], ['inaho', -200, 3050], ['cedar', -3300, -150], ['coast', 4300, -900], ['marsh', 3700, 1700], ['snow', -400, -4100], ['kumoji', 2800, -2700], ['pampas', 600, -2600], ['bamboo', -2700, 1700]];
  const census = {};
  for (const hour of [9, 22]) {
    h.clock.setHour(hour);
    for (const [name, x, z] of places) {
      c.placeAt(x, z);
      await wait(700);
      census[name + '@' + hour] = F.stats.animals;
    }
  }
  // flee: put a deer 6 m ahead, then "jog" toward it
  h.clock.setHour(10);
  c.placeAt(2800, -2700);
  await wait(300);
  const [deer] = F.spawnAt('sikaDeer', c.position.x + 6, c.position.z, 1, 10, 0.1);
  await wait(300);
  c.vel.set(4.5, 0, 0); // pretend to jog
  F.update(0.05, c.position, 4.5, 10);
  const fled = deer.state;
  c.vel.set(0, 0, 0);
  // pet a cat
  const [cat] = F.spawnAt('cat', c.position.x + 1.5, c.position.z, 1, 10, 0.1);
  const before = F.trust.cat ?? 0;
  F.pet(cat);
  const after = F.trust.cat;
  // bow to a deer
  const [d2] = F.spawnAt('sikaDeer', c.position.x, c.position.z + 2, 1, 10, 0.1);
  F.bow(d2);
  await wait(1000);
  return { census, fled, catState: cat.state, trust: [before, after], bowState: d2.state };
});
console.log(JSON.stringify({ ...out, errors }, null, 1));
await browser.close();
server.stop();
const alive = Object.values(out.census).filter((n) => n > 0).length / Object.values(out.census).length;
const ok = alive >= 0.8 && out.fled === 'flee' && out.trust[1] > out.trust[0] && out.catState === 'petted' && out.bowState === 'bow' && errors.length === 0;
if (!ok) { console.error('FAUNA TEST FAILED (alive ' + alive + ')'); process.exit(1); }
console.log('FAUNA TEST PASSED (alive in ' + Math.round(alive * 100) + '% of places/times)');
