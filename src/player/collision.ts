/**
 * Collision world: everything you can bump into, in a spatial grid — walls and buildings (boxes),
 * tree trunks, posts, stone lanterns, shrines, tablets and benches (circles), bushes (soft: they
 * slow you down instead of stopping you), and moving people and large animals. The player is a
 * circle; `resolve` pushes it out of whatever it overlaps, so you slide along walls and around
 * trunks instead of stopping dead. Things lower than a step (`top` near your feet) don't block.
 */
import type { Collider } from './controller';

export type Circle = { x: number; z: number; r: number; top: number; bottom?: number; soft?: boolean };

const CELL = 8;
const key = (i: number, j: number) => i * 73856093 ^ j * 19349663;

export class CollisionWorld {
  private cells = new Map<number, { boxes: Collider[]; circles: Circle[] }>();
  private tags = new Map<string, { k: number; c?: Circle; b?: Collider }[]>();
  /** moving things (people, animals) for this frame */
  dynamic: Circle[] = [];
  /** how much a soft obstacle (a bush) slowed you on the last resolve, 0..1 */
  slowed = 0;

  private cell(k: number) { let c = this.cells.get(k); if (!c) { c = { boxes: [], circles: [] }; this.cells.set(k, c); } return c; }

  addBox(b: Collider, tag = ''): void {
    for (let i = Math.floor(b.x0 / CELL); i <= Math.floor(b.x1 / CELL); i++) for (let j = Math.floor(b.z0 / CELL); j <= Math.floor(b.z1 / CELL); j++) {
      const k = key(i, j);
      this.cell(k).boxes.push(b);
      if (tag) (this.tags.get(tag) ?? this.tags.set(tag, []).get(tag)!).push({ k, b });
    }
  }
  addCircle(c: Circle, tag = ''): void {
    for (let i = Math.floor((c.x - c.r) / CELL); i <= Math.floor((c.x + c.r) / CELL); i++) for (let j = Math.floor((c.z - c.r) / CELL); j <= Math.floor((c.z + c.r) / CELL); j++) {
      const k = key(i, j);
      this.cell(k).circles.push(c);
      if (tag) (this.tags.get(tag) ?? this.tags.set(tag, []).get(tag)!).push({ k, c });
    }
  }
  /** Remove everything added under a tag (a forest tile that left, a festival that ended). */
  remove(tag: string): void {
    const list = this.tags.get(tag);
    if (!list) return;
    for (const e of list) {
      const cell = this.cells.get(e.k);
      if (!cell) continue;
      if (e.c) { const i = cell.circles.indexOf(e.c); if (i >= 0) cell.circles.splice(i, 1); }
      if (e.b) { const i = cell.boxes.indexOf(e.b); if (i >= 0) cell.boxes.splice(i, 1); }
    }
    this.tags.delete(tag);
  }
  has(tag: string): boolean { return this.tags.has(tag); }

  /** Does (x, z) with radius r overlap anything that blocks at this height? */
  blocked(x: number, z: number, feet: number, r: number, head = 1.7): boolean {
    let hit = false;
    this.visit(x, z, r, feet, head, (dx, dz, pen, soft) => { if (!soft && pen > 0.02) hit = true; void dx; void dz; });
    return hit;
  }

  /** Push the circle (x, z, r) out of everything it overlaps; returns the free position. */
  resolve(x: number, z: number, feet: number, r: number, head = 1.7): { x: number; z: number } {
    this.slowed = 0;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      this.visit(x, z, r, feet, head, (nx, nz, pen, soft) => {
        if (soft) { this.slowed = Math.max(this.slowed, Math.min(1, pen / r)); return; }
        x += nx * pen; z += nz * pen; moved = true;
      });
      if (!moved) break;
    }
    return { x, z };
  }

  /** Call `f(normalX, normalZ, penetration, soft)` for every overlap near (x, z). */
  private visit(x: number, z: number, r: number, feet: number, head: number, f: (nx: number, nz: number, pen: number, soft: boolean) => void): void {
    const blocksAt = (top: number, bottom = -1e9) => feet < top - 0.3 && feet + head > bottom;
    const circle = (c: Circle) => {
      if (!blocksAt(c.top, c.bottom)) return;
      const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), pen = r + c.r - d;
      if (pen <= 0) return;
      const n = d > 1e-4 ? 1 / d : 0;
      f(d > 1e-4 ? dx * n : 1, d > 1e-4 ? dz * n : 0, pen, !!c.soft);
    };
    const seen = new Set<Collider>();
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
      const cell = this.cells.get(key(i, j));
      if (!cell) continue;
      for (const c of cell.circles) circle(c);
      for (const b of cell.boxes) {
        if (seen.has(b)) continue;
        seen.add(b);
        if (!blocksAt(b.top)) continue;
        // closest point on the box to the circle's centre
        const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
        const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
        if (d > 1e-4) { const pen = r - d; if (pen > 0) f(dx / d, dz / d, pen, false); continue; }
        // centre inside the box: out through the nearest side
        const l = x - b.x0, rr = b.x1 - x, t = z - b.z0, bt = b.z1 - z, m = Math.min(l, rr, t, bt);
        if (m === l) f(-1, 0, l + r, false); else if (m === rr) f(1, 0, rr + r, false); else if (m === t) f(0, -1, t + r, false); else f(0, 1, bt + r, false);
      }
    }
    for (const c of this.dynamic) if (Math.abs(c.x - x) < r + c.r && Math.abs(c.z - z) < r + c.r) circle(c);
  }
}
