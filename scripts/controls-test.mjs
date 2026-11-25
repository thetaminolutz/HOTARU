// M3 controls test: drives the real game with keyboard input and checks movement physics.
// Headless software GL renders slowly (dt is capped at 0.1 s), so holds are generous.
import { launch, waitReady } from './browser.mjs';
import { serve } from './serve.mjs';

const server = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const results = {};
let ok = false;
try {
  await page.goto(server.url + '?nosw=1&play=1', { waitUntil: 'load' });
  await waitReady(page);
  await page.waitForTimeout(1000);
  const st = () => page.evaluate(() => { const c = window.__hotaru.game.controller; return { x: c.position.x, y: c.position.y, z: c.position.z, feet: c.feet, pose: c.pose, yaw: c.yaw }; });
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

  // walk: face the pier and press W
  const s0 = await st();
  await page.evaluate(() => { const c = window.__hotaru.game.controller; c.yaw = 0; c.pitch = 0; });
  await hold('KeyW', 5000);
  const s1 = await st();
  results.walked = Math.hypot(s1.x - s0.x, s1.z - s0.z);

  // jump: feet go up, then land again
  const before = (await st()).feet;
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const mid = (await st()).feet;
  await page.waitForTimeout(5000);
  const after = (await st()).feet;
  results.jumpHeight = mid - before;
  results.landed = Math.abs(after - before) < 0.3;

  // swim: teleport into the deep lake
  await page.evaluate(() => { const c = window.__hotaru.game.controller; c.placeAt(0, 0); });
  await page.waitForTimeout(800);
  results.swimPose = (await st()).pose;

  // sit at the end of the pier, then time-lapse
  await page.evaluate(() => {
    const g = window.__hotaru.game, it = g.interactions.nearest('sit', g.world.dock.anchors.pierEnd);
    it.use();
  });
  await page.waitForTimeout(300);
  results.sitPose = (await st()).pose;
  const h0 = await page.evaluate(() => window.__hotaru.clock.hour);
  await hold('KeyT', 3000);
  const h1 = await page.evaluate(() => window.__hotaru.clock.hour);
  results.timelapseHours = (h1 - h0 + 24) % 24;
  // standing up by walking
  await hold('KeyS', 400);
  results.stoodUp = (await st()).pose !== 'sit';

  // colliders: walking into the boathouse is blocked
  await page.evaluate(() => {
    const g = window.__hotaru.game, b = g.world.dock.anchors.boathouse, c = g.controller;
    c.placeAt(b.x + 9, b.z); c.yaw = Math.PI / 2; c.pitch = 0; // facing west, toward the boathouse
  });
  await hold('KeyW', 3000);
  results.outsideBoathouse = await page.evaluate(() => {
    const g = window.__hotaru.game, b = g.world.dock.anchors.boathouse, c = g.controller;
    return c.position.x > b.x + 3.5 - 0.01;
  });

  // Apple Pencil: a pen tap on the right of the screen turns the view toward it
  await page.evaluate(() => { const c = window.__hotaru.game.controller; c.placeAt(0, 330); c.yaw = 0; c.pitch = 0; });
  const yawBefore = (await st()).yaw;
  await page.evaluate(() => {
    const el = document.getElementById('ui');
    const opts = (type) => ({ pointerId: 7, pointerType: 'pen', clientX: innerWidth * 0.85, clientY: innerHeight * 0.5, bubbles: true, isPrimary: true, pressure: 0.5, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
    el.dispatchEvent(new PointerEvent('pointerdown', opts('pointerdown')));
    el.dispatchEvent(new PointerEvent('pointerup', opts('pointerup')));
  });
  await page.waitForTimeout(3000);
  results.penTurn = yawBefore - (await st()).yaw; // turning right lowers yaw

  ok = results.penTurn > 0.2 && results.walked > 1 && results.jumpHeight > 0.2 && results.landed && results.swimPose === 'swim'
    && results.sitPose === 'sit' && results.timelapseHours > 0.1 && results.stoodUp && results.outsideBoathouse;
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  server.stop();
}
console.log(ok ? 'CONTROLS TEST PASSED' : 'CONTROLS TEST FAILED');
process.exit(ok ? 0 : 1);
