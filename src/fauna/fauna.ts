/**
 * Fauna (SPEC §15). Animals spawn in 40 m cells around the player from habitat, region and
 * hour (deterministic per cell and two-hour window), live a small state machine (idle, wander,
 * graze, rest/sleep, flee, approach, swim, circle, fly, flutter, perch, stand), react to how
 * you move (jogging scares, standing still invites the curious), remember trust per species,
 * can be petted, and temple deer bow back. One instanced draw per species.
 */
import * as THREE from 'three';
import { SPECIES, type Habitat, type Species } from './data/species';
import { buildAnimal } from './models';
import { faunaMaterial } from './material';
import { createRng, hash3, type Rng } from '../core/rng';
import { REGIONS } from '../world/data/regions';
import type { GameWorld } from '../scene/gameWorld';

const CELL = 40;
const RADIUS = 120;
const MAX_PER_SPECIES = 48;

type State = 'idle' | 'wander' | 'graze' | 'sleep' | 'flee' | 'approach' | 'petted' | 'bow' | 'takeoff';

export type Animal = {
  id: number; sp: Species; cell: string;
  pos: THREE.Vector3; yaw: number; home: THREE.Vector3; target: THREE.Vector3;
  state: State; timer: number; speed: number;
  phase: number; gait: number; head: number; wing: number; sleep: number; wag: number; pitch: number;
  orbit: number; alt: number; r: Rng; callIn: number;
};

type Kind = { sp: Species; mesh: THREE.Mesh; geo: THREE.InstancedBufferGeometry; legH: number };

const inHours = (h: number, [a, b]: [number, number]) => (a <= b ? h >= a && h < b : h >= a || h < b);
const angDiff = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export class Fauna {
  readonly group = new THREE.Group();
  readonly animals: Animal[] = [];
  private kinds = new Map<string, Kind>();
  private cells = new Map<string, Animal[]>();
  private nextId = 1;
  /** trust per species (petting, visiting); grows slowly, saved with the game */
  trust: Record<string, number> = {};
  /** set by the audio system: an animal calls at a world position */
  onCall: ((voice: NonNullable<Species['voice']>, pos: THREE.Vector3) => void) | null = null;
  /** set by the game: an animal can be petted / bowed to right now */
  onNear: ((a: Animal, near: boolean) => void) | null = null;
  enabled = true;
  private b = { forest: 0, moisture: 0, autumn: 0, special: 0, specialW: 0, grass: [0, 0, 0] as [number, number, number], region: 0 };
  private hourBucket = -1;
  private near = new Set<number>();

  constructor(private w: GameWorld, private seed: number) {
    this.group.name = 'fauna';
    for (const sp of SPECIES) {
      const { geo, legH } = buildAnimal(sp);
      const ig = new THREE.InstancedBufferGeometry();
      for (const k of ['position', 'normal', 'aColor', 'aPart', 'aPivot']) ig.setAttribute(k, geo.getAttribute(k));
      ig.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PER_SPECIES * 4), 4).setUsage(THREE.DynamicDrawUsage));
      ig.setAttribute('iAnim', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PER_SPECIES * 4), 4).setUsage(THREE.DynamicDrawUsage));
      ig.setAttribute('iMisc', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PER_SPECIES * 4), 4).setUsage(THREE.DynamicDrawUsage));
      ig.instanceCount = 0;
      const mesh = new THREE.Mesh(ig, faunaMaterial(legH, sp.size > 0.3));
      mesh.frustumCulled = false;
      mesh.name = 'fauna-' + sp.id;
      mesh.userData.castShadow = sp.size > 0.3 && sp.plan !== 'fish';
      mesh.userData.noReflect = sp.size < 0.3;
      mesh.visible = false;
      this.group.add(mesh);
      this.kinds.set(sp.id, { sp, mesh, geo: ig, legH });
    }
  }

  // ---------- habitat ----------
  private habitats(x: number, z: number): Set<Habitat> {
    const w = this.w, H = new Set<Habitat>(['sky']);
    const h = w.height(x, z), b = w.world.biome(x, z, this.b);
    const rid = REGIONS[b.region]?.id ?? '';
    let village: string | null = null, vd = Infinity, vr = 1;
    for (const v of w.villages.villages) {
      const d = Math.hypot(x - v.layout.def.x, z - v.layout.def.z);
      if (d < vd) { vd = d; village = v.layout.def.id; vr = v.layout.def.r; }
    }
    const inVillage = vd < vr * 0.9;
    if (h < -0.7) H.add('water');
    else if (h < 1.4) H.add('shore');
    if (h > 1) {
      if (inVillage) H.add('village');
      if (village === 'kumoji' && vd < vr * 1.3) H.add('temple');
      if (village === 'yukemuri' && vd < vr * 1.3) H.add('onsen');
      if ((village === 'inaho' || village === 'chabatake') && vd < vr * 1.8) H.add('farm');
      if (rid === 'rice' || rid === 'tea') H.add('farm');
      if (b.forest > 0.55 && !inVillage) H.add('forest');
      if (b.forest < 0.4 && !inVillage) H.add('meadow');
      if (rid === 'sunflower' || rid === 'hydrangea' || rid === 'cherry' || (b.forest < 0.3 && b.moisture > 0.5)) H.add('flowers');
      if (h > 620 && (rid === 'snow' || h > 950)) H.add('snow');
    }
    if (rid === 'marsh' || (b.special === 7 && b.specialW > 0.4)) H.add('marsh');
    if (rid === 'coast' && h < 12 && h > -0.5) H.add('coast');
    return H;
  }

  /** Spawn the animals of one cell (deterministic per cell and two-hour window). */
  private spawnCell(ci: number, cj: number, hour: number): Animal[] {
    const out: Animal[] = [];
    const r = createRng(hash3(ci, cj, Math.floor(hour / 2), this.seed ^ 0xfa0a));
    const tries = 2;
    for (let t = 0; t < tries; t++) {
      if (r.next() > 0.42) continue;
      const x = (ci + r.next()) * CELL, z = (cj + r.next()) * CELL;
      const H = this.habitats(x, z);
      const cands = SPECIES.filter((sp) => sp.habitats.some((hb) => H.has(hb)) && (inHours(hour, sp.hours) || sp.sleeps));
      if (!cands.length) continue;
      const tot = cands.reduce((a, s) => a + s.weight, 0);
      let u = r.next() * tot, sp = cands[0]!;
      for (const c of cands) { u -= c.weight; if (u <= 0) { sp = c; break; } }
      // kites and gulls circle high: only a few in the sky
      if ((sp.move === 'circle') && r.next() < 0.6) continue;
      const n = r.int(sp.group[0], sp.group[1] + 1);
      for (let k = 0; k < n; k++) {
        const ax = x + (r.next() - 0.5) * 8, az = z + (r.next() - 0.5) * 8;
        const gh = this.w.groundHeight(ax, az);
        const water = sp.move === 'swim';
        if (water ? gh > -0.6 : gh < 0.25 && sp.habitats.indexOf('shore') < 0 && sp.habitats.indexOf('coast') < 0) continue;
        if (!water && gh < -0.2) continue;
        const kind = this.kinds.get(sp.id)!;
        if (kind.geo.instanceCount + out.filter((a) => a.sp === sp).length >= MAX_PER_SPECIES) continue;
        out.push(this.make(sp, ax, az, gh, hour, r));
      }
    }
    return out;
  }

  private make(sp: Species, x: number, z: number, gh: number, hour: number, r: Rng): Animal {
    const asleep = !inHours(hour, sp.hours);
    const y = sp.move === 'swim' ? (sp.plan === 'fish' ? -0.35 : -0.02) : sp.move === 'circle' ? gh + 45 + r.next() * 40
      : sp.move === 'perch' ? gh + 6 + r.next() * 3 : sp.move === 'flutter' ? gh + 0.6 + r.next() : sp.move === 'fly' ? gh + 3 + r.next() * 5 : gh;
    const a: Animal = {
      id: this.nextId++, sp, cell: '', pos: new THREE.Vector3(x, y, z), yaw: r.next() * Math.PI * 2, home: new THREE.Vector3(x, y, z), target: new THREE.Vector3(x, y, z),
      state: asleep ? 'sleep' : 'idle', timer: r.range(1, 5), speed: 0,
      phase: r.next() * 6, gait: 0, head: 0, wing: sp.move === 'circle' || sp.move === 'fly' || sp.move === 'flutter' ? 1 : 0, sleep: asleep ? 1 : 0, wag: 0, pitch: 0,
      orbit: r.next() * Math.PI * 2, alt: y, r: createRng(hash3(Math.round(x * 10), Math.round(z * 10), 3, this.seed)), callIn: r.range(5, 40),
    };
    return a;
  }

  // ---------- per frame ----------
  update(dt: number, player: THREE.Vector3, playerSpeed: number, hour: number): void {
    if (!this.enabled) { this.group.visible = false; return; }
    this.group.visible = true;
    const bucket = Math.floor(hour / 2);
    if (bucket !== this.hourBucket) {
      // the hour window changed: let the world re-populate (nocturnal animals come out)
      this.hourBucket = bucket;
      for (const k of [...this.cells.keys()]) this.dropCell(k);
    }
    // stream cells
    const ci0 = Math.floor((player.x - RADIUS) / CELL), ci1 = Math.floor((player.x + RADIUS) / CELL);
    const cj0 = Math.floor((player.z - RADIUS) / CELL), cj1 = Math.floor((player.z + RADIUS) / CELL);
    const want = new Set<string>();
    if (player.y - this.w.height(player.x, player.z) < 80) for (let j = cj0; j <= cj1; j++) for (let i = ci0; i <= ci1; i++) {
      const cx = (i + 0.5) * CELL, cz = (j + 0.5) * CELL;
      if (Math.hypot(cx - player.x, cz - player.z) > RADIUS) continue;
      const key = i + ',' + j;
      want.add(key);
      if (!this.cells.has(key)) {
        const list = this.spawnCell(i, j, hour);
        for (const a of list) { a.cell = key; this.animals.push(a); }
        this.cells.set(key, list);
      }
    }
    for (const k of [...this.cells.keys()]) if (!want.has(k)) {
      // keep cells a little longer (no popping right at the edge)
      const [i, j] = k.split(',').map(Number) as [number, number];
      if (Math.hypot((i + 0.5) * CELL - player.x, (j + 0.5) * CELL - player.z) > RADIUS + 30) this.dropCell(k);
    }
    for (const a of this.animals) this.think(a, dt, player, playerSpeed, hour);
    this.upload();
  }

  private dropCell(key: string): void {
    const list = this.cells.get(key);
    this.cells.delete(key);
    if (!list) return;
    for (const a of list) {
      const i = this.animals.indexOf(a);
      if (i >= 0) this.animals.splice(i, 1);
      if (this.near.delete(a.id)) this.onNear?.(a, false);
    }
  }

  private think(a: Animal, dt: number, player: THREE.Vector3, pSpeed: number, hour: number): void {
    const sp = a.sp, r = a.r;
    const dx = a.pos.x - player.x, dz = a.pos.z - player.z;
    const d = Math.hypot(dx, dz);
    const trust = this.trust[sp.id] ?? 0;
    const awake = inHours(hour, sp.hours);
    a.timer -= dt;
    let desired = 0; // movement speed this frame

    // reactions to the player
    const ground = sp.move === 'walk' || sp.move === 'hop' || sp.move === 'still' || sp.move === 'swim';
    if (ground && a.state !== 'flee' && a.state !== 'takeoff' && a.state !== 'petted' && a.state !== 'bow') {
      const scare = sp.flee * (pSpeed > 3.2 ? 1 : pSpeed > 1.6 ? 0.45 : 0.2) * Math.max(0.2, 1 - trust * 0.2);
      if (sp.flee > 0 && d < scare) {
        if (sp.plan === 'bird' && sp.move !== 'swim' && sp.id !== 'chicken') { a.state = 'takeoff'; a.wing = 1; a.timer = 6; }
        else { a.state = 'flee'; a.timer = r.range(2.5, 4.5); a.sleep = 0; }
        a.target.set(a.pos.x + (dx / (d || 1)) * 30, a.pos.y, a.pos.z + (dz / (d || 1)) * 30);
      } else if (awake && a.state !== 'approach' && pSpeed < 1.3 && d < 14 && d > 3 && r.next() < sp.curious * dt * 0.15) {
        a.state = 'approach'; a.timer = 12;
      }
    }

    switch (a.state) {
      case 'sleep':
        a.sleep = Math.min(1, a.sleep + dt); a.head = 0.35;
        if (awake) { a.state = 'idle'; a.timer = 2; }
        break;
      case 'idle':
        a.head += (Math.sin(a.phase * 0.3 + a.id) * 0.15 - a.head) * dt * 2;
        a.sleep = Math.max(0, a.sleep - dt);
        if (a.timer < 0) {
          if (!awake && sp.sleeps) { a.state = 'sleep'; break; }
          const u = r.next();
          const grazer = ['sikaDeer', 'horse', 'cow', 'goat', 'serow', 'hare', 'chicken', 'pigeon', 'sparrow', 'crow', 'ptarmigan', 'pheasant', 'boar', 'piglet', 'egret', 'crane'].includes(sp.id);
          if (grazer && u < 0.45) { a.state = 'graze'; a.timer = r.range(3, 9); }
          else { a.state = 'wander'; a.timer = r.range(4, 10); const R = sp.move === 'swim' ? 10 : sp.size * 8 + 3; a.target.set(a.home.x + (r.next() - 0.5) * R * 2, a.pos.y, a.home.z + (r.next() - 0.5) * R * 2); }
        }
        break;
      case 'graze':
        a.head += (0.95 - a.head) * dt * 3;
        if (a.timer < 0) { a.state = 'idle'; a.timer = r.range(1, 4); }
        break;
      case 'wander':
        a.head += (0 - a.head) * dt * 3;
        desired = sp.speed * 0.6;
        if (a.timer < 0 || Math.hypot(a.target.x - a.pos.x, a.target.z - a.pos.z) < 0.5) { a.state = 'idle'; a.timer = r.range(2, 6); }
        break;
      case 'flee':
        a.head = 0; desired = sp.speed * 3.2;
        if (a.timer < 0) { a.state = 'idle'; a.timer = 3; a.home.copy(a.pos); }
        break;
      case 'approach':
        a.head += (-0.1 - a.head) * dt * 3;
        a.target.copy(player);
        desired = d > 2.2 ? sp.speed * 0.7 : 0;
        a.wag = sp.id === 'shiba' || sp.id === 'akita' ? 1 : 0.3;
        if (d <= 2.2) a.yaw += angDiff(a.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 4);
        if (a.timer < 0 || pSpeed > 2.5) { a.state = 'idle'; a.timer = 3; a.wag = 0; }
        break;
      case 'petted':
        a.head += (-0.2 - a.head) * dt * 4; a.wag = 1;
        if (a.timer < 0) { a.state = 'idle'; a.timer = 4; a.wag = 0; }
        break;
      case 'bow':
        a.head += ((a.timer > 1.4 ? 0 : a.timer > 0.4 ? 1.0 : 0) - a.head) * dt * 5;
        if (a.timer < 0) { a.state = 'idle'; a.timer = 3; }
        break;
      case 'takeoff':
        a.wing = 1; desired = 6;
        a.pos.y += dt * 4;
        if (a.timer < 0) { a.state = 'idle'; a.pos.y = this.w.groundHeight(a.target.x, a.target.z); a.pos.x = a.target.x; a.pos.z = a.target.z; a.home.copy(a.pos); a.wing = 0; }
        break;
    }

    // movement by kind
    switch (sp.move) {
      case 'circle': {
        a.orbit += dt * (sp.speed / 40);
        a.pos.set(a.home.x + Math.cos(a.orbit) * 40, a.alt + Math.sin(a.orbit * 0.5) * 4, a.home.z + Math.sin(a.orbit) * 40);
        a.yaw = Math.atan2(-Math.sin(a.orbit), Math.cos(a.orbit));
        a.phase += dt * 6; a.wing = 0.3 + 0.7 * Math.max(0, Math.sin(a.orbit * 3)); a.gait = 0;
        return;
      }
      case 'fly': case 'flutter': {
        const fast = sp.move === 'fly';
        if (a.timer < 0 || a.pos.distanceTo(a.target) < 1) {
          a.timer = r.range(1, fast ? 3 : 4);
          const R = fast ? 25 : 4;
          const gx = a.home.x + (r.next() - 0.5) * R * 2, gz = a.home.z + (r.next() - 0.5) * R * 2;
          a.target.set(gx, this.w.groundHeight(gx, gz) + (fast ? 1.5 + r.next() * 6 : 0.3 + r.next() * 1.4), gz);
        }
        const to = a.target.clone().sub(a.pos), l = to.length() || 1;
        const v = Math.min(l, sp.speed * dt);
        a.pos.addScaledVector(to, v / l);
        a.yaw += angDiff(a.yaw, Math.atan2(to.x, to.z)) * Math.min(1, dt * 6);
        a.pitch = fast ? Math.asin(Math.max(-0.6, Math.min(0.6, to.y / l))) : 0;
        a.phase += dt * (fast ? 14 : sp.size < 0.05 ? 60 : 26);
        a.wing = 1; a.gait = 0;
        return;
      }
      case 'perch':
        a.head = Math.sin(a.phase * 0.4) * 0.2; a.phase += dt;
        a.yaw += Math.sin(a.phase * 0.25) * dt * 0.4;
        this.maybeCall(a, dt, d);
        return;
    }
    // ground / water movement towards the target
    a.speed += (desired - a.speed) * Math.min(1, dt * 4);
    if (a.speed > 0.02) {
      const tx = a.target.x - a.pos.x, tz = a.target.z - a.pos.z;
      const want = Math.atan2(tx, tz);
      a.yaw += angDiff(a.yaw, want) * Math.min(1, dt * 3);
      const nx = a.pos.x + Math.sin(a.yaw) * a.speed * dt, nz = a.pos.z + Math.cos(a.yaw) * a.speed * dt;
      const gh = this.w.groundHeight(nx, nz);
      const ok = sp.move === 'swim' ? gh < -0.6 : gh > 0.1;
      if (ok) { a.pos.x = nx; a.pos.z = nz; } else { a.target.copy(a.home); }
      if (sp.move !== 'swim') {
        let y = this.w.groundHeight(a.pos.x, a.pos.z);
        if (sp.move === 'hop') y += Math.abs(Math.sin(a.phase * 0.5)) * Math.min(0.25, sp.size * 0.5) * Math.min(1, a.speed);
        a.pos.y = y;
      }
    }
    a.phase += dt * a.speed * (8 / Math.max(0.3, sp.size)) * (sp.move === 'hop' ? 1.5 : 1);
    a.gait += (Math.min(1, a.speed / Math.max(0.2, sp.speed)) - a.gait) * Math.min(1, dt * 5);
    if (sp.move === 'swim' && sp.plan === 'fish') a.wag = 0.3 + a.gait;
    if (a.state !== 'sleep') this.maybeCall(a, dt, d);
    // near enough to pet or bow to?
    const can = !!(sp.pettable || sp.bows) && d < 3.2 && a.state !== 'flee' && a.state !== 'sleep';
    if (can !== this.near.has(a.id)) {
      if (can) this.near.add(a.id); else this.near.delete(a.id);
      this.onNear?.(a, can);
    }
  }

  private maybeCall(a: Animal, dt: number, d: number): void {
    if (!a.sp.voice || d > 90) return;
    a.callIn -= dt;
    if (a.callIn < 0) {
      a.callIn = a.r.range(12, 60) * (a.sp.voice === 'frog' ? 0.3 : 1);
      this.onCall?.(a.sp.voice, a.pos);
    }
  }

  /** Place a group of a species at (x, z) (screenshots, tests). They live in a pinned cell. */
  spawnAt(id: string, x: number, z: number, n: number, hour: number, spread = 3): Animal[] {
    const sp = SPECIES.find((s) => s.id === id);
    if (!sp) return [];
    const r = createRng(hash3(Math.round(x), Math.round(z), n, 77));
    const key = 'pin:' + id + ':' + Math.round(x) + ',' + Math.round(z);
    const list: Animal[] = [];
    for (let k = 0; k < n; k++) {
      const ax = x + (r.next() - 0.5) * spread * 2, az = z + (r.next() - 0.5) * spread * 2;
      const a = this.make(sp, ax, az, this.w.groundHeight(ax, az), hour, r);
      a.cell = key;
      list.push(a);
      this.animals.push(a);
    }
    this.pinned.set(key, list);
    return list;
  }
  private pinned = new Map<string, Animal[]>();

  /** The player pets an animal. */
  pet(a: Animal): void {
    a.state = 'petted'; a.timer = 2.5; a.sleep = 0;
    this.trust[a.sp.id] = Math.min(5, (this.trust[a.sp.id] ?? 0) + 0.5);
    if (a.sp.voice) this.onCall?.(a.sp.voice, a.pos);
  }

  /** The player bows; the deer bows back a moment later. */
  bow(a: Animal): void {
    setTimeout(() => { a.state = 'bow'; a.timer = 2.2; }, 700);
    this.trust[a.sp.id] = Math.min(5, (this.trust[a.sp.id] ?? 0) + 0.25);
  }

  private upload(): void {
    const count = new Map<string, number>();
    for (const a of this.animals) {
      const k = this.kinds.get(a.sp.id)!;
      const i = count.get(a.sp.id) ?? 0;
      if (i >= MAX_PER_SPECIES) continue;
      count.set(a.sp.id, i + 1);
      const P = k.geo.getAttribute('iPos').array as Float32Array, A = k.geo.getAttribute('iAnim').array as Float32Array, M = k.geo.getAttribute('iMisc').array as Float32Array;
      P[i * 4] = a.pos.x; P[i * 4 + 1] = a.pos.y; P[i * 4 + 2] = a.pos.z; P[i * 4 + 3] = a.yaw;
      A[i * 4] = a.phase; A[i * 4 + 1] = a.gait; A[i * 4 + 2] = a.head; A[i * 4 + 3] = a.wing;
      M[i * 4] = 1; M[i * 4 + 1] = a.sleep; M[i * 4 + 2] = a.wag; M[i * 4 + 3] = a.pitch;
    }
    for (const [id, k] of this.kinds) {
      const n = count.get(id) ?? 0;
      k.geo.instanceCount = n;
      k.mesh.visible = n > 0;
      if (n) for (const name of ['iPos', 'iAnim', 'iMisc']) {
        const at = k.geo.getAttribute(name) as THREE.InstancedBufferAttribute;
        at.clearUpdateRanges(); at.addUpdateRange(0, n * 4); at.needsUpdate = true;
      }
    }
  }

  get stats(): { animals: number; species: number; bySpecies: Record<string, number> } {
    const by: Record<string, number> = {};
    for (const a of this.animals) by[a.sp.id] = (by[a.sp.id] ?? 0) + 1;
    return { animals: this.animals.length, species: Object.keys(by).length, bySpecies: by };
  }
}
