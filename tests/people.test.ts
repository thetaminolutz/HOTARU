import { describe, expect, it } from 'vitest';
import { allLines, talk, GREET_FIRST, GREET_FRIEND, WANDERER_LINES } from '../src/people/dialogue';
import { SCHEDULES, WANDERERS } from '../src/people/data/people';
import { createRng } from '../src/core/rng';

const ctx = { name: 'Haru', job: 'farmer' as const, personality: 'cheerful' as const, age: 'adult' as const, met: 0, nick: 'Firefly', hour: 10, season: 'autumn' as const, weather: 'fair' as const, village: 'Inaho', friend: 'Mio' };

describe('people', () => {
  it('has 500+ distinct lines of dialogue and a voice for every wanderer', () => {
    expect(new Set(allLines()).size).toBeGreaterThanOrEqual(500);
    for (const w of WANDERERS) expect(WANDERER_LINES[w.id]?.length).toBeGreaterThan(5);
    expect(WANDERERS.length).toBeGreaterThanOrEqual(15);
  });
  it('schedules start at midnight and are in order', () => {
    for (const s of Object.values(SCHEDULES)) {
      expect(s[0]!.at).toBe(0);
      for (let i = 1; i < s.length; i++) expect(s[i]!.at).toBeGreaterThan(s[i - 1]!.at);
    }
    // the lantern maker lights the lanterns at dusk and puts them out at dawn
    expect(SCHEDULES.lanternMaker.some((s) => s.act === 'lightLanterns' && s.at > 16 && s.at < 19)).toBe(true);
    expect(SCHEDULES.lanternMaker.some((s) => s.act === 'snuffLanterns' && s.at < 7)).toBe(true);
  });
  it('a first meeting is polite; a friend is greeted by nickname', () => {
    const first = talk(ctx, createRng(1));
    expect(GREET_FIRST.cheerful.map((l) => l.replace(/\{name\}/g, 'Haru').replace(/\{village\}/g, 'Inaho').replace(/\{friend\}/g, 'Mio'))).toContain(first[0]);
    const friend = talk({ ...ctx, met: 6 }, createRng(1));
    expect(GREET_FRIEND.map((l) => l.replace(/\{nick\}/g, 'Firefly'))).toContain(friend[0]);
    expect(friend.length).toBeGreaterThanOrEqual(2);
    for (const l of [...first, ...friend]) expect(l).not.toMatch(/\{/);
  });
  it('talks are deterministic for a seed and vary with weather', () => {
    expect(talk(ctx, createRng(5))).toEqual(talk(ctx, createRng(5)));
    const rainy = new Set<string>();
    for (let k = 0; k < 40; k++) talk({ ...ctx, weather: 'rain', met: 1 }, createRng(k)).forEach((l) => rainy.add(l));
    expect([...rainy].some((l) => /rain|umbrella|frog|eaves/i.test(l))).toBe(true);
  });
});
