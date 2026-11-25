// Renders the world heightfield + regions to a PNG for quick layout checks.
// Run: npx esbuild scripts/worldmap.ts --bundle --platform=node --outfile=/tmp/wm.cjs && node /tmp/wm.cjs out.png
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createWorld } from '../src/world/heightfield';
import { DEFAULT_SEED } from '../src/config';

const S = 512, EXT = 8192;
const w = createWorld(DEFAULT_SEED);
const buf = Buffer.alloc(S * S * 4);
for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
  const x = -EXT + (i / S) * EXT * 2, z = -EXT + (j / S) * EXT * 2;
  const h = w.height(x, z);
  const hx = w.height(x + 20, z);
  const shade = Math.max(0.4, Math.min(1.3, 1 + (h - hx) * 0.02));
  let c: number[];
  if (h < 0) c = [30, 60 + Math.max(0, 40 + h * 2), 120];
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
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
const ih = Buffer.alloc(13); ih.writeUInt32BE(S, 0); ih.writeUInt32BE(S, 4); ih[8] = 8; ih[9] = 6;
writeFileSync(process.argv[2] ?? 'worldmap.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
