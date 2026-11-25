/** Local simplex noise (2D/3D) and fbm helpers, seeded. Output roughly in [-1, 1]. */
import { createRng } from './rng';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;
const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

export type Noise = {
  noise2(x: number, y: number): number;
  noise3(x: number, y: number, z: number): number;
  fbm2(x: number, y: number, octaves?: number, lacunarity?: number, gain?: number): number;
  ridged2(x: number, y: number, octaves?: number): number;
};

export function createNoise(seed: number): Noise {
  const rng = createRng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const t = p[i]!; p[i] = p[j]!; p[j] = t;
  }
  const perm = new Uint8Array(512);
  const perm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]!; perm12[i] = perm[i]! % 12; }

  function noise2(xin: number, yin: number): number {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = perm12[ii + perm[jj]!]! * 3; t0 *= t0; n += t0 * t0 * (GRAD3[g]! * x0 + GRAD3[g + 1]! * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = perm12[ii + i1 + perm[jj + j1]!]! * 3; t1 *= t1; n += t1 * t1 * (GRAD3[g]! * x1 + GRAD3[g + 1]! * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = perm12[ii + 1 + perm[jj + 1]!]! * 3; t2 *= t2; n += t2 * t2 * (GRAD3[g]! * x2 + GRAD3[g + 1]! * y2); }
    return 70 * n;
  }

  function noise3(xin: number, yin: number, zin: number): number {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const corner = (tx: number, ty: number, tz: number, gi: number) => {
      let tt = 0.6 - tx * tx - ty * ty - tz * tz;
      if (tt < 0) return 0;
      const g = gi * 3;
      tt *= tt;
      return tt * tt * (GRAD3[g]! * tx + GRAD3[g + 1]! * ty + GRAD3[g + 2]! * tz);
    };
    const n =
      corner(x0, y0, z0, perm12[ii + perm[jj + perm[kk]!]!]!) +
      corner(x1, y1, z1, perm12[ii + i1 + perm[jj + j1 + perm[kk + k1]!]!]!) +
      corner(x2, y2, z2, perm12[ii + i2 + perm[jj + j2 + perm[kk + k2]!]!]!) +
      corner(x3, y3, z3, perm12[ii + 1 + perm[jj + 1 + perm[kk + 1]!]!]!);
    return 32 * n;
  }

  function fbm2(x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise2(x * freq + o * 17.3, y * freq - o * 9.1);
      norm += amp; amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }

  function ridged2(x: number, y: number, octaves = 5): number {
    let sum = 0, amp = 0.5, freq = 1, prev = 1;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(noise2(x * freq + o * 31.7, y * freq + o * 11.3));
      n *= n;
      sum += n * amp * prev;
      prev = n; amp *= 0.5; freq *= 2.03;
    }
    return sum;
  }

  return { noise2, noise3, fbm2, ridged2 };
}
