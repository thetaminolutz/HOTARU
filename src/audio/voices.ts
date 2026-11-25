/**
 * Nature voices, all synthesised (SPEC §25): birds by species (bush warbler, tits, sparrows,
 * turtle dove, crow, owl, woodpecker, gull), insects (crickets, bell crickets, evening
 * cicadas), frogs, and the sounds of places (wind chimes, temple bell, bamboo knock,
 * shishi-odoshi, creaking trunks, snapping twigs, water drips, fish splashes).
 * Each voice plays into `out` at time `t` and returns its length in seconds.
 */
import type { Rng } from '../core/rng';
import { playNote } from './instruments';

type Ctx = BaseAudioContext;

function tone(ctx: Ctx, out: AudioNode, t: number, f0: number, f1: number, dur: number, amp: number, type: OscillatorType = 'sine', attack = 0.01): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(amp, t + attack);
  g.gain.setValueAtTime(amp, t + Math.max(attack, dur - 0.03));
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseBurst(ctx: Ctx, out: AudioNode, buf: AudioBuffer, t: number, dur: number, amp: number, type: BiquadFilterType, freq: number, q = 1, decay = dur / 3): void {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(amp, t);
  g.gain.setTargetAtTime(0, t + 0.002, decay);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}

/** Amplitude-pulsed tone (insects, frogs). */
function pulsed(ctx: Ctx, out: AudioNode, t: number, f: number, dur: number, rate: number, amp: number, type: OscillatorType = 'sine', fEnd = f): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(fEnd, t + dur);
  const am = ctx.createOscillator();
  am.type = 'square'; am.frequency.value = rate;
  const amG = ctx.createGain(); amG.gain.value = 0.5;
  const g = ctx.createGain();
  g.gain.value = 0.5;
  am.connect(amG); amG.connect(g.gain);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(amp, t + 0.02);
  env.gain.setValueAtTime(amp, t + dur - 0.05);
  env.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g); g.connect(env); env.connect(out);
  for (const s of [o, am]) { s.start(t); s.stop(t + dur + 0.05); }
}

export type VoiceId =
  | 'warbler' | 'tit' | 'sparrow' | 'dove' | 'crow' | 'owl' | 'woodpecker' | 'gull'
  | 'cricket' | 'bellCricket' | 'higurashi' | 'frog' | 'kajika'
  | 'furin' | 'templeBell' | 'bambooKnock' | 'shishiOdoshi' | 'creak' | 'twig' | 'drip' | 'splash'
  | 'meow' | 'bark' | 'quack' | 'deer' | 'cluck' | 'whinny' | 'moo' | 'monkey' | 'kite' | 'crane';

export function playVoice(id: VoiceId, ctx: Ctx, out: AudioNode, t: number, r: Rng, noise: AudioBuffer): number {
  switch (id) {
    case 'warbler': { // uguisu: a long "hooo…" then the quick "ho-ke-kyo"
      const p = 0.9 + r.next() * 0.2;
      tone(ctx, out, t, 1150 * p, 1250 * p, 1.0, 0.13, 'sine', 0.2);
      tone(ctx, out, t + 1.15, 2300 * p, 1500 * p, 0.16, 0.16);
      tone(ctx, out, t + 1.34, 2600 * p, 2900 * p, 0.12, 0.16);
      tone(ctx, out, t + 1.5, 3500 * p, 2300 * p, 0.35, 0.18);
      return 2;
    }
    case 'tit': { // shijūkara: "tsu-pi, tsu-pi, tsu-pi"
      const n = r.int(2, 5), p = 0.9 + r.next() * 0.25;
      for (let i = 0; i < n; i++) {
        tone(ctx, out, t + i * 0.32, 5200 * p, 4600 * p, 0.07, 0.07);
        tone(ctx, out, t + i * 0.32 + 0.1, 3400 * p, 3700 * p, 0.12, 0.08);
      }
      return n * 0.32 + 0.2;
    }
    case 'sparrow': {
      const n = r.int(2, 6);
      for (let i = 0; i < n; i++) tone(ctx, out, t + i * (0.12 + r.next() * 0.15), 4200 + r.next() * 900, 3200 + r.next() * 600, 0.06, 0.06, 'triangle');
      return n * 0.25;
    }
    case 'dove': { // kijibato: "de-de, po-po"
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(out);
      const seq = [[0, 0.32], [0.45, 0.22], [0.75, 0.35], [1.2, 0.35]];
      for (const [o, d] of seq) tone(ctx, lp, t + o!, 520, 470, d!, 0.12, 'sine', 0.06);
      return 1.7;
    }
    case 'crow': {
      const n = r.int(1, 4);
      for (let i = 0; i < n; i++) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 2; bp.connect(out);
        tone(ctx, bp, t + i * 0.5, 620, 520, 0.36, 0.3, 'sawtooth', 0.03);
        noiseBurst(ctx, bp, noise, t + i * 0.5, 0.3, 0.1, 'bandpass', 1500, 1, 0.1);
      }
      return n * 0.5;
    }
    case 'owl': { // fukurō: "hoo, hoo-hoo"
      for (const [o, d] of [[0, 0.5], [0.8, 0.25], [1.1, 0.55]]) tone(ctx, out, t + o!, 390, 360, d!, 0.16, 'sine', 0.08);
      return 1.8;
    }
    case 'woodpecker': {
      const n = r.int(10, 20), rate = 15 + r.next() * 6;
      for (let i = 0; i < n; i++) noiseBurst(ctx, out, noise, t + i / rate, 0.03, 0.35 * (1 - i / n * 0.6), 'bandpass', 1100, 6, 0.008);
      return n / rate;
    }
    case 'gull': {
      const n = r.int(1, 4);
      for (let i = 0; i < n; i++) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.5; bp.connect(out);
        tone(ctx, bp, t + i * 0.45, 1500, 1050, 0.35, 0.22, 'sawtooth', 0.02);
      }
      return n * 0.45;
    }
    case 'cricket': { // enma kōrogi: "koro-koro-ri…"
      const f = 4300 + r.next() * 700, n = r.int(2, 5);
      for (let i = 0; i < n; i++) pulsed(ctx, out, t + i * 0.5, f, 0.28, 30, 0.05);
      return n * 0.5;
    }
    case 'bellCricket': { // suzumushi: a bright "riiin"
      pulsed(ctx, out, t, 4100 + r.next() * 300, 0.6 + r.next() * 0.4, 55, 0.05);
      return 1;
    }
    case 'higurashi': { // evening cicada: "kana-kana-kana…" falling and slowing
      const dur = 3 + r.next() * 2;
      pulsed(ctx, out, t, 5200, dur, 9, 0.04, 'sine', 4300);
      return dur;
    }
    case 'frog': {
      const n = r.int(2, 6), f = 170 + r.next() * 120;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 3; bp.Q.value = 3; bp.connect(out);
      for (let i = 0; i < n; i++) pulsed(ctx, bp, t + i * (0.35 + r.next() * 0.1), f, 0.18, 28, 0.35, 'square');
      return n * 0.45;
    }
    case 'kajika': { // kajika frog: a sweet rising trill
      for (let i = 0; i < 6; i++) tone(ctx, out, t + i * 0.13, 1400 + i * 120, 1900 + i * 140, 0.1, 0.06);
      return 1;
    }
    case 'furin': { // glass wind chime
      const n = r.int(1, 4);
      for (let i = 0; i < n; i++) playNote(ctx, out, 'chime', t + i * (0.12 + r.next() * 0.25), 96 + r.int(0, 3) * 2, 1, 0.5);
      return 2;
    }
    case 'templeBell': {
      playNote(ctx, out, 'bell', t, 40 + r.int(0, 2) * 2, 8, 0.9);
      return 14;
    }
    case 'bambooKnock': {
      const n = r.int(1, 4);
      for (let i = 0; i < n; i++) noiseBurst(ctx, out, noise, t + i * (0.1 + r.next() * 0.3), 0.08, 0.4, 'bandpass', 650 + r.next() * 400, 8, 0.02);
      return 1;
    }
    case 'shishiOdoshi': {
      noiseBurst(ctx, out, noise, t, 0.15, 0.9, 'bandpass', 900, 5, 0.025);
      tone(ctx, out, t, 300, 260, 0.25, 0.25, 'sine', 0.002);
      return 0.5;
    }
    case 'creak': { // a tall trunk swaying
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 12; bp.connect(out);
      const d = 0.8 + r.next() * 1.2;
      pulsed(ctx, bp, t, 70 + r.next() * 30, d, 40 + r.next() * 30, 0.5, 'sawtooth', 90 + r.next() * 40);
      return d;
    }
    case 'twig': {
      noiseBurst(ctx, out, noise, t, 0.05, 0.5, 'highpass', 1800, 0.7, 0.008);
      if (r.next() < 0.5) noiseBurst(ctx, out, noise, t + 0.06, 0.04, 0.3, 'highpass', 2200, 0.7, 0.006);
      return 0.2;
    }
    case 'drip': {
      tone(ctx, out, t, 900 + r.next() * 500, 2400 + r.next() * 800, 0.04, 0.12, 'sine', 0.002);
      return 0.1;
    }
    case 'meow': { // a vowel-shaped glide through a formant
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.connect(out);
      bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1600, t + 0.25); bp.frequency.linearRampToValueAtTime(800, t + 0.6);
      const f = 520 + r.next() * 160;
      tone(ctx, bp, t, f, f * 1.25, 0.25, 0.35, 'sawtooth', 0.04);
      tone(ctx, bp, t + 0.25, f * 1.25, f * 0.8, 0.35, 0.35, 'sawtooth', 0.01);
      return 0.7;
    }
    case 'bark': {
      const n = r.int(1, 4);
      for (let i = 0; i < n; i++) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.5; bp.connect(out);
        tone(ctx, bp, t + i * 0.35, 420, 300, 0.14, 0.5, 'sawtooth', 0.008);
        noiseBurst(ctx, bp, noise, t + i * 0.35, 0.12, 0.25, 'bandpass', 1200, 1, 0.04);
      }
      return n * 0.35;
    }
    case 'quack': {
      const n = r.int(1, 4);
      for (let i = 0; i < n; i++) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 4; bp.connect(out);
        tone(ctx, bp, t + i * 0.28, 260, 220, 0.18, 0.5, 'square', 0.01);
      }
      return n * 0.28;
    }
    case 'deer': { // sika: a high, thin whistle-call
      tone(ctx, out, t, 1800, 2600, 0.25, 0.12, 'sine', 0.03);
      tone(ctx, out, t + 0.25, 2600, 1500, 0.5, 0.12, 'sine', 0.01);
      return 0.8;
    }
    case 'cluck': {
      const n = r.int(2, 6);
      for (let i = 0; i < n; i++) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 3; bp.connect(out);
        tone(ctx, bp, t + i * 0.18, 380, 330, 0.08, 0.35, 'square', 0.005);
      }
      return n * 0.18;
    }
    case 'whinny': {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 2; bp.connect(out);
      pulsed(ctx, bp, t, 900, 1.1, 14, 0.25, 'sawtooth', 600);
      return 1.2;
    }
    case 'moo': {
      const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 600; bp.connect(out);
      tone(ctx, bp, t, 140, 120, 1.3, 0.4, 'sawtooth', 0.15);
      return 1.4;
    }
    case 'monkey': {
      const n = r.int(1, 3);
      for (let i = 0; i < n; i++) tone(ctx, out, t + i * 0.3, 900, 1500, 0.2, 0.12, 'triangle', 0.02);
      return n * 0.3;
    }
    case 'kite': { // black kite: "piihyorororo"
      tone(ctx, out, t, 2200, 2600, 0.4, 0.1, 'sine', 0.05);
      pulsed(ctx, out, t + 0.45, 2400, 0.9, 12, 0.08, 'sine', 1900);
      return 1.4;
    }
    case 'crane': {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 2; bp.connect(out);
      tone(ctx, bp, t, 950, 1100, 0.3, 0.3, 'sawtooth', 0.02);
      tone(ctx, bp, t + 0.35, 1100, 900, 0.4, 0.25, 'sawtooth', 0.02);
      return 0.8;
    }
    case 'splash': { // a fish jumping
      noiseBurst(ctx, out, noise, t, 0.25, 0.4, 'bandpass', 1400, 1.2, 0.06);
      noiseBurst(ctx, out, noise, t + 0.18, 0.3, 0.25, 'bandpass', 900, 1.2, 0.08);
      return 0.6;
    }
  }
}
