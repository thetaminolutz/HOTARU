import { describe, it, expect } from 'vitest';
import { createNoise } from '../src/core/noise';

describe('noise', () => {
  it('is deterministic per seed', () => {
    const a = createNoise(5), b = createNoise(5);
    for (let i = 0; i < 100; i++) expect(a.noise2(i * 0.37, i * 0.11)).toBe(b.noise2(i * 0.37, i * 0.11));
  });
  it('stays roughly in [-1, 1]', () => {
    const n = createNoise(3);
    for (let i = 0; i < 5000; i++) {
      const v2 = n.noise2(i * 0.173, i * 0.311), v3 = n.noise3(i * 0.17, i * 0.07, i * 0.29);
      expect(Math.abs(v2)).toBeLessThanOrEqual(1.05);
      expect(Math.abs(v3)).toBeLessThanOrEqual(1.05);
    }
  });
  it('is continuous', () => {
    const n = createNoise(8);
    expect(Math.abs(n.noise2(10, 10) - n.noise2(10.001, 10))).toBeLessThan(0.01);
  });
});
