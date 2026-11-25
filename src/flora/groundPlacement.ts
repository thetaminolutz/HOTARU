/**
 * Ground plants for a tile (runs in the terrain worker): grass everywhere, flowers in
 * patches, ferns & dwarf bamboo on forest floors, reeds at the water's edge, pampas on the
 * moor, rice on the terraces. Packed per instance: x, y, z, height, r, g, b, variant.
 */
import type { World, Biome } from '../world/heightfield';
import { createRng, hash3 } from '../core/rng';
import { createNoise, type Noise } from '../core/noise';
import { GV } from './groundAtlas';
import { REGIONS } from '../world/data/regions';

const PAMPAS = REGIONS.findIndex((r) => r.id === 'pampas');

export const STRIDE = 8;
let noise: Noise | null = null;
let noiseSeed = -1;

export type Rect = [number, number, number, number];

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export function placeGround(w: World, x0: number, z0: number, size: number, density: number, exclude: Rect[]): Float32Array {
  if (!noise || noiseSeed !== w.seed) { noise = createNoise(w.seed ^ 0x9a55); noiseSeed = w.seed; }
  const n = noise;
  const r = createRng(hash3(Math.round(x0), Math.round(z0), 7, w.seed));
  // biome on a coarse 5×5 grid (cheap), nearest lookup per plant
  const G = 5, bio: Biome[] = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) bio.push(w.biome(x0 + (i / (G - 1)) * size, z0 + (j / (G - 1)) * size));
  const out: number[] = [];
  const cell = 0.42 / Math.sqrt(Math.max(0.15, density));
  for (let z = z0; z < z0 + size; z += cell) for (let x = x0; x < x0 + size; x += cell) {
    const px = x + r.next() * cell, pz = z + r.next() * cell;
    const u = r.next(), u2 = r.next(), u3 = r.next();
    if (exclude.some(([ax, az, bx, bz]) => px > ax && px < bx && pz > az && pz < bz)) continue;
    const b = bio[Math.min(G - 1, Math.round(((pz - z0) / size) * (G - 1))) * G + Math.min(G - 1, Math.round(((px - x0) / size) * (G - 1)))]!;
    const h = w.height(px, pz);
    if (h < -0.75 || h > 1150) continue;
    const patch = n.fbm2(px / 11, pz / 11, 3);
    const big = n.fbm2(px / 60, pz / 60, 2);
    let variant = -1, height = 0.5;
    const moist = b.moisture, forest = b.forest;
    // the water's edge: reeds, cattails, horsetail
    if (h < 0.5) {
      if (patch < 0.05 || u > 0.4) continue; // clumps, not a wall
      variant = u2 < 0.2 ? GV.cattails : u2 < 0.85 ? GV.reeds : GV.horsetail;
      height = 0.9 + u3 * 0.8;
    } else if (b.special === 5 && b.specialW > 0.4) { // bamboo forest floor: sasa
      if (u > 0.55) continue;
      variant = u2 < 0.75 ? GV.sasa : GV.fern; height = 0.5 + u3 * 0.5;
    } else if (b.special === 1 && b.specialW > 0.45) { // rice terraces (bunds stay grassy)
      const onBund = (h % 2.4) / 2.4 > 0.86;
      variant = onBund ? GV.tuft : GV.rice; height = onBund ? 0.35 + u3 * 0.3 : 0.75 + u3 * 0.25;
      if (onBund && u > 0.6) continue;
    } else if (b.region === PAMPAS || (b.special === 0 && b.autumn > 0.75 && moist < 0.4 && big > 0.1)) { // pampas moor
      if (u > 0.75) continue;
      variant = u2 < 0.6 ? GV.pampas : GV.tallGrass; height = 1.0 + u3 * 0.8;
    } else if (b.special === 7 && b.specialW > 0.4) { // marsh
      if (u > 0.8) continue;
      variant = u2 < 0.6 ? GV.reeds : u2 < 0.8 ? GV.tallGrass : GV.cattails; height = 1.0 + u3 * 0.9;
    } else if (forest > 0.55 && patch + big * 0.5 < 0.35) { // forest floor: ferns, moss, sasa, a few flowers
      if (u > 0.55 + moist * 0.25) continue;
      variant = u2 < 0.45 ? GV.fern : u2 < 0.7 ? GV.moss : u2 < 0.9 ? GV.sasa : GV.bellflower;
      height = variant === GV.moss ? 0.25 : 0.45 + u3 * 0.5;
    } else { // meadow: grass with flower patches
      if (h > 950 && u > 0.3) continue;
      const flowers = patch > 0.28 && u < 0.35;
      if (flowers) {
        const kind = (Math.floor((big + 1) * 3) + Math.floor(patch * 7)) % 5;
        variant = [GV.cosmos, GV.daisy, GV.dandelion, GV.spiderLily, GV.bellflower][kind]!;
        height = 0.45 + u3 * 0.35;
      } else {
        variant = u2 < 0.68 ? GV.tuft : u2 < 0.86 ? GV.tallGrass : GV.clover;
        height = variant === GV.clover ? 0.28 : variant === GV.tallGrass ? 0.5 + u3 * 0.4 : 0.3 + u3 * 0.3;
        if (patch < -0.25 && u > 0.5) continue; // natural gaps
      }
    }
    // colour: the region's grass, greener where moist, golden where dry/autumn, per-plant jitter
    let gr = b.grass[0], gg = b.grass[1], gb = b.grass[2];
    const lush = Math.max(0, moist - 0.55) * 1.2;
    gr *= 1 - lush * 0.35; gg *= 1 + lush * 0.25; gb *= 1 - lush * 0.2;
    const dryT = Math.max(0, 0.5 - moist) + Math.max(0, patch) * 0.3 * b.autumn;
    gr += (lin(0.62) - gr) * dryT * 0.5; gg += (lin(0.52) - gg) * dryT * 0.4; gb += (lin(0.26) - gb) * dryT * 0.4;
    const j = (0.85 + u3 * 0.3) * (forest > 0.55 ? 1.35 : 1);
    out.push(px, h - 0.05, pz, height, gr * j * 1.3, gg * j * 1.3, gb * j * 1.3, variant);
  }
  return new Float32Array(out);
}
