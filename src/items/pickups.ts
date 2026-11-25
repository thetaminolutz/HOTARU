/**
 * Keepsakes lying in the world (SPEC §10): shells on the sand, smooth stones on river banks,
 * feathers under trees, pressed-flower blossoms in meadows, and village things (a crane left on a
 * step, a coin by the well, a spinning top) plus a few hand-placed finds (the fox mask by the
 * temple gate, the storehouse key at the castle, the star chart on the hill). Common ones grow
 * back after a few days. One merged mesh, rebuilt when something is picked up.
 */
import * as THREE from 'three';
import { boxUV, mergeGeoms } from '../buildings/kit';
import { litMaterial, ensureColor } from '../render/materials';
import { createRng, hashString } from '../core/rng';
import { keepsakeDef, type KeepsakeId } from './items';
import type { GameWorld } from '../scene/gameWorld';

export type Pickup = { id: string; item: KeepsakeId; pos: THREE.Vector3; renew: boolean };

const VILLAGE_FINDS: KeepsakeId[] = ['crane', 'coin', 'top', 'pinwheel', 'riceBall', 'chime', 'fan', 'brush', 'letter', 'omamori', 'incense', 'tea', 'persimmon', 'seeds', 'luckyCat', 'fish'];
const RESPAWN_DAYS = 3;

const lin = (hex: number): [number, number, number] => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

export class Pickups {
  readonly list: Pickup[] = [];
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private material = litMaterial({ outline: true });

  constructor(private w: GameWorld, seed: number) {
    this.group.name = 'pickups';
    this.place(seed);
  }

  private add(id: string, item: KeepsakeId, x: number, z: number, renew = false): void {
    const y = this.w.groundHeight(x, z);
    if (y < 0.15 || this.w.world.hydro.waterAt(x, z) > y - 0.05) return;
    this.list.push({ id, item, pos: new THREE.Vector3(x, y, z), renew });
  }

  private place(seed: number): void {
    const r = createRng(seed ^ hashString('keepsakes'));
    const W = this.w.world;
    // villages: a few things left on steps and by wells
    for (const v of this.w.villages.villages) {
      const L = v.layout;
      for (let k = 0; k < 4; k++) {
        const street = L.streets[r.int(0, Math.max(1, L.streets.length))];
        const pt = street?.[r.int(0, Math.max(1, street.length))];
        const [x, z] = pt ?? [L.well.x + r.range(-6, 6), L.well.z + r.range(-6, 6)];
        this.add(`v-${L.def.id}-${k}`, r.pick(VILLAGE_FINDS), x + r.range(-1.6, 1.6), z + r.range(-1.6, 1.6));
      }
    }
    // river banks: smooth stones
    for (const rv of W.hydro.rivers) {
      for (let i = 2; i < rv.pts.length - 1; i += 9) {
        const p = rv.pts[i]!, q = rv.pts[i + 1]!;
        const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1, side = r.chance(0.5) ? 1 : -1;
        const off = p.width / 2 + 1.4;
        this.add(`stone-${rv.id}-${i}`, 'stone', p.x - (dz / l) * off * side, p.z + (dx / l) * off * side, true);
      }
    }
    // the coast: shells along the tide line (walk west from the sea until the sand rises)
    for (let z = -2600; z <= 2400; z += 260) {
      for (let x = 4900; x > 3000; x -= 6) {
        const h = W.height(x, z);
        if (h > 0.35 && h < 1.6) { this.add(`shell-${z}`, 'shell', x - 1.5, z + r.range(-20, 20), true); break; }
        if (h > 1.6) break;
      }
    }
    // the lake shore too
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      for (let d = 250; d < 900; d += 4) {
        const x = Math.cos(a) * d, z = Math.sin(a) * d, h = W.height(x, z);
        if (h > 0.3) { if (h < 1.4) this.add(`lshell-${a.toFixed(1)}`, r.chance(0.5) ? 'shell' : 'stone', x, z, true); break; }
      }
    }
    // forests and meadows: feathers and flowers, scattered over the land
    const b = { forest: 0, moisture: 0, autumn: 0, special: 0, specialW: 0, grass: [0, 0, 0] as [number, number, number], region: 0 };
    for (let n = 0; n < 220 && this.list.length < 150; n++) {
      const x = r.range(-4400, 4400), z = r.range(-4400, 4400);
      W.biome(x, z, b);
      const h = W.height(x, z);
      if (h < 2 || h > 600) continue;
      if (b.forest > 0.55 && r.chance(0.35)) this.add(`feather-${n}`, 'feather', x, z, true);
      else if (b.forest < 0.35 && b.moisture > 0.45 && r.chance(0.35)) this.add(`flower-${n}`, 'flower', x, z, true);
    }
    // hand-placed finds
    const kumoji = this.w.villages.villages.find((v) => v.layout.def.id === 'kumoji')?.layout.torii;
    if (kumoji) this.add('foxMask', 'foxMask', kumoji.x + 3.2, kumoji.z - 2.1);
    const c = W.sites.castle;
    this.add('key', 'key', c.x + 7, c.z + 9);
    this.add('starChart', 'starChart', 420, -620);
    const inaho = this.w.villages.villages.find((v) => v.layout.def.id === 'inaho')?.layout.well;
    if (inaho) this.add('doll', 'doll', inaho.x + 14, inaho.z - 9);
  }

  /** Visible pickups: not picked, or grown back. */
  available(picked: Record<string, number>, day: number): Pickup[] {
    return this.list.filter((p) => { const d = picked[p.id]; return d === undefined || (p.renew && day - d >= RESPAWN_DAYS); });
  }

  /** Rebuild the merged mesh for what's lying around now. */
  rebuild(picked: Record<string, number>, day: number): void {
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    const parts: THREE.BufferGeometry[] = [];
    for (const p of this.available(picked, day)) {
      const col = lin(keepsakeDef(p.item).color), { x, y, z } = p.pos;
      const rot = (hashString(p.id) % 628) / 100;
      let g: THREE.BufferGeometry;
      switch (p.item) {
        case 'stone': g = new THREE.SphereGeometry(0.13, 6, 4).toNonIndexed().scale(1.3, 0.6, 1); break;
        case 'shell': g = new THREE.ConeGeometry(0.1, 0.08, 6).toNonIndexed().rotateX(Math.PI / 2).scale(1, 0.5, 1); break;
        case 'feather': g = boxUV(0.04, 0.012, 0.32, 1); break;
        case 'flower': g = mergeGeoms([boxUV(0.02, 0.22, 0.02, 1, [0.3, 0.5, 0.25]).translate(0, -0.08, 0), ensureColor(new THREE.SphereGeometry(0.07, 5, 3).toNonIndexed(), col)]); break;
        default: g = boxUV(0.18, 0.1, 0.14, 1);
      }
      ensureColor(g, col);
      g.rotateY(rot).translate(x, y + (p.item === 'flower' ? 0.2 : 0.06), z);
      parts.push(g);
      // a small glint so it can be spotted
      parts.push(boxUV(0.03, 0.03, 0.03, 1, [1, 0.95, 0.8], 0.9).translate(x, y + 0.24, z));
    }
    if (!parts.length) return;
    this.mesh = new THREE.Mesh(mergeGeoms(parts), this.material);
    this.mesh.name = 'pickups';
    this.group.add(this.mesh);
  }
}
