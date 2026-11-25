/**
 * Rare world events (SPEC §22), at most one a day, chosen from the day number: a flock of cranes
 * migrating overhead, a meteor shower, a lunar eclipse (red moon), a lantern moving alone across
 * the lake, a whale in the bay, a sea of clouds below the temple at dawn, a mother deer and her
 * fawn crossing your path, monkeys stealing persimmons. Seeing one counts as a rare moment.
 */
import * as THREE from 'three';
import { boxUV, chochin, mergeGeoms } from '../buildings/kit';
import { litMaterial } from '../render/materials';
import { hashString } from '../core/rng';
import type { GameWorld } from '../scene/gameWorld';

export type EventId = 'cranes' | 'meteors' | 'eclipse' | 'loneLantern' | 'whale' | 'seaOfClouds' | 'deerFawn' | 'monkeys';
export const EVENTS: { id: EventId; label: string; hours: [number, number] }[] = [
  { id: 'cranes', label: 'Cranes flying south', hours: [7, 11] },
  { id: 'meteors', label: 'A meteor shower', hours: [21, 27] },
  { id: 'eclipse', label: 'The red moon', hours: [21, 24.5] },
  { id: 'loneLantern', label: 'A lantern crossing the lake alone', hours: [20, 23.5] },
  { id: 'whale', label: 'A whale in the bay', hours: [9, 16] },
  { id: 'seaOfClouds', label: 'A sea of clouds', hours: [5, 8.5] },
  { id: 'deerFawn', label: 'A deer and her fawn', hours: [6, 9.5] },
  { id: 'monkeys', label: 'Monkeys stealing persimmons', hours: [13, 16] },
];

/** The event of a day (deterministic), or null — about two days in five. */
export function eventOn(day: number, seed = 1): EventId | null {
  const h = hashString('ev' + seed + ':' + day);
  if (h % 5 >= 2) return null;
  return EVENTS[(h >> 4) % EVENTS.length]!.id;
}
export function inHours(hour: number, [a, b]: [number, number]): boolean { return b > 24 ? hour >= a || hour < b - 24 : hour >= a && hour < b; }

export class WorldEvents {
  readonly group = new THREE.Group();
  current: EventId | null = null;
  /** sky effects the game passes to the sky shader */
  meteors = 0;
  eclipse = 0;
  /** extra mist (sea of clouds) */
  mist = 0;
  onSeen: ((id: EventId) => void) | null = null;
  private cranes: THREE.Mesh;
  private lantern: THREE.Mesh;
  private whale: THREE.Mesh;
  private spawned = -1;
  private craneT = 0;

  constructor(private w: GameWorld, private seed: number) {
    this.group.name = 'world-events';
    // a V of cranes: white bodies, black wing tips (two frames by wing angle in the vertex colours)
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 13; i++) {
      const side = i % 2 ? 1 : -1, k = Math.ceil(i / 2), x = side * k * 4, z = k * 5;
      parts.push(boxUV(0.35, 0.3, 1.6, 1, [0.95, 0.95, 0.93]).translate(x, 0, z));
      parts.push(boxUV(2.6, 0.08, 0.6, 1, [0.92, 0.92, 0.9]).translate(x, 0.05, z));
      parts.push(boxUV(0.6, 0.08, 0.5, 1, [0.08, 0.08, 0.1]).translate(x - 1.5, 0.05, z), boxUV(0.6, 0.08, 0.5, 1, [0.08, 0.08, 0.1]).translate(x + 1.5, 0.05, z));
      parts.push(boxUV(0.15, 0.15, 0.6, 1, [0.8, 0.15, 0.1]).translate(x, 0.1, z - 1.0));
    }
    this.cranes = new THREE.Mesh(mergeGeoms(parts), litMaterial({}));
    this.cranes.visible = false;
    this.lantern = new THREE.Mesh(chochin(0.28, 0.5), litMaterial({ emissive: new THREE.Color(1, 0.65, 0.3), emissiveIntensity: 3.5, flicker: true }));
    this.lantern.visible = false;
    const wp: THREE.BufferGeometry[] = [new THREE.SphereGeometry(1, 10, 6).toNonIndexed().scale(3, 1.2, 9), boxUV(5, 0.3, 1.5, 1).translate(0, 0, -9)];
    this.whale = new THREE.Mesh(mergeGeoms(wp), litMaterial({ tint: 0x2a3440, outline: true }));
    this.whale.visible = false;
    this.group.add(this.cranes, this.lantern, this.whale);
  }

  update(dt: number, t: number, day: number, hour: number, cam: THREE.Vector3, look: THREE.Vector3, clear: boolean): void {
    // events after midnight belong to the evening before
    const ev = eventOn(hour < 4 ? day - 1 : day, this.seed);
    const def = ev ? EVENTS.find((e) => e.id === ev)! : null;
    const on = def && inHours(hour, def.hours) ? ev : null;
    this.current = on;
    const night = hour > 20 || hour < 4.5;
    this.meteors = on === 'meteors' && clear ? 0.75 : 0;
    this.eclipse += ((on === 'eclipse' ? 1 : 0) - this.eclipse) * Math.min(1, dt * 0.2);
    const reg = this.w.world.regionAt(cam.x, cam.z);
    this.mist = on === 'seaOfClouds' ? 1 : 0;
    if ((on === 'meteors' && clear && night) || (on === 'eclipse' && this.eclipse > 0.6)) this.onSeen?.(on);
    // cranes: across the sky above you
    this.cranes.visible = on === 'cranes';
    if (on === 'cranes') {
      this.craneT += dt;
      const k = (this.craneT % 90) / 90;
      this.cranes.position.set(cam.x - 300 + k * 600, cam.y + 80, cam.z - 60);
      this.cranes.rotation.y = -Math.PI / 2;
      this.cranes.scale.y = 1 + Math.sin(t * 4) * 0.4;
      if (look.y > 0.2) this.onSeen?.('cranes');
    }
    // the lone lantern drifts across the lake
    this.lantern.visible = on === 'loneLantern' && Math.hypot(cam.x, cam.z) < 1200;
    if (this.lantern.visible) {
      const k = ((hour - 20) / 3.5);
      this.lantern.position.set(-260 + k * 520, 0.35 + Math.sin(t) * 0.04, -120 + Math.sin(k * 3) * 60);
      if (this.lantern.position.distanceTo(cam) < 250) this.onSeen?.('loneLantern');
    }
    // the whale: off Shiomachi, surfacing now and then
    this.whale.visible = on === 'whale' && cam.x > 3000;
    if (this.whale.visible) {
      const k = (t * 0.02) % 1, surf = Math.max(0, Math.sin(t * 0.35));
      this.whale.position.set(4700 + Math.sin(k * 6.28) * 120, -2 + surf * 1.8, -800 + Math.cos(k * 6.28) * 200);
      this.whale.rotation.y = k * 6.28 + Math.PI / 2;
      if (surf > 0.7 && this.whale.position.distanceTo(cam) < 600) this.onSeen?.('whale');
    }
    if (on === 'seaOfClouds' && reg >= 0 && cam.y > 220) this.onSeen?.('seaOfClouds');
    // animals: spawned once near you
    if ((on === 'deerFawn' || on === 'monkeys') && this.spawned !== day) {
      this.spawned = day;
      const a = Math.atan2(look.x, look.z), x = cam.x + Math.sin(a) * 18, z = cam.z + Math.cos(a) * 18;
      const herd = this.w.fauna.spawnAt(on === 'deerFawn' ? 'sikaDeer' : 'macaque', x, z, on === 'deerFawn' ? 2 : 5, hour, 2);
      if (on === 'deerFawn' && herd[1]) { herd[1].sp = { ...herd[1].sp, size: herd[1].sp.size * 0.55 }; }
      for (const h of herd) { h.state = 'wander'; h.timer = 60; h.target.set(cam.x - Math.sin(a) * 30 + Math.cos(a) * 25, h.pos.y, cam.z - Math.cos(a) * 30 - Math.sin(a) * 25); }
      if (herd.length) this.onSeen?.(on);
    }
  }
}
