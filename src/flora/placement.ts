/**
 * Deterministic tree placement for a world tile (runs in the terrain worker). Poisson-like
 * jittered grid; species mix follows the region/biome (SPEC §5 scatter, §6 regions).
 * Returns per-species packed arrays: x, y, z, scale, rotation.
 */
import type { World } from '../world/heightfield';
import { createRng, hash3 } from '../core/rng';
import { createNoise } from '../core/noise';
import { REGIONS } from '../world/data/regions';

type Mix = [string, number][];
const MIX: Record<string, Mix> = {
  lake: [['maple', 3], ['larch', 3], ['fir', 2], ['pine', 1], ['shrub', 2]],
  castle: [['maple', 3], ['fir', 3], ['larch', 2], ['pine', 1]],
  maple: [['maple', 8], ['larch', 2], ['shrub', 2], ['fir', 1]],
  snow: [['fir', 6], ['birch', 3], ['pine', 1]],
  volcano: [['pine', 4], ['birch', 1]],
  cedar: [['cedar', 9], ['fir', 2], ['maple', 0.4]],
  bamboo: [['bamboo', 9], ['maple', 0.5], ['cedar', 0.5]],
  rice: [['maple', 2], ['cherry', 1], ['pine', 1], ['shrub', 2]],
  tea: [['cedar', 2], ['maple', 1], ['shrub', 1]],
  cherry: [['cherry', 8], ['maple', 1], ['pine', 1]],
  market: [['cherry', 2], ['pine', 2], ['maple', 1]],
  coast: [['pine', 8], ['shrub', 1]],
  marsh: [['shrub', 2], ['birch', 1]],
  temple: [['cedar', 5], ['maple', 3], ['pine', 1]],
  ginkgo: [['ginkgo', 8], ['maple', 1]],
  mirror: [['fir', 3], ['larch', 3], ['maple', 3], ['birch', 1]],
  hydrangea: [['maple', 2], ['cedar', 2], ['shrub', 3]],
  sunflower: [['shrub', 1], ['cherry', 1]],
  pampas: [['pine', 2], ['shrub', 1]],
  wisteria: [['maple', 3], ['cedar', 2], ['fir', 1]],
  none: [['maple', 2], ['larch', 2], ['fir', 2], ['pine', 1], ['shrub', 1]],
};

function pick(mix: Mix, u: number): string {
  const tot = mix.reduce((a, [, w]) => a + w, 0);
  let acc = 0;
  for (const [id, w] of mix) { acc += w / tot; if (u <= acc) return id; }
  return mix[mix.length - 1]![0];
}

/** Areas kept open around the M1 dock (the meadow and the pier view). */
function keepOpen(x: number, z: number): boolean {
  const dx = x - 0, dz = z - 284;
  const d = Math.hypot(dx, dz);
  if (d < 60 && !(dx < -22 && dz > 4)) return true;
  if (Math.abs(dx) < 40 && dz > -10 && dz < 140) return true;
  return false;
}

export function placeTrees(w: World, x0: number, z0: number, size: number): Record<string, Float32Array> {
  const lists: Record<string, number[]> = {};
  const r = createRng(hash3(Math.round(x0), Math.round(z0), 0, w.seed ^ 0x7733));
  const n = createNoise(w.seed ^ 0x7ee5);
  const cell = 7;
  const b = { forest: 0, moisture: 0, autumn: 0, special: 0, specialW: 0, grass: [0, 0, 0] as [number, number, number], region: 0 };
  for (let z = z0; z < z0 + size; z += cell) for (let x = x0; x < x0 + size; x += cell) {
    const px = x + r.next() * cell, pz = z + r.next() * cell;
    const u1 = r.next(), u2 = r.next(), u3 = r.next(), u4 = r.next();
    const h = w.height(px, pz);
    if (h < 0.9 || h > 1500) continue;
    const e = 2;
    const slope = Math.hypot(w.height(px + e, pz) - w.height(px - e, pz), w.height(px, pz + e) - w.height(px, pz - e)) / (2 * e);
    if (slope > 0.75) continue;
    if (keepOpen(px, pz)) continue;
    w.biome(px, pz, b);
    // treeline: fewer trees high up, none on snowy peaks
    const alt = h > 900 ? 0 : h > 650 ? 0.35 : 1;
    let dens = b.forest * b.forest * 1.15 * alt;
    if (b.special === 1 && b.specialW > 0.4) dens *= 0.15; // rice terraces stay open
    if (b.special === 6 && b.specialW > 0.4) dens *= 0.1; // tea rows
    if (b.special === 7 && b.specialW > 0.4) dens *= 0.2; // marsh
    dens *= 0.55 + 0.45 * (n.fbm2(px / 90, pz / 90, 2) + 0.5);
    if (u1 > dens) continue;
    const reg = w.regionAt(px, pz);
    const mix = MIX[reg >= 0 ? REGIONS[reg]!.id : 'none'] ?? MIX.none!;
    let id = pick(mix, u2);
    if (h > 700 && id !== 'fir' && id !== 'birch') id = u3 < 0.7 ? 'fir' : 'pine';
    (lists[id] ??= []).push(px, h, pz, 0.72 + u3 * 0.6, u4 * Math.PI * 2);
  }
  // the hand-placed framing trees of the M1 dock (reference 1's maple over the boathouse)
  if (x0 <= 0 && x0 + size > 0 && z0 <= 290 && z0 + size > 290) {
    const add = (id: string, x: number, z: number, s: number, rot: number) => (lists[id] ??= []).push(x, w.height(x, z), z, s, rot);
    add('maple', -16.5, 290, 1.35, 0.4);
    add('maple', 24, 298, 1.1, 2.0);
    add('pine', 34, 286, 1.1, 1.2);
    add('shrub', -11.5, 287, 1.2, 0.2);
    add('shrub', 15, 290, 1.0, 1.0);
    add('shrub', -30, 292, 1.3, 2.2);
  }
  return Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, new Float32Array(v)]));
}
