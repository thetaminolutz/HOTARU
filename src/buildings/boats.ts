/** Rowboat hull lofted from cross-sections, plus a simple rower in a straw hat. */
import * as THREE from 'three';
import { ensureColor } from '../render/materials';
import { boxUV, mergeGeoms } from './kit';

export function rowboatGeometry(length = 4.2, beam = 1.4, depth = 0.55): THREE.BufferGeometry {
  const ST = 14, SEC = 6;
  const pos: number[] = [], uv: number[] = [];
  const ring = (i: number) => {
    const t = i / ST; // 0 stern .. 1 bow
    const z = (t - 0.5) * length;
    const e = Math.abs(t - 0.5) * 2;
    const w = (beam / 2) * Math.pow(Math.max(0, 1 - Math.pow(e, 2.4)), 0.55) * (t > 0.5 ? 1 - 0.15 * e : 1) + 0.02;
    const sheer = depth * 0.15 + 0.22 * Math.pow(e, 3) * (t > 0.5 ? 1.4 : 0.8);
    const d = depth * (1 - 0.45 * Math.pow(e, 3));
    const pts: [number, number, number][] = [];
    for (let k = 0; k <= SEC; k++) {
      const a = (k / SEC) * Math.PI; // 0 = starboard gunwale, π = port gunwale
      const x = Math.cos(a) * w;
      const y = sheer - Math.sin(a) * d * (0.65 + 0.35 * Math.abs(Math.sin(a)));
      pts.push([x, y, z]);
    }
    return pts;
  };
  const rings = Array.from({ length: ST + 1 }, (_, i) => ring(i));
  for (let i = 0; i < ST; i++) for (let k = 0; k < SEC; k++) {
    const a = rings[i]![k]!, b = rings[i + 1]![k]!, c = rings[i + 1]![k + 1]!, d = rings[i]![k + 1]!;
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    const u0 = i / ST * length / 2, u1 = (i + 1) / ST * length / 2, v0 = k / SEC * 1.2, v1 = (k + 1) / SEC * 1.2;
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hull.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  hull.computeVertexNormals();
  ensureColor(hull, [0.75, 0.62, 0.55]);
  // gunwale rails and two thwarts
  const parts = [hull];
  const seat = (z: number) => boxUV(beam * 0.82, 0.05, 0.28, 2, [0.85, 0.7, 0.55]).translate(0, depth * 0.02, z);
  parts.push(seat(-0.6), seat(0.7));
  return mergeGeoms(parts);
}

/** A faceless rower: dark haori, straw hat. Seated, facing the stern (as rowers do). */
export function rowerGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.16, 0.26, 0.62, 6).translate(0, 0.35, 0);
  ensureColor(body, [0.12, 0.13, 0.22]);
  const head = new THREE.SphereGeometry(0.11, 6, 4).translate(0, 0.78, 0);
  ensureColor(head, [0.55, 0.4, 0.32]);
  const hat = new THREE.ConeGeometry(0.34, 0.16, 10).translate(0, 0.9, 0);
  ensureColor(hat, [0.62, 0.5, 0.3]);
  return mergeGeoms([body, head, hat]);
}

export function oarGeometry(): THREE.BufferGeometry {
  const shaft = boxUV(0.05, 0.05, 2.2, 2, [0.6, 0.45, 0.3]);
  const blade = boxUV(0.16, 0.02, 0.5, 2, [0.6, 0.45, 0.3]).translate(0, 0, -1.2);
  return mergeGeoms([shaft, blade]);
}
