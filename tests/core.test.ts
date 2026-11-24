import { describe, it, expect } from 'vitest';
import { WorldClock, periodOf } from '../src/core/clock';
import { EventBus } from '../src/core/events';
import { migrate, SAVE_VERSION } from '../src/save/save';
import { createHeightFn } from '../src/world/testTerrain';
import { DEFAULT_SEED } from '../src/config';

describe('clock', () => {
  it('24 real minutes per day by default', () => {
    const c = new WorldClock();
    c.setHour(0);
    c.tick(60); // one real minute
    expect(c.hour).toBeCloseTo(1, 5);
  });
  it('wraps and counts days', () => {
    const c = new WorldClock();
    c.setHour(23.9);
    c.tick(30);
    expect(c.day).toBe(1);
    expect(c.hour).toBeLessThan(1);
  });
  it('names periods', () => {
    expect(periodOf(12)).toBe('noon');
    expect(periodOf(17.6)).toBe('golden hour');
    expect(periodOf(21.5)).toBe('night');
  });
});

describe('event bus', () => {
  it('delivers and unsubscribes', () => {
    const bus = new EventBus<{ a: { n: number } }>();
    let got = 0;
    const off = bus.on('a', ({ n }) => (got += n));
    bus.emit('a', { n: 2 });
    off();
    bus.emit('a', { n: 5 });
    expect(got).toBe(2);
  });
});

describe('save', () => {
  it('accepts the current version', () => {
    const s = migrate({ version: SAVE_VERSION, seed: 1, pos: [0, 0, 0], yaw: 0, pitch: 0, hour: 1, day: 0, savedAt: 0 });
    expect(s?.seed).toBe(1);
  });
  it('rejects unknown old versions without a migration', () => {
    expect(migrate({ version: 0 })).toBeNull();
  });
});

describe('world generation', () => {
  it('same seed → same terrain (hash of a height grid)', () => {
    const hashGrid = (seed: number) => {
      const h = createHeightFn(seed);
      let acc = 0;
      for (let z = -1000; z <= 1000; z += 50) for (let x = -1000; x <= 1000; x += 50) acc = (acc * 31 + Math.round(h(x, z) * 100)) >>> 0;
      return acc;
    };
    expect(hashGrid(DEFAULT_SEED)).toBe(hashGrid(DEFAULT_SEED));
    expect(hashGrid(DEFAULT_SEED)).not.toBe(hashGrid(DEFAULT_SEED + 1));
  });
  it('has a lake at the centre and land at the dock', () => {
    const h = createHeightFn(DEFAULT_SEED);
    expect(h(0, 0)).toBeLessThan(-3);
    expect(h(0, 330)).toBeGreaterThan(0.5);
  });
});
