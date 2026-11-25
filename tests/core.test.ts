import { describe, it, expect } from 'vitest';
import { WorldClock, periodOf } from '../src/core/clock';
import { EventBus } from '../src/core/events';
import { migrate, SAVE_VERSION } from '../src/save/save';
import { createWorld } from '../src/world/heightfield';
import { buildNode, nodeIndex, RES } from '../src/world/terrainWorker';
import { placeTrees } from '../src/flora/placement';
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
      const h = createWorld(seed).height;
      let acc = 0;
      for (let z = -1000; z <= 1000; z += 50) for (let x = -1000; x <= 1000; x += 50) acc = (acc * 31 + Math.round(h(x, z) * 100)) >>> 0;
      return acc;
    };
    expect(hashGrid(DEFAULT_SEED)).toBe(hashGrid(DEFAULT_SEED));
    expect(hashGrid(DEFAULT_SEED)).not.toBe(hashGrid(DEFAULT_SEED + 1));
  });
  it('has a lake at the centre and land at the dock', () => {
    const h = createWorld(DEFAULT_SEED).height;
    expect(h(0, 0)).toBeLessThan(-3);
    expect(h(0, 330)).toBeGreaterThan(0.5);
  });
});

describe('world streaming', () => {
  const w = createWorld(DEFAULT_SEED);
  it('chunks regenerate identically (hash)', () => {
    const hash = (d: ReturnType<typeof buildNode>) => { let a = 0; for (const v of d.pos) a = (a * 31 + Math.round(v * 100)) >>> 0; return a; };
    expect(hash(buildNode(w, 512, -1024, 256))).toBe(hash(buildNode(createWorld(DEFAULT_SEED), 512, -1024, 256)));
  });
  it('index covers grid and skirts', () => {
    const idx = nodeIndex();
    expect(idx.length).toBe(RES * RES * 6 + 4 * RES * 6);
    const N = RES + 1;
    expect(Math.max(...idx)).toBe(N * N + 4 * N - 1);
  });
  it('tree placement is deterministic and keeps the dock open', () => {
    const a = placeTrees(w, -128, 128, 256), b = placeTrees(w, -128, 128, 256);
    expect(Object.keys(a)).toEqual(Object.keys(b));
    for (const k of Object.keys(a)) expect(Array.from(a[k]!)).toEqual(Array.from(b[k]!));
    let inCorridor = 0;
    for (const arr of Object.values(a)) for (let i = 0; i < arr.length; i += 5) {
      const dx = arr[i]!, dz = arr[i + 2]! - 284;
      if (Math.abs(dx) < 40 && dz > -10 && dz < 140) inCorridor++;
    }
    // only the six hand-placed framing trees stand near the pier
    expect(inCorridor).toBeLessThanOrEqual(6);
  });
  it('the sea is east and border ranges are high', () => {
    expect(w.height(4900, 0)).toBeLessThan(0);
    expect(w.height(-6500, 0)).toBeGreaterThan(600);
  });
});
