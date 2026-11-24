/** Procedural pixel-art textures (SPEC §3.9, §7.1). Generated at boot, nothing downloaded. */
import * as THREE from 'three';
import { Pixmap, rngFor, shadeHex, mixHex } from './pixmap';

export function toTexture(p: Pixmap, opts: { repeat?: boolean; mips?: boolean; srgb?: boolean } = {}): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(p.data.buffer), p.w, p.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.flipY = false;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = opts.mips === false ? THREE.NearestFilter : THREE.NearestMipmapNearestFilter;
  t.generateMipmaps = opts.mips !== false;
  t.wrapS = t.wrapT = opts.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Horizontal wooden planks. 32×32 covers 2×2 m (16 texels per metre). */
export function woodPlanks(name = 'planks', base = 0x8a5a3a): Pixmap {
  const p = new Pixmap(32, 32), r = rngFor(name);
  for (let row = 0; row < 8; row++) {
    const y0 = row * 4;
    const tone = 0.82 + r.next() * 0.3;
    const c = shadeHex(base, tone);
    const seam = r.int(0, 32);
    for (let y = y0; y < y0 + 4; y++) for (let x = 0; x < 32; x++) {
      let cc = c;
      if (y === y0) cc = shadeHex(base, tone * 1.12); // lit top edge
      if (y === y0 + 3) cc = shadeHex(base, 0.45); // gap shadow
      if (r.chance(0.06)) cc = shadeHex(cc, 0.85); // grain
      p.set(x, y, cc);
    }
    p.vline(seam, y0, y0 + 2, shadeHex(base, 0.5));
    if (r.chance(0.5)) p.set(r.int(2, 30), y0 + 1, shadeHex(base, 0.6)); // knot
  }
  return p;
}

export function verticalPlanks(name = 'vplanks', base = 0x7a4c30): Pixmap {
  const src = woodPlanks(name, base), p = new Pixmap(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, src.get(y, x));
  return p;
}

/** Overlapping roof shingles / cedar bark roof. 32×32 = 2×2 m. */
export function shingles(name = 'shingles', base = 0x5a4a4a): Pixmap {
  const p = new Pixmap(32, 32), r = rngFor(name);
  for (let row = 0; row < 8; row++) {
    const y0 = row * 4, off = row % 2 ? 3 : 0;
    for (let x = 0; x < 32; x++) for (let y = y0; y < y0 + 4; y++) {
      const t = (y - y0) / 3;
      let c = shadeHex(base, 1.15 - t * 0.35);
      if ((x + off) % 6 === 0) c = shadeHex(base, 0.55);
      if (r.chance(0.05)) c = shadeHex(c, 0.88);
      p.set(x, y, c);
    }
  }
  return p;
}

/** Shōji paper with wooden lattice; white so the emissive light can tint it. 32×32 = 1×1 m. */
export function shoji(): Pixmap {
  const p = new Pixmap(32, 32), r = rngFor('shoji');
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const c = r.chance(0.08) ? 0xf0e6cc : 0xfff4dc;
    p.set(x, y, c);
  }
  for (let i = 0; i < 32; i += 8) { p.hline(0, 31, i, 0x3a2418); p.vline(i, 0, 31, 0x3a2418); }
  return p;
}

/** Paper lantern skin with horizontal ribs. 16×16, white-gold so emissive shows through. */
export function lanternPaper(): Pixmap {
  const p = new Pixmap(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let c = 0xfff0c8;
    if (y % 4 === 0) c = 0xd08a40;
    if (y === 0 || y === 15) c = 0x3a2418;
    p.set(x, y, c);
  }
  return p;
}

/** Stone blocks (pier footings, lantern bases). */
export function stone(name = 'stone', base = 0x8a8a90): Pixmap {
  const p = new Pixmap(32, 32), r = rngFor(name);
  p.fill(shadeHex(base, 0.5));
  for (let by = 0; by < 32; by += 8) {
    const off = (by / 8) % 2 ? 6 : 0;
    for (let bx = -12; bx < 32; bx += 12) {
      const tone = 0.85 + r.next() * 0.3;
      for (let y = by + 1; y < by + 8; y++) for (let x = bx + off + 1; x < bx + off + 12; x++) {
        let c = shadeHex(base, tone * (y === by + 1 ? 1.15 : 1));
        if (r.chance(0.07)) c = shadeHex(c, 0.82);
        p.setW(x, y, c);
      }
    }
  }
  return p;
}

/**
 * Leaf-cluster atlas: 2×2 blobs of 32×32 with leafy edges and painted inner clusters.
 * Greyscale (tinted per tree), alpha-tested.
 */
export function leafAtlas(): Pixmap {
  const p = new Pixmap(64, 64);
  for (let v = 0; v < 4; v++) {
    const r = rngFor('leaf' + v);
    const ox = (v % 2) * 32, oy = Math.floor(v / 2) * 32;
    const blobs: [number, number, number][] = [];
    const n = 6 + r.int(0, 4);
    for (let i = 0; i < n; i++) {
      const a = r.next() * Math.PI * 2, d = r.next() * 7;
      blobs.push([16 + Math.cos(a) * d, 16 + Math.sin(a) * d * 0.8, 5 + r.next() * 4.5]);
    }
    const inside = (x: number, y: number) => blobs.some(([bx, by, br]) => (x - bx) ** 2 + (y - by) ** 2 <= br * br);
    for (let y = 1; y < 31; y++) for (let x = 1; x < 31; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      // leafy edge: drop some border pixels, add little leaf points
      const edge = !inside(x - 0.5, y + 0.5) || !inside(x + 1.5, y + 0.5) || !inside(x + 0.5, y - 0.5) || !inside(x + 0.5, y + 1.5);
      if (edge && r.chance(0.35)) continue;
      // inner shading: lighter upper-left, clusters of leaf clumps
      const lx = (x - 16) / 14, ly = (y - 16) / 14;
      let l = 0.72 - ly * 0.22 - lx * 0.1;
      const clump = Math.sin(x * 1.7 + v) * Math.cos(y * 1.3 - v) > 0.55;
      if (clump) l += 0.12;
      if (r.chance(0.12)) l -= 0.12;
      if (edge) l -= 0.08;
      const g = Math.max(40, Math.min(255, Math.round(l * 255)));
      p.set(ox + x, oy + y, (g << 16) | (g << 8) | g);
    }
    // a few stray leaves outside the outline
    for (let i = 0; i < 10; i++) {
      const a = r.next() * Math.PI * 2, d = 11 + r.next() * 3;
      const x = Math.round(16 + Math.cos(a) * d), y = Math.round(16 + Math.sin(a) * d * 0.85);
      if (x > 0 && y > 0 && x < 31 && y < 31) p.set(ox + x, oy + y, 0x9a9a9a);
    }
  }
  return p;
}

/** Grass/reed atlas, 4 variants of 32×64: meadow tuft, tall grass, reeds, cattails. Greyscale, 1-px blades. */
export function grassAtlas(): Pixmap {
  const p = new Pixmap(128, 64);
  const variants = [
    { blades: 16, h: [16, 34], lean: 6, w: 1 },
    { blades: 12, h: [28, 50], lean: 8, w: 1 },
    { blades: 9, h: [40, 63], lean: 4, w: 1 },
    { blades: 7, h: [44, 63], lean: 3, w: 1, cattail: true },
  ];
  variants.forEach((vdef, v) => {
    const r = rngFor('grass' + v);
    const ox = v * 32;
    for (let b = 0; b < vdef.blades; b++) {
      const x0 = 6 + r.int(0, 20);
      const h = r.int(vdef.h[0]!, vdef.h[1]!);
      const lean = (r.next() - 0.5) * vdef.lean * 2;
      const tone = 0.55 + r.next() * 0.45;
      for (let y = 0; y < h; y++) {
        const t = y / h;
        const x = Math.round(x0 + lean * t * t);
        const g = Math.round(255 * Math.min(1, tone * (0.6 + t * 0.55)));
        p.set(ox + x, 63 - y, (g << 16) | (g << 8) | g);
        if (y < h * 0.25) p.set(ox + x + 1, 63 - y, shadeHex((g << 16) | (g << 8) | g, 0.75));
      }
      if (vdef.cattail && b % 2 === 0) {
        const x = Math.round(x0 + lean);
        for (let y = h - 9; y < h - 2; y++) { p.set(ox + x, 63 - y, 0x5a3a2a); p.set(ox + x + 1, 63 - y, 0x4a2e22); }
      }
    }
  });
  return p;
}

/** Soft radial glow for lantern halos, dithered rings are added by the quantize pass. */
export function glowSprite(): Pixmap {
  const p = new Pixmap(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot(x - 15.5, y - 15.5) / 15.5;
    const a = Math.max(0, 1 - d);
    const v = Math.round(255 * Math.pow(a, 2.2));
    p.set(x, y, 0xffffff, v);
  }
  return p;
}

export { mixHex };
