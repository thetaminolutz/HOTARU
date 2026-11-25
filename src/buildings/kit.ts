/** Modular building kit helpers (SPEC §7.1): world-scaled UV boxes, roofs, lanterns. */
import * as THREE from 'three';
import { ensureColor } from '../render/materials';

/** Box with UVs in metres / texMeters, so texel density is the same on every face. */
export function boxUV(w: number, h: number, d: number, texMeters = 2, rgb: [number, number, number] = [1, 1, 1], emissive = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, (uv.getX(i) * dims[f]![0]) / texMeters, (uv.getY(i) * dims[f]![1]) / texMeters);
  }
  return ensureColor(g.toNonIndexed(), rgb, emissive);
}

/** Place a geometry: translate/rotate copy. */
export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): THREE.BufferGeometry {
  const c = g.clone();
  if (rx) c.rotateX(rx);
  if (rz) c.rotateZ(rz);
  if (ry) c.rotateY(ry);
  c.translate(x, y, z);
  return c;
}

/** Gable roof (two sloped slabs) with ridge along z, deep overhang. */
export function gableRoof(w: number, d: number, rise: number, overhang: number, thick = 0.15, texMeters = 2): THREE.BufferGeometry[] {
  const half = w / 2 + overhang;
  const slope = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  const len = d + overhang * 2;
  const left = boxUV(slope, thick, len, texMeters);
  left.rotateZ(ang);
  left.translate(-half / 2, rise / 2, 0);
  const right = boxUV(slope, thick, len, texMeters);
  right.rotateZ(-ang);
  right.translate(half / 2, rise / 2, 0);
  return [left, right];
}

/** Triangular gable wall filling the roof end. */
export function gableEnd(w: number, rise: number, texMeters = 2): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p = [-w / 2, 0, 0, w / 2, 0, 0, 0, rise, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w / texMeters, 0, w / 2 / texMeters, rise / texMeters], 2));
  return ensureColor(g);
}

/** Paper lantern (chōchin): emissive paper body with dark caps. Origin at the top. */
export function chochin(radius = 0.28, height = 0.5): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = -t * height;
    const r = radius * (0.55 + 0.45 * Math.sin(Math.PI * t));
    pts.push(new THREE.Vector2(Math.max(r, 0.05), y));
  }
  const body = new THREE.LatheGeometry(pts, 8);
  const uv = body.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i));
  ensureColor(body, [1, 1, 1], 1);
  const capT = ensureColor(new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, 0.05, 8).translate(0, -0.02, 0), [0.15, 0.08, 0.06], 0);
  const capB = ensureColor(new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, 0.05, 8).translate(0, -height + 0.02, 0), [0.15, 0.08, 0.06], 0);
  return mergeGeoms([body, capT, capB]);
}

/** Square standing lantern box (andon on a post top). Origin at bottom. */
export function andon(w = 0.36, h = 0.5): THREE.BufferGeometry {
  const body = boxUV(w, h, w, 1, [1, 1, 1], 1).translate(0, h / 2 + 0.06, 0);
  const roof = new THREE.ConeGeometry(w * 0.95, 0.18, 4, 1);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, h + 0.15, 0);
  ensureColor(roof, [0.18, 0.1, 0.08], 0);
  const base = boxUV(w * 1.15, 0.08, w * 1.15, 1, [0.18, 0.1, 0.08], 0).translate(0, 0.04, 0);
  return mergeGeoms([body, roof.toNonIndexed(), base]);
}

export function mergeGeoms(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
  for (const p0 of parts) {
    const p = p0.index ? p0.toNonIndexed() : p0;
    if (!p.getAttribute('normal')) p.computeVertexNormals();
    ensureColor(p);
    const pa = p.getAttribute('position'), na = p.getAttribute('normal'), ua = p.getAttribute('uv'), ca = p.getAttribute('aColor');
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      nor.push(na.getX(i), na.getY(i), na.getZ(i));
      uv.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0);
      col.push(ca.getX(i), ca.getY(i), ca.getZ(i), ca.getW(i));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 4));
  g.computeBoundingSphere();
  return g;
}
