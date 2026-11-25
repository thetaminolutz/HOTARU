import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/world/heightfield';
import { placeGround, STRIDE } from '../src/flora/groundPlacement';
import { GROUND_VARIANTS } from '../src/flora/groundAtlas';
import { DEFAULT_SEED } from '../src/config';

describe('ground plants', () => {
  const w = createWorld(DEFAULT_SEED);
  it('are deterministic per tile', () => {
    const a = placeGround(w, 32, 320, 16, 0.7, []);
    const b = placeGround(w, 32, 320, 16, 0.7, []);
    expect(a.length).toBeGreaterThan(0);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
  it('stay inside the tile, use known variants and skip excluded rects', () => {
    const d = placeGround(w, 0, 300, 16, 0.7, [[0, 300, 8, 316]]);
    for (let o = 0; o < d.length; o += STRIDE) {
      expect(d[o]!).toBeGreaterThanOrEqual(8);
      expect(d[o]!).toBeLessThan(16);
      expect(d[o + 7]!).toBeLessThan(GROUND_VARIANTS.length);
    }
  });
  it('grow flower fields in the cosmos region', () => {
    const d = placeGround(w, 2900, 3000, 16, 1, []);
    const flowers = new Set(['cosmos', 'daisy', 'dandelion', 'spiderLily', 'bellflower'].map((n) => GROUND_VARIANTS.indexOf(n as never)));
    let n = 0;
    for (let o = 0; o < d.length; o += STRIDE) if (flowers.has(d[o + 7]!)) n++;
    expect(n).toBeGreaterThan(20);
  });
});
