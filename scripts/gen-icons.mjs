// Generates the pixel-art lantern app icons and iPad launch images as PNGs (no dependencies).
// Run: npm run icons   (outputs into public/icons/)
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const hex = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

// 32×32 pixel lantern on navy with a dithered halo. '.' = background.
const ART = [
  '................................',
  '................................',
  '...............##...............',
  '...............##...............',
  '.............######.............',
  '............########............',
  '..........aaaaaaaaaaaa..........',
  '.........aoooooooooooooa........',
  '........aooyyyyyyyyyyooa........',
  '........aoyyyyyyyyyyyyoa........',
  '.......rrrrrrrrrrrrrrrrrr.......',
  '.......aoyyyyyywwyyyyyyoa.......',
  '.......aoyyyyywwwwyyyyyoa.......',
  '.......aoyyyyywwwwyyyyyoa.......',
  '.......rrrrrrrrrrrrrrrrrr.......',
  '.......aoyyyyyywwyyyyyyoa.......',
  '.......aoyyyyyyyyyyyyyyoa.......',
  '.......aoyyyyyyyyyyyyyyoa.......',
  '.......rrrrrrrrrrrrrrrrrr.......',
  '........aoyyyyyyyyyyyyoa........',
  '........aooyyyyyyyyyyooa........',
  '.........aoooooooooooooa........',
  '..........aaaaaaaaaaaa..........',
  '............########............',
  '.............######.............',
  '...............vv...............',
  '...............vv...............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];
const COL = { '#': 0x2a1e24, a: 0x8a3a18, o: 0xe2622b, y: 0xffb347, w: 0xffe6a3, r: 0xb8501e, v: 0xc2452f };
const BG = 0x0e1430, BG2 = 0x1c2550, HALO = 0x5a3a3a;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function lanternPixel(x, y) {
  const ch = ART[y]?.[x] ?? '.';
  if (ch !== '.') return COL[ch];
  const d = Math.hypot(x - 15.5, y - 14) / 14;
  const th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  if (d < 1 && (1 - d) * 0.7 > th) return HALO;
  return y > 26 && (x + y) % 2 === 0 ? BG2 : BG;
}

function icon(size, pad = 0) {
  const buf = Buffer.alloc(size * size * 4);
  const inner = size - pad * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const ix = Math.floor(((x - pad) / inner) * 32), iy = Math.floor(((y - pad) / inner) * 32);
    const c = ix < 0 || iy < 0 || ix > 31 || iy > 31 ? BG : lanternPixel(ix, iy);
    const [r, g, b] = hex(c);
    buf.set([r, g, b, 255], (y * size + x) * 4);
  }
  return png(size, size, buf);
}

function launch(w, h) {
  const buf = Buffer.alloc(w * h * 4);
  const cell = Math.floor(Math.min(w, h) / 3 / 32);
  const ox = Math.floor(w / 2 - 16 * cell), oy = Math.floor(h / 2 - 16 * cell);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ix = Math.floor((x - ox) / cell), iy = Math.floor((y - oy) / cell);
    let c = BG;
    if (ix >= 0 && iy >= 0 && ix < 32 && iy < 32) c = lanternPixel(ix, iy);
    const [r, g, b] = hex(c);
    buf.set([r, g, b, 255], (y * w + x) * 4);
  }
  return png(w, h, buf);
}

for (const s of [32, 192, 512]) writeFileSync(new URL(`icon-${s}.png`, OUT), icon(s));
writeFileSync(new URL('icon-maskable-512.png', OUT), icon(512, 64));
writeFileSync(new URL('apple-touch-icon.png', OUT), icon(180));
for (const [w, h] of [[2360, 1640], [2388, 1668], [2732, 2048], [2160, 1620], [2048, 1536], [2266, 1488]]) writeFileSync(new URL(`launch-${w}x${h}.png`, OUT), launch(w, h));
console.log('icons written to public/icons/');
