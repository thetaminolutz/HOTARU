/**
 * Player sounds (SPEC §25): footsteps by surface (grass, forest litter, wood boards, gravel /
 * rock, sand, snow, shallow water), jump, soft landings, swim strokes, and quiet UI ticks.
 * All short filtered-noise grains with a body thump, randomised per step.
 */
import type { Mixer } from './mixer';
import { createRng } from '../core/rng';

export type Surface = 'grass' | 'leaves' | 'wood' | 'gravel' | 'sand' | 'snow' | 'water' | 'tatami';

export class Sfx {
  private r = createRng(0x5f5);
  constructor(private mix: Mixer) {}

  private grain(out: AudioNode, t: number, dur: number, amp: number, type: BiquadFilterType, f: number, q: number, kind: 'white' | 'pink' | 'brown' = 'white'): void {
    const ctx = this.mix.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.mix.noise[kind];
    const fl = ctx.createBiquadFilter();
    fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + Math.min(0.01, dur * 0.2));
    g.gain.setTargetAtTime(0, t + Math.min(0.01, dur * 0.2), dur / 3);
    s.connect(fl); fl.connect(g); g.connect(out);
    s.start(t, this.r.next() * 3.5); s.stop(t + dur * 1.5 + 0.02);
  }

  private thump(out: AudioNode, t: number, f: number, amp: number, dur = 0.08): void {
    const ctx = this.mix.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.setTargetAtTime(0, t, dur / 3);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur * 2);
  }

  /** One footstep; `speed` m/s makes jogging steps heavier. */
  step(surface: Surface, speed: number): void {
    const out = this.mix.direct('sfx', 1, surface === 'wood' ? 0.25 : 0.12, (this.r.next() - 0.5) * 0.3);
    const t = this.mix.now + 0.01;
    const k = Math.min(1.3, 0.55 + speed * 0.14) * (0.85 + this.r.next() * 0.3);
    const p = 0.9 + this.r.next() * 0.2;
    switch (surface) {
      case 'grass':
        this.grain(out, t, 0.12, 0.16 * k, 'highpass', 2500 * p, 0.6, 'pink');
        this.grain(out, t + 0.03, 0.09, 0.1 * k, 'bandpass', 1200 * p, 0.8, 'pink');
        this.thump(out, t, 90, 0.08 * k);
        break;
      case 'leaves': // dry autumn litter: crackles
        for (let i = 0; i < 4; i++) this.grain(out, t + i * 0.022 + this.r.next() * 0.01, 0.03, 0.14 * k, 'highpass', 3000 * p, 0.7);
        this.grain(out, t, 0.12, 0.08 * k, 'bandpass', 1500 * p, 0.7, 'pink');
        this.thump(out, t, 90, 0.08 * k);
        break;
      case 'wood': case 'tatami':
        this.thump(out, t, surface === 'wood' ? 150 * p : 110 * p, (surface === 'wood' ? 0.4 : 0.2) * k, surface === 'wood' ? 0.12 : 0.07);
        this.grain(out, t, 0.05, 0.12 * k, 'bandpass', surface === 'wood' ? 900 * p : 2400 * p, 3);
        if (surface === 'wood' && this.r.next() < 0.12) this.grain(out, t + 0.08, 0.25, 0.05, 'bandpass', 520 * p, 14, 'pink'); // a board creaks
        break;
      case 'gravel':
        for (let i = 0; i < 6; i++) this.grain(out, t + i * 0.015 + this.r.next() * 0.01, 0.025, 0.12 * k, 'bandpass', 2600 * p + this.r.next() * 1500, 2);
        this.thump(out, t, 80, 0.1 * k);
        break;
      case 'sand':
        this.grain(out, t, 0.16, 0.12 * k, 'bandpass', 1800 * p, 0.5);
        this.thump(out, t, 70, 0.06 * k);
        break;
      case 'snow': // compressed crunch
        for (let i = 0; i < 5; i++) this.grain(out, t + i * 0.03, 0.04, 0.12 * k, 'bandpass', 1400 * p + i * 200, 1.5, 'pink');
        this.thump(out, t, 70, 0.08 * k);
        break;
      case 'water':
        this.grain(out, t, 0.25, 0.22 * k, 'bandpass', 900 * p, 1.2);
        this.grain(out, t + 0.06, 0.3, 0.12 * k, 'bandpass', 1700 * p, 1.5);
        break;
    }
  }

  jump(): void {
    const out = this.mix.direct('sfx', 1, 0.1);
    this.grain(out, this.mix.now, 0.18, 0.06, 'bandpass', 700, 0.7, 'pink'); // cloth / breath
  }

  land(surface: Surface, impact: number): void {
    const k = Math.min(1.6, 0.6 + impact * 0.15);
    this.step(surface, 2 + impact);
    const out = this.mix.direct('sfx', 1, 0.15);
    this.thump(out, this.mix.now + 0.01, surface === 'wood' ? 120 : 70, 0.25 * k, 0.15);
  }

  stroke(): void {
    const out = this.mix.direct('sfx', 1.5, 0.2);
    const t = this.mix.now;
    this.grain(out, t, 0.5, 0.12, 'bandpass', 700, 1, 'pink');
    this.grain(out, t + 0.2, 0.4, 0.06, 'bandpass', 1500, 1.2);
  }

  /** Soft wooden UI tick (buttons) and a paper rustle (screens). */
  ui(kind: 'tick' | 'open' | 'close'): void {
    const out = this.mix.direct('ui', 1, 0.05);
    const t = this.mix.now;
    if (kind === 'tick') { this.thump(out, t, 700, 0.12, 0.03); this.grain(out, t, 0.02, 0.05, 'bandpass', 2600, 4); }
    else this.grain(out, t, kind === 'open' ? 0.22 : 0.16, 0.08, 'bandpass', kind === 'open' ? 3200 : 2400, 0.7, 'pink');
  }
}
