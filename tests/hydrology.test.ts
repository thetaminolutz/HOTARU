import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/world/heightfield';
import { DEFAULT_SEED } from '../src/config';

const w = createWorld(DEFAULT_SEED);
const hy = w.hydro;

describe('hydrology', () => {
  it('is deterministic', () => {
    const b = createWorld(DEFAULT_SEED).hydro;
    expect(b.rivers.map((r) => r.pts.length)).toEqual(hy.rivers.map((r) => r.pts.length));
    expect(b.falls.length).toBe(hy.falls.length);
  });
  it('has a main river into the lake and out to the sea, tributaries, ponds and waterfalls', () => {
    expect(hy.rivers.filter((r) => r.main).length).toBe(2);
    expect(hy.rivers.length).toBeGreaterThanOrEqual(6);
    expect(hy.ponds.length).toBeGreaterThan(0);
    expect(hy.falls.some((f) => f.river === 'upper' && f.top - f.bottom > 15)).toBe(true);
    const upper = hy.rivers.find((r) => r.id === 'upper')!;
    expect(upper.pts[0]!.level).toBeGreaterThan(300);
    expect(Math.abs(upper.pts[upper.pts.length - 1]!.level)).toBeLessThan(1);
  });
  it('water only ever flows downhill', () => {
    for (const r of hy.rivers) for (let i = 1; i < r.pts.length; i++) expect(r.pts[i]!.level).toBeLessThanOrEqual(r.pts[i - 1]!.level + 1e-6);
  });
  it('rivers are carved: the bed lies under the water surface', () => {
    for (const r of hy.rivers) for (let i = 0; i < r.pts.length; i += 25) {
      const p = r.pts[i]!;
      if (p.level < 0.5) continue;
      expect(w.height(p.x, p.z)).toBeLessThan(p.level);
      expect(hy.waterAt(p.x, p.z)).toBeCloseTo(p.level, 0);
    }
  });
});
