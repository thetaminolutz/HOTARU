/**
 * Villagers & wanderers (SPEC §16–17). Each village is populated from its houses (households
 * with jobs from the house's trade, children and elders), every person follows their job's
 * schedule (home, work, field, dock, plaza, tea house, shrine, river), walking the streets.
 * The lantern maker walks the village at dusk lighting every lantern one by one and puts them
 * out near dawn. Umbrellas in rain and snow, home in storms. They notice you: a bow the first
 * time, later a wave. Wanderers keep their own haunts and roads. One instanced draw for all.
 */
import * as THREE from 'three';
import { personGeometry, peopleMaterial } from './model';
import { CLOTHES, FAMILY, FAMILY_END, GIVEN, PERSONALITIES, SCHEDULES, WANDERERS, type Activity, type Age, type Job, type Personality, type Place, type WandererDef } from './data/people';
import { createRng, hashString, type Rng } from '../core/rng';
import { hexToLinear } from '../render/color';
import type { GameWorld } from '../scene/gameWorld';
import type { HouseSpec } from '../buildings/house';

const MAX = 160;
const ACTIVE_R = 420;

export type Person = {
  id: string; name: string; job: Job; age: Age; personality: Personality; village: string; villageName: string;
  home: HouseSpec | null; work: HouseSpec | null; pitch: number;
  clothes: [THREE.Color, THREE.Color]; hair: THREE.Color; skin: number; hat: boolean; basket: boolean;
  wanderer?: WandererDef;
  /** the masked stranger, after the story's ending */
  unmasked?: boolean;
  // live state
  pos: THREE.Vector3; yaw: number; path: THREE.Vector3[]; act: Activity; place: Place; target: THREE.Vector3;
  inside: boolean; visible: boolean; phase: number; gait: number; pose: number; arm: number; armT: number;
  umbrella: boolean; greetT: number; r: Rng; slotKey: string; lanternIdx: number; actT: number;
  /** look: hairstyle (0 bun, 1 topknot, 2 ponytail, 3 bob), everyday outfit (0 kimono, 1 work clothes), headband */
  hairStyle: number; outfit: number; headband: boolean;
  /** live look: outfit now (3 bath wrap, 4 summer clothes), smile 0..1, body pose (1 lying, 2 swimming), rain cape */
  outfitNow: number; smile: number; body: number; cape: boolean;
};

const H2 = new THREE.Vector3();

function houseDoor(h: HouseSpec, out = new THREE.Vector3(), outward = 1.6): THREE.Vector3 {
  const a = (h.rot * Math.PI) / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  const lz = h.d / 2 + outward;
  return out.set(h.x + lz * s, h.floorY, h.z + lz * c);
}
function houseInside(h: HouseSpec, r: Rng, out = new THREE.Vector3()): THREE.Vector3 {
  const a = (h.rot * Math.PI) / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  const lx = (r.next() - 0.5) * (h.w - 2), lz = (r.next() - 0.6) * (h.d - 2);
  return out.set(h.x + lx * c + lz * s, h.floorY, h.z - lx * s + lz * c);
}
const inHours = (h: number, [a, b]: [number, number]) => (a <= b ? h >= a && h < b : h >= a || h < b);

export class People {
  readonly mesh: THREE.Mesh;
  readonly people: Person[] = [];
  private geo: THREE.InstancedBufferGeometry;
  /** met counts and nicknames (saved) */
  memory: { met: Record<string, number>; nick: Record<string, string> } = { met: {}, nick: {} };
  /** a festival in progress: guests gather around this spot (SPEC §22) */
  festival: { id: string; spot: THREE.Vector3; village: string } | null = null;
  onNear: ((p: Person, near: boolean) => void) | null = null;
  private near = new Set<string>();
  private places = new Map<string, Record<string, THREE.Vector3>>();
  private streets = new Map<string, THREE.Vector3[]>();
  private active = new Set<string>();

  constructor(private w: GameWorld, seed: number) {
    const base = personGeometry();
    const g = new THREE.InstancedBufferGeometry();
    for (const k of ['position', 'normal', 'aPart', 'aSlot', 'aPivot']) g.setAttribute(k, base.getAttribute(k));
    for (const k of ['iPos', 'iAnim', 'iColA', 'iColB', 'iColC', 'iStyle']) g.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, peopleMaterial());
    this.mesh.frustumCulled = false;
    this.mesh.name = 'people';
    this.mesh.userData.castShadow = true;
    this.populate(seed);
  }

  // ---------- population ----------
  private populate(seed: number): void {
    const used = new Set<string>();
    const name = (rr: Rng) => {
      for (let k = 0; k < 20; k++) {
        const n = rr.pick(GIVEN) + ' ' + rr.pick(FAMILY) + rr.pick(FAMILY_END);
        if (!used.has(n)) { used.add(n); return n; }
      }
      return rr.pick(GIVEN);
    };
    const jobOf = (h: HouseSpec): Job => {
      if (h.type === 'shrine') return 'monk';
      if (h.type === 'fisher') return 'fisher';
      if (h.type === 'inn' || h.type === 'onsen') return 'innkeeper';
      if (h.type === 'teahouse') return 'tea';
      if (h.type === 'shop') return 'merchant';
      if (h.type === 'workshop') return (['potter', 'weaver', 'carpenter', 'lanternMaker'] as const).find((j) => j === h.profession) ?? 'carpenter';
      if (h.type === 'machiya') return h.profession === 'weaver' || h.profession === 'potter' ? h.profession : 'merchant';
      return 'farmer';
    };
    for (const v of this.w.villages.villages) {
      const def = v.layout.def;
      const houses = v.layout.houses.filter((h) => h.type !== 'kura' && h.type !== 'onsen');
      let hasLantern = false;
      houses.forEach((h, i) => {
        if (this.people.length >= MAX - 20) return;
        const hr = createRng(hashString(def.id) + i * 131 + seed);
        let job = jobOf(h);
        if (!hasLantern && (job === 'lanternMaker' || i === houses.length - 1 || (job === 'merchant' && i > 1))) { job = 'lanternMaker'; hasLantern = true; }
        const work = ['farmer', 'fisher', 'monk'].includes(job) ? null : h;
        this.add({ id: `${def.id}-${i}-a`, name: name(hr), job, age: 'adult', village: def.id, villageName: def.name, home: h, work, r: hr });
        if (h.type === 'minka' || h.type === 'machiya' || h.type === 'fisher') {
          if (hr.next() < 0.45) this.add({ id: `${def.id}-${i}-c`, name: name(hr).split(' ')[0]!, job: 'child', age: 'child', village: def.id, villageName: def.name, home: h, work: null, r: hr });
          if (hr.next() < 0.35) this.add({ id: `${def.id}-${i}-e`, name: name(hr), job: 'elder', age: 'elder', village: def.id, villageName: def.name, home: h, work: null, r: hr });
        }
      });
      this.streets.set(def.id, v.layout.streets.flatMap((st) => st.map(([x, z]) => new THREE.Vector3(x, this.w.groundHeight(x, z), z))));
      this.places.set(def.id, this.findPlaces(v.layout.def.id));
    }
    for (const wd of WANDERERS) {
      const wr = createRng(hashString(wd.id));
      const p = this.add({ id: 'w-' + wd.id, name: wd.name, job: wd.job, age: wd.age, village: '', villageName: '', home: null, work: null, r: wr, wanderer: wd });
      p.clothes = [new THREE.Color(...hexToLinear(wd.clothes[0])), new THREE.Color(...hexToLinear(wd.clothes[1]))];
      p.hat = wd.hat; p.pitch = wd.pitch;
      if (wd.id === 'peddler' || wd.id === 'teaMerchant' || wd.id === 'botanist') p.basket = true;
    }
  }

  private add(o: { id: string; name: string; job: Job; age: Age; village: string; villageName: string; home: HouseSpec | null; work: HouseSpec | null; r: Rng; wanderer?: WandererDef }): Person {
    const r = o.r;
    const cl = r.pick(CLOTHES[o.job]);
    const lin = (h: string) => new THREE.Color(...hexToLinear(h));
    const hair = o.age === 'elder' ? lin(r.pick(['#b8b4ac', '#d8d4cc', '#8a8680'])) : lin(r.pick(['#1e1a18', '#2a221e', '#3a2a22', '#141214']));
    const p: Person = {
      id: o.id, name: o.name, job: o.job, age: o.age, personality: r.pick(PERSONALITIES), village: o.village, villageName: o.villageName,
      home: o.home, work: o.work, pitch: o.age === 'child' ? 1.5 + r.next() * 0.3 : o.age === 'elder' ? 0.75 + r.next() * 0.2 : 0.9 + r.next() * 0.35,
      clothes: [lin(cl[0]), lin(cl[1])], hair, skin: r.next() * 0.5, hat: o.job === 'farmer' || o.job === 'fisher' || (o.job === 'monk' && r.next() < 0.5), basket: o.job === 'farmer' && r.next() < 0.5,
      wanderer: o.wanderer,
      pos: new THREE.Vector3(), yaw: r.next() * 6.28, path: [], act: 'walk', place: 'street', target: new THREE.Vector3(),
      inside: false, visible: false, phase: r.next() * 6, gait: 0, pose: 0, arm: 0, armT: 0, umbrella: false, greetT: 0, r: createRng(hashString(o.id) ^ 0x51), slotKey: '', lanternIdx: 0, actT: 0,
      hairStyle: 0, outfit: 0, headband: false, outfitNow: 0, smile: 0, body: 0, cape: false,
    };
    // how they look: hair, everyday clothes (work clothes for those who work outdoors or with their hands)
    const hr = createRng(hashString(o.id) ^ 0x4a12);
    p.hairStyle = o.age === 'child' ? (hr.next() < 0.7 ? 3 : 2) : o.job === 'monk' ? 1 : hr.next() < 0.42 ? 0 : hr.next() < 0.7 ? 1 : 2;
    const workP: Partial<Record<Job, number>> = { farmer: 0.65, fisher: 0.7, carpenter: 0.85, potter: 0.75, lanternMaker: 0.3 };
    p.outfit = hr.next() < (workP[o.job] ?? 0) ? 1 : 0;
    p.headband = p.outfit === 1 && (o.job === 'carpenter' || o.job === 'fisher' || hr.next() < 0.4);
    p.outfitNow = p.outfit;
    this.people.push(p);
    return p;
  }

  /** Named points of a village: plaza, tea house, shrine, dock/shore, fields, river. */
  private findPlaces(id: string): Record<string, THREE.Vector3> {
    const v = this.w.villages.villages.find((v) => v.layout.def.id === id)!;
    const d = v.layout.def, H = (x: number, z: number) => new THREE.Vector3(x, this.w.groundHeight(x, z), z);
    const out: Record<string, THREE.Vector3> = { plaza: H(d.x + 2, d.z - 3) };
    const tea = v.layout.houses.find((h) => h.type === 'teahouse' || h.type === 'inn');
    out.teahouse = tea ? houseDoor(tea, new THREE.Vector3(), 1.2) : out.plaza!;
    out.shrine = v.layout.torii ? H(v.layout.torii.x - Math.sin(v.layout.torii.rot) * 3, v.layout.torii.z - Math.cos(v.layout.torii.rot) * 3) : out.plaza!;
    // the shore nearest the village (fishers), the river (children, elders)
    let shore = out.plaza!, best = Infinity;
    for (let a = 0; a < 24; a++) for (let rr = d.r; rr < d.r + 500; rr += 25) {
      const x = d.x + Math.cos((a / 24) * Math.PI * 2) * rr, z = d.z + Math.sin((a / 24) * Math.PI * 2) * rr;
      const h = this.w.height(x, z);
      if (h < 0.3 && h > -2 && rr < best) { best = rr; shore = H(x - Math.cos((a / 24) * Math.PI * 2) * 3, z - Math.sin((a / 24) * Math.PI * 2) * 3); }
    }
    out.dock = shore;
    let river = out.plaza!, rb = Infinity;
    for (const r of this.w.world.hydro.rivers) for (let i = 0; i < r.pts.length; i += 4) {
      const p = r.pts[i]!, dd = Math.hypot(p.x - d.x, p.z - d.z);
      if (dd < rb && dd < 450) { rb = dd; river = H(p.x + p.width, p.z + p.width); }
    }
    out.river = rb < Infinity ? river : (this.streets.get(id)?.[0] ?? out.plaza!);
    out.field = H(d.x + Math.cos(hashString(id)) * d.r * 1.3, d.z + Math.sin(hashString(id)) * d.r * 1.3);
    // a swimming hole: the deepest water of the stream or river near the village
    const hy = this.w.world.hydro;
    let sb = -Infinity;
    for (const r of hy.rivers) for (let i = 0; i < r.pts.length; i += 2) {
      const p = r.pts[i]!, dd = Math.hypot(p.x - d.x, p.z - d.z);
      if (dd > d.r + 120) continue;
      const depth = hy.waterAt(p.x, p.z) - this.w.world.height(p.x, p.z);
      if (depth > 0.55 && depth - dd * 0.004 > sb) { sb = depth - dd * 0.004; out.swim = new THREE.Vector3(p.x, hy.waterAt(p.x, p.z), p.z); }
    }
    // the bath of the village onsen
    const on = v.layout.houses.find((h) => h.type === 'onsen');
    if (on) {
      const a = (on.rot * Math.PI) / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a)), lz = -on.d * 0.15;
      out.onsen = new THREE.Vector3(on.x + lz * s, on.floorY + 0.46, on.z + lz * c);
      (out.onsen as THREE.Vector3 & { w?: number; d?: number }).w = on.w * 0.6 - 0.8;
      (out.onsen as THREE.Vector3 & { w?: number; d?: number }).d = on.d * 0.45 - 0.8;
    }
    return out;
  }

  // ---------- schedules ----------
  private slotFor(p: Person, hour: number, storm: boolean): { act: Activity; place: Place } {
    if (p.wanderer) return { act: inHours(hour, p.wanderer.hours) ? 'walk' : 'sleep', place: 'street' };
    const S = SCHEDULES[p.job];
    let cur = S[0]!;
    for (const s of S) if (hour >= s.at) cur = s;
    if (storm && cur.act !== 'sleep' && !['work'].includes(cur.act)) return { act: 'eat', place: 'home' };
    if (cur.act === 'sleep') return cur;
    // a freer life (owner request): swimming in the stream on summer afternoons, an evening soak
    // at the onsen, a nap in the grass after the midday meal
    const P = this.places.get(p.village), hsh = hashString(p.id), fair = !this.wet;
    if (P?.swim && fair && this.season === 'summer' && p.age === 'child' && hour >= 12 && hour < 16.5 && hsh % 4 !== 0) return { act: 'swim', place: 'swim' };
    if (P?.onsen && p.age !== 'child' && ((hour >= 18.6 && hour < 20.8 && hsh % 3 !== 0) || (p.age === 'elder' && hour >= 6 && hour < 7.2))) return { act: 'soak', place: 'onsen' };
    if (fair && this.season !== 'winter' && (p.age === 'elder' || p.job === 'farmer') && hour >= 13 && hour < 14.4 && hsh % 3 === 0) return { act: 'nap', place: 'field' };
    return cur;
  }
  private season = 'autumn';
  private wet = false;

  private placePoint(p: Person, place: Place, act: Activity): { pos: THREE.Vector3; inside: boolean } {
    const P = this.places.get(p.village)!;
    const r = p.r;
    const jit = (v: THREE.Vector3, k: number) => v.clone().add(H2.set((r.next() - 0.5) * k, 0, (r.next() - 0.5) * k));
    const indoorAct = act === 'sleep' || act === 'eat' || (act === 'work' && place === 'work' && p.work && p.job !== 'innkeeper') || (act === 'tea' && false);
    switch (place) {
      case 'home': return p.home ? (indoorAct ? { pos: houseInside(p.home, r), inside: true } : { pos: houseDoor(p.home, new THREE.Vector3(), 1.5 + r.next() * 2), inside: false }) : { pos: jit(P.plaza!, 6), inside: false };
      case 'work': return p.work ? (indoorAct ? { pos: houseInside(p.work, r), inside: true } : { pos: houseDoor(p.work, new THREE.Vector3(), 1.4), inside: false }) : { pos: jit(P.plaza!, 6), inside: false };
      case 'field': return { pos: jit(P.field!, 30), inside: false };
      case 'dock': return { pos: jit(P.dock!, 8), inside: false };
      case 'plaza': return { pos: jit(P.plaza!, 7), inside: false };
      case 'teahouse': return { pos: jit(P.teahouse!, 3), inside: false };
      case 'shrine': return { pos: jit(P.shrine!, 2), inside: false };
      case 'river': return { pos: jit(P.river!, 6), inside: false };
      case 'swim': return { pos: P.swim ? this.swimSpot(P.swim, r) : jit(P.river!, 6), inside: false };
      case 'onsen': {
        const o = P.onsen as (THREE.Vector3 & { w?: number; d?: number }) | undefined;
        if (!o) return { pos: jit(P.plaza!, 6), inside: false };
        return { pos: o.clone().add(H2.set((r.next() - 0.5) * (o.w ?? 1), 0, (r.next() - 0.5) * (o.d ?? 1))), inside: true };
      }
      default: { const st = this.streets.get(p.village)!; return { pos: st[r.int(0, st.length)]!.clone(), inside: false }; }
    }
  }

  /** Somewhere in deep enough water near the swimming hole. */
  private swimSpot(c: THREE.Vector3, r: Rng): THREE.Vector3 {
    const hy = this.w.world.hydro;
    for (let k = 0; k < 10; k++) {
      const x = c.x + (r.next() - 0.5) * 9, z = c.z + (r.next() - 0.5) * 9;
      if (hy.waterAt(x, z) - this.w.world.height(x, z) > 0.5) return new THREE.Vector3(x, hy.waterAt(x, z), z);
    }
    return c.clone();
  }

  /** A route over the village streets (nearest street points, then along), ending at `to`. */
  private route(p: Person, to: THREE.Vector3): THREE.Vector3[] {
    const st = this.streets.get(p.village);
    if (!st || !st.length || p.pos.distanceTo(to) < 25) return [to.clone()];
    const near = (v: THREE.Vector3) => { let b = 0, bd = Infinity; st.forEach((s, i) => { const d = s.distanceToSquared(v); if (d < bd) { bd = d; b = i; } }); return b; };
    const a = near(p.pos), b = near(to);
    const path: THREE.Vector3[] = [];
    // streets are stored back to back; walk index by index (a crossing street is reached via the plaza)
    const step = a < b ? 1 : -1;
    for (let i = a; i !== b; i += step) if (Math.abs(i - a) % 2 === 0) path.push(st[i]!.clone());
    path.push(st[b]!.clone(), to.clone());
    return path;
  }

  /** Put everyone of a village where their schedule says, right now (when the village comes near). */
  private settle(village: string, hour: number, storm: boolean): void {
    for (const p of this.people) if (p.village === village) {
      const s = this.slotFor(p, hour, storm);
      p.act = s.act; p.place = s.place; p.slotKey = s.act + s.place;
      const pt = this.placePoint(p, s.place, s.act);
      p.pos.copy(pt.pos); p.target.copy(pt.pos); p.inside = pt.inside; p.path = [];
    }
  }

  // ---------- per frame ----------
  update(dt: number, player: THREE.Vector3, hour: number, day: number, weather: { rain: number; snow: number; storm: number }, season = 'autumn'): void {
    const storm = weather.storm > 0.5;
    const wet = weather.rain > 0.15 || weather.snow > 0.35;
    this.season = season; this.wet = wet || weather.storm > 0.3;
    // which villages are near enough to live
    for (const v of this.w.villages.villages) {
      const d = v.layout.def, near = Math.hypot(player.x - d.x, player.z - d.z) < ACTIVE_R + d.r;
      if (near && !this.active.has(d.id)) { this.active.add(d.id); this.settle(d.id, hour, storm); }
      if (!near) this.active.delete(d.id);
    }
    for (const p of this.people) {
      if (p.wanderer) { this.wanderer(p, dt, player, hour, day); continue; }
      if (this.festival && this.isGuest(p)) { this.guest(p, dt, player); continue; }
      if (!this.active.has(p.village)) { p.visible = false; continue; }
      const s = this.slotFor(p, hour, storm);
      const key = s.act + s.place;
      if (key !== p.slotKey) {
        p.slotKey = key; p.act = s.act; p.place = s.place; p.actT = 0; p.lanternIdx = 0;
        const pt = this.placePoint(p, s.place, s.act);
        p.target.copy(pt.pos);
        p.path = this.route(p, pt.pos);
        // back from a festival far away: they're simply home again
        if (p.pos.distanceTo(pt.pos) > 400) { p.pos.copy(pt.pos); p.path = []; }
        if (p.inside && !pt.inside && p.home) { p.pos.copy(houseDoor(p.inside && p.work && p.act !== 'sleep' ? p.work : p.home, new THREE.Vector3(), 1.0)); }
        p.inside = false;
        (p as Person & { goingInside?: boolean }).goingInside = pt.inside;
      }
      p.actT += dt;
      // in the rain, field and boat folk wear a straw cape and hat; others take an umbrella
      p.cape = wet && !p.inside && (p.job === 'farmer' || p.job === 'fisher') && p.act !== 'swim';
      p.umbrella = wet && !p.inside && !p.cape && p.act !== 'swim' && p.act !== 'soak';
      this.live(p, dt, player);
    }
    this.lanternRound(dt, hour);
    this.upload();
  }

  /** Everyone of the festival's village goes, plus every third person from elsewhere. */
  private isGuest(p: Person): boolean {
    return p.village === this.festival!.village || hashString(p.id) % 3 === 0;
  }

  /** A festival guest: mill about the spot, chatting; children run around. */
  private guest(p: Person, dt: number, player: THREE.Vector3): void {
    const F = this.festival!;
    if (p.slotKey !== 'fest-' + F.id) {
      p.slotKey = 'fest-' + F.id; p.act = p.age === 'child' ? 'play' : 'chat'; p.place = 'plaza'; p.actT = 0; p.inside = false;
      const t = F.spot.clone().add(H2.set((p.r.next() - 0.5) * 30, 0, (p.r.next() - 0.5) * 30));
      t.y = this.w.groundHeight(t.x, t.z);
      p.target.copy(t);
      // far away (another village): they're there already
      if (p.pos.distanceTo(t) > 60 || !p.visible) { p.pos.copy(t); p.path = []; } else p.path = [t];
    }
    p.actT += dt;
    if (p.actT > 25 + (hashString(p.id) % 20)) {
      p.actT = 0;
      const t = F.spot.clone().add(H2.set((p.r.next() - 0.5) * 30, 0, (p.r.next() - 0.5) * 30));
      t.y = this.w.groundHeight(t.x, t.z);
      p.target.copy(t); p.path = [t];
    }
    p.umbrella = false;
    if (F.spot.distanceTo(player) > 500) { p.visible = false; return; }
    this.live(p, dt, player);
  }

  private live(p: Person, dt: number, player: THREE.Vector3): void {
    p.visible = p.act !== 'sleep';
    let speed = 0;
    if (p.path.length) {
      const t = p.path[0]!;
      const dx = t.x - p.pos.x, dz = t.z - p.pos.z, d = Math.hypot(dx, dz);
      const v = p.body === 2 ? 0.9 : p.age === 'child' ? (p.act === 'play' ? 2.6 : 1.6) : p.age === 'elder' ? 0.8 : 1.25;
      if (d < 0.4) {
        p.path.shift();
        if (!p.path.length && (p as Person & { goingInside?: boolean }).goingInside) { p.inside = true; }
      } else {
        speed = v;
        const want = Math.atan2(dx, dz);
        let da = want - p.yaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        p.yaw += da * Math.min(1, dt * 6);
        p.pos.x += (dx / d) * v * dt; p.pos.z += (dz / d) * v * dt;
        const fy = this.w.groundHeight(p.pos.x, p.pos.z);
        p.pos.y += (fy - p.pos.y) * Math.min(1, dt * 10);
      }
    } else if (p.act === 'swim' && p.r.next() < dt * 0.25) {
      const P = this.places.get(p.village);
      if (P?.swim) p.path = [this.swimSpot(P.swim, p.r)];
    } else if (p.act === 'play' && p.r.next() < dt * 0.4) {
      p.path = [p.target.clone().add(H2.set((p.r.next() - 0.5) * 10, 0, (p.r.next() - 0.5) * 10))];
      p.path[0]!.y = this.w.groundHeight(p.path[0]!.x, p.path[0]!.z);
    }
    // in the water: swimming at the surface; at the onsen: sitting in the bath up to the shoulders
    const hy = this.w.world.hydro, wl = hy.waterAt(p.pos.x, p.pos.z);
    const scale = p.age === 'child' ? 0.64 : p.age === 'elder' ? 0.95 : 1;
    p.body = 0; p.outfitNow = p.outfit;
    if (p.act === 'swim') {
      p.outfitNow = 4;
      if (wl - this.w.world.height(p.pos.x, p.pos.z) > 0.45) { p.body = 2; p.pos.y = wl - 0.1 * scale; }
    }
    const atBath = p.act === 'soak' && !p.path.length;
    if (p.act === 'soak') p.outfitNow = 3;
    if (atBath) p.pos.y = p.target.y - 0.62 * scale;
    if (p.act === 'nap' && !p.path.length) p.body = 1;
    p.gait += (Math.min(1, (p.body === 2 ? 0 : speed) / 1.3) - p.gait) * Math.min(1, dt * 6);
    p.phase += dt * speed * 5;
    // what they're doing once there
    const arrived = !p.path.length;
    let pose = 0, arm = 0;
    if (arrived) {
      if (p.act === 'eat' || p.act === 'tea' || (p.act === 'sit') || (p.act === 'fish') || p.act === 'soak') pose = 1;
      if (p.act === 'work' && (p.place === 'field' || p.job === 'potter' || p.job === 'weaver' || p.job === 'carpenter')) { arm = 2; if (p.place === 'field') pose = 2.55; }
      if (p.act === 'sweep') arm = 2;
      if (p.act === 'pray') pose = 2 + 0.5 + 0.5 * Math.sin(p.actT * 0.8);
      if (p.act === 'chat' && Math.sin(p.actT * 0.7 + p.phase) > 0.85) arm = 1;
    }
    // greeting: turn to you; a bow the first time, a wave afterwards
    const dp = Math.hypot(player.x - p.pos.x, player.z - p.pos.z);
    p.greetT = Math.max(0, p.greetT - dt);
    if (p.visible && !p.inside && dp < 6 && arrived && pose < 0.5 && p.body === 0) {
      const want = Math.atan2(player.x - p.pos.x, player.z - p.pos.z);
      let da = want - p.yaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      p.yaw += da * Math.min(1, dt * 3);
      if (p.greetT === 0 && dp < 4.5) p.greetT = 40;
      if (p.greetT > 38) { if ((this.memory.met[p.id] ?? 0) === 0) pose = 2.8; else arm = 1; }
    }
    p.pose += (pose - p.pose) * Math.min(1, dt * 4);
    // a smile for you, for friends, at play, in the water and in the bath
    const happy = p.greetT > 30 || p.act === 'play' || p.act === 'swim' || p.act === 'soak' || (p.act === 'chat' && Math.sin(p.actT * 0.5 + p.phase) > 0.2) || p.personality === 'cheerful';
    p.smile += ((happy ? 1 : 0) - p.smile) * Math.min(1, dt * 3);
    if (p.armT > 0) { p.armT -= dt; arm = 1; }
    p.arm = arm;
    const can = p.visible && dp < 3 && Math.abs(player.y - p.pos.y) < 2.5;
    if (can !== this.near.has(p.id)) { if (can) this.near.add(p.id); else this.near.delete(p.id); this.onNear?.(p, can); }
  }

  /** The lantern maker of each village lights (17:x) and snuffs (dawn) every lantern in turn. */
  private lanternRound(dt: number, hour: number): void {
    const V = this.w.villages;
    for (const v of V.villages) {
      const id = v.layout.def.id;
      const lm = this.people.find((p) => p.village === id && p.job === 'lanternMaker');
      const lights = V.lanterns.filter((l) => l.village === id);
      const wantLit = hour >= 17.2 || hour < 5.2;
      if (!lm || !this.active.has(id)) { for (const l of lights) V.setLantern(l, wantLit && (hour >= 18.4 || hour < 5.2) ? true : wantLit && l.lit); continue; }
      const lighting = lm.act === 'lightLanterns', snuffing = lm.act === 'snuffLanterns';
      if (!lighting && !snuffing) {
        // outside the round the state follows the hour (e.g. arriving at night: all lit)
        if (lm.slotKey && !(hour >= 17.2 && hour < 19.4) && !(hour >= 5.2 && hour < 6.5)) for (const l of lights) V.setLantern(l, wantLit);
        continue;
      }
      const todo = lights.filter((l) => l.lit !== lighting);
      if (!todo.length) continue;
      // walk to the nearest lantern still to do, reach up, light it
      let best = todo[0]!, bd = Infinity;
      for (const l of todo) { const d = Math.hypot(l.pos.x - lm.pos.x, l.pos.z - lm.pos.z); if (d < bd) { bd = d; best = l; } }
      const last = lm.path[lm.path.length - 1];
      if (!last || Math.hypot(last.x - best.pos.x, last.z - best.pos.z) > 2) {
        const stand = best.pos.clone().add(H2.set(0.7, 0, 0.7));
        stand.y = this.w.groundHeight(stand.x, stand.z);
        lm.path = [stand];
      }
      if (bd < 1.4) { lm.armT = 1.0; lm.actT += dt; if (lm.actT > 0.9) { V.setLantern(best, lighting); lm.actT = 0; } }
    }
  }

  private wanderer(p: Person, dt: number, player: THREE.Vector3, hour: number, day: number): void {
    const wd = p.wanderer!;
    const out = !inHours(hour, wd.hours);
    p.visible = !out;
    if (out) return;
    const stop = wd.route[(day + hashString(wd.id)) % wd.route.length]!;
    const anchor = this.anchor(stop, wd.id);
    if (p.target.distanceToSquared(anchor) > 400 || p.pos.lengthSq() === 0) {
      p.target.copy(anchor);
      p.pos.copy(anchor);
      p.path = [];
    }
    // potter about near the stop
    if (!p.path.length && p.r.next() < dt * 0.08) {
      const t = anchor.clone().add(H2.set((p.r.next() - 0.5) * 10, 0, (p.r.next() - 0.5) * 10));
      t.y = this.w.groundHeight(t.x, t.z);
      p.path = [t];
    }
    p.act = wd.id === 'poet' || wd.id === 'painter' || wd.id === 'starWatcher' || wd.id === 'oldFisher' || wd.id === 'hermit' ? 'sit' : 'walk';
    p.umbrella = false;
    this.live(p, dt, player);
  }

  /** Where a wanderer's stop is. */
  private anchor(stop: string, salt: string): THREE.Vector3 {
    const H = (x: number, z: number) => new THREE.Vector3(x, this.w.groundHeight(x, z), z);
    const o = (hashString(salt) % 40) - 20;
    if (stop === 'dock') { const S = this.w.dock.anchors.shore!; return H(S.x + 6 + o * 0.2, S.z + 8); }
    if (stop === 'castle') return H(-150 + o, -1000);
    if (stop === 'hill') return H(-420, 640);
    if (stop === 'waterfall') { const f = [...this.w.world.hydro.falls].sort((a, b) => (b.top - b.bottom) * (b.river === 'upper' ? 3 : 1) - (a.top - a.bottom) * (a.river === 'upper' ? 3 : 1))[0]!; return H(f.x + f.dx * 25 - f.dz * 12, f.z + f.dz * 25 + f.dx * 12); }
    const v = this.w.villages.villages.find((v) => v.layout.def.id === stop);
    if (v) { const st = v.layout.streets[0]!, [x, z] = st[Math.floor(st.length * 0.3)]!; return H(x + o * 0.1, z); }
    return H(0, 300);
  }

  private upload(): void {
    const g = this.geo;
    const A = (k: string) => g.getAttribute(k).array as Float32Array;
    const P = A('iPos'), N = A('iAnim'), CA = A('iColA'), CB = A('iColB'), CC = A('iColC'), ST = A('iStyle');
    let i = 0;
    for (const p of this.people) {
      if (!p.visible || i >= MAX) continue;
      const scale = p.age === 'child' ? 0.64 : p.age === 'elder' ? 0.95 : 1;
      const bare = p.outfitNow >= 3;
      const flags = ((p.hat || p.cape) && !p.umbrella && !bare && p.body === 0 ? 1 : 0) + (p.umbrella ? 2 : 0) + (p.basket && !bare && p.body === 0 ? 4 : 0) + (p.age === 'elder' ? 8 : 0) + (p.cape ? 16 : 0) + (p.headband && !bare ? 32 : 0);
      P.set([p.pos.x, p.pos.y, p.pos.z, p.yaw], i * 4);
      N.set([p.phase, p.gait, p.pose, p.arm], i * 4);
      CA.set([p.clothes[0].r, p.clothes[0].g, p.clothes[0].b, scale], i * 4);
      CB.set([p.clothes[1].r, p.clothes[1].g, p.clothes[1].b, flags], i * 4);
      CC.set([p.hair.r, p.hair.g, p.hair.b, p.skin], i * 4);
      ST.set([p.hairStyle, p.outfitNow, p.smile, p.body], i * 4);
      i++;
    }
    g.instanceCount = i;
    this.mesh.visible = i > 0;
    for (const k of ['iPos', 'iAnim', 'iColA', 'iColB', 'iColC', 'iStyle']) {
      const at = g.getAttribute(k) as THREE.InstancedBufferAttribute;
      at.clearUpdateRanges(); at.addUpdateRange(0, i * 4); at.needsUpdate = true;
    }
  }

  /** Positions of everyone near p (doors open for them too). */
  openers(): THREE.Vector3[] { return this.people.filter((p) => p.visible && !p.inside && p.path.length).map((p) => p.pos); }
}
