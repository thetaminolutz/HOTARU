/**
 * Layered, location-aware ambience (SPEC §25). Continuous beds (wind low and high, leaf
 * rustle, bamboo and pine whoosh, lake lapping, surf, rain) follow the place, the wind and the
 * weather; spatial events (birds by species and hour, insects, frogs, owls, woodpeckers,
 * creaking trunks, chimes, the temple bell…) are scattered around the listener at rates set by
 * the same context. With eyes closed you can tell a deep cedar wood at dawn from the lake at
 * night or the coast at noon.
 */
import type { Mixer } from './mixer';
import { playVoice, type VoiceId } from './voices';
import { createRng } from '../core/rng';

export type AmbContext = {
  region: string;
  forest: number;
  moisture: number;
  autumn: number;
  hour: number;
  /** wind strength 0..1+ */
  wind: number;
  /** 0..1: lake shore / standing water nearby */
  water: number;
  /** 0..1: sea surf nearby */
  coast: number;
  /** height above the surrounding land (exposure) */
  altitude: number;
  rain: number;
  snow: number;
  /** 0..1 near the Tomoshibi dock (wind chime, boats) */
  dock: number;
  indoors: boolean;
};

type Bed = { gain: GainNode; filter: BiquadFilterNode; src: AudioBufferSourceNode; level: number };

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 0..1 bell around an hour (wrapping midnight) */
const around = (h: number, c: number, w: number) => { const d = Math.min(Math.abs(h - c), 24 - Math.abs(h - c)); return Math.max(0, 1 - d / w); };

export class Ambience {
  private beds: Record<string, Bed> = {};
  private r = createRng(0xa3b1);
  private gust = 0.5;
  private gustT = 0;
  private swell = 0;
  /** per-minute rates of the last update (debug panel / tests) */
  rates: Partial<Record<VoiceId, number>> = {};
  lastEvents: string[] = [];

  constructor(private mix: Mixer) {
    const bed = (name: string, kind: 'white' | 'pink' | 'brown', type: BiquadFilterType, f: number, q: number, bus: 'ambience' | 'nature' = 'ambience') => {
      const src = mix.noiseSource(kind, 0.9 + this.r.next() * 0.2);
      const filter = mix.ctx.createBiquadFilter();
      filter.type = type; filter.frequency.value = f; filter.Q.value = q;
      const gain = mix.ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter); filter.connect(gain); gain.connect(mix.buses[bus]);
      this.beds[name] = { gain, filter, src, level: 0 };
    };
    bed('windLow', 'brown', 'lowpass', 320, 0.5);
    bed('windHigh', 'pink', 'bandpass', 1100, 0.7);
    bed('leaves', 'pink', 'bandpass', 2600, 0.9, 'nature');
    bed('pines', 'pink', 'bandpass', 650, 2.5, 'nature');
    bed('bamboo', 'pink', 'bandpass', 1500, 3, 'nature');
    bed('lap', 'brown', 'lowpass', 500, 0.8, 'nature');
    bed('surf', 'pink', 'lowpass', 900, 0.6, 'nature');
    bed('rain', 'pink', 'highpass', 900, 0.5, 'nature');
    bed('insects', 'white', 'bandpass', 4600, 6, 'nature');
  }

  private set(name: string, level: number, freq?: number): void {
    const b = this.beds[name]!;
    b.level = level;
    const t = this.mix.now;
    b.gain.gain.setTargetAtTime(level, t, 0.25);
    if (freq !== undefined) b.filter.frequency.setTargetAtTime(freq, t, 0.3);
  }

  update(dt: number, c: AmbContext): void {
    // gusts: a slow random walk the beds breathe with
    this.gustT -= dt;
    if (this.gustT <= 0) { this.gustT = 1.5 + this.r.next() * 4; this.swell = this.r.next(); }
    this.gust += (this.swell - this.gust) * Math.min(1, dt * 0.6);
    const g = this.gust;
    const exposure = 0.6 + Math.min(1, c.altitude / 300) * 0.8;
    const shelter = c.indoors ? 0.25 : 1;
    const w = Math.min(1.4, c.wind) * shelter;
    const open = 1 - c.forest * 0.6;
    this.set('windLow', (0.05 + w * 0.22 * (0.5 + g)) * exposure * open);
    this.set('windHigh', w * 0.06 * (0.3 + g) * exposure * open, 900 + g * 600);
    const leafy = c.forest * (c.region === 'bamboo' ? 0.3 : 1) * (1 - Math.min(1, c.snow));
    this.set('leaves', leafy * (0.015 + w * 0.08 * (0.2 + g)) * shelter, 2200 + g * 1200 + c.autumn * 800);
    const conifer = c.region === 'cedar' || c.region === 'snow' || c.region === 'temple' || c.region === 'coast' ? c.forest : c.forest * 0.3;
    this.set('pines', conifer * w * 0.09 * (0.3 + g) * shelter, 550 + g * 250);
    this.set('bamboo', (c.region === 'bamboo' ? c.forest : 0) * w * 0.08 * (0.3 + g) * shelter);
    // lapping: little irregular waves
    const lapMod = 0.5 + 0.5 * Math.sin(this.mix.now * 1.3 + Math.sin(this.mix.now * 0.37) * 3);
    this.set('lap', c.water * (0.05 + w * 0.08) * (0.4 + 0.6 * lapMod) * shelter, 350 + lapMod * 300);
    // surf: long swells
    const sw = Math.pow(0.5 + 0.5 * Math.sin(this.mix.now * (Math.PI * 2 / 9.5)), 3);
    this.set('surf', c.coast * (0.06 + 0.22 * sw) * (0.6 + w * 0.5) * shelter, 500 + sw * 1600);
    this.set('rain', c.rain * 0.25 * (c.indoors ? 0.5 : 1), c.indoors ? 500 : 1400);
    // night insect bed (a far chorus under the individual voices); autumn = crickets
    const night = smooth(18.5, 20.5, c.hour) + (c.hour < 5 ? 1 : 0) - smooth(4.5, 6, c.hour) * (c.hour < 12 ? 1 : 0);
    const nightK = Math.max(0, Math.min(1, night));
    this.set('insects', nightK * 0.012 * (1 - c.snow) * (1 - Math.min(1, c.altitude / 600)) * shelter * (1 - c.coast * 0.5));

    // ---- events ----
    const h = c.hour;
    const day = 1 - nightK;
    const dawn = around(h, 6.2, 2.2), dusk = around(h, 18.4, 1.6);
    const cold = Math.max(c.snow, smooth(500, 900, c.altitude + (c.region === 'snow' ? 600 : 0)));
    const life = (1 - cold * 0.8) * (1 - Math.min(1, c.rain) * 0.7) * shelter;
    const R: Partial<Record<VoiceId, number>> = {
      warbler: day * (0.5 + 2.5 * dawn) * (0.3 + c.forest) * (c.region === 'bamboo' ? 2 : 1) * life,
      tit: day * (1 + 3 * dawn) * (0.3 + c.forest) * life,
      sparrow: day * (1 - c.forest) * (c.region === 'rice' || c.region === 'market' || c.region === 'tea' || c.dock > 0.3 ? 3 : 0.6) * life,
      dove: day * (0.4 + dawn) * (0.2 + c.forest) * life,
      crow: day * (0.6 + 1.5 * dusk) * life,
      woodpecker: day * c.forest * (c.region === 'cedar' || c.region === 'temple' || c.region === 'maple' ? 1.4 : 0.4) * life,
      gull: day * c.coast * 6,
      owl: nightK * (0.2 + c.forest) * 1.2 * (1 - cold * 0.5),
      cricket: nightK * (1 - c.forest * 0.4) * 10 * life * (1 - c.coast * 0.6),
      bellCricket: nightK * (0.5 + c.autumn) * 6 * life * (1 - c.coast * 0.6),
      higurashi: dusk * (0.3 + c.forest) * 3 * life + dawn * c.forest * 1.5 * life,
      frog: nightK * Math.max(c.water, c.region === 'rice' || c.region === 'marsh' ? 1 : 0) * 8 * life,
      kajika: (c.water * (c.region === 'mirror' || c.region === 'bamboo' ? 1 : 0.3)) * (0.5 + nightK) * 2 * life,
      furin: c.dock * (0.4 + w * 4) * (0.3 + g),
      templeBell: (c.region === 'temple' ? 0.6 : c.region === 'lake' ? 0.06 : 0.02) * (around(h, 6, 0.6) + around(h, 18, 0.6) + 0.15),
      bambooKnock: c.region === 'bamboo' ? c.forest * (1 + w * 8) : 0,
      shishiOdoshi: c.region === 'temple' ? 0.8 : 0,
      creak: c.forest * (c.region === 'cedar' || c.region === 'bamboo' ? 1.5 : 0.4) * (0.3 + w * 3) * shelter,
      twig: c.forest * 1.2 * shelter,
      drip: c.forest * c.moisture * (dawn + Math.min(1, c.rain) * 4 + (c.region === 'cedar' ? 0.6 : 0)) * 3 * shelter,
      splash: c.water * day * 0.8,
    };
    this.rates = R;
    for (const [id, perMin] of Object.entries(R) as [VoiceId, number][]) {
      if (perMin > 0 && this.r.next() < (perMin * dt) / 60) this.emit(id, c);
    }
  }

  /** Play one event somewhere around the listener. */
  emit(id: VoiceId, c: AmbContext): void {
    const r = this.r;
    const [dMin, dMax, yMin, yMax, bus]: [number, number, number, number, 'nature' | 'ambience'] = (() => {
      switch (id) {
        case 'crow': return [40, 140, 10, 30, 'nature'];
        case 'gull': return [20, 90, 8, 25, 'nature'];
        case 'owl': case 'woodpecker': return [25, 80, 6, 15, 'nature'];
        case 'cricket': case 'bellCricket': return [2, 14, -1.5, -0.5, 'nature'];
        case 'frog': case 'kajika': return [6, 40, -1.5, 0, 'nature'];
        case 'higurashi': return [15, 60, 4, 12, 'nature'];
        case 'templeBell': return [300, 900, 20, 60, 'ambience'];
        case 'furin': return [4, 16, 1, 2, 'ambience'];
        case 'creak': return [8, 35, 2, 10, 'nature'];
        case 'twig': return [6, 30, -1, 0, 'nature'];
        case 'drip': return [2, 10, 0, 4, 'nature'];
        case 'splash': return [10, 50, -1.5, -1, 'nature'];
        case 'shishiOdoshi': return [20, 50, 0, 1, 'ambience'];
        default: return [8, 50, 3, 14, 'nature'];
      }
    })();
    const a = r.next() * Math.PI * 2, d = dMin + r.next() * (dMax - dMin);
    const x = Math.sin(a) * d, z = Math.cos(a) * d, y = yMin + r.next() * (yMax - yMin);
    const out = this.mix.spatial(bus, x, y, z, 16, c.forest > 0.5 ? 0.6 : 0.35);
    const t = this.mix.now + 0.05;
    playVoice(id, this.mix.ctx, out, t, r, this.mix.noise.white);
    this.lastEvents.push(id);
    if (this.lastEvents.length > 40) this.lastEvents.shift();
  }

  /** Bed levels for tests / debug. */
  levels(): Record<string, number> {
    return Object.fromEntries(Object.entries(this.beds).map(([k, b]) => [k, +b.level.toFixed(4)]));
  }
}
