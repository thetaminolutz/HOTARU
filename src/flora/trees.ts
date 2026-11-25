/**
 * Trees as trunk meshes + camera-facing leaf-cluster cards (painterly blobs, SPEC §3.10).
 * One instanced draw per species for the crowns, one for the trunks.
 */
import * as THREE from 'three';
import { U } from '../render/uniforms';
import { COMMON_PARS, FOG_FN, LIGHTING, NOISE, SKY_FN, WIND } from '../render/shaders/common';
import { litMaterial, ensureColor } from '../render/materials';
import { hexToLinear } from '../render/color';
import { createRng } from '../core/rng';
import type { TreeSpecies } from './data/trees';

export type TreeInstance = { x: number; y: number; z: number; scale: number; rot: number; color?: string };

const VERT = /* glsl */ `
${COMMON_PARS}
${WIND}
attribute vec3 aCenter;
attribute vec2 aCorner;
attribute float aSize;
attribute float aAtlas;
attribute vec4 iPos;      // xyz, scale
attribute vec4 iColor;    // rgb, phase
uniform float uCrownY;
uniform float uHeight;
uniform float uSwayAmt;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vColor;
varying float vAo;
void main(){
  float s = iPos.w;
  float ph = iColor.w;
  float c = cos(ph * 6.2831), sn = sin(ph * 6.2831);
  vec3 lc = vec3(aCenter.x * c - aCenter.z * sn, aCenter.y, aCenter.x * sn + aCenter.z * c) * s;
  vec3 center = iPos.xyz + lc;
  // wind: whole tree sways with travelling gusts, clusters flutter
  float hf = clamp(aCenter.y / uHeight, 0.0, 1.0);
  float g = gust(iPos.xz);
  vec2 wd = normalize(uWind.xy);
  float sway = (sin(uTime * 1.1 + ph * 20.0) * 0.4 + 0.8) * g * uSwayAmt * hf * hf * uHeight * s;
  center.xz += wd * sway;
  center += vec3(sin(uTime * 3.1 + aCenter.x * 3.0 + ph * 9.0), 0.0, cos(uTime * 2.7 + aCenter.z * 3.0)) * 0.05 * g * s;

  // face the camera POSITION (not its rotation): turning the head never re-renders the cards
  vec3 camWorld = (inverse(viewMatrix) * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = normalize(camWorld - center);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam) + vec3(1e-4, 0.0, 0.0));
  vec3 up = cross(toCam, right);
  // painterly LOD: far away, clusters grow so each stays a few pixels wide (no speckle)
  float camDist = length(center - camWorld);
  float sz = max(aSize * s, camDist * uPixelAngle * 3.0);
  vec3 wp = center + (right * aCorner.x + up * aCorner.y) * sz * 0.5;

  vec3 crownC = iPos.xyz + vec3(0.0, uCrownY * s, 0.0);
  vec3 cn = normalize(center - crownC + vec3(0.0, 0.3, 0.0) * s);
  vNormal = normalize(cn + (right * aCorner.x + up * aCorner.y) * 0.55);
  vAo = 0.55 + 0.45 * clamp(length(lc - vec3(0.0, uCrownY * s, 0.0)) / (uHeight * s * 0.5), 0.0, 1.0);
  vWorldPos = wp;
  vec2 cell = vec2(mod(aAtlas, 2.0), floor(aAtlas / 2.0)) * 0.5;
  vUv = cell + vec2(aCorner.x * 0.5 + 0.5, 0.5 - aCorner.y * 0.5) * 0.5;
  vColor = iColor.rgb;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
${LIGHTING}
uniform sampler2D uAtlas;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vColor;
varying float vAo;
void main(){
  clipCheck(vWorldPos);
  vec4 t = texture2D(uAtlas, vUv);
  if (t.a < 0.5) discard;
  vec3 albedo = vColor * (0.55 + 0.75 * t.r);
  vec3 col = shade(albedo, normalize(vNormal), vWorldPos, 0.7, vAo, 0.3);
  col = applyFog(col, vWorldPos);
  gl_FragColor = vec4(col, 0.5);
}
`;

const DEPTH_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
void main(){ if (texture2D(uAtlas, vUv).a < 0.5) discard; gl_FragColor = vec4(1.0); }
`;

/** Cluster layout for a species, in metres, in tree-local space. */
function clusterLayout(sp: TreeSpecies, seed: number): { c: THREE.Vector3; size: number }[] {
  const r = createRng(seed);
  const out: { c: THREE.Vector3; size: number }[] = [];
  const crownH = sp.height - sp.trunkHeight;
  for (let i = 0; i < sp.clusters; i++) {
    const size = r.range(sp.clusterSize[0], sp.clusterSize[1]);
    let p: THREE.Vector3;
    const t = i / (sp.clusters - 1);
    switch (sp.shape) {
      case 'dome': {
        const a = r.next() * Math.PI * 2, u = Math.sqrt(r.next());
        const y = sp.trunkHeight + crownH * (0.25 + 0.65 * r.next());
        const ry = 1 - Math.pow((y - sp.trunkHeight - crownH * 0.45) / (crownH * 0.65), 2);
        p = new THREE.Vector3(Math.cos(a) * sp.radius * u * Math.max(0.3, ry), y, Math.sin(a) * sp.radius * u * Math.max(0.3, ry));
        break;
      }
      case 'cone': {
        const y = sp.trunkHeight + crownH * (0.08 + 0.86 * t);
        const rr = sp.radius * (1 - t) * 0.85 + 0.2;
        const a = i * 2.39996 + r.next() * 0.5;
        p = new THREE.Vector3(Math.cos(a) * rr * 0.75, y, Math.sin(a) * rr * 0.75);
        out.push({ c: p, size: size * (1 - t * 0.55) });
        continue;
      }
      case 'pads': {
        const tier = i % 4;
        const a = r.next() * Math.PI * 2;
        const y = sp.trunkHeight - 1.2 + tier * 1.3 + r.range(-0.2, 0.2);
        const rr = sp.radius * (1 - tier * 0.22) * r.range(0.4, 1);
        p = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
        break;
      }
      default: {
        const a = r.next() * Math.PI * 2, u = r.next();
        p = new THREE.Vector3(Math.cos(a) * sp.radius * 0.6 * u, sp.height * (0.35 + 0.3 * r.next()), Math.sin(a) * sp.radius * 0.6 * u);
      }
    }
    out.push({ c: p, size });
  }
  return out;
}

function trunkGeometry(sp: TreeSpecies): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const top = sp.shape === 'cone' ? sp.height * 0.75 : sp.height * 0.7;
  const g = new THREE.CylinderGeometry(sp.trunkRadius * 0.45, sp.trunkRadius, top, 6, 3);
  g.translate(0, top / 2, 0);
  // slight bend for character
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + Math.sin(y * 0.5) * 0.15 * (sp.shape === 'pads' ? 3 : 1));
  }
  g.computeVertexNormals();
  parts.push(g);
  if (sp.shape === 'dome' || sp.shape === 'pads') {
    for (let b = 0; b < 3; b++) {
      const br = new THREE.CylinderGeometry(sp.trunkRadius * 0.2, sp.trunkRadius * 0.45, sp.radius * 0.9, 4, 1);
      br.translate(0, sp.radius * 0.45, 0);
      br.rotateZ(0.9 + b * 0.1);
      br.rotateY(b * 2.1);
      br.translate(0, sp.trunkHeight * 0.9 + b * 0.4, 0);
      parts.push(br);
    }
  }
  const merged = mergeSimple(parts);
  const [r, gg, bb] = hexToLinear(sp.trunkColor);
  return ensureColor(merged, [r * 2.2, gg * 2.2, bb * 2.2]);
}

/** Minimal non-indexed merge (avoids pulling in BufferGeometryUtils). */
export function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
  for (const p0 of parts) {
    const p = p0.index ? p0.toNonIndexed() : p0;
    const pa = p.getAttribute('position'), na = p.getAttribute('normal'), ua = p.getAttribute('uv'), ca = p.getAttribute('aColor');
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      nor.push(na ? na.getX(i) : 0, na ? na.getY(i) : 1, na ? na.getZ(i) : 0);
      uv.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0);
      if (ca) col.push(ca.getX(i), ca.getY(i), ca.getZ(i), ca.getW(i)); else col.push(1, 1, 1, 0);
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

/**
 * near = true: trunks + shadow casting (trees around the player).
 * near = false: crowns only, no shadows — distant trees never show their trunks or shadows.
 */
export function createTrees(sp: TreeSpecies, instances: TreeInstance[], atlas: THREE.Texture, seed: number, near = true): THREE.Group {
  const group = new THREE.Group();
  group.name = 'trees-' + sp.id;
  if (instances.length === 0) return group;
  const layout = clusterLayout(sp, seed);
  const quad = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const aCenter: number[] = [], aCorner: number[] = [], aSize: number[] = [], aAtlas: number[] = [], idx: number[] = [];
  const r = createRng(seed ^ 77);
  layout.forEach((cl, k) => {
    const v = r.int(0, 4);
    quad.forEach(([x, y]) => { aCenter.push(cl.c.x, cl.c.y, cl.c.z); aCorner.push(x!, y!); aSize.push(cl.size); aAtlas.push(v); });
    const b = k * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  // Draw outer/upper clusters last-ish isn't needed: alpha-tested, depth sorted by z-buffer.
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(aCenter, 3)); // placeholder for three
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(aCenter, 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(aCorner, 2));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(aSize, 1));
  g.setAttribute('aAtlas', new THREE.Float32BufferAttribute(aAtlas, 1));
  g.setIndex(idx);
  const iPos = new Float32Array(instances.length * 4), iCol = new Float32Array(instances.length * 4);
  const cr = createRng(seed ^ 991);
  instances.forEach((t, i) => {
    iPos.set([t.x, t.y, t.z, t.scale], i * 4);
    const [rr, gg, bb] = hexToLinear(t.color ?? cr.pick(sp.colors));
    iCol.set([rr, gg, bb, t.rot / (Math.PI * 2)], i * 4);
  });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 4));
  g.setAttribute('iColor', new THREE.InstancedBufferAttribute(iCol, 4));
  g.instanceCount = instances.length;

  const uniforms = {
    ...U,
    uAtlas: { value: atlas },
    uCrownY: { value: sp.trunkHeight + (sp.height - sp.trunkHeight) * 0.5 },
    uHeight: { value: sp.height },
    uSwayAmt: { value: sp.sway },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
  mat.userData.depth = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide });
  const crowns = new THREE.Mesh(g, mat);
  crowns.frustumCulled = false;
  crowns.userData.castShadow = near;
  crowns.name = 'crowns-' + sp.id;
  group.add(crowns);
  if (!near) return group;

  const trunkMat = litMaterial({ outline: false, sway: 0 });
  const trunks = new THREE.InstancedMesh(trunkGeometry(sp), trunkMat, instances.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  instances.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Object3D().up, t.rot);
    sc.setScalar(t.scale);
    m.compose(new THREE.Vector3(t.x, t.y - 0.2, t.z), q, sc);
    trunks.setMatrixAt(i, m);
  });
  trunks.computeBoundingSphere();
  trunks.userData.castShadow = true;
  trunks.name = 'trunks-' + sp.id;
  group.add(trunks);
  return group;
}
