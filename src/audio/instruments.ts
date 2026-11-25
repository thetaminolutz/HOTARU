/**
 * Instruments synthesised in code (SPEC §25): koto and shamisen (Karplus-Strong plucked
 * strings rendered once per pitch and cached), shakuhachi (breathy noise + sine with delayed
 * vibrato and a little pitch "meri" at the onset), soft piano (additive partials), music box,
 * warm pad, bells/chimes (inharmonic partials) and taiko.
 */
import { createRng } from '../core/rng';

export type Instrument = 'koto' | 'shamisen' | 'shakuhachi' | 'piano' | 'musicbox' | 'pad' | 'bell' | 'chime' | 'taiko';

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

const ksCache = new Map<string, AudioBuffer>();

/** Karplus-Strong string, rendered offline in JS (a few ms per note, cached by pitch). */
function pluckBuffer(ctx: BaseAudioContext, freq: number, bright: number, decay: number, seconds: number): AudioBuffer {
  const key = `${freq.toFixed(1)}|${bright}|${decay}|${ctx.sampleRate}`;
  const hit = ksCache.get(key);
  if (hit) return hit;
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
  const N = Math.max(2, Math.round(sr / freq));
  const buf = ctx.createBuffer(1, n, sr);
  const out = buf.getChannelData(0);
  const line = new Float32Array(N);
  const r = createRng(Math.round(freq * 100));
  // excitation: noise, low-passed by pluck brightness (a softer pluck = darker attack)
  let lp = 0;
  for (let i = 0; i < N; i++) { lp += ((r.next() * 2 - 1) - lp) * bright; line[i] = lp; }
  // per-sample loss so every pitch decays over `decay` seconds
  const g = Math.pow(0.001, 1 / (decay * freq));
  let idx = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[idx]!;
    const v = (cur + prev) * 0.5 * g;
    prev = cur;
    line[idx] = v;
    out[i] = cur;
    idx = (idx + 1) % N;
  }
  // fade the tail
  const f = Math.floor(sr * 0.05);
  for (let i = 0; i < f; i++) out[n - 1 - i]! *= i / f;
  ksCache.set(key, buf);
  return buf;
}

type Env = { a: number; d: number; s: number; r: number };
function envelope(g: AudioParam, t: number, peak: number, dur: number, e: Env): number {
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + e.a);
  g.setTargetAtTime(peak * e.s, t + e.a, e.d / 3);
  const end = t + Math.max(dur, e.a + 0.01);
  g.setTargetAtTime(0, end, e.r / 3);
  return end + e.r;
}

/**
 * Play one note. `dest` is where the voice connects to. Returns the time the voice ends.
 * `vel` 0..1.
 */
export function playNote(ctx: BaseAudioContext, dest: AudioNode, inst: Instrument, t: number, midi: number, dur: number, vel: number): number {
  const f = mtof(midi);
  switch (inst) {
    case 'koto':
    case 'shamisen': {
      const sham = inst === 'shamisen';
      const src = ctx.createBufferSource();
      src.buffer = pluckBuffer(ctx, f, sham ? 0.9 : 0.5, sham ? 0.9 : 2.6, sham ? 1.4 : 3.2);
      // body resonance
      const body = ctx.createBiquadFilter();
      body.type = 'peaking'; body.frequency.value = sham ? 1800 : 600; body.Q.value = 1.2; body.gain.value = sham ? 7 : 5;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = sham ? 180 : 90;
      const g = ctx.createGain();
      g.gain.value = vel * (sham ? 0.5 : 0.7);
      src.connect(body); body.connect(hp); hp.connect(g); g.connect(dest);
      src.start(t);
      return t + (sham ? 1.4 : 3.2);
    }
    case 'shakuhachi': {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator();
      o.type = 'sine'; o2.type = 'triangle';
      // "meri": the note bends up into pitch
      o.frequency.setValueAtTime(f * 0.97, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.18);
      o2.frequency.setValueAtTime(f * 0.97, t); o2.frequency.exponentialRampToValueAtTime(f, t + 0.18);
      const vib = ctx.createOscillator(), vibG = ctx.createGain();
      vib.frequency.value = 5.2;
      vibG.gain.setValueAtTime(0, t); vibG.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 1.2));
      vib.connect(vibG); vibG.connect(o.frequency); vibG.connect(o2.frequency);
      const g2 = ctx.createGain(); g2.gain.value = 0.18;
      o2.connect(g2);
      // breath: band-passed noise riding on the tone
      const nb = ctx.createBufferSource();
      nb.buffer = noiseBuffer(ctx);
      nb.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2.5;
      const nG = ctx.createGain(); nG.gain.value = 0.5;
      nb.connect(bp); bp.connect(nG);
      const amp = ctx.createGain();
      const end = envelope(amp.gain, t, vel * 0.42, dur, { a: 0.12, d: 0.4, s: 0.8, r: 0.35 });
      // a breathier attack
      const chiff = ctx.createGain();
      envelope(chiff.gain, t, vel * 0.25, 0.08, { a: 0.03, d: 0.1, s: 0.2, r: 0.2 });
      nG.connect(chiff); chiff.connect(dest);
      o.connect(amp); g2.connect(amp); nG.connect(amp);
      amp.connect(dest);
      for (const s of [o, o2, vib, nb]) { s.start(t); s.stop(end + 0.1); }
      return end;
    }
    case 'piano':
    case 'musicbox': {
      const box = inst === 'musicbox';
      const partials = box ? [[1, 1, 1.6], [4.0, 0.25, 0.4], [6.9, 0.08, 0.2]] : [[1, 1, 2.6], [2.001, 0.45, 1.6], [3.004, 0.22, 1.0], [4.01, 0.1, 0.6], [5.02, 0.05, 0.4]];
      const out = ctx.createGain();
      out.gain.value = vel * (box ? 0.28 : 0.3) * (midi > 84 ? 0.7 : 1);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = box ? 9000 : 1200 + vel * 3500;
      let end = t;
      for (const [m, a, d] of partials) {
        const o = ctx.createOscillator();
        o.frequency.value = f * m!;
        const g = ctx.createGain();
        const dd = d! * (box ? 1 : Math.max(0.4, 1.6 - (midi - 48) / 40));
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(a!, t + 0.004);
        g.gain.setTargetAtTime(0, t + 0.004, dd / 2.5);
        // key release damps the note (piano), the music box rings
        if (!box) g.gain.setTargetAtTime(0, t + Math.max(dur, 0.1), 0.12);
        o.connect(g); g.connect(lp);
        const e = t + (box ? dd * 2 : Math.min(dd * 2, Math.max(dur, 0.1) + 0.5));
        o.start(t); o.stop(e);
        end = Math.max(end, e);
      }
      lp.connect(out); out.connect(dest);
      return end;
    }
    case 'pad': {
      const out = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.4;
      const end = envelope(out.gain, t, vel * 0.12, dur, { a: Math.min(2.5, dur * 0.4), d: 1, s: 0.85, r: 2.5 });
      for (const det of [-6, 0, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        o.connect(lp); o.start(t); o.stop(end + 0.1);
      }
      lp.connect(out); out.connect(dest);
      return end;
    }
    case 'bell':
    case 'chime': {
      const chime = inst === 'chime';
      const parts = chime ? [[1, 1, 2.2], [2.76, 0.5, 1.2], [5.4, 0.25, 0.6], [8.93, 0.12, 0.3]] : [[0.5, 0.6, 9], [1, 1, 7], [1.19, 0.5, 5], [2.0, 0.3, 4], [2.74, 0.25, 3], [4.07, 0.1, 2]];
      const out = ctx.createGain();
      out.gain.value = vel * (chime ? 0.16 : 0.3);
      let end = t;
      for (const [m, a, d] of parts) {
        const o = ctx.createOscillator();
        o.frequency.value = f * m!;
        // temple bells beat slowly (two close partials)
        if (!chime) o.detune.value = (m! * 7) % 3;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(a!, t + (chime ? 0.002 : 0.01));
        g.gain.setTargetAtTime(0, t + 0.01, d! / 3);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + d! * 2);
        end = Math.max(end, t + d! * 2);
      }
      out.connect(dest);
      return end;
    }
    case 'taiko': {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f * 2, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * 0.9, t);
      g.gain.setTargetAtTime(0, t + 0.01, 0.18);
      const nb = ctx.createBufferSource();
      nb.buffer = noiseBuffer(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vel * 0.5, t);
      ng.gain.setTargetAtTime(0, t, 0.03);
      nb.connect(lp); lp.connect(ng); ng.connect(dest);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 1.2); nb.start(t); nb.stop(t + 0.3);
      return t + 1.2;
    }
  }
}

let nbuf: AudioBuffer | null = null;
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  if (nbuf && nbuf.sampleRate === ctx.sampleRate) return nbuf;
  const n = ctx.sampleRate * 2;
  nbuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = nbuf.getChannelData(0);
  const r = createRng(99);
  for (let i = 0; i < n; i++) d[i] = r.next() * 2 - 1;
  return nbuf;
}
