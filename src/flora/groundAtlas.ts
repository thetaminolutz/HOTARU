/**
 * Ground-plant atlas (SPEC §14): 16 variants of 32×64, 1-px stems and leaves. Greyscale
 * pixels are tinted per instance (region grass colour); coloured pixels (flowers, seed heads)
 * keep their colour. Indices are listed in GROUND_VARIANTS.
 */
import { Pixmap, rngFor, shadeHex } from '../render/pixmap';

export const GROUND_VARIANTS = [
  'tuft', 'tallGrass', 'reeds', 'cattails', 'fern', 'pampas', 'rice', 'clover',
  'spiderLily', 'cosmos', 'bellflower', 'dandelion', 'daisy', 'horsetail', 'sasa', 'moss',
] as const;
export type GroundVariant = (typeof GROUND_VARIANTS)[number];
export const GV = Object.fromEntries(GROUND_VARIANTS.map((v, i) => [v, i])) as Record<GroundVariant, number>;

const W = 32, H = 64;
const grey = (v: number) => { const g = Math.max(0, Math.min(255, Math.round(v * 255))); return (g << 16) | (g << 8) | g; };

function blade(p: Pixmap, ox: number, x0: number, h: number, lean: number, tone: number, width = 1): void {
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const x = Math.round(x0 + lean * t * t);
    const c = grey(Math.min(1, tone * (0.6 + t * 0.55)));
    p.set(ox + x, H - 1 - y, c);
    if (width > 1 && y < h * 0.4) p.set(ox + x + 1, H - 1 - y, shadeHex(c, 0.75));
  }
}

function flowerHead(p: Pixmap, x: number, y: number, petal: number, centre: number, r = 1): void {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) p.set(x + dx * r, y + dy * r, petal);
  if (r > 1) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) p.set(x + dx, y + dy, petal);
  p.set(x, y, centre);
}

function stemTop(ox: number, x0: number, h: number, lean: number): [number, number] {
  return [ox + Math.round(x0 + lean), H - 1 - h];
}

export function groundAtlas(): Pixmap {
  const p = new Pixmap(W * 8, H * 2);
  GROUND_VARIANTS.forEach((name, v) => {
    const r = rngFor('ground-' + name);
    const ox = (v % 8) * W, oy = Math.floor(v / 8) * H;
    const q = new Pixmap(W, H); // draw into a tile, then copy (keeps the code simple)
    const L = (n: number, hMin: number, hMax: number, lean: number, tMin = 0.55, w = 1) => {
      const tops: [number, number][] = [];
      for (let b = 0; b < n; b++) {
        const x0 = 5 + r.int(0, 22), h = r.int(hMin, hMax), ln = (r.next() - 0.5) * lean * 2;
        blade(q, 0, x0, h, ln, tMin + r.next() * (1 - tMin), w);
        tops.push(stemTop(0, x0, h, ln));
      }
      return tops;
    };
    switch (name) {
      case 'tuft': L(16, 14, 30, 6); break;
      case 'tallGrass': L(12, 26, 48, 8); break;
      case 'reeds': L(9, 40, 63, 4); break;
      case 'cattails': {
        const tops = L(7, 44, 63, 3);
        tops.forEach(([x, y], i) => { if (i % 2 === 0) for (let k = 2; k < 9; k++) { q.set(x, y + k, 0x5a3a2a); q.set(x + 1, y + k, 0x4a2e22); } });
        break;
      }
      case 'fern': {
        // arching fronds with leaflets
        for (let f = 0; f < 5; f++) {
          const dir = f % 2 ? 1 : -1, len = r.int(14, 22), base = 16 + r.int(-3, 3);
          for (let k = 0; k < len; k++) {
            const t = k / len, x = Math.round(base + dir * k * 0.8), y = Math.round(H - 2 - Math.sin(t * Math.PI * 0.8) * 22 - k * 0.2);
            const tone = 0.62 + 0.25 * (1 - t);
            q.set(x, y, grey(tone));
            if (k % 2 === 0 && t < 0.9) { q.set(x, y - 1, grey(tone * 0.9)); q.set(x, y + 1, grey(tone * 0.8)); q.set(x - dir, y - 2, grey(tone * 0.85)); }
          }
        }
        break;
      }
      case 'pampas': {
        const tops = L(8, 40, 62, 6, 0.5);
        tops.forEach(([x, y]) => { for (let k = 0; k < 10; k++) { q.set(x + (k % 3 === 0 ? 1 : 0) + Math.round(k * 0.3), y + k, k % 2 ? 0xe8e2d0 : 0xd8cfb8); } });
        break;
      }
      case 'rice': {
        const tops = L(12, 22, 34, 3, 0.6);
        tops.forEach(([x, y]) => { for (let k = 0; k < 6; k++) q.set(x + Math.round(k * 0.5), y + k, k % 2 ? 0xd8b048 : 0xc89a38); });
        break;
      }
      case 'clover': {
        for (let i = 0; i < 26; i++) {
          const x = r.int(3, 29), y = H - 1 - r.int(0, 9), t = 0.5 + r.next() * 0.4;
          q.set(x, y, grey(t)); q.set(x + 1, y, grey(t * 0.9)); q.set(x, y - 1, grey(t * 1.1));
        }
        if (r.chance(0.9)) flowerHead(q, r.int(6, 26), H - 12, 0xf4f0e8, 0xe8d8a8);
        break;
      }
      case 'spiderLily': {
        const tops = L(4, 26, 40, 2, 0.5);
        tops.forEach(([x, y]) => {
          // curled red petals radiating
          for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2; q.set(x + Math.round(Math.cos(ang) * 3), y + Math.round(Math.sin(ang) * 2), 0xd8302a); q.set(x + Math.round(Math.cos(ang) * 2), y + Math.round(Math.sin(ang) * 1), 0xc2452f); }
          q.set(x, y, 0xf06a4a);
        });
        break;
      }
      case 'cosmos': {
        const tops = L(6, 22, 42, 6, 0.5);
        tops.forEach(([x, y], i) => flowerHead(q, x, y, i % 3 === 0 ? 0xf4eef0 : i % 3 === 1 ? 0xe890b8 : 0xc8508a, 0xf0c840, 2));
        break;
      }
      case 'bellflower': {
        const tops = L(6, 18, 30, 4, 0.5);
        tops.forEach(([x, y]) => { q.set(x, y + 1, 0x6a6ad8); q.set(x - 1, y + 2, 0x5a5ac8); q.set(x + 1, y + 2, 0x7a7ae8); q.set(x, y + 2, 0x8a8af0); });
        break;
      }
      case 'dandelion': {
        L(10, 6, 12, 5, 0.5);
        for (let i = 0; i < 3; i++) { const x = r.int(7, 25), h = r.int(12, 20); for (let y = 0; y < h; y++) q.set(x, H - 1 - y, grey(0.65)); flowerHead(q, x, H - 1 - h, 0xf0d040, 0xe0a828, 2); }
        break;
      }
      case 'daisy': {
        const tops = L(7, 14, 26, 4, 0.5);
        tops.forEach(([x, y]) => flowerHead(q, x, y, 0xf6f4ee, 0xe8c040, 1));
        break;
      }
      case 'horsetail': {
        for (let s = 0; s < 6; s++) {
          const x = r.int(6, 26), h = r.int(18, 34);
          for (let y = 0; y < h; y++) { q.set(x, H - 1 - y, grey(y % 5 === 0 ? 0.45 : 0.7)); if (y % 5 === 0 && y > 4) { q.set(x - 1, H - y, grey(0.6)); q.set(x + 1, H - y, grey(0.6)); } }
        }
        break;
      }
      case 'sasa': {
        // dwarf bamboo: broad pointed leaves
        for (let l = 0; l < 9; l++) {
          const x0 = r.int(6, 26), y0 = H - 1 - r.int(6, 22), dir = r.chance(0.5) ? 1 : -1, len = r.int(6, 10);
          for (let k = 0; k < len; k++) { const t = k / len, x = x0 + dir * k, y = Math.round(y0 - Math.sin(t * Math.PI) * 2); q.set(x, y, grey(0.75 - t * 0.2)); if (t < 0.7) q.set(x, y + 1, grey(0.55)); }
          for (let y = y0; y < H; y++) if (r.chance(0.6)) q.set(x0, y, grey(0.5));
        }
        break;
      }
      case 'moss': {
        for (let i = 0; i < 60; i++) { const x = r.int(2, 30), y = H - 1 - Math.floor(Math.abs(r.next() - r.next()) * 8); q.set(x, y, grey(0.45 + r.next() * 0.35)); }
        break;
      }
    }
    p.blit(q, ox, oy);
  });
  return p;
}
