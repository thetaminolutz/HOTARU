/**
 * Music player (SPEC §25): plays one generated piece (an "arc" of 2–4 minutes), then leaves
 * minutes of pure ambience before the next one — silence is a feature. The next piece fits
 * wherever you are then (region, hour). Notes are scheduled a second ahead on the audio clock.
 */
import type { Mixer } from './mixer';
import { playNote } from './instruments';
import { composePiece, degreeToMidi, moodFor, SCALES, type Piece } from './composer';
import { createRng } from '../core/rng';

export type MusicFrequency = 'often' | 'occasional' | 'rare' | 'off';
const GAP: Record<MusicFrequency, [number, number]> = { often: [45, 110], occasional: [150, 360], rare: [420, 900], off: [Infinity, Infinity] };

export class MusicPlayer {
  frequency: MusicFrequency = 'occasional';
  piece: Piece | null = null;
  private start = 0;
  private idx = 0;
  /** audio-clock time when the next piece may start */
  nextAt = 0;
  private rng = createRng(0x5eed);
  private count = 0;
  private out: GainNode;
  /** last context (for the next piece) */
  region = 'lake';
  hour = 12;
  title = false;

  constructor(private mix: Mixer) {
    this.out = mix.ctx.createGain();
    this.out.connect(mix.buses.music);
    const send = mix.ctx.createGain();
    send.gain.value = 0.45;
    this.out.connect(send); send.connect(mix.reverbIn);
    // the first piece comes a little while after you start walking (or right away on the title)
    this.nextAt = mix.now + 25 + this.rng.next() * 35;
  }

  get playing(): boolean { return this.piece !== null; }

  /** Start a piece now (title screen, tests). */
  playNow(): void { this.nextAt = this.mix.now; }

  /** Fade out and end the current piece (e.g. entering a festival takes over). */
  stop(fade = 3): void {
    if (!this.piece) return;
    const g = this.out.gain, t = this.mix.now;
    g.setTargetAtTime(0, t, fade / 3);
    this.piece = null;
    setTimeout(() => this.out.gain.setTargetAtTime(1, this.mix.now, 0.05), fade * 1000 + 200);
    this.scheduleGap();
  }

  private scheduleGap(): void {
    const [a, b] = GAP[this.frequency];
    this.nextAt = this.mix.now + a + this.rng.next() * (b - a);
  }

  update(): void {
    const now = this.mix.now;
    if (!this.piece) {
      if (this.frequency === 'off' || now < this.nextAt) return;
      const mood = moodFor(this.region, this.hour, this.title);
      this.piece = composePiece(0x484f + this.count++ * 7919, mood);
      this.start = now + 0.3;
      this.idx = 0;
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setValueAtTime(1, now);
    }
    const p = this.piece;
    const spb = 60 / p.mood.bpm;
    const ahead = now + 1.2;
    while (this.idx < p.notes.length) {
      const n = p.notes[this.idx]!;
      const t = this.start + n.beat * spb;
      if (t > ahead) break;
      // slight human timing, and a gentle swell in the middle of the arc
      const arc = Math.sin(Math.PI * Math.min(1, n.beat / p.beats));
      if (t >= now - 0.05) playNote(this.mix.ctx, this.out, n.inst, Math.max(t, now) + this.rng.next() * 0.012, n.midi, n.dur * spb, n.vel * (0.75 + 0.25 * arc));
      this.idx++;
    }
    if (this.idx >= p.notes.length && now > this.start + p.seconds + 4) {
      this.piece = null;
      this.scheduleGap();
    }
  }

  /** A short discovery sting (a new place): a rising arpeggio on chimes and koto. */
  sting(): void {
    const ctx = this.mix.ctx, t = this.mix.now + 0.05;
    const sc = SCALES.yo;
    [0, 2, 4, 7].forEach((d, i) => {
      playNote(ctx, this.out, 'koto', t + i * 0.16, degreeToMidi(sc, 62, d), 1, 0.5);
      playNote(ctx, this.out, 'chime', t + i * 0.16 + 0.02, degreeToMidi(sc, 74, d), 1, 0.35);
    });
  }
}

/** Render a piece offline (no speakers needed): used to publish listenable samples. */
export async function renderPiece(region: string, hour: number, title: boolean, seconds: number, sampleRate = 22050): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.floor(seconds * sampleRate), sampleRate);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  // a small room-ish reverb from a decaying noise tail
  const conv = ctx.createConvolver();
  const n = Math.floor(sampleRate * 2.2), ir = ctx.createBuffer(1, n, sampleRate), d = ir.getChannelData(0);
  const r = createRng(7);
  for (let i = 0; i < n; i++) d[i] = (r.next() * 2 - 1) * Math.exp(-3.2 * i / n * 2.2);
  conv.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.12;
  out.connect(ctx.destination); out.connect(conv); conv.connect(wet); wet.connect(ctx.destination);
  const piece = composePiece(0x484f, moodFor(region, hour, title));
  const spb = 60 / piece.mood.bpm;
  for (const note of piece.notes) {
    const t = 0.2 + note.beat * spb;
    if (t > seconds - 1) break;
    playNote(ctx, out, note.inst, t, note.midi, note.dur * spb, note.vel);
  }
  const buf = await ctx.startRendering();
  const data = buf.getChannelData(0);
  // fade out the end
  const f = sampleRate * 2;
  for (let i = 0; i < f; i++) data[data.length - 1 - i]! *= i / f;
  return data;
}
