/**
 * The painted map (SPEC §11): the whole valley in ink and watercolour, generated once from the
 * heightfield — washes for water and land, darker greens for forests, ochre heights, snow,
 * faint contour lines, inked coasts, rivers and roads, red roofs for villages — on washi paper.
 * The map screen paints it in only where you've been.
 */
import { Pixmap, shadeHex, mixHex } from '../render/pixmap';
import { HALF } from '../world/data/regions';
import type { World } from '../world/heightfield';
import { VILLAGES } from '../buildings/data/villages';

export const MAP_PX = 256;
const M = (HALF * 2) / MAP_PX;
export const toMap = (x: number, z: number): [number, number] => [(x + HALF) / M, (z + HALF) / M];
export const fromMap = (u: number, v: number): [number, number] => [u * M - HALF, v * M - HALF];

const toHex = (r: number, g: number, b: number) => (Math.round(Math.min(1, r) * 255) << 16) | (Math.round(Math.min(1, g) * 255) << 8) | Math.round(Math.min(1, b) * 255);
const srgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export const PAPER = 0xeee2c2;

export function paintMap(w: World, dock: { x: number; z: number }): Pixmap {
  const p = new Pixmap(MAP_PX, MAP_PX);
  const H = new Float32Array(MAP_PX * MAP_PX), WET = new Uint8Array(MAP_PX * MAP_PX);
  const b = { forest: 0, moisture: 0, autumn: 0, special: 0, specialW: 0, grass: [0, 0, 0] as [number, number, number], region: 0 };
  for (let v = 0; v < MAP_PX; v++) for (let u = 0; u < MAP_PX; u++) {
    const [x, z] = fromMap(u + 0.5, v + 0.5);
    const h = w.height(x, z), wl = w.hydro.waterAt(x, z);
    const k = v * MAP_PX + u;
    H[k] = h;
    let col: number;
    if (h < 0 || wl > h + 0.2) {
      WET[k] = 1;
      const depth = Math.min(1, Math.max(0, -h) / 30);
      col = mixHex(0x9cc4cc, 0x4a7a9a, depth);
    } else {
      w.biome(x, z, b);
      const g = toHex(srgb(b.grass[0]) * 1.1, srgb(b.grass[1]) * 1.1, srgb(b.grass[2]) * 1.05);
      col = mixHex(g, 0x3e6a3a, b.forest * 0.55);
      if (b.special === 2 && b.specialW > 0.4 && h < 3) col = 0xe8d8a8;
      col = mixHex(col, 0xb89a6a, Math.min(1, Math.max(0, (h - 260) / 260)));
      if (h > 560) col = mixHex(col, 0xf4f2ec, Math.min(1, (h - 560) / 80));
      // light from the north-west: a soft hill shade
      const [x2, z2] = fromMap(u - 0.5, v - 0.5);
      const slope = (h - w.height(x2, z2)) / M;
      col = shadeHex(col, 1 + Math.max(-0.25, Math.min(0.25, slope * 1.6)));
    }
    // watercolour: a little paper showing through, soft value steps
    const n = ((u * 73856093) ^ (v * 19349663)) >>> 0;
    col = mixHex(col, PAPER, 0.18 + ((n >> 7) % 9) / 90);
    p.set(u, v, col);
  }
  // contour lines every 80 m and an inked coastline
  for (let v = 1; v < MAP_PX; v++) for (let u = 1; u < MAP_PX; u++) {
    const k = v * MAP_PX + u, a = H[k]!, l = H[k - 1]!, t = H[k - MAP_PX]!;
    if (WET[k] !== WET[k - 1] || WET[k] !== WET[k - MAP_PX]) { p.set(u, v, 0x3a4a5a); continue; }
    if (!WET[k] && (Math.floor(a / 80) !== Math.floor(l / 80) || Math.floor(a / 80) !== Math.floor(t / 80))) p.set(u, v, shadeHex(p.get(u, v), 0.82));
  }
  // rivers
  for (const r of w.hydro.rivers) for (let i = 1; i < r.pts.length; i++) {
    const a = toMap(r.pts[i - 1]!.x, r.pts[i - 1]!.z), c = toMap(r.pts[i]!.x, r.pts[i]!.z);
    p.line(Math.round(a[0]), Math.round(a[1]), Math.round(c[0]), Math.round(c[1]), r.main ? 0x3a6a9a : 0x5a8ab0);
  }
  // villages: a cluster of red roofs
  const marks = [...VILLAGES.map((v) => ({ x: v.x, z: v.z, n: v.n })), { x: dock.x, z: dock.z, n: 6 }];
  for (const m of marks) {
    const [u, v] = toMap(m.x, m.z);
    const s = m.n > 20 ? 3 : 2;
    for (let i = -s; i <= s; i += 2) for (let j = -s; j <= s; j += 2) { p.set(Math.round(u + i), Math.round(v + j), 0xb8402a); p.set(Math.round(u + i + 1), Math.round(v + j), 0x7a2a1e); }
  }
  return p;
}

/** The 8 stamps you can place (9×9 icons). */
export const STAMPS: { name: string; rows: string[]; color: number }[] = [
  { name: 'Star', color: 0xc8a040, rows: ['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.', '.#.....#.'] },
  { name: 'Heart', color: 0xc8403a, rows: ['.........', '.##...##.', '####.####', '#########', '.#######.', '..#####..', '...###...', '....#....', '.........'] },
  { name: 'Torii', color: 0xc8402a, rows: ['#########', '.#######.', '..#...#..', '#########', '..#...#..', '..#...#..', '..#...#..', '..#...#..', '..#...#..'] },
  { name: 'Fish', color: 0x3a6a9a, rows: ['.........', '.........', '#...###..', '##.#####.', '.###.####', '##.#####.', '#...###..', '.........', '.........'] },
  { name: 'Flower', color: 0xd86a8a, rows: ['...#.#...', '..##.##..', '.#######.', '..##@##..', '.#######.', '..##.##..', '...#.#...', '....#....', '....#....'] },
  { name: 'Mountain', color: 0x6a5a4a, rows: ['.........', '....#....', '...###...', '..##.##..', '..#...#..', '.##...##.', '.#.....#.', '##.....##', '#########'] },
  { name: 'Lantern', color: 0xe8902a, rows: ['...###...', '..#####..', '.#######.', '.#.....#.', '.#######.', '.#.....#.', '.#######.', '..#####..', '...###...'] },
  { name: 'Question', color: 0x4a3a5a, rows: ['..#####..', '.##...##.', '......##.', '....###..', '...##....', '...##....', '.........', '...##....', '...##....'] },
];
export function stampIcon(i: number): Pixmap {
  const s = STAMPS[i]!, p = new Pixmap(9, 9);
  s.rows.forEach((r, y) => { for (let x = 0; x < 9; x++) if (r[x] === '#' || r[x] === '@') p.set(x, y, r[x] === '@' ? 0xf0d040 : s.color); });
  return p;
}
