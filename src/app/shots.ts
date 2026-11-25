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

export const SHOTS: Shot[] = [
  { name: 'dock-night', label: 'Dock at night', hour: 21.6, elapsed: 4200, pos: (w) => off(w, 8, 3, 3), look: (w) => off(w, -8, 1.8, -18), fov: 70 },
  { name: 'dock-golden', label: 'Dock, golden hour', hour: 17.7, elapsed: 4200, pos: (w) => off(w, 8, 3, 3), look: (w) => off(w, -8, 1.8, -18), fov: 70 },
  { name: 'dock-day', label: 'Dock at noon', hour: 12, elapsed: 4200, pos: (w) => off(w, 9, 3.4, 12), look: (w) => off(w, -6, 2.2, -16), fov: 70 },
  { name: 'lake-dusk', label: 'Mirror lake at dusk', hour: 17.75, elapsed: 900, wind: 0.06, boat: [-68, -34, 1.57], pos: (w) => off(w, -75, 3.2, -10), look: (w) => off(w, -60, 40, -400), fov: 62 },
  { name: 'lake-night', label: 'Lake at night', hour: 22, elapsed: 900, pos: (w) => off(w, -75, 3.2, -10), look: (w) => off(w, -60, 40, -400), fov: 62 },
  { name: 'pier-end', label: 'End of the pier', hour: 21.0, elapsed: 3000, pos: (w) => w.dock.anchors.pierEnd!.clone().add(new THREE.Vector3(0, 1.6, 2)), look: (w) => w.dock.anchors.pierEnd!.clone().add(new THREE.Vector3(-30, 2, -60)) },
];

export const shotByName = (n: string | undefined) => SHOTS.find((s) => s.name === n);
