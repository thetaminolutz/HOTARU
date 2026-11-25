// Water e2e (SPEC §3.8): rivers above the lake are real water — you wade and swim at the river's
// own level; ripples spread where you move in the lake.
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
  const h = window.__hotaru, g = h.game, c = g.controller, hy = g.world.world.hydro;
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  // the widest point of the upper river above 20 m
  const up = hy.rivers.find((r) => r.id === 'upper');
  const p = up.pts.filter((p) => p.level > 20).sort((a, b) => b.width - a.width)[0];
  c.placeAt(p.x, p.z);
  await wait(1500);
  const river = { pose: c.pose, level: +p.level.toFixed(2), eye: +c.position.y.toFixed(2), waterLevel: +c.waterLevel().toFixed(2) };
  // ripples in the lake
  const S = g.world.dock.anchors.shore;
  c.placeAt(S.x - 30, S.z - 20);
  await wait(800);
  const rip = g.world.water.material.uniforms.uRipples.value.filter((v) => v.w > 0).length;
  return { river, lakePose: c.pose, ripples: rip, rivers: g.world.rivers.group.children.length, falls: hy.falls.length };
});
console.log(JSON.stringify({ ...r, errors }));
await browser.close();
server.stop();
const ok = (r.river.pose === 'swim' || r.river.pose === 'wade') && Math.abs(r.river.waterLevel - r.river.level) < 0.5 && r.ripples > 0 && errors.length === 0;
if (!ok) { console.error('WATER TEST FAILED'); process.exit(1); }
console.log('WATER TEST PASSED');
