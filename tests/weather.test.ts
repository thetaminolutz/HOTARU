import { describe, expect, it } from 'vitest';
import { Weather, LOOKS } from '../src/sky/weather';
import { seasonWeights, lookAt } from '../src/flora/data/seasons';

describe('seasons', () => {
  it('weights sum to one and blend into the next season', () => {
    for (let s = 0; s < 4; s += 0.05) expect(seasonWeights(s).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(seasonWeights(2.5)).toEqual([0, 0, 1, 0]);
    expect(seasonWeights(2.9)[3]).toBeGreaterThan(0.4);
  });
  it('cherries bloom in spring and are bare in winter; pines stay green', () => {
    expect(lookAt('cherry', 0.3).mix).toBe(1);
    expect(lookAt('cherry', 3.3).bare).toBeGreaterThan(0.8);
    expect(lookAt('pine', 3.3).bare).toBe(0);
    expect(lookAt('maple', 2.3).mix).toBe(0); // autumn: the tree's own reds
  });
});

describe('weather', () => {
  it('starts in autumn and cycles seasons every N days', () => {
    const w = new Weather();
    expect(w.seasonAt(0, 12)).toBeGreaterThanOrEqual(2);
    expect(Math.floor(w.seasonAt(7, 12))).toBe(3);
    w.seasonLock = 'autumn';
    expect(w.seasonAt(100, 0)).toBe(2);
  });
  it('rain wets the world; winter turns rain to snow and snow settles', () => {
    const w = new Weather();
    w.forced = 'rain';
    let o = w.update(0.1, 0.016, 0, 12, 'lake', 0, true);
    expect(o.rain).toBeGreaterThan(0.5);
    expect(o.wet).toBeGreaterThan(0.5);
    w.seasonLock = 'winter';
    o = w.update(0.1, 0.016, 0, 12, 'lake', 0, true);
    expect(o.rain).toBe(0);
    expect(o.snow).toBeGreaterThan(0.5);
    expect(o.snowCover).toBeGreaterThan(0.8);
  });
  it('changes weather on its own when not forced, blending over minutes', () => {
    const w = new Weather();
    const seen = new Set<string>();
    for (let h = 0; h < 24 * 14; h += 0.25) { w.update(0.25, 0.016, Math.floor(h / 24), h % 24, 'lake', 0); seen.add(w.current); }
    expect(seen.size).toBeGreaterThan(3);
    expect(Object.keys(LOOKS).length).toBeGreaterThanOrEqual(11);
  });
  it('storms flash and roll thunder after the light', () => {
    const w = new Weather();
    w.forced = 'storm';
    const delays: number[] = [];
    w.onThunder = (d) => delays.push(d);
    for (let i = 0; i < 2000; i++) w.update(0.001, 0.05, 0, 15, 'lake', 0, i === 0);
    expect(delays.length).toBeGreaterThan(0);
    expect(Math.min(...delays)).toBeGreaterThan(2);
  });
});
