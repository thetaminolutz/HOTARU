/** Fixed camera shots for screenshots, teleports and the title-screen drift. */
import * as THREE from 'three';
import type { GameWorld } from '../scene/gameWorld';

export type Shot = {
  name: string;
  label: string;
  hour: number;
  /** Fixed animation time for deterministic screenshots. */
  elapsed: number;
  pos: (w: GameWorld) => THREE.Vector3;
  look: (w: GameWorld) => THREE.Vector3;
  fov?: number;
  wind?: number;
  /** Rowing boat position relative to the shore point: [x, z, heading]. */
  boat?: [number, number, number];
};

const off = (w: GameWorld, x: number, y: number, z: number) => w.dock.anchors.shore!.clone().add(new THREE.Vector3(x, y, z));
/** Absolute position `dy` metres above the ground (or water). */
const at = (w: GameWorld, x: number, z: number, dy: number) => new THREE.Vector3(x, Math.max(w.height(x, z), 0) + dy, z);

const vil = (w: GameWorld, id: string) => w.villages.villages.find((v) => v.layout.def.id === id)!.layout;
/** A point along a village's main street (fraction 0..1), `dy` above the road. */
const street = (w: GameWorld, id: string, f: number, dy = 1.7) => {
  const st = vil(w, id).streets[0]!, [x, z] = st[Math.round(f * (st.length - 1))]!;
  return new THREE.Vector3(x, w.groundHeight(x, z) + dy, z);
};
/** Inside the n-th house of a type: local (u, v) in −1..1 of the floor, `dy` above it. */
const inside = (w: GameWorld, id: string, type: string, u: number, v: number, dy: number) => {
  const h = vil(w, id).houses.filter((h) => h.type === type)[0] ?? vil(w, id).houses[0]!;
  const lx = (u * h.w) / 2, lz = (v * h.d) / 2, a = (h.rot * Math.PI) / 2;
  const c = Math.round(Math.cos(a)), sn = Math.round(Math.sin(a));
  return new THREE.Vector3(h.x + lx * c + lz * sn, h.floorY + dy, h.z - lx * sn + lz * c);
};
const above = (w: GameWorld, id: string, dist: number, ang: number, dy: number) => {
  const d = vil(w, id).def, x = d.x + Math.cos(ang) * dist, z = d.z + Math.sin(ang) * dist;
  return new THREE.Vector3(x, Math.max(w.height(x, z), 0) + dy, z);
};

export const SHOTS: Shot[] = [
  { name: 'dock-night', label: 'Dock at night', hour: 21.6, elapsed: 4200, pos: (w) => off(w, 8, 3, 3), look: (w) => off(w, -8, 1.8, -18), fov: 70 },
  { name: 'dock-golden', label: 'Dock, golden hour', hour: 17.7, elapsed: 4200, pos: (w) => off(w, 8, 3, 3), look: (w) => off(w, -8, 1.8, -18), fov: 70 },
  { name: 'dock-day', label: 'Dock at noon', hour: 12, elapsed: 4200, pos: (w) => off(w, 9, 3.4, 12), look: (w) => off(w, -6, 2.2, -16), fov: 70 },
  { name: 'lake-dusk', label: 'Mirror lake at dusk', hour: 17.75, elapsed: 900, wind: 0.06, boat: [-68, -34, 1.57], pos: (w) => off(w, -75, 3.2, -10), look: (w) => off(w, -60, 40, -400), fov: 62 },
  { name: 'lake-night', label: 'Lake at night', hour: 22, elapsed: 900, pos: (w) => off(w, -75, 3.2, -10), look: (w) => off(w, -60, 40, -400), fov: 62 },
  { name: 'pier-end', label: 'End of the pier', hour: 21.0, elapsed: 3000, pos: (w) => w.dock.anchors.pierEnd!.clone().add(new THREE.Vector3(0, 1.6, 2)), look: (w) => w.dock.anchors.pierEnd!.clone().add(new THREE.Vector3(-30, 2, -60)) },
  // M2: the wider world
  { name: 'castle-view', label: 'Lake from the castle mountain', hour: 16.8, elapsed: 1200, pos: (w) => at(w, -150, -880, 12), look: (w) => at(w, 0, 200, 0), fov: 70 },
  { name: 'maple-golden', label: 'Maple mountains, golden hour', hour: 17.4, elapsed: 1200, pos: (w) => at(w, -1900, -1700, 30), look: (w) => at(w, -2700, -2500, 150), fov: 70 },
  { name: 'cedar-forest', label: 'Misty cedar forest', hour: 8, elapsed: 1200, pos: (w) => at(w, -3280, -120, 1.7), look: (w) => at(w, -3200, -220, 6), fov: 75 },
  { name: 'coast-day', label: 'Eastern coast', hour: 11, elapsed: 1200, pos: (w) => at(w, 4330, -980, 6), look: () => new THREE.Vector3(4900, 0, -1300), fov: 70 },
  { name: 'snow-pass', label: 'Snowy high pass', hour: 14, elapsed: 1200, pos: (w) => at(w, -300, -3300, 25), look: (w) => at(w, -400, -4300, 300), fov: 70 },
  { name: 'flyover', label: 'High over the world', hour: 16.5, elapsed: 1200, pos: () => new THREE.Vector3(1200, 1400, 2600), look: () => new THREE.Vector3(-600, 200, -1500), fov: 70 },
  { name: 'rice-valley', label: 'Rice-terrace valley', hour: 10.5, elapsed: 1200, pos: (w) => at(w, -200, 2500, 30), look: (w) => at(w, -200, 3300, 20), fov: 70 },
  // M7: villages and interiors
  { name: 'market-street', label: 'Ichiba market street', hour: 10.5, elapsed: 1200, pos: (w) => street(w, 'ichiba', 0.42), look: (w) => street(w, 'ichiba', 0.7, 1.6), fov: 70 },
  { name: 'market-dusk', label: 'Ichiba at dusk', hour: 19.2, elapsed: 1200, pos: (w) => street(w, 'ichiba', 0.3, 1.7), look: (w) => street(w, 'ichiba', 0.55, 1.5), fov: 70 },
  { name: 'villages-night', label: 'A village at night from the hills', hour: 21.5, elapsed: 1200, pos: (w) => above(w, 'ichiba', 230, 0.8, 38), look: (w) => above(w, 'ichiba', 0, 0, 4), fov: 55 },
  { name: 'interior-day', label: 'Inside a farmhouse', hour: 11, elapsed: 1200, pos: (w) => inside(w, 'inaho', 'minka', 0.75, -0.7, 1.5), look: (w) => inside(w, 'inaho', 'minka', -0.4, 0.6, 0.6), fov: 78 },
  { name: 'interior-night', label: 'Farmhouse at night', hour: 22, elapsed: 1200, pos: (w) => inside(w, 'inaho', 'minka', 0.75, 0.75, 1.5), look: (w) => inside(w, 'inaho', 'minka', -0.5, -0.8, 0.4), fov: 78 },
  { name: 'thatch-village', label: 'Inaho, thatched farmhouses', hour: 16.8, elapsed: 1200, pos: (w) => street(w, 'inaho', 0.4, 1.7), look: (w) => street(w, 'inaho', 0.65, 2.2), fov: 70 },
  { name: 'harbour', label: 'Shiomachi fishing village', hour: 8.5, elapsed: 1200, pos: (w) => street(w, 'shiomachi', 0.25, 1.7), look: (w) => street(w, 'shiomachi', 0.6, 2), fov: 70 },
  { name: 'onsen-village', label: 'Yukemuri hot-spring village', hour: 17.8, elapsed: 1200, pos: (w) => street(w, 'yukemuri', 0.35, 1.7), look: (w) => street(w, 'yukemuri', 0.65, 2), fov: 70 },
  { name: 'shrine-torii', label: 'Torii at Kumoji', hour: 15, elapsed: 1200, pos: (w) => street(w, 'kumoji', 0.82, 1.7), look: (w) => street(w, 'kumoji', 1, 2.6), fov: 70 },
  // M5: vegetation, wind & particles
  { name: 'meadow-flowers', label: 'Cosmos fields', hour: 15.5, elapsed: 1200, wind: 0.7, pos: (w) => at(w, 2900, 3000, 1.6), look: (w) => at(w, 2960, 2940, 1), fov: 70 },
  { name: 'cherry-hills', label: 'Cherry hills, falling leaves', hour: 16.5, elapsed: 1200, wind: 0.8, pos: (w) => at(w, 2300, -400, 1.7), look: (w) => at(w, 2380, -460, 4), fov: 70 },
  { name: 'bamboo-grove', label: 'Bamboo grove', hour: 9, elapsed: 1200, pos: (w) => at(w, -2700, 1700, 1.7), look: (w) => at(w, -2760, 1640, 5), fov: 75 },
  { name: 'pampas-moor', label: 'The pampas moor', hour: 17.2, elapsed: 1200, wind: 0.9, pos: (w) => at(w, 600, -2600, 1.7), look: (w) => at(w, 700, -2680, 2), fov: 70 },
  { name: 'reed-marsh', label: 'Reed marsh at dusk', hour: 19.6, elapsed: 1200, wind: 0.3, pos: (w) => at(w, 3700, 1700, 1.7), look: (w) => at(w, 3790, 1650, 1), fov: 70 },
  { name: 'hydrangea-hills', label: 'Hydrangea hills', hour: 11, elapsed: 1200, pos: (w) => at(w, -1300, 2300, 1.7), look: (w) => at(w, -1370, 2240, 3), fov: 70 },
];

export const shotByName = (n: string | undefined) => SHOTS.find((s) => s.name === n);
