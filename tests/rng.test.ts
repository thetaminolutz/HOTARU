import { describe, it, expect } from 'vitest';
import { createRng, hashString, hash3 } from '../src/core/rng';

describe('rng', () => {
  it('same seed → same sequence', () => {
    const a = createRng(1234), b = createRng(1234);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });
  it('different seeds differ', () => {
    const a = createRng(1), b = createRng(2);
    const sa = Array.from({ length: 8 }, () => a.next()), sb = Array.from({ length: 8 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });
  it('values are in [0,1) and roughly uniform', () => {
    const r = createRng(99);
    let sum = 0;
    for (let i = 0; i < 20000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); sum += v; }
    expect(sum / 20000).toBeCloseTo(0.5, 1);
  });
  it('forks are deterministic and independent', () => {
    const a = createRng(7).fork('trees'), b = createRng(7).fork('trees'), c = createRng(7).fork('rocks');
    expect(a.next()).toBe(b.next());
    expect(createRng(7).fork('trees').next()).not.toBe(c.next());
  });
  it('hashes are stable', () => {
    expect(hashString('hotaru')).toBe(hashString('hotaru'));
    expect(hash3(1, 2, 3, 4)).toBe(hash3(1, 2, 3, 4));
    expect(hash3(1, 2, 3, 4)).not.toBe(hash3(1, 2, 3, 5));
  });
});
