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
  /** items, journal, map, album, garden (M11) */
  /** the story's ending (M12) */
  story?: { done?: boolean; given?: boolean };
  adv?: { journey?: Record<string, unknown>; garden?: number[] };
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
  // keep the previous save as a backup, then swap in the new one (temp key → swap)
  try { const prev = await kv.get<Record<string, unknown>>('save.' + slot); if (prev && valid(prev)) await kv.swap('save.' + slot + '.prev', prev); } catch { /* no backup this time */ }
  await kv.swap('save.' + slot, full);
}

/** A save that makes sense: a seed and a finite position. */
export function valid(s: Record<string, unknown> | null): boolean {
  const pos = s?.pos as unknown;
  return !!s && typeof s.seed === 'number' && Array.isArray(pos) && pos.length === 3 && pos.every((v) => Number.isFinite(v));
}

export async function readSave(slot: number): Promise<SaveData | null> {
  for (const key of ['save.' + slot, 'save.' + slot + '.prev']) {
    try {
      const raw = await kv.get<Record<string, unknown>>(key);
      const m = raw && valid(raw) ? migrate(raw) : null;
      if (m) return m;
    } catch { /* try the backup */ }
  }
  return null;
}

/** Export a save as a file the player keeps (SPEC §27). */
export function exportSave(s: SaveData, slot: number): void {
  const blob = new Blob([JSON.stringify(s)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hotaru-save-${slot}-day${(s.day ?? 0) + 1}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Import a save file into a slot; resolves to the save, or null if it isn't one. */
export function importSave(slot: number): Promise<SaveData | null> {
  return new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      try {
        const f = inp.files?.[0];
        if (!f) return res(null);
        const raw = JSON.parse(await f.text()) as Record<string, unknown>;
        const m = valid(raw) ? migrate(raw) : null;
        if (!m) return res(null);
        await kv.swap('save.' + slot, m);
        res(m);
      } catch { res(null); }
    };
    inp.click();
  });
}

/** Ask the browser not to evict our storage (important on iPadOS). */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
