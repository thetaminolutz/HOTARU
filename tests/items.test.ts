import { describe, it, expect } from 'vitest';
import { Inventory, KEEPSAKES, TOOLS } from '../src/items/items';
import { Journey, MAP_CELLS } from '../src/items/journey';
import { FISH, pickFish } from '../src/items/data/fish';

describe('items (SPEC §10)', () => {
  it('has the keepsakes and tools of the spec', () => {
    expect(KEEPSAKES.length).toBeGreaterThanOrEqual(23);
    expect(TOOLS.map((t) => t.id)).toEqual(expect.arrayContaining(['lantern', 'rod', 'camera', 'sketchbook', 'map', 'flute', 'umbrella', 'boat']));
  });
  it('holds 12 keepsakes; tools never take a slot', () => {
    const inv = new Inventory();
    for (let i = 0; i < 12; i++) expect(inv.add('shell')).toBe(true);
    expect(inv.add('stone')).toBe(false);
    inv.give('rod'); inv.give('lantern');
    expect(inv.free).toBe(0);
    expect(inv.nextTool()).toBeTruthy();
    const j = new Inventory(); j.load(JSON.parse(JSON.stringify(inv.toJSON())));
    expect(j.slots.filter(Boolean).length).toBe(12);
    expect(j.tools.has('rod')).toBe(true);
  });
});

describe('journey & map reveal (SPEC §11)', () => {
  it('reveals around where you walk and saves it', () => {
    const j = new Journey();
    expect(j.revealed(0, 0)).toBe(0);
    j.revealAt(0, 0, 200);
    expect(j.revealed(0, 0)).toBeGreaterThan(0.9);
    expect(j.revealed(3000, 3000)).toBe(0);
    expect(j.explored).toBeGreaterThan(0);
    const k = new Journey(); k.load(JSON.parse(JSON.stringify(j.toJSON())));
    expect(k.reveal.length).toBe(MAP_CELLS * MAP_CELLS);
    expect(k.revealed(0, 0)).toBeCloseTo(j.revealed(0, 0));
  });
  it('keeps the biggest catch per species', () => {
    const j = new Journey();
    expect(j.caught('carp', 40, 0)).toBe(true);
    expect(j.caught('carp', 30, 1)).toBe(false);
    expect(j.caught('carp', 60, 2)).toBe(true);
    expect(j.fish.carp!.size).toBe(60);
  });
});

describe('fish (SPEC §21)', () => {
  it('has 30 species and always finds one for any water', () => {
    expect(FISH.length).toBe(30);
    for (const w of ['lake', 'river', 'sea', 'pond', 'marsh', 'mountain'] as const)
      for (let h = 0; h < 24; h += 3) for (let s = 0; s < 4; s++) expect(pickFish(w, h, s, false, Math.random())).toBeTruthy();
  });
  it('respects hours and seasons', () => {
    const night = new Set<string>(), day = new Set<string>();
    for (let i = 0; i < 400; i++) { night.add(pickFish('lake', 23, 1, false, i / 400).id); day.add(pickFish('lake', 12, 1, false, i / 400).id); }
    expect(night.has('lanternFish')).toBe(true);
    expect(day.has('lanternFish')).toBe(false);
  });
});
