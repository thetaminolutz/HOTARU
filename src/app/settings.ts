/** Player settings (SPEC §26), persisted in localStorage (settings only — saves live in IndexedDB). */
import type { QualityName } from '../config';
import { bus } from '../core/events';
import { DEFAULT_BINDINGS, type Action } from '../player/bindings';

export type Settings = {
  quality: QualityName;
  dither: number;
  outlines: boolean;
  showFps: boolean;
  headBob: boolean;
  /** Field of view in degrees (60–100). */
  fov: number;
  /** Look sensitivity multiplier (0.25–2). */
  sensitivity: number;
  invertY: boolean;
  /** Hold Shift to jog (false) or toggle jog with a tap (true). */
  toggleJog: boolean;
  bindings: Record<Action, string[]>;
  /** Volumes 0..1 (SPEC §26 audio). */
  volMaster: number;
  volMusic: number;
  volAmbience: number;
  volSfx: number;
  /** How often music arcs come between stretches of pure ambience. */
  musicFrequency: 'often' | 'occasional' | 'rare' | 'off';
  /** Seasons cycle every `seasonDays` in-game days, or stay locked ("eternal autumn"). */
  seasonMode: 'cycle' | 'spring' | 'summer' | 'autumn' | 'winter';
  seasonDays: number;
  /** Changing weather, or always fair. */
  weatherMode: 'dynamic' | 'fair';
  /** Lower the quality while frames stay slow; come back up when there's room (SPEC §3.13). */
  autoQuality: boolean;
  fpsCap: 30 | 60 | 0;
  /** Comfort & accessibility (SPEC §26) */
  reducedMotion: boolean;
  largeText: boolean;
  highContrast: boolean;
  subtitles: boolean;
  monoAudio: boolean;
  leftHanded: boolean;
  hints: 'gentle' | 'off';
  /** active save slot (1–3) */
  saveSlot: number;
};

const KEY = 'hotaru.settings.v1';
const DEFAULTS: Settings = {
  quality: 'medium', dither: 0.85, outlines: true, showFps: false, headBob: true,
  fov: 75, sensitivity: 1, invertY: false, toggleJog: false,
  bindings: structuredClone(DEFAULT_BINDINGS),
  volMaster: 0.8, volMusic: 0.7, volAmbience: 0.8, volSfx: 0.7, musicFrequency: 'occasional',
  seasonMode: 'cycle', seasonDays: 7, weatherMode: 'dynamic',
  autoQuality: true, fpsCap: 60, reducedMotion: false, largeText: false, highContrast: false, subtitles: false,
  monoAudio: false, leftHanded: false, hints: 'gentle', saveSlot: 1,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const s = JSON.parse(raw) as Partial<Settings>;
    return { ...structuredClone(DEFAULTS), ...s, bindings: { ...structuredClone(DEFAULT_BINDINGS), ...(s.bindings ?? {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const settings: Settings = load();

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  settings[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode: keep in memory */ }
  bus.emit('settings:changed', { key });
}
