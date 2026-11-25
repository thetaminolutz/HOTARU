/**
 * Interior furnishing (SPEC §7.4): procedurally furnished by building type and the owner's
 * profession. Tatami, irori hearth with a hanging kettle, zabuton cushions (you can sit on
 * them), chabudai, tansu chests, shelves with bowls, andon lamps, a tokonoma alcove with a
 * scroll and ikebana, and profession props. Futons are laid out at night.
 */
import * as THREE from 'three';
import { boxUV, andon, chochin } from './kit';
import { ensureColor } from '../render/materials';
import type { Rng } from '../core/rng';
import type { HouseOut, HouseSpec } from './house';

export type MatKey = 'wood' | 'darkwood' | 'plaster' | 'thatch' | 'tile' | 'shingle' | 'copper' | 'shoji' | 'tatami' | 'floor' | 'stone' | 'paper' | 'cloth' | 'water';

type Dims = { w: number; d: number; F: number; H: number; doorX: number };
type Add = (k: MatKey, g: THREE.BufferGeometry) => void;

const tint = (g: THREE.BufferGeometry, rgb: [number, number, number], em = 0) => {
  g.deleteAttribute('aColor');
  return ensureColor(g, rgb, em);
};

export function props(s: HouseSpec, r: Rng, D: Dims, add: Add, out: HouseOut, warm: THREE.Color, fire: THREE.Color): void {
  const { w, d, F } = D;
  const back = -d / 2 + 0.25, inner = { x0: -w / 2 + 0.3, x1: w / 2 - 0.3, z0: -d / 2 + 0.3, z1: d / 2 - 0.3 };
  const lamp = (x: number, z: number) => {
    add('paper', andon(0.3, 0.45).translate(x, F, z));
    out.lights.push({ pos: new THREE.Vector3(x, F + 0.6, z), color: warm.clone(), radius: 6, intensity: 1.6, halo: 0.4, phase: r.next() * 6 });
  };
  const cushion = (x: number, z: number, yaw: number) => {
    add('cloth', tint(boxUV(0.55, 0.08, 0.55, 1), [0.55, 0.22, 0.2]).translate(x, F + 0.04, z));
    out.sits.push({ x, y: F, z, yaw, label: 'Sit on the cushion' });
  };
  const chest = (x: number, z: number, h = 1.1) => {
    add('darkwood', boxUV(1.0, h, 0.45, 1).translate(x, F + h / 2, z));
    for (let y = 0.25; y < h; y += 0.3) add('stone', tint(boxUV(0.12, 0.04, 0.04, 1), [0.2, 0.18, 0.16]).translate(x, F + y, z + 0.24));
  };
  const shelf = (x: number, z: number) => {
    for (const y of [0.6, 1.2, 1.8]) add('wood', boxUV(1.2, 0.05, 0.35, 1).translate(x, F + y, z));
    for (let i = 0; i < 4; i++) {
      const y = [0.6, 1.2, 1.8][r.int(0, 3)]!;
      const bowl = new THREE.CylinderGeometry(0.09, 0.06, 0.08, 6).toNonIndexed();
      add('cloth', tint(bowl, r.pick([[0.75, 0.7, 0.6], [0.3, 0.35, 0.45], [0.55, 0.35, 0.25]] as [number, number, number][])).translate(x - 0.45 + i * 0.3, F + y + 0.07, z));
    }
  };

  const floorTatami = s.type !== 'kura' && s.type !== 'shop' && s.type !== 'workshop' && s.type !== 'fisher';
  if (floorTatami) {
    // tatami over the back of the room; the front is wooden boards (genkan)
    const tz0 = -d / 2 + 0.07, tz1 = d / 2 - 1.4;
    for (let x = -w / 2 + 0.07; x < w / 2 - 0.5; x += 1) for (let z = tz0; z < tz1 - 0.5; z += 2) {
      const tw = Math.min(1, w / 2 - 0.07 - x), td = Math.min(2, tz1 - z);
      add('tatami', boxUV(tw - 0.02, 0.05, td - 0.02, 2).translate(x + tw / 2, F + 0.025, z + td / 2));
    }
  }

  switch (s.type) {
    case 'minka': case 'fisher': {
      // irori hearth with a hanging kettle; cushions around it
      const hx = r.range(-0.5, 0.5), hz = -0.3;
      add('stone', boxUV(1.1, 0.1, 1.1, 1).translate(hx, F + 0.05, hz));
      add('stone', tint(boxUV(0.8, 0.11, 0.8, 1), [0.18, 0.16, 0.15]).translate(hx, F + 0.056, hz));
      add('darkwood', boxUV(0.03, D.H - 0.8, 0.03, 1).translate(hx, F + 0.8 + (D.H - 0.8) / 2, hz));
      add('stone', tint(new THREE.SphereGeometry(0.16, 6, 4).toNonIndexed(), [0.12, 0.12, 0.13]).translate(hx, F + 0.62, hz));
      add('paper', tint(boxUV(0.4, 0.06, 0.3, 1), [1, 0.5, 0.2], 1).translate(hx, F + 0.12, hz)); // embers
      out.lights.push({ pos: new THREE.Vector3(hx, F + 0.4, hz), color: fire.clone(), radius: 7, intensity: 2.2, halo: 0, phase: r.next() * 6 + 100 });
      cushion(hx, hz - 0.95, 0); cushion(hx + 0.95, hz, -Math.PI / 2); cushion(hx - 0.95, hz, Math.PI / 2);
      chest(inner.x1 - 0.55, back);
      if (s.type === 'fisher') {
        for (let i = 0; i < 3; i++) add('cloth', tint(boxUV(0.9, 1.1, 0.03, 1), [0.4, 0.38, 0.3]).translate(inner.x0 + 0.6 + i * 0.6, F + 1.5, back + 0.05)); // nets
        add('wood', boxUV(0.5, 0.35, 0.5, 1).translate(inner.x0 + 0.4, F + 0.18, inner.z1 - 0.4)); // basket
      } else shelf(inner.x0 + 0.8, back + 0.05);
      tokonoma(-w / 2 + 1.2);
      lamp(inner.x1 - 0.3, inner.z1 - 1.6);
      futons(2);
      break;
    }
    case 'machiya': case 'inn': case 'teahouse': {
      const tables = s.type === 'inn' ? 2 : 1;
      for (let i = 0; i < tables; i++) {
        const tx = tables === 1 ? 0 : (i - 0.5) * w * 0.45, tz = -0.4;
        add('darkwood', boxUV(1.1, 0.3, 0.75, 1).translate(tx, F + 0.15, tz));
        if (s.type === 'teahouse' || s.profession === 'tea') {
          add('cloth', tint(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 6).toNonIndexed(), [0.35, 0.45, 0.35]).translate(tx, F + 0.36, tz));
        }
        cushion(tx, tz - 0.75, 0); cushion(tx, tz + 0.75, Math.PI);
      }
      tokonoma(0);
      chest(inner.x0 + 0.6, back);
      lamp(inner.x1 - 0.3, back + 0.2);
      lamp(inner.x0 + 0.3, inner.z1 - 1.6);
      futons(s.type === 'inn' ? 3 : 1);
      break;
    }
    case 'shop': {
      // counter and goods
      add('darkwood', boxUV(w * 0.6, 0.85, 0.5, 1).translate(0, F + 0.42, 0.4));
      shelf(-w / 4, back + 0.05); shelf(w / 4, back + 0.05);
      for (let i = 0; i < 5; i++) add('wood', boxUV(0.45, 0.35, 0.45, 1).translate(r.range(inner.x0, inner.x1), F + 0.18, r.range(0.9, inner.z1 - 0.3)));
      for (let i = 0; i < 3; i++) add('cloth', tint(new THREE.CylinderGeometry(0.18, 0.22, 0.5, 7).toNonIndexed(), [0.45, 0.32, 0.22]).translate(inner.x0 + 0.4 + i * 0.5, F + 0.25, -0.6));
      lamp(0, -0.8);
      cushion(0, -0.25, 0);
      break;
    }
    case 'workshop': {
      workshop(s.profession);
      lamp(inner.x1 - 0.3, inner.z0 + 0.3);
      break;
    }
    case 'kura': {
      for (let i = 0; i < 6; i++) add('wood', boxUV(0.6, 0.5, 0.5, 1).translate(r.range(inner.x0 + 0.3, inner.x1 - 0.3), F + 0.25 + (i > 3 ? 0.5 : 0), r.range(inner.z0 + 0.3, -0.2)));
      break;
    }
    case 'onsen': {
      // an indoor stone bath (steam comes from the village's particle emitter)
      add('stone', boxUV(w * 0.6, 0.5, d * 0.45, 1).translate(0, F + 0.25, -d * 0.15));
      add('water', boxUV(w * 0.6 - 0.4, 0.05, d * 0.45 - 0.4, 1).translate(0, F + 0.46, -d * 0.15));
      for (let i = 0; i < 3; i++) add('wood', boxUV(0.35, 0.25, 0.35, 1).translate(inner.x0 + 0.4 + i * 0.5, F + 0.12, inner.z1 - 0.4)); // buckets
      lamp(inner.x1 - 0.3, inner.z1 - 0.5);
      break;
    }
    case 'shrine': {
      add('darkwood', boxUV(0.8, 0.5, 0.5, 1).translate(0, F + 0.25, 0.3)); // offering box
      add('wood', boxUV(0.9, 0.9, 0.6, 1).translate(0, F + 0.45, back + 0.4)); // the inner sanctuary
      add('cloth', tint(boxUV(0.06, 0.06, 0.06, 1), [0.9, 0.85, 0.7]).translate(0, F + 1.0, back + 0.4));
      out.lights.push({ pos: new THREE.Vector3(0, F + 1.2, 0), color: warm.clone(), radius: 5, intensity: 1.2, halo: 0.3, phase: r.next() * 6 });
      break;
    }
  }

  function tokonoma(x: number): void {
    // alcove: raised platform, a hanging scroll and an ikebana vase
    add('darkwood', boxUV(1.2, 0.15, 0.6, 1).translate(x, F + 0.075, back + 0.3));
    add('cloth', tint(boxUV(0.5, 1.2, 0.02, 1), [0.9, 0.86, 0.74]).translate(x, F + 1.35, back + 0.02));
    for (let i = 0; i < 5; i++) add('stone', tint(boxUV(0.03, 0.18, 0.02, 1), [0.15, 0.13, 0.12]).translate(x - 0.1 + (i % 2) * 0.12, F + 1.6 - i * 0.2, back + 0.035)); // brush strokes
    add('cloth', tint(new THREE.CylinderGeometry(0.08, 0.1, 0.25, 6).toNonIndexed(), [0.3, 0.38, 0.5]).translate(x + 0.35, F + 0.27, back + 0.3));
    add('cloth', tint(new THREE.SphereGeometry(0.14, 5, 4).toNonIndexed(), r.pick([[0.85, 0.3, 0.3], [0.9, 0.75, 0.3], [0.7, 0.5, 0.8]] as [number, number, number][])).translate(x + 0.35, F + 0.5, back + 0.3));
  }

  function futons(n: number): void {
    for (let i = 0; i < n; i++) {
      const x = inner.x0 + 0.6 + i * 1.1;
      if (x > inner.x1 - 0.5) break;
      out.night.push(tint(boxUV(0.95, 0.12, 2.0, 1), [0.92, 0.9, 0.86]).translate(x, F + 0.06, -d / 2 + 1.3));
      out.night.push(tint(boxUV(0.97, 0.06, 1.4, 1), r.pick([[0.3, 0.4, 0.62], [0.62, 0.32, 0.3], [0.4, 0.5, 0.35]] as [number, number, number][])).translate(x, F + 0.15, -d / 2 + 1.55));
    }
  }

  function workshop(p: string): void {
    const bench = () => add('wood', boxUV(1.6, 0.75, 0.6, 1).translate(inner.x0 + 1.0, F + 0.375, back + 0.4));
    switch (p) {
      case 'potter':
        add('stone', tint(new THREE.CylinderGeometry(0.35, 0.4, 0.45, 8).toNonIndexed(), [0.4, 0.36, 0.32]).translate(0, F + 0.22, -0.3));
        add('stone', tint(new THREE.CylinderGeometry(0.15, 0.12, 0.2, 7).toNonIndexed(), [0.65, 0.45, 0.32]).translate(0, F + 0.55, -0.3));
        for (let i = 0; i < 7; i++) add('stone', tint(new THREE.CylinderGeometry(0.12, 0.1, 0.25 + r.next() * 0.2, 7).toNonIndexed(), [0.6, 0.42, 0.3]).translate(inner.x0 + 0.4 + i * 0.35, F + 0.95, back + 0.15));
        add('wood', boxUV(2.6, 0.05, 0.35, 1).translate(inner.x0 + 1.4, F + 0.8, back + 0.15));
        cushion(0, 0.35, Math.PI);
        break;
      case 'lanternMaker':
        bench();
        for (let i = 0; i < 4; i++) {
          const lx = inner.x0 + 0.6 + i * 0.7;
          add('paper', chochin(0.2, 0.38).translate(lx, F + D.H - 0.3, -0.2));
          out.lights.push({ pos: new THREE.Vector3(lx, F + D.H - 0.55, -0.2), color: new THREE.Color(1, 0.6, 0.25), radius: 4, intensity: 1.0, halo: 0.6, phase: r.next() * 6 });
        }
        for (let i = 0; i < 3; i++) add('cloth', tint(boxUV(0.03, 0.03, 0.2, 1), [0.15, 0.12, 0.1]).translate(inner.x0 + 0.7 + i * 0.25, F + 0.8, back + 0.4)); // brushes
        break;
      case 'weaver': {
        // a loom frame with a half-woven indigo cloth
        const lx = 0, lz = -0.4;
        for (const sx of [-0.7, 0.7]) for (const sz of [-0.5, 0.5]) add('darkwood', boxUV(0.08, 1.4, 0.08, 1).translate(lx + sx, F + 0.7, lz + sz));
        add('darkwood', boxUV(1.5, 0.08, 1.1, 1).translate(lx, F + 1.4, lz));
        add('cloth', tint(boxUV(1.3, 0.03, 0.8, 1), [0.18, 0.25, 0.5]).translate(lx, F + 0.75, lz));
        cushion(lx, lz + 0.9, Math.PI);
        break;
      }
      case 'carpenter':
        bench();
        for (let i = 0; i < 6; i++) add('wood', boxUV(0.12, 2.2, 0.25, 1).translate(inner.x1 - 0.2, F + 1.1, inner.z0 + 0.3 + i * 0.3).rotateZ(0));
        add('wood', boxUV(1.0, 0.5, 0.25, 1).translate(0.3, F + 0.25, 0.2)); // sawhorse
        break;
      default:
        bench();
        // herbs drying from the beams
        for (let i = 0; i < 6; i++) add('cloth', tint(boxUV(0.12, 0.4, 0.12, 1), [0.35, 0.45, 0.25]).translate(inner.x0 + 0.5 + i * 0.4, F + D.H - 0.35, 0));
    }
  }
}
