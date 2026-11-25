// Houses e2e (SPEC §7.4): walk up to a house, the door slides open, walk in (indoors, on the
// floor), and the walls block you.
import { launch, waitReady } from './browser.mjs';
import { serve } from './serve.mjs';

const server = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(server.url + '?nosw=1&play=1');
await waitReady(page);
await page.mouse.click(450, 300);
const setup = await page.evaluate(async () => {
  const h = window.__hotaru, g = h.game, c = g.controller, V = g.world.villages;
  const v = V.villages.find((v) => v.layout.def.id === 'inaho');
  const dr = v.doors[0], house = v.layout.houses[0];
  const out = dr.door.pos.clone().sub(new h.THREE.Vector3(house.x, dr.door.pos.y, house.z)).setY(0).normalize();
  const start = dr.door.pos.clone().addScaledVector(out, 3.2);
  c.placeAt(start.x, start.z);
  // face the door (forward is −z rotated by yaw)
  c.yaw = Math.atan2(out.x, out.z);
  c.pitch = 0;
  window.__probe = { opened: 0 };
  const tick = () => { window.__probe.opened = Math.max(window.__probe.opened, dr.open); requestAnimationFrame(tick); };
  tick();
  return { indoors: V.indoors(c.position), floorY: house.floorY };
});
await page.waitForTimeout(500);
await page.keyboard.down('KeyW');
let inside = false, feet = 0;
for (let i = 0; i < 80 && !inside; i++) {
  await page.waitForTimeout(150);
  ({ inside, feet } = await page.evaluate(() => { const g = window.__hotaru.game; return { inside: g.world.villages.indoors(g.controller.position), feet: g.controller.position.y }; }));
}
await page.waitForTimeout(5000);
await page.keyboard.up('KeyW');
const end = await page.evaluate(() => { const h = window.__hotaru, g = h.game; return { still: g.world.villages.indoors(g.controller.position), opened: window.__probe.opened, space: h.audio?.mix.space ?? null, surface: h.audio?.surface() ?? null }; });
const r = { before: { indoors: setup.indoors }, opened: +end.opened.toFixed(2), inside, feet: +feet.toFixed(2), floorY: +setup.floorY.toFixed(2), still: end.still, space: end.space, surface: end.surface };
console.log(JSON.stringify({ ...r, errors }));
await browser.close();
server.stop();
const ok = !r.before.indoors && r.opened > 0.5 && r.inside && r.still && errors.length === 0;
if (!ok) { console.error('HOUSES TEST FAILED'); process.exit(1); }
console.log('HOUSES TEST PASSED');
