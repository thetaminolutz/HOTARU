/**
 * Save game (SPEC §27): versioned format with migrations, written atomically. M1 stores the
 * essentials (seed, position, view, time); every later milestone adds its own fields.
 */
import { kv } from './db';

export const SAVE_VERSION = 1;

export type SaveV1 = {
  version: 1;
  seed: number;
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  hour: number;
  day: number;
  savedAt: number;
  /** villagers you've met and the nicknames they gave you (M9) */
  memory?: { met: Record<string, number>; nick: Record<string, string> };
  /** trust per animal species (M8) */
  trust?: Record<string, number>;
  /** secrets found, shrine restoration, the castle's hidden gate (M10) */
  found?: string[];
  shrines?: Record<string, { level: number; lastDay: number }>;
  gate?: boolean;
};

export type SaveData = SaveV1;

/** Migrations from older versions, keyed by source version. */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {};

export function migrate(raw: Record<string, unknown>): SaveData | null {
  let s = raw;
  let v = Number(s.version ?? 0);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) return null;
    s = m(s);
    v = Number(s.version);
  }
  return s as unknown as SaveData;
}

export async function writeSave(slot: number, data: Omit<SaveData, 'version' | 'savedAt'>): Promise<void> {
  const full: SaveData = { ...data, version: SAVE_VERSION, savedAt: Date.now() };
  await kv.swap('save.' + slot, full);
}

export async function readSave(slot: number): Promise<SaveData | null> {
  try {
    const raw = await kv.get<Record<string, unknown>>('save.' + slot);
    return raw ? migrate(raw) : null;
  } catch {
    return null;
  }
}

/** Ask the browser not to evict our storage (important on iPadOS). */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
