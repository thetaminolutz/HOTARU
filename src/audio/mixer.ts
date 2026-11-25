/**
 * Audio mixer (SPEC §25): buses → master → gentle limiter. Reverb per space from generated
 * impulse responses (two convolvers cross-fade when the space changes). Spatial sources use
 * HRTF panners with distance air absorption (a low-pass that closes with distance).
 */
import { createRng } from '../core/rng';

export type Bus = 'music' | 'ambience' | 'nature' | 'sfx' | 'ui';
export type Space = 'open' | 'forest' | 'valley' | 'room' | 'hall' | 'cave';

/** decay seconds, damping (0 bright … 1 dark), early-echo spacing (s), wet level */
const SPACES: Record<Space, [number, number, number, number]> = {
  open: [1.2, 0.6, 0, 0.12],
  forest: [2.2, 0.75, 0.035, 0.28],
  valley: [3.2, 0.55, 0.21, 0.22],
  room: [0.5, 0.5, 0.012, 0.2],
  hall: [2.6, 0.45, 0.04, 0.35],
  cave: [4.2, 0.65, 0.06, 0.45],
};

export class Mixer {
  readonly master: GainNode;
  readonly buses = {} as Record<Bus, GainNode>;
  /** Send for anything that should sit in the current space. */
  readonly reverbIn: GainNode;
  private conv: [ConvolverNode, ConvolverNode];
  private convGain: [GainNode, GainNode];
  private active = 0;
  private comp: DynamicsCompressorNode;
  /** Mono mode (SPEC §26): everything folded down to one channel. */
  setMono(on: boolean): void {
    this.comp.channelCount = on ? 1 : 2;
    this.comp.channelCountMode = on ? 'explicit' : 'max';
    this.comp.channelInterpretation = 'speakers';
  }
  space: Space | null = null;
  readonly noise: { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer };

  constructor(readonly ctx: AudioContext) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.3;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);
    this.comp = comp;
    for (const b of ['music', 'ambience', 'nature', 'sfx', 'ui'] as Bus[]) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses[b] = g;
    }
    this.reverbIn = ctx.createGain();
    this.conv = [ctx.createConvolver(), ctx.createConvolver()];
    this.convGain = [ctx.createGain(), ctx.createGain()];
    for (let i = 0; i < 2; i++) {
      this.reverbIn.connect(this.conv[i]!);
      this.conv[i]!.connect(this.convGain[i]!);
      this.convGain[i]!.gain.value = 0;
      this.convGain[i]!.connect(this.master);
    }
    this.noise = { white: this.makeNoise('white'), pink: this.makeNoise('pink'), brown: this.makeNoise('brown') };
    this.setSpace('open', 0);
  }

  get now(): number { return this.ctx.currentTime; }

  private masterVol = 1;
  fadeIn(seconds = 2): void {
    const g = this.master.gain;
    g.cancelScheduledValues(this.now);
    g.setValueAtTime(g.value, this.now);
    g.linearRampToValueAtTime(this.masterVol * this.masterVol, this.now + seconds);
  }

  setVolume(bus: Bus | 'master', v: number): void {
    if (bus === 'master') { this.masterVol = v; this.master.gain.setTargetAtTime(v * v, this.now, 0.1); }
    else this.buses[bus].gain.setTargetAtTime(v * v, this.now, 0.1);
  }

  /** Change the reverb space (cross-fades between two convolvers). */
  setSpace(space: Space, fade = 1.5): void {
    if (space === this.space) return;
    this.space = space;
    const next = 1 - this.active;
    this.conv[next]!.buffer = this.impulse(space);
    const t = this.now;
    this.convGain[next]!.gain.setTargetAtTime(SPACES[space][3], t, fade / 3 + 0.01);
    this.convGain[this.active]!.gain.setTargetAtTime(0, t, fade / 3 + 0.01);
    this.active = next;
  }

  private irCache = new Map<Space, AudioBuffer>();
  impulse(space: Space): AudioBuffer {
    const hit = this.irCache.get(space);
    if (hit) return hit;
    const [decay, damp, echo] = SPACES[space];
    const sr = this.ctx.sampleRate, n = Math.floor(sr * decay);
    const buf = this.ctx.createBuffer(2, n, sr);
    const r = createRng(space.length * 977 + n);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const env = Math.exp((-6.9 * t) / decay);
        // damping: the one-pole low-pass closes over time (high frequencies die first)
        const k = Math.max(0.03, 1 - damp * Math.min(1, t / decay * 1.5));
        lp += ((r.next() * 2 - 1) - lp) * k;
        let v = lp * env;
        // sparse early echoes (valley walls, trunks)
        if (echo > 0 && t < decay * 0.6) {
          const ph = (t % echo) / echo;
          if (ph < 0.02) v += (r.next() * 2 - 1) * env * 0.8;
        }
        d[i] = v * (i < sr * 0.003 ? i / (sr * 0.003) : 1);
      }
    }
    this.irCache.set(space, buf);
    return buf;
  }

  private makeNoise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    const sr = this.ctx.sampleRate, n = sr * 4;
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const r = createRng(kind.length * 31);
    let b0 = 0, b1 = 0, b2 = 0, br = 0;
    for (let i = 0; i < n; i++) {
      const w = r.next() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
      } else { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.2; }
    }
    // cross-fade the loop seam
    const f = Math.floor(sr * 0.05);
    for (let i = 0; i < f; i++) { const a = i / f; d[n - f + i] = d[n - f + i]! * (1 - a) + d[i]! * a; }
    return buf;
  }

  /** A looping noise source (started). */
  noiseSource(kind: 'white' | 'pink' | 'brown', rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise[kind];
    s.loop = true;
    s.playbackRate.value = rate;
    s.loopStart = 0;
    s.start(this.now, Math.random() * 3.9);
    return s;
  }

  /**
   * A one-shot spatial voice: returns the input node to connect a sound into. Positioned
   * relative to the listener (metres); further sounds are quieter and duller. The chain is
   * disconnected after `life` seconds.
   */
  spatial(bus: Bus, x: number, y: number, z: number, life: number, reverb = 0.4): AudioNode {
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 4; p.rolloffFactor = 1; p.maxDistance = 1000;
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    const d = Math.hypot(x, y, z);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(900, 18000 / (1 + d / 25));
    const send = ctx.createGain();
    send.gain.value = reverb * Math.min(1, 0.4 + d / 60);
    lp.connect(p); p.connect(this.buses[bus]);
    lp.connect(send); send.connect(this.reverbIn);
    setTimeout(() => { lp.disconnect(); p.disconnect(); send.disconnect(); }, (life + 0.5) * 1000);
    return lp;
  }

  /** A non-spatial one-shot into a bus (music, UI), with a reverb send. */
  direct(bus: Bus, life: number, reverb = 0.3, pan = 0): AudioNode {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    const send = ctx.createGain();
    send.gain.value = reverb;
    g.connect(p); p.connect(this.buses[bus]);
    g.connect(send); send.connect(this.reverbIn);
    setTimeout(() => { g.disconnect(); p.disconnect(); send.disconnect(); }, (life + 0.5) * 1000);
    return g;
  }
}
