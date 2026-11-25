/**
 * Generative composer (SPEC §25): pieces are built from phrases over Japanese pentatonic
 * scales (yo, in, miyako-bushi, ryūkyū) and gentle Western ones, with a motif per region and
 * a recognisable main theme (the Lantern Lake motif) that returns in variations. Pure and
 * deterministic: (seed, mood) → a list of notes in beats.
 */
import { createRng, hashString, type Rng } from '../core/rng';
import type { Instrument } from './instruments';

export const SCALES = {
  yo: [0, 2, 5, 7, 9],
  in: [0, 1, 5, 7, 8],
  miyako: [0, 1, 5, 7, 10],
  ryukyu: [0, 4, 5, 7, 11],
  majorPenta: [0, 2, 4, 7, 9],
  minorPenta: [0, 3, 5, 7, 10],
} as const;
export type ScaleName = keyof typeof SCALES;

export type Mood = {
  id: string;
  scale: ScaleName;
  root: number;      // MIDI note of the tonic (melody register)
  bpm: number;
  melody: Instrument;
  accomp: Instrument;
  extra?: Instrument; // occasional colour (music box, chimes, shamisen)
  pad: boolean;
  /** 0..1: how many notes are played (night is sparse) */
  density: number;
  /** use the main theme as the A section */
  theme: boolean;
  /** the region whose motif shapes the B sections */
  motif: string;
};

export type Note = { beat: number; dur: number; midi: number; inst: Instrument; vel: number };
export type Piece = { mood: Mood; notes: Note[]; beats: number; seconds: number };

/** The Lantern Lake theme: [scale degree, beats]. Degrees count up the scale across octaves. */
export const MAIN_THEME: [number, number][] = [
  [4, 1], [5, 1], [7, 2], [5, 1], [4, 1], [2, 2],
  [1, 1], [2, 1], [4, 1.5], [2, 0.5], [1, 4],
  [4, 1], [5, 1], [7, 1.5], [8, 0.5], [7, 1], [5, 1], [4, 2],
  [2, 1], [4, 1], [1, 2], [0, 4],
];

export function degreeToMidi(scale: readonly number[], root: number, deg: number): number {
  const o = Math.floor(deg / scale.length), i = ((deg % scale.length) + scale.length) % scale.length;
  return root + o * 12 + scale[i]!;
}

/** A region's motif: 8 bars of stepwise melody, ending at home. */
export function regionMotif(name: string): [number, number][] {
  const r = createRng(hashString('motif:' + name));
  return phrase(r, 32, 3, 0.5);
}

/** A singing phrase: mostly steps, a few leaps, longer notes at phrase ends. */
function phrase(r: Rng, beats: number, start: number, restiness: number): [number, number][] {
  const out: [number, number][] = [];
  let b = 0, d = start;
  const durs = [0.5, 1, 1, 1, 1.5, 2, 2, 3];
  while (b < beats) {
    const left = beats - b;
    let dur = left <= 4 ? left : durs[r.int(0, durs.length)]!;
    if ((b + dur) % 8 > 6 && left > 4) dur += 1; // breathe at the end of each two bars
    dur = Math.min(dur, left);
    const step = r.next();
    d += step < 0.38 ? -1 : step < 0.76 ? 1 : step < 0.86 ? 2 : step < 0.94 ? -2 : 0;
    if (left <= 4) d = r.next() < 0.6 ? 0 : 2; // land on the tonic or the third degree
    d = Math.max(-2, Math.min(9, d));
    out.push([r.next() < restiness * 0.12 && left > 4 ? -99 : d, dur]);
    b += dur;
  }
  return out;
}

/** Vary a phrase: ornaments, shifted degrees, octave displacement. */
function vary(r: Rng, p: [number, number][], amount: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [d, dur] of p) {
    if (d === -99) { out.push([d, dur]); continue; }
    const u = r.next();
    if (u < amount * 0.25 && dur >= 1) { out.push([d + 1, 0.25], [d, dur - 0.25]); continue; } // grace note
    if (u < amount * 0.45) { out.push([d + (r.next() < 0.5 ? 1 : -1), dur]); continue; }
    if (u < amount * 0.55 && dur >= 2) { out.push([d, dur / 2], [d + 2, dur / 2]); continue; }
    out.push([d, dur]);
  }
  return out;
}

const SECTION_PLANS = [
  ['A', 'A2', 'B', 'A3'],
  ['intro', 'A', 'B', 'A2', 'coda'],
  ['A', 'B', 'B2', 'A2', 'coda'],
  ['intro', 'A', 'A2', 'B', 'A3', 'coda'],
];

export function composePiece(seed: number, mood: Mood): Piece {
  const r = createRng(seed ^ hashString(mood.id));
  const scale = SCALES[mood.scale];
  const notes: Note[] = [];
  const themeA: [number, number][] = mood.theme ? MAIN_THEME : regionMotif(mood.motif + ':A');
  const motifB = regionMotif(mood.motif);
  const plan = [...SECTION_PLANS[r.int(0, SECTION_PLANS.length)]!];
  // arcs last 2–4 minutes: grow the middle until the piece is long enough
  const secLen = (s: string) => (s === 'intro' || s === 'coda' ? 16 : 32);
  const extra = ['B2', 'A3', 'B', 'A2'];
  for (let k = 0; (plan.reduce((a, s) => a + secLen(s), 0) * 60) / mood.bpm < 125 && k < 8; k++) {
    const at = plan[plan.length - 1] === 'coda' ? plan.length - 1 : plan.length;
    plan.splice(at, 0, extra[k % extra.length]!);
  }
  let beat = 0;
  // a slow harmonic rhythm: one chord root per two bars, chosen from scale degrees
  const chordFor = (bar: number) => [0, 3, 2, 0, 4, 3, 1, 0][(bar >> 1) % 8]!;
  plan.forEach((sec) => {
    const len = secLen(sec);
    let mel: [number, number][] | null;
    if (sec === 'intro') mel = null;
    else if (sec === 'coda') mel = [[4, 3], [2, 1], [1, 4], [-99, 4], [0, 4]];
    else if (sec.startsWith('A')) mel = sec === 'A' ? themeA : vary(r, themeA, sec === 'A2' ? 0.5 : 0.8);
    else mel = sec === 'B' ? motifB.map(([d, l]) => [d === -99 ? d : d + 2, l] as [number, number]) : vary(r, motifB, 0.6);
    // melody
    if (mel) {
      let b = beat;
      const rate = mel === MAIN_THEME || sec.startsWith('A') ? len / mel.reduce((a, [, l]) => a + l, 0) : 1;
      for (const [d, l] of mel) {
        const dur = l * rate;
        if (d !== -99 && r.next() < 0.55 + mood.density * 0.45) {
          notes.push({ beat: b, dur: dur * 0.95, midi: degreeToMidi(scale, mood.root, d), inst: mood.melody, vel: 0.55 + r.next() * 0.25 + (dur >= 2 ? 0.1 : 0) });
        }
        b += dur;
      }
    }
    // accompaniment: gentle arpeggios a register below, thinner when sparse
    for (let bar = 0; bar < len / 4; bar++) {
      const c = chordFor(bar);
      const t0 = beat + bar * 4;
      const pattern = mood.density > 0.6 ? [0, 1, 2, 3] : mood.density > 0.35 ? [0, 2] : [0];
      for (const k of pattern) {
        if (r.next() > 0.5 + mood.density * 0.5 && k > 0) continue;
        const deg = c + [0, 2, 4, 2][k]!;
        notes.push({ beat: t0 + k, dur: 2.5, midi: degreeToMidi(scale, mood.root - 12, deg), inst: mood.accomp, vel: 0.35 + r.next() * 0.15 });
      }
      if (mood.pad && bar % 2 === 0) {
        for (const d of [c, c + 2]) notes.push({ beat: t0, dur: 8, midi: degreeToMidi(scale, mood.root - 24, d), inst: 'pad', vel: 0.6 });
      }
      // a high colour note now and then
      if (mood.extra && r.next() < 0.18 * (0.5 + mood.density)) {
        notes.push({ beat: t0 + r.int(0, 4) + 0.5, dur: 1, midi: degreeToMidi(scale, mood.root + 12, r.int(0, 7)), inst: mood.extra, vel: 0.3 + r.next() * 0.2 });
      }
    }
    beat += len;
  });
  notes.sort((a, b) => a.beat - b.beat);
  return { mood, notes, beats: beat, seconds: (beat * 60) / mood.bpm };
}

/** Pick the mood for a place and time. */
export function moodFor(region: string, hour: number, title = false): Mood {
  const night = hour < 5 || hour > 20.5;
  const dusk = hour > 17 && hour <= 20.5;
  if (title) return { id: 'title', scale: 'yo', root: 62, bpm: 60, melody: 'piano', accomp: 'koto', extra: 'musicbox', pad: true, density: 0.6, theme: true, motif: 'lake' };
  if (night) return { id: 'night:' + region, scale: region === 'lake' ? 'yo' : 'in', root: 64, bpm: 52, melody: 'piano', accomp: 'piano', extra: 'musicbox', pad: true, density: 0.3, theme: region === 'lake', motif: region };
  const base: Partial<Mood> = (() => {
    switch (region) {
      case 'lake': case 'mirror': return { scale: 'yo', root: 62, bpm: 64, melody: dusk ? 'piano' : 'koto', accomp: 'koto', extra: 'chime', pad: true, theme: true };
      case 'cedar': case 'bamboo': case 'temple': case 'wisteria': return { scale: 'in', root: 69, bpm: 54, melody: 'shakuhachi', accomp: 'koto', pad: true, density: 0.45 };
      case 'snow': case 'castle': case 'volcano': case 'ginkgo': return { scale: 'miyako', root: 64, bpm: 58, melody: 'shakuhachi', accomp: 'koto', extra: 'bell', pad: true };
      case 'rice': case 'tea': case 'market': return { scale: 'yo', root: 67, bpm: 80, melody: 'koto', accomp: 'shamisen', extra: 'musicbox', pad: false, density: 0.75 };
      case 'coast': case 'marsh': return { scale: 'ryukyu', root: 60, bpm: 70, melody: 'koto', accomp: 'piano', extra: 'chime', pad: true };
      case 'cherry': case 'sunflower': case 'hydrangea': return { scale: 'majorPenta', root: 65, bpm: 72, melody: 'musicbox', accomp: 'koto', extra: 'chime', pad: true, density: 0.65 };
      case 'pampas': case 'maple': return { scale: 'minorPenta', root: 62, bpm: 60, melody: 'shakuhachi', accomp: 'koto', pad: true };
      default: return { scale: 'yo', root: 64, bpm: 64, melody: 'koto', accomp: 'piano', pad: true };
    }
  })();
  return { id: `${region}:${dusk ? 'dusk' : 'day'}`, density: dusk ? 0.45 : 0.6, theme: false, motif: region, pad: true, scale: 'yo', root: 64, bpm: 64, melody: 'koto', accomp: 'koto', ...base } as Mood;
}
