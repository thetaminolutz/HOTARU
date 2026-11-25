/**
 * Items (SPEC §10): tools that never take a slot and are never lost, and keepsakes that fill
 * the 12 slots (gifts, offerings, things to keep at home). Every item has a 12×12 pixel icon.
 */
import { Pixmap, shadeHex } from '../render/pixmap';
import type { Job } from '../people/data/people';

export type ToolId = 'lantern' | 'rod' | 'camera' | 'sketchbook' | 'map' | 'flute' | 'umbrella' | 'boat';
export type KeepsakeId =
  | 'shell' | 'stone' | 'feather' | 'flower' | 'crane' | 'letter' | 'omamori' | 'coin' | 'foxMask' | 'incense'
  | 'riceBall' | 'persimmon' | 'tea' | 'chime' | 'top' | 'seeds' | 'fan' | 'doll' | 'key' | 'brush' | 'luckyCat' | 'starChart' | 'pinwheel' | 'fish' | 'lantern1000';

export type ToolDef = { id: ToolId; name: string; text: string; color: number };
export type KeepsakeDef = { id: KeepsakeId; name: string; text: string; color: number; likedBy: Job[]; offering?: boolean };

export const TOOLS: ToolDef[] = [
  { id: 'map', name: 'Map', text: 'A hand-drawn map that fills in as you walk.', color: 0xd8c8a0 },
  { id: 'camera', name: 'Camera', text: 'Photos go into the journal’s album.', color: 0x3a3a40 },
  { id: 'sketchbook', name: 'Sketchbook', text: 'Ink a view, or draw your own.', color: 0xe8dcc0 },
  { id: 'lantern', name: 'Paper lantern', text: 'Lights your way at night. A gift from Akari.', color: 0xffb347 },
  { id: 'rod', name: 'Fishing rod', text: 'Old Genzō’s spare. Patience first, hooks later.', color: 0x8a6a3a },
  { id: 'flute', name: 'Flute', text: 'The hermit’s bamboo flute. Some places listen.', color: 0xa8884a },
  { id: 'umbrella', name: 'Umbrella', text: 'A red wagasa. Rain drums on it.', color: 0xc0402a },
  { id: 'boat', name: 'Boat token', text: 'Take the rowboat at the Tomoshibi pier.', color: 0x6a4a34 },
];

export const KEEPSAKES: KeepsakeDef[] = [
  { id: 'shell', name: 'Seashell', text: 'Pink inside, like a sunrise.', color: 0xf0d0c0, likedBy: ['child', 'fisher'] },
  { id: 'stone', name: 'Smooth stone', text: 'The river spent a century on it.', color: 0x8a8a90, likedBy: ['elder', 'potter'] },
  { id: 'feather', name: 'Feather', text: 'Light as a thought.', color: 0xe8e4dc, likedBy: ['child', 'weaver'] },
  { id: 'flower', name: 'Pressed flower', text: 'A season, kept flat between pages.', color: 0xe07a8a, likedBy: ['weaver', 'tea', 'elder'], offering: true },
  { id: 'crane', name: 'Origami crane', text: 'A thousand of them grant a wish.', color: 0xe8e0f0, likedBy: ['child', 'monk'] },
  { id: 'letter', name: 'Letter', text: 'Addressed to someone across the lake.', color: 0xf0e8d0, likedBy: [] },
  { id: 'omamori', name: 'Omamori charm', text: 'For safe journeys.', color: 0xc84a3a, likedBy: ['fisher'], offering: true },
  { id: 'coin', name: 'Old coin', text: 'Square hole, worn smooth.', color: 0xc8a050, likedBy: ['merchant'], offering: true },
  { id: 'foxMask', name: 'Fox mask', text: 'White, with red marks. Someone left it.', color: 0xf4f0e8, likedBy: [] },
  { id: 'incense', name: 'Incense sticks', text: 'Sandalwood.', color: 0x8a5a3a, likedBy: ['monk'], offering: true },
  { id: 'riceBall', name: 'Rice ball', text: 'For sharing.', color: 0xf4f4ec, likedBy: ['farmer', 'child', 'carpenter'], offering: true },
  { id: 'persimmon', name: 'Persimmon', text: 'Sweet after the first frost.', color: 0xe8782a, likedBy: ['elder', 'farmer'], offering: true },
  { id: 'tea', name: 'Tea leaves', text: 'First flush from Chabatake.', color: 0x5a8a4a, likedBy: ['tea', 'innkeeper', 'elder'] },
  { id: 'chime', name: 'Wind chime', text: 'A glass fūrin with a goldfish.', color: 0x9ac8e8, likedBy: ['innkeeper', 'child'] },
  { id: 'top', name: 'Spinning top', text: 'Wobbles, then sings.', color: 0xc8503a, likedBy: ['child'] },
  { id: 'seeds', name: 'Seeds', text: 'Plant them at home.', color: 0x8a7a4a, likedBy: ['farmer'] },
  { id: 'fan', name: 'Festival fan', text: 'Painted with fireworks.', color: 0x3a5ac8, likedBy: ['tea', 'lanternMaker'] },
  { id: 'doll', name: 'Lost doll', text: 'Someone must be missing her.', color: 0xe8b0a0, likedBy: ['child'] },
  { id: 'key', name: 'Old key', text: 'Iron, heavy, for a storehouse.', color: 0x5a5a5a, likedBy: [] },
  { id: 'brush', name: 'Ink brush', text: 'For letters and poems.', color: 0x3a2a22, likedBy: ['lanternMaker', 'monk'] },
  { id: 'luckyCat', name: 'Lucky cat', text: 'Beckons good fortune.', color: 0xf8f4ec, likedBy: ['merchant'] },
  { id: 'starChart', name: 'Star chart', text: 'One star is missing.', color: 0x2a3a6a, likedBy: [] },
  { id: 'pinwheel', name: 'Pinwheel', text: 'Turns with the faintest breeze.', color: 0xe8c040, likedBy: ['child'] },
  { id: 'lantern1000', name: 'The thousandth lantern', text: 'Painted with a single firefly. Float it on the lake on festival night.', color: 0xffc860, likedBy: [] },
  { id: 'fish', name: 'Dried fish', text: 'The cats will follow you.', color: 0xb8a088, likedBy: ['fisher', 'elder'] },
];

export const toolDef = (id: ToolId) => TOOLS.find((t) => t.id === id)!;
export const keepsakeDef = (id: KeepsakeId) => KEEPSAKES.find((k) => k.id === id)!;

/** A 12×12 icon: a coloured token shape per kind. */
const iconCache = new Map<string, Pixmap>();
export function itemIcon(id: string, color: number): Pixmap {
  const hit = iconCache.get(id);
  if (hit) return hit;
  const p = new Pixmap(12, 12), dark = shadeHex(color, 0.55), lite = shadeHex(color, 1.25);
  const disc = (r: number) => { for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const d = Math.hypot(x - 5.5, y - 5.5); if (d < r) p.set(x, y, d > r - 1 ? dark : x + y < 9 ? lite : color); } };
  switch (id) {
    case 'lantern': disc(5); for (let y = 2; y < 10; y += 2) p.hline(2, 9, y, dark); p.hline(3, 8, 0, 0x3a2418); p.hline(3, 8, 11, 0x3a2418); break;
    case 'rod': p.line(1, 11, 10, 1, color); p.line(10, 1, 10, 7, 0xd8d0c0); p.set(10, 8, 0xc83a2a); break;
    case 'flute': p.line(1, 10, 10, 1, color); p.line(2, 10, 11, 1, dark); for (const k of [3, 5, 7]) p.set(k, 11 - k, 0x2a1a14); break;
    case 'umbrella': for (let y = 1; y < 6; y++) p.hline(6 - y, 5 + y, y, y % 2 ? color : lite); p.vline(6, 6, 11, 0x3a2418); break;
    case 'map': p.rect(1, 2, 10, 8, color); p.line(2, 8, 5, 4, 0x4a6a8a); p.line(5, 4, 9, 6, 0x4a6a8a); p.set(7, 3, 0xc83a2a); break;
    case 'camera': p.rect(1, 3, 10, 7, color); p.rect(4, 5, 4, 4, 0x8ab0d0); p.rect(2, 2, 3, 1, color); break;
    case 'sketchbook': p.rect(2, 1, 8, 10, color); p.vline(2, 1, 10, 0x8a3a2a); p.line(4, 7, 8, 4, 0x2a2a2a); break;
    case 'boat': p.hline(1, 10, 7, color); p.hline(2, 9, 8, color); p.hline(3, 8, 9, dark); p.vline(6, 2, 6, 0x3a2418); break;
    case 'fish': for (let x = 2; x < 9; x++) p.vline(x, 4 + (x < 5 ? 5 - x : 0) / 2, 7 - (x < 5 ? 5 - x : 0) / 2, color); p.vline(9, 3, 8, dark); p.set(3, 5, 0x1a1a1a); break;
    case 'feather': p.line(2, 10, 9, 2, dark); for (let k = 0; k < 6; k++) { p.set(4 + k, 8 - k, color); p.set(3 + k, 7 - k, color); } break;
    case 'crane': p.line(1, 7, 6, 3, color); p.line(6, 3, 10, 6, color); p.line(6, 3, 6, 9, dark); break;
    default: disc(4.5);
  }
  iconCache.set(id, p);
  return p;
}

export class Inventory {
  static readonly SLOTS = 12;
  tools = new Set<ToolId>(['map', 'camera', 'sketchbook']);
  slots: (KeepsakeId | null)[] = new Array(Inventory.SLOTS).fill(null);
  /** keepsakes stored at home (unlimited) */
  stored: KeepsakeId[] = [];
  /** the tool in hand for "use tool" */
  current: ToolId | null = null;

  add(id: KeepsakeId): boolean {
    const i = this.slots.indexOf(null);
    if (i < 0) return false;
    this.slots[i] = id;
    return true;
  }
  remove(id: KeepsakeId): boolean {
    const i = this.slots.indexOf(id);
    if (i < 0) return false;
    this.slots[i] = null;
    return true;
  }
  get free(): number { return this.slots.filter((s) => !s).length; }
  give(tool: ToolId): boolean {
    if (this.tools.has(tool)) return false;
    this.tools.add(tool);
    this.current ??= tool === 'rod' || tool === 'lantern' || tool === 'flute' ? tool : this.current;
    return true;
  }
  /** cycle the tool in hand among those that can be "used" */
  nextTool(): ToolId | null {
    const usable = (['lantern', 'rod', 'flute', 'umbrella'] as ToolId[]).filter((t) => this.tools.has(t));
    if (!usable.length) return (this.current = null);
    const i = this.current ? usable.indexOf(this.current) : -1;
    return (this.current = usable[(i + 1) % usable.length]!);
  }
  toJSON(): { tools: ToolId[]; slots: (KeepsakeId | null)[]; stored: KeepsakeId[]; current: ToolId | null } {
    return { tools: [...this.tools], slots: [...this.slots], stored: [...this.stored], current: this.current };
  }
  load(o: ReturnType<Inventory['toJSON']>): void {
    this.tools = new Set(o.tools); this.slots = o.slots.slice(0, Inventory.SLOTS); while (this.slots.length < Inventory.SLOTS) this.slots.push(null);
    this.stored = o.stored ?? []; this.current = o.current ?? null;
  }
}
