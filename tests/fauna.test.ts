import { describe, expect, it } from 'vitest';
import { SPECIES } from '../src/fauna/data/species';
import { buildAnimal, PART } from '../src/fauna/models';

describe('fauna', () => {
  it('has 30+ peaceful species with habitats and hours', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
    for (const s of SPECIES) {
      expect(s.habitats.length).toBeGreaterThan(0);
      expect(s.group[0]).toBeLessThanOrEqual(s.group[1]);
    }
  });
  it('every species builds a body with animatable parts', () => {
    for (const s of SPECIES) {
      const { geo, height } = buildAnimal(s);
      const parts = new Set(Array.from(geo.getAttribute('aPart').array as Float32Array));
      expect(parts.has(PART.body)).toBe(true);
      if (s.plan === 'quad') for (const p of [PART.head, PART.fl, PART.fr, PART.bl, PART.br, PART.tail]) expect(parts.has(p)).toBe(true);
      if (s.plan === 'bird' || s.plan === 'insect') expect(parts.has(PART.wingL) && parts.has(PART.wingR)).toBe(true);
      expect(height).toBeGreaterThan(0);
      expect(geo.getAttribute('position').count).toBe(geo.getAttribute('aPivot').count);
    }
  });
});
