// Renders the world heightfield + regions to a PNG for quick layout checks.
// Run: npx esbuild scripts/worldmap.ts --bundle --platform=node --outfile=/tmp/wm.cjs && node /tmp/wm.cjs out.png
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createWorld } from '../src/world/heightfield';
import { DEFAULT_SEED } from '../src/config';

const S = 512, EXT = Number(process.env.EXT ?? 8192);
const w = createWorld(DEFAULT_SEED);
const t0 = Date.now();
const hy = w.hydro;
console.log('hydrology', Date.now() - t0, 'ms', hy.rivers.map((r) => r.id + ':' + r.pts.length + ' ' + r.pts[0]!.level.toFixed(0) + '→' + r.pts[r.pts.length - 1]!.level.toFixed(0)).join(' | '), 'ponds', hy.ponds.length, 'falls', hy.falls.length);
const buf = Buffer.alloc(S * S * 4);
for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
  const x = -EXT + (i / S) * EXT * 2, z = -EXT + (j / S) * EXT * 2;
  const h = w.height(x, z);
  const hx = w.height(x + 20, z);
  const shade = Math.max(0.4, Math.min(1.3, 1 + (h - hx) * 0.02));
  let c: number[];
  if (h < 0 || w.hydro.waterAt(x, z) > h) c = [30, 60 + Math.max(0, 40 + h * 2), 160];
  else {
    const b = w.biome(x, z);
    const snow = h > 900;
    c = snow ? [230, 230, 240] : h > 600 ? [120, 110, 100] : [b.grass[0] * 255 * 2.5, b.grass[1] * 255 * 2.5, b.grass[2] * 255 * 2.5];
    if (!snow && b.forest > 0.6) c = [c[0]! * 0.6, c[1]! * 0.7, c[2]! * 0.6];
  }
  const k = (j * S + i) * 4;
  buf[k] = Math.min(255, c[0]! * shade); buf[k + 1] = Math.min(255, c[1]! * shade); buf[k + 2] = Math.min(255, c[2]! * shade); buf[k + 3] = 255;
  if (Math.abs(Math.abs(x) - 5000) < 20 && Math.abs(z) < 5000 || Math.abs(Math.abs(z) - 5000) < 20 && Math.abs(x) < 5000) { buf[k] = 255; buf[k + 1] = 0; buf[k + 2] = 0; }
}
const mark = (x: number, z: number, c: number[], r = 0) => {
  const i0 = Math.round(((x + EXT) / (EXT * 2)) * S), j0 = Math.round(((z + EXT) / (EXT * 2)) * S);
  for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
    if (i < 0 || j < 0 || i >= S || j >= S) continue;
    const k = (j * S + i) * 4; buf[k] = c[0]!; buf[k + 1] = c[1]!; buf[k + 2] = c[2]!;
  }
};
for (const r of hy.rivers) for (const p of r.pts) mark(p.x, p.z, r.main ? [20, 90, 255] : [70, 160, 255]);
for (const p of hy.ponds) mark(p.x, p.z, [0, 220, 255], 2);
for (const f of hy.falls) mark(f.x, f.z, [255, 40, 40], 1);
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
const ih = Buffer.alloc(13); ih.writeUInt32BE(S, 0); ih.writeUInt32BE(S, 4); ih[8] = 8; ih[9] = 6;
writeFileSync(process.argv[2] ?? 'worldmap.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
