/**
 * The world heightfield and biome sampler (SPEC §5 "directed procedural"). Pure functions
 * of the seed, shared by the main thread and the terrain workers, so chunks regenerate
 * identically. Regions shape the land; landmarks (Lantern Lake, the dock, islands, the
 * volcano, border ranges, the eastern sea) are sculpted on top.
 */
import { createNoise } from '../core/noise';
import { smoothstep, lerp, clamp } from '../core/math';
import { REGIONS, HALF } from './data/regions';
import { VILLAGES } from '../buildings/data/villages';
import { computeHydrology, type Hydro } from './hydrology';
import { computeSites, type Sites } from './sites';

export type Biome = {
  forest: number;
  moisture: number;
  autumn: number;
  /** dominant special feature id (see RegionDef.special) and its weight */
  special: number;
  specialW: number;
  grass: [number, number, number];
  region: number;
};

export type World = {
  seed: number;
  height(x: number, z: number): number;
  biome(x: number, z: number, out?: Biome): Biome;
  regionAt(x: number, z: number): number;
  /** rivers, ponds and waterfalls */
  readonly hydro: Hydro;
  /** castle plateau and grottos */
  readonly sites: Sites;
};

const hexLin = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  const f = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
};
const GRASS = REGIONS.map((r) => hexLin(r.grass));

export function createWorld(seed: number): World {
  const n = createNoise(seed);
  const nw = createNoise(seed ^ 0x51a7);
  const R = REGIONS.length;
  const w = new Float32Array(R);

  /** Region weights at a (domain-warped) point, normalised into `w`. Returns the total. */
  function weights(x: number, z: number): number {
    const wx = x + 260 * nw.fbm2(x / 1400, z / 1400, 3), wz = z + 260 * nw.fbm2(x / 1400 + 7.7, z / 1400 - 2.1, 3);
    let sum = 0;
    for (let i = 0; i < R; i++) {
      const r = REGIONS[i]!;
      const d = Math.hypot(wx - r.x, wz - r.z) / r.r;
      const v = d > 2.6 ? 0 : Math.exp(-d * d * 2.2);
      w[i] = v;
      sum += v;
    }
    // a gentle "countryside" default where no region dominates
    const def = 0.06;
    for (let i = 0; i < R; i++) w[i]! /= sum + def;
    return sum;
  }

  /** M1 Lantern Lake sculpting (kept identical in spirit): basin, dock shore, islands. */
  function lakeShape(x: number, z: number, land: number): number {
    const wx = x + 70 * n.fbm2(x / 520, z / 520, 3);
    const wz = z + 50 * n.fbm2(x / 520 + 9.1, z / 520 - 3.7, 3);
    const ld = Math.hypot(wx / 440, (wz + 10) / 300);
    if (ld > 2.2) return land;
    // land near the lake rises gently from the shore
    const near = smoothstep(1.0, 2.2, ld);
    land = lerp(3 + 26 * (n.fbm2(x / 360, z / 360, 4) * 0.5 + 0.5) * smoothstep(1.05, 2.4, ld), land, near);
    const dock = Math.exp(-(((x + 10) / 140) ** 2) - (((z - 300) / 70) ** 2));
    land = lerp(land, 1.0 + 0.5 * (n.noise2(x / 30, z / 30) * 0.5 + 0.5) + Math.max(0, ld - 1) * 40, dock * 0.9);
    const shore = smoothstep(0.975, 1.03, ld);
    const bottom = -1.6 - 11 * smoothstep(0.97, 0.55, ld) + 0.6 * n.noise2(x / 60, z / 60);
    const lake = lerp(bottom, Math.max(land, 0.5), shore);
    const isl = (cx: number, cz: number, r: number, h: number) => -4 + (h + 4) * smoothstep(1, 0.3, Math.hypot(x - cx, z - cz) / r);
    const islands = Math.max(isl(-150, 40, 70, 9), isl(140, -30, 22, 4), isl(-10, -150, 30, 5));
    return Math.max(lake, islands + 1.2 * n.noise2(x / 25, z / 25) * smoothstep(-1, 2, islands));
  }

  function height(x: number, z: number): number {
    weights(x, z);
    let base = 0, hill = 0, ridge = 0, terrace = 0, marsh = 0;
    for (let i = 0; i < R; i++) {
      const v = w[i]!;
      if (v < 1e-4) continue;
      const r = REGIONS[i]!;
      base += r.base * v; hill += r.hill * v; ridge += r.ridge * v;
      if (r.special === 1) terrace += v;
      if (r.special === 7) marsh += v;
    }
    const def = 1 - w.reduce((a, b) => a + b, 0);
    base += 20 * def; hill += 40 * def; ridge += 40 * def;

    const hills = n.fbm2(x / 420, z / 420, 5) * 0.5 + 0.5;
    // mountains: broad massifs (squared low-frequency fbm) carved by soft ridges, not spires
    const mass = n.fbm2(x / 1700 + 3.1, z / 1700 - 1.7, 4) * 0.5 + 0.5;
    const rid = n.ridged2(x / 1300, z / 1300, 4);
    let h = base + hill * hills + ridge * (mass * mass + rid * 0.25 * mass) + 6 * n.noise2(x / 60, z / 60);

    // rice terraces: stepped slopes
    if (terrace > 0.05) {
      const step = 2.4;
      const t = Math.floor(h / step) * step + smoothstep(0.85, 1, (h % step) / step) * step;
      h = lerp(h, t, clamp(terrace * 1.6, 0, 1));
    }
    // marsh: nearly flat, just above the water
    if (marsh > 0.05) h = lerp(h, 1.2 + 0.8 * n.noise2(x / 90, z / 90), clamp(marsh * 1.5, 0, 1));

    // the quiet volcano: a broad cone with a crater lake
    const vd = Math.hypot(x - 1900, z + 4200);
    if (vd < 2600) {
      const cone = 1250 * Math.pow(Math.max(0, 1 - vd / 2400), 1.6);
      const crater = vd < 260 ? -smoothstep(260, 120, vd) * 140 : 0;
      h = Math.max(h, cone + crater + 15 * n.noise2(x / 120, z / 120));
    }

    // Lantern Lake and its shores
    h = lakeShape(x, z, h);
    // the boathouse (your house) stands on a small levelled terrace on its stilts, never in the slope
    const bd = Math.max(Math.abs(x + 8.25) - 4.75, Math.abs(z - 303) - 5.2);
    if (bd < 7) h = Math.min(h, lerp(0.55 + 0.04 * n.noise2(x / 3, z / 3), h, smoothstep(1.2, 7, bd)));

    // the eastern sea with cliffs and a cove; border ranges on the other three sides
    const coastX = HALF - 650 + 260 * n.fbm2(z / 1200, 3.3, 3) + 120 * n.noise2(z / 300, 1.1);
    if (x > coastX - 400) {
      const t = smoothstep(coastX - 60, coastX + 140, x);
      const cliff = smoothstep(coastX - 400, coastX - 60, x) * (25 + 35 * rid);
      h = lerp(Math.max(h, h * 0.6 + cliff), -28 - (x - coastX) * 0.02, t);
    }
    // gull island offshore
    const gd = Math.hypot(x - (HALF + 350), z + 1900) / 380;
    if (gd < 1.4) h = Math.max(h, -20 + 60 * smoothstep(1.1, 0.2, gd) * (0.8 + 0.4 * n.noise2(x / 90, z / 90)));

    const edgeW = HALF + 200 - Math.max(-x, Math.abs(z)); // distance to W/N/S border
    if (edgeW < 900 && x < coastX - 300) {
      const k = smoothstep(900, -1600, edgeW);
      const m = n.fbm2(x / 1500 + 9.3, z / 1500 - 4.1, 4) * 0.5 + 0.5;
      h += k * (800 + 1100 * m * m + 260 * n.ridged2(x / 1100, z / 1100, 4) * m);
    }

    // keep land above the water line outside the lake and the sea (no accidental floods)
    // villages sit on gently graded land (keeps a fifth of the original relief)
    if (grading) for (const v of VILLAGES) {
      const dv = Math.hypot(x - v.x, z - v.z);
      if (dv > v.r * 1.6) continue;
      const tv = villageLevel(v);
      if (tv < 2) continue;
      const k = smoothstep(v.r * 1.6, v.r * 0.8, dv);
      h = lerp(h, tv + (h - tv) * 0.2, k);
    }

    const inLake = Math.hypot(x / 440, (z + 10) / 300) < 1.25;
    if (!inLake && x < coastX - 120 && gd > 1.2) h = Math.max(h, 0.6);
    // rivers, ponds and waterfalls carved last (see hydrology.ts)
    if (carving) { h = hydro().carve(x, z, h); h = sites().carve(x, z, h); }
    return h;
  }

  let carving = true;
  let hyd: Hydro | null = null;
  let sit: Sites | null = null;
  function sites(): Sites {
    if (!sit) { const was = carving; carving = false; const hy = hydro(); sit = computeSites((x, z) => hy.carve(x, z, height(x, z)), hy); carving = was; }
    return sit;
  }
  function hydro(): Hydro {
    if (!hyd) { const was = carving; carving = false; hyd = computeHydrology(height); carving = was; }
    return hyd;
  }

  /** Mean height around a village before grading (computed once). */
  let grading = true;
  const levels = new Map<string, number>();
  function villageLevel(v: { id: string; x: number; z: number; r: number }): number {
    let t = levels.get(v.id);
    if (t === undefined) {
      // the village levels never depend on rivers (keeps the result independent of call order)
      const wasCarving = carving;
      grading = false; carving = false;
      t = 0;
      const pts = [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]];
      for (const [a, b] of pts) t += height(v.x + a! * v.r, v.z + b! * v.r);
      t /= pts.length;
      grading = true; carving = wasCarving;
      levels.set(v.id, t);
    }
    return t;
  }

  function biome(x: number, z: number, out: Biome = { forest: 0, moisture: 0, autumn: 0, special: 0, specialW: 0, grass: [0, 0, 0], region: 0 }): Biome {
    weights(x, z);
    let forest = 0, moist = 0, aut = 0, best = 0, bestI = 0;
    const g: [number, number, number] = [0, 0, 0];
    const sp = new Float32Array(8);
    let tot = 0;
    for (let i = 0; i < R; i++) {
      const v = w[i]!;
      tot += v;
      if (v < 1e-4) continue;
      const r = REGIONS[i]!;
      forest += r.forest * v; moist += r.moisture * v; aut += r.autumn * v;
      g[0] += GRASS[i]![0] * v; g[1] += GRASS[i]![1] * v; g[2] += GRASS[i]![2] * v;
      sp[r.special] = sp[r.special]! + v;
      if (v > best) { best = v; bestI = i; }
    }
    const def = Math.max(0, 1 - tot);
    forest += 0.35 * def; moist += 0.6 * def; aut += 0.5 * def;
    const dg = GRASS[0]!;
    g[0] += dg[0] * def; g[1] += dg[1] * def; g[2] += dg[2] * def;
    let spI = 0, spW = 0;
    for (let k = 1; k < 8; k++) if (sp[k]! > spW) { spW = sp[k]!; spI = k; }
    // forest density varies in groves
    const grove = n.fbm2(x / 260, z / 260, 3);
    // the meadow around the Tomoshibi dock stays open
    const dockD = Math.hypot(x, z - 284);
    out.forest = clamp(forest + grove * 0.45, 0, 1) * smoothstep(70, 220, dockD);
    out.moisture = clamp(moist + 0.15 * n.noise2(x / 500, z / 500), 0, 1);
    out.autumn = clamp(aut, 0, 1);
    out.special = spI; out.specialW = spW;
    out.grass = g;
    out.region = bestI;
    return out;
  }

  function regionAt(x: number, z: number): number {
    weights(x, z);
    let best = 0, bi = -1;
    for (let i = 0; i < R; i++) if (w[i]! > best) { best = w[i]!; bi = i; }
    return best > 0.25 ? bi : -1;
  }

  return { seed, height, biome, regionAt, get hydro() { return hydro(); }, get sites() { return sites(); } };
}
