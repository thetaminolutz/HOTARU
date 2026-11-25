/** Pixel textures for villages (SPEC §7.1). 32×32 tiles, mostly 2×2 m (16 texels / m). */
import { Pixmap, rngFor, shadeHex } from '../render/pixmap';

/** White / ochre plaster with soft stains and a dark timber frame every 2 m. */
export function plaster(name = 'plaster', base = 0xe8dcc4): Pixmap {
  const p = new Pixmap(32, 32), r = rngFor(name);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let c = shadeHex(base, 0.96 + r.next() * 0.06);
    if (r.chance(0.04)) c = shadeHex(base, 0.88);
    if (y > 26 && r.chance(0.3)) c = shadeHex(base, 0.85); // splash stains near the ground
    p.set(x, y, c);
  }
  // timber frame (hashira) at the tile edges
  for (let y = 0; y < 32; y++) { p.set(0, y, 0x4a3226); p.set(1, y, 0x5a3e2c); }
  for (let x = 0; x < 32; x++) { p.set(x, 0, 0x4a3226); p.set(x, 31, 0x3a261e); }
  return p;
}

/** Thick straw thatch: layered, combed strands. */
export function thatch(name = 'thatch', base = 0x9a8456): Pixmap {
  const p = new Pixmap(32, 32), r = rngFor(name);
  for (let x = 0; x < 32; x++) {
    let tone = 0.85 + r.next() * 0.3;
    for (let y = 0; y < 32; y++) {
      if (r.chance(0.15)) tone = 0.8 + r.next() * 0.35;
      let c = shadeHex(base, tone * (1.05 - ((y % 8) / 8) * 0.3));
      if (y % 8 === 7) c = shadeHex(base, 0.55);
      if (r.chance(0.03)) c = 0x6a7a44; // moss
      p.set(x, y, c);
    }
  }
  return p;
}

/** Kawara roof tiles: rounded rows (blue-grey or brown). */
export function kawara(name = 'kawara', base = 0x5a6270): Pixmap {
  const p = new Pixmap(32, 32), r = rngFor(name);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const col = x % 8, row = y % 8;
    // convex tile rows: bright crest, dark troughs; overlap shadow at each course
    const crest = Math.cos(((col - 3.5) / 4) * Math.PI * 0.5);
    let c = shadeHex(base, 0.55 + crest * 0.6);
    if (row === 0) c = shadeHex(base, 0.45);
    if (row === 1) c = shadeHex(base, 0.75 + crest * 0.5);
    if (r.chance(0.03)) c = shadeHex(c, 0.85);
    p.set(x, y, c);
  }
  return p;
}

/** Tatami: woven rush with a dark cloth border (32×32 = 1×2 m mat). */
export function tatami(): Pixmap {
  const p = new Pixmap(32, 32), r = rngFor('tatami');
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let c = shadeHex(0xb8b478, 0.92 + ((y % 2) * 0.08) + r.next() * 0.04);
    if (x < 2 || x > 29) c = 0x2a3a2a; // heri border
    p.set(x, y, c);
  }
  return p;
}

/** Packed earth / gravel path. */
export function dirt(name = 'dirt', base = 0x8a7458): Pixmap {
  const p = new Pixmap(32, 32), r = rngFor(name);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let c = shadeHex(base, 0.9 + r.next() * 0.15);
    if (r.chance(0.06)) c = shadeHex(base, 0.7);
    if (r.chance(0.04)) c = shadeHex(base, 1.2);
    p.set(x, y, c);
  }
  return p;
}

/** Indigo noren curtain with a white crest. 16×16. */
export function noren(): Pixmap {
  const p = new Pixmap(16, 16);
  p.fill(0x2a3a6a);
  for (let x = 0; x < 16; x += 5) p.vline(x, 4, 15, 0x1a2448); // slits
  p.disc(8, 7, 3, 0xe8e0d0);
  p.disc(8, 7, 1, 0x2a3a6a);
  p.hline(0, 15, 0, 0x1a1a20);
  return p;
}

/** Copper-green temple roof. */
export function copperRoof(): Pixmap { return kawara('copper', 0x5a9a84); }
