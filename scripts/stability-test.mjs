// SPEC §3.2 pixel stability: turning the camera by less than a pixel must not re-render a
// different image (no shimmer) — only the sub-pixel shift changes. A whole-pixel turn shifts
// the image by exactly one pixel.
import { launch, waitReady } from './browser.mjs';
import { serve } from './serve.mjs';

const server = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
let ok = false;
try {
  // bloom is re-sampled on its own half-res grid, so it is excluded from the one-pixel check
await page.goto(server.url + '?shot=dock-night&nosw=1&off=' + (process.env.OFF ?? 'bloom'), { waitUntil: 'load' });
  await waitReady(page);
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const h = window.__hotaru, g = h.game, c = g.controller;
    const frames = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(res))));
    const q = (2 * Math.tan((g.camera.fov * Math.PI) / 360)) / g.pipeline.height;
    // centre the yaw on a pixel step
    c.yaw = Math.round(c.yaw / q) * q;
    await frames();
    const a = h.readInternal();
    c.yaw += q * 0.3; // sub-pixel turn
    await frames();
    const b = h.readInternal();
    const shift = g.pipeline.shift.x;
    let diffSub = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffSub++;
    c.yaw += q * 0.7; // completes one whole pixel
    await frames();
    const d = h.readInternal();
    const W = g.pipeline.pixelRT.width, H = g.pipeline.pixelRT.height;
    // compare d shifted by one pixel against a (centre region, ignore animated areas by tolerance)
    const match = (dx, y0 = 20, y1 = H - 20) => {
      let same = 0, total = 0;
      for (let y = y0; y < y1; y++) for (let x = W * 0.35 | 0; x < W * 0.65; x++) {
        total++;
        const ia = (y * W + x) * 4, id = (y * W + x + dx) * 4;
        if (Math.abs(a[ia] - d[id]) + Math.abs(a[ia + 1] - d[id + 1]) + Math.abs(a[ia + 2] - d[id + 2]) < 24) same++;
      }
      return same / total;
    };
    const m = {};
    for (const dx of [-2, -1, 0, 1, 2]) m[dx] = +match(dx).toFixed(3);
    const rows = [];
    for (let k = 0; k < 6; k++) rows.push(+match(1, 20 + ((H - 40) * k) / 6 | 0, 20 + ((H - 40) * (k + 1)) / 6 | 0).toFixed(2));
    return { diffSub, shift, match: m, bands_bottom_to_top: rows, matchRatioAfterOnePixel: Math.max(m[1], m[-1]) };
  });
  // a few pixels may differ from animated particles; the bulk must be identical
  ok = r.diffSub < 400 && Math.abs(r.shift - 0.3) < 0.01 && r.matchRatioAfterOnePixel > 0.85;
  console.log(JSON.stringify(r));
} finally {
  await browser.close();
  server.stop();
}
console.log(ok ? 'STABILITY TEST PASSED' : 'STABILITY TEST FAILED');
process.exit(ok ? 0 : 1);
