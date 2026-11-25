import { describe, it, expect } from 'vitest';
import { bodyFont, headingFont, tinyFont } from '../src/ui/font';
import { chooseInternal } from '../src/render/resolution';

describe('pixel fonts', () => {
  it('body font covers printable ASCII and German characters', () => {
    for (let c = 33; c < 127; c++) expect(bodyFont.glyphs.has(String.fromCharCode(c)), String.fromCharCode(c)).toBe(true);
    for (const ch of 'äöüÄÖÜß') expect(bodyFont.glyphs.has(ch), ch).toBe(true);
  });
  it('glyphs fit the 9-px body grid', () => {
    for (const g of bodyFont.glyphs.values()) { expect(g.h).toBeLessThanOrEqual(9); expect(g.w).toBeLessThanOrEqual(6); }
  });
  it('heading font is the brushed 2× version', () => {
    expect(headingFont.glyph('A')!.h).toBe(bodyFont.glyph('A')!.h * 2);
  });
  it('tiny font has all digits', () => {
    for (const d of '0123456789') expect(tinyFont.glyphs.has(d)).toBe(true);
  });
  it('measures and wraps', () => {
    expect(bodyFont.measure('Hi')).toBeGreaterThan(0);
    const lines = bodyFont.wrap('one paper lantern and the whole dark lake leans in', 60);
    for (const l of lines) expect(bodyFont.measure(l)).toBeLessThanOrEqual(60);
  });
});

describe('integer scaling', () => {
  it('iPad Air landscape at Medium → scale 5 (328 px tall, square pixels)', () => {
    expect(chooseInternal(2360, 1640, 360)).toEqual({ scale: 5, width: 472, height: 328 });
  });
  it('1080p desktop at High', () => {
    const r = chooseInternal(1920, 1080, 450);
    expect(r.scale).toBe(2);
    expect(r.width * r.scale).toBeGreaterThanOrEqual(1920);
  });
  it('never below scale 1', () => {
    expect(chooseInternal(300, 200, 360).scale).toBe(1);
  });
});
