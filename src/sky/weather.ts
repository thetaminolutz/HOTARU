/**
 * Weather & seasons (SPEC §12). Weather is a small state machine whose next state is drawn
 * from the season's and the region's climate; every change blends over in-game minutes.
 * The result drives clouds, light, fog and mist, wind, rain and snow particles, wetness and
 * puddles, snow lying on the ground, rain rings, lightning with thunder, and a rainbow after
 * rain. Seasons follow the day counter (N days each) or are locked in Settings.
 */
import * as THREE from 'three';
import { createRng } from '../core/rng';
import { seasonWeights, GRASS_TINT, type SeasonName, SEASONS } from '../flora/data/seasons';

export type WeatherId = 'clear' | 'partly' | 'overcast' | 'drizzle' | 'rain' | 'heavyRain' | 'storm' | 'fog' | 'sunshower' | 'snow' | 'heavySnow';

type Look = { cloud: number; rain: number; snow: number; fog: number; wind: number; dark: number; storm: number };
export const LOOKS: Record<WeatherId, Look> = {
  clear:     { cloud: 0.45, rain: 0, snow: 0, fog: 0, wind: 0.5, dark: 0, storm: 0 },
  partly:    { cloud: 0.7, rain: 0, snow: 0, fog: 0, wind: 0.55, dark: 0.08, storm: 0 },
  overcast:  { cloud: 0.95, rain: 0, snow: 0, fog: 0.25, wind: 0.55, dark: 0.45, storm: 0 },
  drizzle:   { cloud: 0.9, rain: 0.3, snow: 0, fog: 0.35, wind: 0.4, dark: 0.45, storm: 0 },
  rain:      { cloud: 1, rain: 0.7, snow: 0, fog: 0.4, wind: 0.7, dark: 0.6, storm: 0 },
  heavyRain: { cloud: 1, rain: 1, snow: 0, fog: 0.55, wind: 0.9, dark: 0.72, storm: 0.2 },
  storm:     { cloud: 1, rain: 1, snow: 0, fog: 0.45, wind: 1.1, dark: 0.8, storm: 1 },
  fog:       { cloud: 0.7, rain: 0, snow: 0, fog: 1, wind: 0.05, dark: 0.25, storm: 0 },
  sunshower: { cloud: 0.45, rain: 0.45, snow: 0, fog: 0.1, wind: 0.4, dark: 0.05, storm: 0 },
  snow:      { cloud: 0.95, rain: 0, snow: 0.6, fog: 0.4, wind: 0.35, dark: 0.35, storm: 0 },
  heavySnow: { cloud: 1, rain: 0, snow: 1, fog: 0.7, wind: 0.55, dark: 0.5, storm: 0 },
};

/** Climate per season: weights for the next state. */
const CLIMATE: Record<SeasonName, Partial<Record<WeatherId, number>>> = {
  spring: { clear: 3, partly: 4, overcast: 2, drizzle: 2, rain: 2, sunshower: 1.2, fog: 1 },
  summer: { clear: 5, partly: 3, overcast: 1, rain: 1, heavyRain: 1, storm: 1.2, sunshower: 0.8 },
  autumn: { clear: 4, partly: 4, overcast: 2, drizzle: 1.5, rain: 1.5, fog: 2 },
  winter: { clear: 3, partly: 2, overcast: 3, snow: 3, heavySnow: 1, fog: 1 },
};

export type WeatherOut = Look & { wet: number; snowCover: number; flash: number; rainbow: number; season: number; weights: [number, number, number, number] };

export class Weather {
  current: WeatherId = 'clear';
  private from: Look = { ...LOOKS.clear };
  private blend = 1;
  /** in-game hours until the next change */
  private timer = 3;
  private r = createRng(0x77e4);
  readonly out: WeatherOut = { ...LOOKS.clear, wet: 0, snowCover: 0, flash: 0, rainbow: 0, season: 2, weights: [0, 0, 1, 0] };
  /** forced weather (Settings "always clear", debug, screenshots) */
  forced: WeatherId | null = null;
  /** season: continuous value (0 spring … 3 winter), or locked */
  seasonDays = 7;
  seasonLock: SeasonName | null = null;
  /** day offset so a new journey starts in autumn */
  startSeason = 2;
  onThunder: ((delay: number, loudness: number) => void) | null = null;
  private flashT = 8;
  private wasRaining = false;

  /** Change now (blending from the current look). */
  set(id: WeatherId, hoursToNext = 2 + this.r.next() * 5): void {
    this.from = this.mixed();
    this.current = id;
    this.blend = 0;
    this.timer = hoursToNext;
  }

  private mixed(): Look {
    const to = LOOKS[this.current], k = this.blend, o = {} as Look;
    for (const key of Object.keys(to) as (keyof Look)[]) o[key] = this.from[key] + (to[key] - this.from[key]) * k;
    return o;
  }

  seasonAt(day: number, hour: number): number {
    if (this.seasonLock) return SEASONS.indexOf(this.seasonLock);
    return (this.startSeason + (day + hour / 24) / this.seasonDays) % 4;
  }

  /**
   * @param dtHours in-game hours passed (time-lapse included)
   * @param dt real seconds (lightning flicker)
   * @param cold 0..1 (altitude / snowy pass): rain falls as snow
   * @param instant snap everything (screenshots)
   */
  update(dtHours: number, dt: number, day: number, hour: number, region: string, cold: number, instant = false): WeatherOut {
    const o = this.out;
    o.season = this.seasonAt(day, hour);
    o.weights = seasonWeights(o.season);
    const seasonName = SEASONS[o.weights.indexOf(Math.max(...o.weights))]!;
    // next state from the climate (forced weather holds)
    this.timer -= dtHours;
    if (this.forced) { if (this.current !== this.forced) this.set(this.forced, 1e9); }
    else if (this.timer < 0) {
      const climate = { ...CLIMATE[seasonName] };
      if (region === 'cedar' || region === 'mirror') climate.fog = (climate.fog ?? 0) + 2;
      if (region === 'coast') { climate.partly = (climate.partly ?? 0) + 2; climate.fog = (climate.fog ?? 0) + 1; }
      if (region === 'snow' || cold > 0.6) { climate.snow = (climate.snow ?? 0) + 2; delete climate.storm; }
      const tot = Object.values(climate).reduce((a, b) => a + (b ?? 0), 0);
      let u = this.r.next() * tot, next: WeatherId = 'clear';
      for (const [id, wgt] of Object.entries(climate) as [WeatherId, number][]) { u -= wgt; if (u <= 0) { next = id; break; } }
      this.set(next);
    }
    this.blend = instant ? 1 : Math.min(1, this.blend + dtHours / 0.35); // ~20 in-game minutes
    const L = this.mixed();
    Object.assign(o, L);
    // cold turns rain into snow (winter, high passes)
    const freeze = Math.max(o.weights[3]! * 0.9, cold);
    if (freeze > 0.5 && o.rain > 0) { o.snow = Math.max(o.snow, o.rain); o.rain = 0; o.storm = 0; }
    if (freeze < 0.3 && o.snow > 0) { o.rain = Math.max(o.rain, o.snow * 0.7); o.snow = 0; }
    // wetness rises in rain and dries slowly; snow lies and melts outside winter
    const k = instant ? 1 : Math.min(1, dtHours / 0.4);
    o.wet = instant ? Math.min(1, o.rain * 1.4) : Math.max(0, Math.min(1, o.wet + (o.rain > 0.05 ? k * o.rain * 1.5 : -dtHours / 2.5)));
    const winterCover = o.weights[3]! * 0.85;
    const snowing = o.snow * (instant ? 1 : dtHours / 1.5);
    const fallen = instant ? Math.min(1, o.snow) : Math.max(0, Math.min(1, (o.snowCover - winterCover) + snowing - (o.snow > 0 ? 0 : dtHours / (freeze > 0.5 ? 12 : 1.5))));
    o.snowCover = Math.max(winterCover, fallen);
    // a rainbow when the rain stops and the sun is out
    const raining = o.rain > 0.2;
    if (this.wasRaining && !raining) o.rainbow = 1;
    this.wasRaining = raining;
    o.rainbow = Math.max(0, o.rainbow - dtHours / 0.6);
    if (this.current === 'sunshower') o.rainbow = Math.max(o.rainbow, 0.8 * this.blend);
    // lightning: a flash now and then; thunder follows after the light (340 m/s)
    o.flash = Math.max(0, o.flash - dt * 5);
    if (o.storm > 0.1) {
      this.flashT -= dt * o.storm;
      if (this.flashT < 0) {
        this.flashT = 5 + this.r.next() * 18;
        const dist = 800 + this.r.next() * 5000;
        o.flash = 1 - Math.min(0.6, dist / 9000);
        this.onThunder?.(dist / 340, 1 - dist / 7000);
      }
    }
    return o;
  }

  grassTint(out = new THREE.Vector3()): THREE.Vector3 {
    out.set(0, 0, 0);
    this.out.weights.forEach((w, i) => out.add(new THREE.Vector3(...GRASS_TINT[i]!).multiplyScalar(w)));
    return out;
  }
}
