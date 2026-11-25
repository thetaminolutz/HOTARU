/**
 * Your journey's record (SPEC §10–11): inventory, map reveal (fog of war), stamps and drawn
 * strokes, places visited, creatures and fish seen, the album of photos and sketches.
 * Pure data, saved with the game.
 */
import { Inventory } from './items';
import { HALF } from '../world/data/regions';

export const MAP_CELLS = 160;
const CELL = (HALF * 2) / MAP_CELLS;

export type Stamp = { x: number; z: number; icon: number };
export type Stroke = { pts: number[]; w: number[]; color: number };
export type Catch = { id: string; size: number; day: number };
export type AlbumEntry = { id: number; kind: 'photo' | 'sketch'; day: number; hour: number; place: string; w: number; h: number; data: string };

export class Journey {
  readonly inv = new Inventory();
  /** fog-of-war: 0 unseen … 255 seen */
  readonly reveal = new Uint8Array(MAP_CELLS * MAP_CELLS);
  stamps: Stamp[] = [];
  strokes: Stroke[] = [];
  places: Record<string, number> = {};
  creatures: Record<string, number> = {};
  fish: Record<string, Catch> = {};
  album: AlbumEntry[] = [];
  /** keepsakes picked up: pickup id → day */
  picked: Record<string, number> = {};
  /** keepsakes given: person id → item ids */
  gifts: Record<string, string[]> = {};
  /** onChange hook (map texture refresh) */
  revealVersion = 0;

  /** Paint away the fog around a point (radius in metres). */
  revealAt(x: number, z: number, r = 140): void {
    const ci = (x + HALF) / CELL, cj = (z + HALF) / CELL, rc = r / CELL;
    let changed = false;
    for (let j = Math.floor(cj - rc); j <= Math.ceil(cj + rc); j++) for (let i = Math.floor(ci - rc); i <= Math.ceil(ci + rc); i++) {
      if (i < 0 || j < 0 || i >= MAP_CELLS || j >= MAP_CELLS) continue;
      const d = Math.hypot(i + 0.5 - ci, j + 0.5 - cj) / rc;
      if (d > 1) continue;
      const v = Math.round(255 * Math.min(1, (1 - d) * 2.2));
      const k = j * MAP_CELLS + i;
      if (v > this.reveal[k]!) { this.reveal[k] = v; changed = true; }
    }
    if (changed) this.revealVersion++;
  }
  revealed(x: number, z: number): number {
    const i = Math.floor((x + HALF) / CELL), j = Math.floor((z + HALF) / CELL);
    if (i < 0 || j < 0 || i >= MAP_CELLS || j >= MAP_CELLS) return 0;
    return this.reveal[j * MAP_CELLS + i]! / 255;
  }
  /** fraction of the map revealed */
  get explored(): number { let n = 0; for (const v of this.reveal) if (v > 128) n++; return n / this.reveal.length; }

  visit(place: string, day: number): boolean { if (place in this.places) return false; this.places[place] = day; return true; }
  see(creature: string, day: number): boolean { if (creature in this.creatures) return false; this.creatures[creature] = day; return true; }
  /** a fish caught; returns true if a new species or a bigger one */
  caught(id: string, size: number, day: number): boolean {
    const prev = this.fish[id];
    if (prev && prev.size >= size) return false;
    this.fish[id] = { id, size, day };
    return true;
  }
  addAlbum(e: Omit<AlbumEntry, 'id'>): AlbumEntry {
    const entry = { ...e, id: (this.album.at(-1)?.id ?? 0) + 1 };
    this.album.push(entry);
    if (this.album.length > 60) this.album.shift();
    return entry;
  }

  toJSON() {
    let s = '';
    for (const v of this.reveal) s += String.fromCharCode(v);
    return {
      inv: this.inv.toJSON(), reveal: btoa(s), stamps: this.stamps, strokes: this.strokes, places: this.places,
      creatures: this.creatures, fish: this.fish, album: this.album, picked: this.picked, gifts: this.gifts,
    };
  }
  load(o: Partial<ReturnType<Journey['toJSON']>>): void {
    if (o.inv) this.inv.load(o.inv);
    if (o.reveal) { const s = atob(o.reveal); for (let i = 0; i < Math.min(s.length, this.reveal.length); i++) this.reveal[i] = s.charCodeAt(i); this.revealVersion++; }
    this.stamps = o.stamps ?? []; this.strokes = o.strokes ?? []; this.places = o.places ?? {};
    this.creatures = o.creatures ?? {}; this.fish = o.fish ?? {}; this.album = o.album ?? [];
    this.picked = o.picked ?? {}; this.gifts = o.gifts ?? {};
  }
}
