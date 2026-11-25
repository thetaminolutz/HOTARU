import { describe, expect, it } from 'vitest';
import { LORE, SHRINE_HAIKU, VIEW_HAIKU } from '../src/secrets/data/texts';
import { createWorld } from '../src/world/heightfield';
import { DEFAULT_SEED } from '../src/config';

describe('secrets', () => {
  it('has the castle story in 30 fragments and haiku for every place', () => {
    expect(LORE.length).toBe(30);
    expect(SHRINE_HAIKU.length).toBeGreaterThanOrEqual(23);
    expect(VIEW_HAIKU.length).toBeGreaterThanOrEqual(25);
    for (const h of [...SHRINE_HAIKU, ...VIEW_HAIKU]) expect(h.split(' / ').length).toBe(3);
  });
  it('sculpts a castle plateau and three grottos with ramps down to their floors', () => {
    const w = createWorld(DEFAULT_SEED), S = w.sites;
    expect(S.grottos.map((g) => g.id).sort()).toEqual(['ice', 'sea', 'waterfall']);
    for (const g of S.grottos) {
      expect(w.height(g.x, g.z)).toBeLessThan(g.floor + 0.5);
      // out of the mouth the ground never rises faster than a walkable 1:2.4 cut
      for (let d = g.r; d < g.r + g.ramp; d += 2) {
        const h = w.height(g.x + Math.sin(g.dir) * d, g.z + Math.cos(g.dir) * d);
        expect(h).toBeLessThanOrEqual(g.floor + (d - g.r + 1) / 2.4 + 0.1);
      }
    }
    // the plateau is nearly flat
    const C = S.castle, hs = [[-20, 0], [20, 0], [0, -20], [0, 20]].map(([a, b]) => w.height(C.x + a!, C.z + b!));
    expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(8);
  });
});
