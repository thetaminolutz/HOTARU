/**
 * Palette expansion, blending and the RGB→palette lookup table (LUT) used by the
 * quantize pass. LUT entry = (nearest index, second index, blend weight) in OKLab.
 */
import { oklabToSrgb, srgbToOklab, hexToRgb, type RGB } from './color';
import { PALETTES, PALETTE_KEYS, RAMP_SLOTS, RAMP_STEPS, type PaletteDef } from './data/palettes';
import { wrapHour } from '../core/math';

export const PALETTE_SIZE = RAMP_SLOTS.length * RAMP_STEPS;
export const LUT_SIZE = 48;

/** Expand a palette definition into OKLab colours (PALETTE_SIZE entries). */
export function expandPalette(def: PaletteDef): RGB[] {
  const out: RGB[] = [];
  const half = (RAMP_STEPS - 1) / 2;
  for (const slot of RAMP_SLOTS) {
    const [d, m, l] = def[slot].map((h) => srgbToOklab(hexToRgb(h))) as [RGB, RGB, RGB];
    for (let i = 0; i < RAMP_STEPS; i++) {
      const t = i / half;
      const a = t <= 1 ? d : m, b = t <= 1 ? m : l, u = t <= 1 ? t : t - 1;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]);
    }
  }
  return out;
}

const expanded = new Map<string, RGB[]>();
function getExpanded(name: string): RGB[] {
  let p = expanded.get(name);
  if (!p) expanded.set(name, (p = expandPalette(PALETTES[name]!)));
  return p;
}

/** The blended OKLab palette for an hour of the day. */
export function paletteAt(hour: number): RGB[] {
  const h = wrapHour(hour);
  let i = 0;
  while (i < PALETTE_KEYS.length - 2 && PALETTE_KEYS[i + 1]!.hour <= h) i++;
  const a = PALETTE_KEYS[i]!, b = PALETTE_KEYS[i + 1]!;
  const t = (h - a.hour) / Math.max(1e-6, b.hour - a.hour);
  const pa = getExpanded(a.palette), pb = getExpanded(b.palette);
  return pa.map((c, k) => {
    const d = pb[k]!;
    return [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t] as RGB;
  });
}

/** OKLab palette → sRGB bytes (RGBA8, PALETTE_SIZE×1). */
export function paletteToBytes(lab: RGB[], out = new Uint8Array(lab.length * 4)): Uint8Array {
  lab.forEach((c, i) => {
    const [r, g, b] = oklabToSrgb(c);
    out[i * 4] = Math.round(r * 255); out[i * 4 + 1] = Math.round(g * 255); out[i * 4 + 2] = Math.round(b * 255); out[i * 4 + 3] = 255;
  });
  return out;
}

/**
 * Build the LUT: for each sRGB cell, the two nearest palette colours in OKLab and the
 * projection weight of the input onto the segment between them (for ordered dither).
 */
export function buildLut(lab: RGB[], size = LUT_SIZE, out = new Uint8Array(size * size * size * 4)): Uint8Array {
  const n = lab.length;
  const pl = new Float32Array(n * 3);
  lab.forEach((c, i) => { pl[i * 3] = c[0]; pl[i * 3 + 1] = c[1]; pl[i * 3 + 2] = c[2]; });
  // Precompute per-axis sRGB→linear to speed up OKLab conversion.
  const lin = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const c = i / (size - 1);
    lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  let o = 0;
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const r = lin[ri]!, g = lin[gi]!, b = lin[bi]!;
        const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
        const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
        const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
        let i1 = 0, i2 = 0, d1 = 1e9, d2 = 1e9;
        for (let k = 0; k < n; k++) {
          const dl = (L - pl[k * 3]!) * 1.3, da = A - pl[k * 3 + 1]!, db = B - pl[k * 3 + 2]!;
          const d = dl * dl + da * da + db * db;
          if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = k; } else if (d < d2) { d2 = d; i2 = k; }
        }
        // projection of input on segment p1→p2
        const ax = pl[i2 * 3]! - pl[i1 * 3]!, ay = pl[i2 * 3 + 1]! - pl[i1 * 3 + 1]!, az = pl[i2 * 3 + 2]! - pl[i1 * 3 + 2]!;
        const len2 = ax * ax + ay * ay + az * az;
        let t = len2 > 1e-9 ? ((L - pl[i1 * 3]!) * ax + (A - pl[i1 * 3 + 1]!) * ay + (B - pl[i1 * 3 + 2]!) * az) / len2 : 0;
        t = Math.min(1, Math.max(0, t));
        out[o++] = i1; out[o++] = i2; out[o++] = Math.round(t * 255); out[o++] = 255;
      }
    }
  }
  return out;
}
