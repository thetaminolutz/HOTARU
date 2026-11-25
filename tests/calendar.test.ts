import { describe, it, expect } from 'vitest';
import { festivalOn, festivalNow, festivalSoon, FESTIVALS } from '../src/events/calendar';

const C = { seasonDays: 7, startSeason: 2, lock: null };

describe('festival calendar (SPEC §22)', () => {
  it('has the five festivals', () => {
    expect(FESTIVALS.map((f) => f.id).sort()).toEqual(['hanami', 'newYear', 'tanabata', 'tsukimi', 'yukitoro']);
  });
  it('holds one festival per season over a year, plus New Year', () => {
    const seen: string[] = [];
    for (let d = 0; d < 28; d++) { const f = festivalOn(d, C); if (f) seen.push(f.id); }
    expect(seen.sort()).toEqual(['hanami', 'newYear', 'tanabata', 'tsukimi', 'yukitoro']);
  });
  it('a new journey (autumn) reaches tsukimi on day 3, in the evening', () => {
    expect(festivalOn(3, C)?.id).toBe('tsukimi');
    expect(festivalNow(3, 20, C)?.id).toBe('tsukimi');
    expect(festivalNow(3, 9, C)).toBeNull();
    expect(festivalSoon(1, C)?.f.id).toBe('tsukimi');
  });
  it('the summer festival comes about three seasons in', () => {
    const d = [...Array(28).keys()].find((k) => festivalOn(k, C)?.id === 'tanabata')!;
    expect(d).toBe(24);
  });
  it('with a locked season the festival repeats', () => {
    const L = { seasonDays: 7, startSeason: 2, lock: 1 };
    expect(festivalOn(3, L)?.id).toBe('tanabata');
    expect(festivalOn(10, L)?.id).toBe('tanabata');
  });
});
