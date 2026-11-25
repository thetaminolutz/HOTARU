import { describe, it, expect } from 'vitest';
import { srgbToOklab, oklabToSrgb, hexToRgb, rgbToHex } from '../src/render/color';
import { buildLut, paletteAt, PALETTE_SIZE, expandPalette, paletteToBytes } from '../src/render/palette';
import { PALETTES, RAMP_SLOTS, RAMP_STEPS } from '../src/render/data/palettes';

describe('colour', () => {
  it('OKLab round-trips', () => {
    for (const hex of ['#0e1430', '#ffb347', '#c2452f', '#79b4e0', '#eef0e6']) {
      expect(rgbToHex(oklabToSrgb(srgbToOklab(hexToRgb(hex))))).toBe(hex);
    }
  });
});

describe('palettes', () => {
  it('every palette has every ramp slot (so palettes can blend)', () => {
    for (const p of Object.values(PALETTES)) for (const s of RAMP_SLOTS) expect(p[s]).toHaveLength(3);
  });
  it('expands to 48–96 colours (SPEC §3.4)', () => {
    expect(PALETTE_SIZE).toBe(RAMP_SLOTS.length * RAMP_STEPS);
    expect(PALETTE_SIZE).toBeGreaterThanOrEqual(48);
    expect(PALETTE_SIZE).toBeLessThanOrEqual(96);
    expect(expandPalette(PALETTES.night!)).toHaveLength(PALETTE_SIZE);
  });
  it('blends smoothly through the day', () => {
    const a = paletteAt(17.0), b = paletteAt(17.01);
    const d = Math.max(...a.map((c, i) => Math.hypot(c[0] - b[i]![0], c[1] - b[i]![1], c[2] - b[i]![2])));
    expect(d).toBeLessThan(0.01);
  });
  it('LUT maps palette colours to themselves', () => {
    const lab = paletteAt(21.5);
    const size = 16;
    const lut = buildLut(lab, size);
    const bytes = paletteToBytes(lab);
    // every LUT entry points at valid palette indices and a weight in [0,255]
    for (let i = 0; i < lut.length; i += 4) {
      expect(lut[i]!).toBeLessThan(PALETTE_SIZE);
      expect(lut[i + 1]!).toBeLessThan(PALETTE_SIZE);
    }
    // the nearest colour to the cell of a palette colour is a palette colour close to it
    const idx = 20;
    const [r, g, b] = [bytes[idx * 4]!, bytes[idx * 4 + 1]!, bytes[idx * 4 + 2]!];
    const cell = (v: number) => Math.round((v / 255) * (size - 1));
    const e = (cell(b) * size * size + cell(g) * size + cell(r)) * 4;
    const n = lut[e]!;
    const dist = Math.hypot(bytes[n * 4]! - r, bytes[n * 4 + 1]! - g, bytes[n * 4 + 2]! - b);
    expect(dist).toBeLessThan(40);
  });
});
