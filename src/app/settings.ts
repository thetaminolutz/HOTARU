/** Player settings (SPEC §26), persisted in localStorage (settings only — saves live in IndexedDB). */
import type { QualityName } from '../config';
import { bus } from '../core/events';

export type Settings = {
  quality: QualityName;
  dither: number;
  outlines: boolean;
  showFps: boolean;
  headBob: boolean;
};

const KEY = 'hotaru.settings.v1';
const DEFAULTS: Settings = { quality: 'medium', dither: 0.85, outlines: true, showFps: false, headBob: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  settings[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode: keep in memory */ }
  bus.emit('settings:changed', { key });
}
