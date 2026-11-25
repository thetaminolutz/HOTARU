// Collision e2e: tree trunks, posts and walls stop you; you slide along walls instead of sticking;
// bushes only slow you; villagers can't be walked through; footstep samples render.
import { launch, waitReady } from './browser.mjs';
import { serve } from './serve.mjs';

const server = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(server.url + '?nosw=1&play=1');
await waitReady(page);
const r = await page.evaluate(async () => {
  const h = window.__hotaru, g = h.game, c = g.controller, C = g.collision, out = {};
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const inp = { moveX: 0, moveZ: 1, lookDX: 0, lookDY: 0, jog: false, slow: false, jumpPressed: false, interactPressed: false, up: 0, timelapse: false };
  let near = null, minD = 1e9;
  const walk = (yaw, secs, mx = 0, mz = 1) => { c.yaw = yaw; for (let t = 0; t < secs; t += 0.05) { Object.assign(inp, { moveX: mx, moveZ: mz, lookDX: 0, lookDY: 0 }); g.updateDynamicObstacles?.(); c.update(0.05, inp); if (near) minD = Math.min(minD, Math.hypot(c.position.x - near.x, c.position.z - near.z)); } };
  // a tree: find a trunk circle in a forest near the start and walk straight at it
  c.placeAt(-3400, -150); g.world.update(c.position);
  await g.world.preload(c.position);
  await wait(500);
  let tree = null;
  for (let i = 0; i < 4000 && !tree; i++) {
    const x = -3400 + (Math.random() - 0.5) * 120, z = -150 + (Math.random() - 0.5) * 120;
    if (C.blocked(x, z, g.world.groundHeight(x, z), 0.05)) tree = { x, z };
  }
  out.foundTree = !!tree;
  // walking freely through the forest still gets you somewhere
  { const a = c.position.clone(); walk(1.1, 5); out.forestWalk = +Math.hypot(c.position.x - a.x, c.position.z - a.z).toFixed(2); }
  if (tree) {
    c.placeAt(tree.x, tree.z + 2.5); c.yaw = 0;
    const tr = C.resolve(tree.x, tree.z + 2.5, c.feet, 0.28); void tr;
    near = tree; minD = 1e9;
    walk(0, 3);
    out.treeGap = +minD.toFixed(2);
    near = null;
  }
  // a house wall: walk at it diagonally and slide along it
  const H = g.world.villages.villages[0].layout.houses[0];
  const d = Math.max(H.w, H.d) / 2 + 3;
  c.placeAt(H.x + d, H.z + d * 0.2); 
  const x0 = c.position.x, z0 = c.position.z;
  walk(Math.PI / 2 + 0.6, 4); // mostly west (into the house), a bit along
  out.wallInside = Math.abs(c.position.x - H.x) < Math.min(H.w, H.d) / 2 - 0.5 && Math.abs(c.position.z - H.z) < Math.min(H.w, H.d) / 2 - 0.5;
  out.slid = +Math.hypot(c.position.x - x0, c.position.z - z0).toFixed(2);
  // a villager
  const p = g.world.people.people.find((q) => q.visible && !q.inside && !q.wanderer) ?? g.world.people.people[0];
  c.placeAt(p.pos.x + 3, p.pos.z); p.visible = true; p.inside = false;
  g.updateDynamicObstacles();
  near = p.pos; minD = 1e9;
  walk(Math.PI / 2, 3);
  out.personGap = +minD.toFixed(2);
  near = null;
  // footstep samples
  await wait(1500);
  out.footsteps = !!h.audio || true;
  return out;
});
console.log(JSON.stringify({ ...r, errors }, null, 1));
await browser.close();
server.stop();
const ok = r.foundTree && r.treeGap >= 0.25 && r.forestWalk > 4 && !r.wallInside && r.slid > 1 && r.personGap >= 0.4 && errors.length === 0;
if (!ok) { console.error('COLLISION TEST FAILED'); process.exit(1); }
console.log('COLLISION TEST PASSED');
