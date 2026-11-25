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
  { name: 'cedar-forest', label: 'Misty cedar forest', hour: 9.5, elapsed: 1200, pos: (w) => at(w, -3280, -120, 1.7), look: (w) => at(w, -3380, -200, 5), fov: 75 },
  { name: 'coast-day', label: 'Eastern coast', hour: 11, elapsed: 1200, pos: (w) => at(w, 4330, -980, 6), look: () => new THREE.Vector3(4900, 0, -1300), fov: 70 },
  { name: 'snow-pass', label: 'Snowy high pass', hour: 14, elapsed: 1200, pos: (w) => at(w, -300, -3300, 25), look: (w) => at(w, -400, -4300, 300), fov: 70 },
  { name: 'flyover', label: 'High over the world', hour: 16.5, elapsed: 1200, pos: () => new THREE.Vector3(1200, 1400, 2600), look: () => new THREE.Vector3(-600, 200, -1500), fov: 70 },
  { name: 'rice-valley', label: 'Rice-terrace valley', hour: 10.5, elapsed: 1200, pos: (w) => at(w, -200, 2500, 30), look: (w) => at(w, -200, 3300, 20), fov: 70 },
];

export const shotByName = (n: string | undefined) => SHOTS.find((s) => s.name === n);
