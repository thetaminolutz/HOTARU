/**
 * Footsteps (SPEC §25), rendered once offline into small sample banks — six variants per surface —
 * then played with gentle pitch/level jitter and alternating left/right feet. Each step is a heel
 * strike followed by a toe roll, shaped by what you walk on:
 * - grass: a soft swish of blades and a muffled thud; dirt: a dull packed-earth thud with grit;
 * - gravel: dozens of tiny stone clicks; stone: a hard tap with a short ring;
 * - wood: a resonant plank (a few modes) and sometimes a creak; tatami: a dry straw brush;
 * - leaves: crackling litter; sand: a soft shifting hiss; snow: a squeaky, compressing crunch;
 * - mud: a wet suck; water: splashes and bubbles.
 * You wear straw sandals (waraji), so everything is a little soft.
 */
import { createRng, type Rng } from '../core/rng';

export type StepSurface = 'grass' | 'dirt' | 'gravel' | 'stone' | 'wood' | 'tatami' | 'leaves' | 'sand' | 'snow' | 'mud' | 'water';
const SURFACES: StepSurface[] = ['grass', 'dirt', 'gravel', 'stone', 'wood', 'tatami', 'leaves', 'sand', 'snow', 'mud', 'water'];
const VARIANTS = 6;
const LEN = 0.42;

/** Render one step into `d` (mono, sample rate sr). */
function render(surface: StepSurface, d: Float32Array, sr: number, r: Rng): void {
  const N = d.length;
  // simple one-pole filters and noise helpers
  let lp = 0, hp = 0, bp1 = 0, bp2 = 0;
  const noise = () => r.next() * 2 - 1;
  const at = (t: number) => Math.floor(t * sr);
  /** add a filtered noise burst: start, length, gain, cutoff low/high (Hz), attack */
  const burst = (t0: number, len: number, g: number, lo: number, hi: number, attack = 0.004, shape = 2) => {
    const s0 = at(t0), n = at(len), aL = Math.max(1, at(attack));
    const kl = 1 - Math.exp((-2 * Math.PI * hi) / sr), kh = 1 - Math.exp((-2 * Math.PI * lo) / sr);
    lp = 0; hp = 0;
    for (let i = 0; i < n && s0 + i < N; i++) {
      const env = i < aL ? i / aL : Math.pow(1 - (i - aL) / (n - aL), shape);
      lp += kl * (noise() - lp); hp += kh * (lp - hp);
      d[s0 + i]! += (lp - hp) * env * g;
    }
  };
  /** a decaying sine (a resonance of a plank, the body thud) */
  const mode = (t0: number, f: number, g: number, decay: number, drop = 0) => {
    const s0 = at(t0), n = at(decay * 5);
    for (let i = 0; i < n && s0 + i < N; i++) {
      const t = i / sr, ff = f * (1 + drop * Math.exp(-t * 60));
      d[s0 + i]! += Math.sin(2 * Math.PI * ff * t) * Math.exp(-t / decay) * g * Math.min(1, i / 20);
    }
  };
  /** many tiny clicks (grit, gravel, crunch) spread over a window */
  const clicks = (t0: number, span: number, count: number, g: number, lo: number, hi: number) => {
    for (let k = 0; k < count; k++) {
      const t = t0 + Math.pow(r.next(), 1.6) * span;
      burst(t, 0.003 + r.next() * 0.006, g * (0.4 + r.next() * 0.8), lo, hi + r.next() * hi * 0.5, 0.0005, 3);
    }
  };
  const heel = 0.012 + r.next() * 0.006, toe = heel + 0.075 + r.next() * 0.035;
  switch (surface) {
    case 'grass':
      mode(heel, 70 + r.next() * 15, 0.22, 0.018, 0.6);
      burst(heel, 0.16, 0.22, 1800, 7000, 0.02, 1.6);
      burst(toe, 0.12, 0.16, 2500, 8000, 0.015, 2);
      clicks(heel + 0.01, 0.12, 5, 0.06, 3000, 6000);
      break;
    case 'dirt':
      mode(heel, 60 + r.next() * 10, 0.42, 0.022, 0.8);
      burst(heel, 0.05, 0.2, 200, 1600, 0.002, 3);
      clicks(heel, 0.07, 14, 0.06, 1500, 4000);
      mode(toe, 75, 0.18, 0.015, 0.5);
      burst(toe, 0.06, 0.1, 400, 2500, 0.004, 3);
      break;
    case 'gravel':
      mode(heel, 65, 0.25, 0.02, 0.6);
      clicks(heel, 0.12, 48, 0.12, 1800, 5000);
      clicks(toe, 0.1, 34, 0.1, 2200, 6000);
      burst(heel, 0.14, 0.06, 1000, 4000, 0.01, 2);
      break;
    case 'stone':
      mode(heel, 95, 0.2, 0.01, 1.2);
      burst(heel, 0.012, 0.3, 1500, 8000, 0.0005, 4);
      mode(heel, 1900 + r.next() * 400, 0.025, 0.02);
      burst(toe, 0.02, 0.12, 2500, 9000, 0.001, 3);
      burst(toe, 0.09, 0.04, 3000, 9000, 0.02, 1.5); // a little scuff
      break;
    case 'wood': {
      // a hollow plank: body + three modes, the toe taps it again
      const f0 = 140 + r.next() * 30;
      mode(heel, f0, 0.45, 0.04, 0.4); mode(heel, f0 * 2.7, 0.14, 0.022); mode(heel, f0 * 5.1, 0.06, 0.012);
      burst(heel, 0.02, 0.16, 600, 4000, 0.001, 3);
      mode(toe, f0 * 1.05, 0.2, 0.03, 0.3); burst(toe, 0.015, 0.08, 900, 5000, 0.001, 3);
      if (r.next() < 0.35) { // a creak: a slow, narrow squeak
        const s0 = at(toe + 0.03), n = at(0.16);
        let ph = 0;
        for (let i = 0; i < n && s0 + i < N; i++) { const t = i / n; ph += (2 * Math.PI * (420 + 160 * t + 30 * Math.sin(t * 40))) / sr; d[s0 + i]! += Math.sin(ph) * Math.sin(Math.PI * t) * 0.035 * (0.6 + 0.4 * Math.sin(t * 90)); }
      }
      break;
    }
    case 'tatami':
      mode(heel, 85, 0.2, 0.015, 0.4);
      burst(heel, 0.09, 0.14, 1200, 6000, 0.01, 1.8);
      burst(toe, 0.11, 0.12, 1800, 7000, 0.02, 1.5);
      break;
    case 'leaves':
      mode(heel, 70, 0.2, 0.018, 0.6);
      clicks(heel, 0.16, 40, 0.12, 2000, 7000);
      burst(heel, 0.18, 0.1, 1500, 6000, 0.02, 1.5);
      clicks(toe, 0.12, 24, 0.09, 2500, 8000);
      break;
    case 'sand':
      mode(heel, 55, 0.25, 0.02, 0.5);
      burst(heel, 0.2, 0.16, 800, 3500, 0.03, 1.4);
      burst(toe, 0.16, 0.1, 1200, 4500, 0.03, 1.4);
      clicks(heel + 0.02, 0.15, 10, 0.03, 2000, 5000);
      break;
    case 'snow': {
      // compressing crunch: band noise chopped by a fast, uneven tremolo, then a squeak
      mode(heel, 60, 0.2, 0.02, 0.4);
      const s0 = at(heel), n = at(0.2);
      let l2 = 0;
      for (let i = 0; i < n && s0 + i < N; i++) {
        const t = i / sr, env = Math.sin(Math.PI * Math.min(1, t / 0.2)) ** 0.7;
        l2 += 0.25 * (noise() - l2);
        const chop = Math.max(0, Math.sin(2 * Math.PI * (35 + 25 * Math.sin(t * 13)) * t + r.next() * 0.6));
        d[s0 + i]! += l2 * chop * env * 0.45;
      }
      if (r.next() < 0.5) mode(toe + 0.04, 900 + r.next() * 300, 0.03, 0.02);
      break;
    }
    case 'mud':
      mode(heel, 50, 0.3, 0.03, 0.4);
      burst(heel, 0.12, 0.14, 150, 900, 0.01, 1.4);
      // the suck as the foot lifts: a falling, gurgling band
      for (let k = 0; k < 4; k++) mode(toe + 0.04 + k * 0.018, 260 - k * 35 + r.next() * 40, 0.05, 0.012, -0.3);
      break;
    case 'water':
      burst(heel, 0.25, 0.28, 400, 2500, 0.004, 1.5);
      burst(heel + 0.03, 0.2, 0.14, 1500, 5000, 0.01, 1.8);
      for (let k = 0; k < 6; k++) mode(heel + 0.04 + r.next() * 0.25, 500 + r.next() * 900, 0.04 * (0.5 + r.next()), 0.012, -0.5); // bubbles
      break;
  }
  void bp1; void bp2;
  // normalise softly
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(d[i]!));
  if (peak > 0.9) for (let i = 0; i < N; i++) d[i]! *= 0.9 / peak;
}

export class Footsteps {
  private bank = new Map<StepSurface, AudioBuffer[]>();
  private r = createRng(0xf007);
  private foot = 1;
  ready = false;

  constructor(private ctx: BaseAudioContext) {
    // rendered in small slices so the first frames stay smooth
    const sr = ctx.sampleRate;
    let k = 0;
    const work = () => {
      const surface = SURFACES[k]!;
      const list: AudioBuffer[] = [];
      for (let v = 0; v < VARIANTS; v++) {
        const b = ctx.createBuffer(1, Math.floor(LEN * sr), sr);
        render(surface, b.getChannelData(0), sr, createRng(0x57e9 + k * 97 + v * 13));
        list.push(b);
      }
      this.bank.set(surface, list);
      if (++k < SURFACES.length) setTimeout(work, 30); else this.ready = true;
    };
    setTimeout(work, 200);
  }

  has(s: StepSurface): boolean { return this.bank.has(s); }

  /** Play one step: `out` is where it goes, `speed` (m/s) makes it heavier, `soft` for slow walking. */
  play(surface: StepSurface, out: AudioNode, t: number, speed: number): boolean {
    const list = this.bank.get(surface);
    if (!list) return false;
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = list[this.r.int(0, list.length)]!;
    // jogging: heavier and quicker (heel and toe closer together)
    const jog = Math.min(1, Math.max(0, (speed - 2.6) / 2));
    src.playbackRate.value = (0.93 + this.r.next() * 0.12) * (1 + jog * 0.08);
    const g = ctx.createGain();
    g.gain.value = (0.35 + Math.min(0.75, speed * 0.16)) * (0.85 + this.r.next() * 0.3) * (speed < 1.4 ? 0.6 : 1);
    const pan = ctx.createStereoPanner();
    this.foot = -this.foot;
    pan.pan.value = this.foot * 0.12;
    src.connect(g); g.connect(pan); pan.connect(out);
    src.start(t);
    return true;
  }
}
