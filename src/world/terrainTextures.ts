/**
 * Terrain detail textures (SPEC §3.9): 32×32 greyscale pixel-art clusters, one layer per
 * ground material, tinted by biome colour in the shader. 16 texels per metre near the camera;
 * mipmaps average them away in the distance (no shimmer).
 */
import * as THREE from 'three';
import { Pixmap, rngFor } from '../render/pixmap';

export const LAYERS = ['grass', 'forestFloor', 'rock', 'snow', 'sand', 'soil', 'moss', 'leaves'] as const;

function grey(p: Pixmap, x: number, y: number, v: number): void {
  const g = Math.max(0, Math.min(255, Math.round(v * 255)));
  p.setW(x, y, (g << 16) | (g << 8) | g);
}

function layer(kind: (typeof LAYERS)[number]): Pixmap {
  const p = new Pixmap(32, 32), r = rngFor('terrain-' + kind);
  const base = 0.55;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) grey(p, x, y, base + (r.next() - 0.5) * 0.06);
  switch (kind) {
    case 'grass':
      // short blade strokes, lit tips
      for (let i = 0; i < 70; i++) {
        const x = r.int(0, 32), y = r.int(0, 32), len = r.int(2, 4), v = r.chance(0.5) ? 0.68 : 0.42;
        for (let k = 0; k < len; k++) grey(p, x + (k === len - 1 && r.chance(0.5) ? 1 : 0), y - k, k === len - 1 ? v + 0.08 : v);
      }
      break;
    case 'forestFloor':
    case 'leaves':
      for (let i = 0; i < 40; i++) {
        const x = r.int(0, 32), y = r.int(0, 32), v = kind === 'leaves' ? 0.4 + r.next() * 0.35 : 0.35 + r.next() * 0.3;
        grey(p, x, y, v); grey(p, x + 1, y, v * 0.9); grey(p, x, y + 1, v * 0.85);
        if (r.chance(0.4)) grey(p, x + 1, y + 1, v * 0.7);
      }
      break;
    case 'rock':
      for (let by = 0; by < 32; by += 8) for (let bx = 0; bx < 32; bx += 10) {
        const ox = bx + (by / 8) % 2 * 5, t = 0.45 + r.next() * 0.25;
        for (let y = by; y < by + 7; y++) for (let x = ox; x < ox + 9; x++) grey(p, x, y, t + (y === by ? 0.12 : 0) - (x === ox + 8 ? 0.1 : 0));
        grey(p, ox + r.int(1, 7), by + r.int(2, 6), t - 0.2);
      }
      break;
    case 'snow':
      for (let i = 0; i < 30; i++) grey(p, r.int(0, 32), r.int(0, 32), r.chance(0.5) ? 0.66 : 0.5);
      break;
    case 'sand':
      for (let i = 0; i < 60; i++) grey(p, r.int(0, 32), r.int(0, 32), r.chance(0.3) ? 0.38 : 0.64);
      for (let i = 0; i < 6; i++) { const x = r.int(0, 32), y = r.int(0, 32); grey(p, x, y, 0.3); grey(p, x + 1, y, 0.45); }
      break;
    case 'soil':
      for (let i = 0; i < 25; i++) { const x = r.int(0, 32), y = r.int(0, 32), v = 0.4 + r.next() * 0.3; grey(p, x, y, v); grey(p, x + 1, y, v - 0.08); }
      break;
    case 'moss':
      for (let i = 0; i < 50; i++) { const x = r.int(0, 32), y = r.int(0, 32); grey(p, x, y, r.chance(0.5) ? 0.66 : 0.45); }
      break;
  }
  return p;
}

export function terrainTextureArray(): THREE.DataArrayTexture {
  const L = LAYERS.length;
  const data = new Uint8Array(32 * 32 * 4 * L);
  LAYERS.forEach((k, i) => data.set(layer(k).data, i * 32 * 32 * 4));
  const t = new THREE.DataArrayTexture(data, 32, 32, L);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}
