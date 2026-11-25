// Where do the triangles and draws go? Per pass (shadow / reflection / main) and per object group
// in the main view, at a few spots, for one quality preset. Usage: Q=medium node scripts/perf-breakdown.mjs
import { launch, waitReady } from './browser.mjs';
import { serve } from './serve.mjs';
const server = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
await page.goto(server.url + `?nosw=1&play=1&quality=${process.env.Q ?? 'medium'}`, { waitUntil: 'load' });
await waitReady(page, 240000);
const out = await page.evaluate(async () => {
  const h = window.__hotaru, g = h.game, c = g.controller, T = h.THREE;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const spots = [['dock', null], ['ichiba', [1500, 1530]], ['forest', [-3400, -150]], ['castle', [-150, -1180]]];
  const res = [];
  for (const [name, p] of spots) {
    if (p) c.placeAt(p[0], p[1]);
    await g.world.preload(c.position);
    await wait(2500);
    const frustum = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(g.camera.projectionMatrix, g.camera.matrixWorldInverse));
    const groups = {};
    g.world.scene.children.forEach((top) => {
      let tri = 0, draws = 0;
      top.traverseVisible((o) => {
        if (!o.isMesh && !o.isPoints) return;
        const geo = o.geometry; if (!geo) return;
        if (o.frustumCulled !== false) { if (!geo.boundingSphere) geo.computeBoundingSphere(); const s = geo.boundingSphere.clone().applyMatrix4(o.matrixWorld); if (!frustum.intersectsSphere(s)) return; }
        const n = (geo.index ? geo.index.count : geo.attributes.position.count) / (o.isPoints ? 1 : 3);
        const inst = o.isInstancedMesh ? o.count : (geo.instanceCount ?? 1);
        tri += o.isPoints ? 0 : n * (Number.isFinite(inst) ? inst : 1); draws++;
      });
      const k = top.name || top.type;
      groups[k] = groups[k] ? [groups[k][0] + Math.round(tri / 1000), groups[k][1] + draws] : [Math.round(tri / 1000), draws];
    });
    res.push({ name, passTris: { ...g.pipeline.passTris }, passDraws: { ...g.pipeline.passDraws }, groups: Object.entries(groups).filter(([, v]) => v[0] > 15 || v[1] > 8).sort((a, b) => b[1][0] - a[1][0]) });
  }
  return res;
});
for (const r of out) {
  console.log(`== ${r.name}  tris shadow ${(r.passTris.shadow / 1e3) | 0}k refl ${(r.passTris.reflection / 1e3) | 0}k main ${(r.passTris.main / 1e3) | 0}k | draws ${JSON.stringify(r.passDraws)}`);
  console.log('   ' + r.groups.map(([k, v]) => `${k}:${v[0]}k/${v[1]}`).join('  '));
}
await browser.close();
server.stop();
