import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/world/heightfield';
import { layoutVillage } from '../src/buildings/layout';
import { VILLAGES } from '../src/buildings/data/villages';
import { buildHouse } from '../src/buildings/house';
import { findRoad } from '../src/buildings/roads';
import { DEFAULT_SEED } from '../src/config';

const w = createWorld(DEFAULT_SEED);

describe('villages', () => {
  it('lay out deterministically, on land, without overlapping houses', () => {
    for (const def of VILLAGES) {
      const a = layoutVillage(def, w.height, DEFAULT_SEED), b = layoutVillage(def, w.height, DEFAULT_SEED);
      expect(a.houses).toEqual(b.houses);
      expect(a.houses.length).toBeGreaterThan(1);
      const rects = a.houses.map((h) => { const odd = h.rot % 2 === 1; const hw = (odd ? h.d : h.w) / 2, hd = (odd ? h.w : h.d) / 2; return [h.x - hw, h.z - hd, h.x + hw, h.z + hd]; });
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const [a0, b0, c0, d0] = rects[i]!, [a1, b1, c1, d1] = rects[j]!;
        expect(a0 < c1 && c0 > a1 && b0 < d1 && d0 > b1).toBe(false);
      }
      for (const h of a.houses) expect(h.groundMin).toBeGreaterThan(1);
    }
  });

  it('the market town is the largest village', () => {
    const n = VILLAGES.map((d) => layoutVillage(d, w.height, DEFAULT_SEED).houses.length);
    expect(n[0]).toBe(Math.max(...n));
    expect(n[0]).toBeGreaterThan(15);
  });

  it('every house is enterable: a door gap in the walls, a floor, steps to the ground, a room', () => {
    const def = VILLAGES[1]!;
    for (const spec of layoutVillage(def, w.height, DEFAULT_SEED).houses) {
      const h = buildHouse(spec, w.height);
      expect(h.doors.length).toBe(1);
      expect(h.rooms.length).toBe(1);
      // the door's centre is not inside any wall collider
      const d = h.doors[0]!.pos;
      expect(h.colliders.some((c) => d.x > c.x0 + 0.05 && d.x < c.x1 - 0.05 && d.z > c.z0 + 0.05 && d.z < c.z1 - 0.05)).toBe(false);
      // a floor deck at floor height, and steps no taller than 0.3 m each
      const ys = h.decks.map((k) => k[4]).sort((a, b) => b - a);
      expect(ys[0]).toBeCloseTo(spec.floorY, 5);
      for (let i = 1; i < ys.length; i++) expect(ys[i - 1]! - ys[i]!).toBeLessThanOrEqual(0.31);
    }
  });

  it('roads find a way between villages', () => {
    const p = findRoad(w.height, -200, 3050, 1500, 1500);
    expect(p.length).toBeGreaterThan(10);
    const [sx, sz] = p[0]!, [ex, ez] = p[p.length - 1]!;
    expect(Math.hypot(sx + 200, sz - 3050)).toBeLessThan(1);
    expect(Math.hypot(ex - 1500, ez - 1500)).toBeLessThan(1);
  });
});
