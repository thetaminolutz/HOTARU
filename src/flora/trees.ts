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
import { toTexture } from '../render/textures';
import { Pixmap, rngFor } from '../render/pixmap';

let bark: THREE.Texture | null = null;
/** Greyscale bark: vertical furrows (tinted by the species' trunk colour). */
function barkTexture(): THREE.Texture {
  if (bark) return bark;
  const p = new Pixmap(16, 32), r = rngFor('bark');
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
    let v = 0.62 + (r.next() - 0.5) * 0.08;
    if ((x + Math.floor(y / 6)) % 4 === 0) v = 0.4;
    if (r.chance(0.05)) v = 0.8;
    const g = Math.round(v * 255);
    p.set(x, y, (g << 16) | (g << 8) | g);
  }
  bark = toTexture(p);
  return bark;
}
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
  vAo = 0.7 + 0.3 * clamp(length(lc - vec3(0.0, uCrownY * s, 0.0)) / (uHeight * s * 0.5), 0.0, 1.0);
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
  vec3 albedo = vColor * (0.55 + 0.75 * t.r) * 1.6;
  vec3 col = shade(albedo, normalize(vNormal), vWorldPos, 0.4, vAo, 0.3);
  col = min(col, vec3(1.15)); // leaves never bloom like lamps
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
        const y = sp.trunkHeight + crownH * (0.05 + 0.88 * t);
        const rr = sp.radius * (1 - t) * 0.9 + 0.25;
        const a = i * 2.39996 + r.next() * 0.5;
        p = new THREE.Vector3(Math.cos(a) * rr * 0.6, y, Math.sin(a) * rr * 0.6);
        out.push({ c: p, size: size * (1 - t * 0.6) });
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
      case 'weep': { // a crown with curtains of hanging branches
        const a = (i / sp.clusters) * Math.PI * 2 + r.next() * 0.4;
        const hang = i % 3;
        const rr = sp.radius * (hang === 0 ? 0.45 : 0.85 + r.next() * 0.15);
        const y = hang === 0 ? sp.height * (0.78 + r.next() * 0.15) : sp.height * (hang === 1 ? 0.62 : 0.36) + r.range(-0.3, 0.3);
        p = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
        out.push({ c: p, size: size * (hang === 2 ? 0.8 : 1) });
        continue;
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
  const g = new THREE.CylinderGeometry(sp.trunkRadius * 0.45, sp.trunkRadius, top, 8, 3);
  g.translate(0, top / 2, 0);
  const guv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * 2, guv.getY(i) * top / 1.2);
  // slight bend for character
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + Math.sin(y * 0.5) * 0.15 * (sp.shape === 'pads' ? 3 : 1));
  }
  g.computeVertexNormals();
  parts.push(g);
  if (sp.shape === 'dome' || sp.shape === 'pads' || sp.shape === 'weep') {
    for (let b = 0; b < 3; b++) {
      const br = new THREE.CylinderGeometry(sp.trunkRadius * 0.2, sp.trunkRadius * 0.45, sp.radius * 0.9, 4, 1);
      br.translate(0, sp.radius * 0.45, 0);
      br.rotateZ(0.9 + b * 0.1);
      br.rotateY(b * 2.1);
      br.translate(0, sp.trunkHeight * 0.9 + b * 0.4, 0);
      parts.push(br);
    }
  }
  const [r, gg, bb] = hexToLinear(sp.trunkColor);
  for (const p of parts) ensureColor(p, [r * 3.6, gg * 3.6, bb * 3.6]);
  return mergeSimple(parts);
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
/** Cluster quads for a layout (shared by every tile of a species). */
function clusterGeometryAttributes(layout: { c: THREE.Vector3; size: number }[], seed: number) {
  const quad = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const aCenter: number[] = [], aCorner: number[] = [], aSize: number[] = [], aAtlas: number[] = [], idx: number[] = [];
  const r = createRng(seed ^ 77);
  layout.forEach((cl, k) => {
    const v = r.int(0, 4);
    quad.forEach(([x, y]) => { aCenter.push(cl.c.x, cl.c.y, cl.c.z); aCorner.push(x!, y!); aSize.push(cl.size); aAtlas.push(v); });
    const b = k * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return {
    position: new THREE.Float32BufferAttribute(aCenter, 3),
    aCenter: new THREE.Float32BufferAttribute(aCenter, 3),
    aCorner: new THREE.Float32BufferAttribute(aCorner, 2),
    aSize: new THREE.Float32BufferAttribute(aSize, 1),
    aAtlas: new THREE.Float32BufferAttribute(aAtlas, 1),
    index: new THREE.Uint16BufferAttribute(idx, 1),
  };
}

/**
 * Everything needed to draw one species: near and far cluster layouts, materials and the
 * trunk geometry. Tiles of the forest streamer create cheap instanced meshes from it.
 */
export class TreeKit {
  private near: ReturnType<typeof clusterGeometryAttributes>;
  private far: ReturnType<typeof clusterGeometryAttributes>;
  private mat: THREE.ShaderMaterial;
  private trunkGeo: THREE.BufferGeometry;
  private trunkMat: THREE.ShaderMaterial;
  private colors: [number, number, number][];

  constructor(readonly sp: TreeSpecies, atlas: THREE.Texture, seed: number) {
    const layout = clusterLayout(sp, seed);
    this.near = clusterGeometryAttributes(layout, seed);
    // far LOD: a third of the clusters, bigger (painterly blobs)
    const farLayout = layout.filter((_, i) => i % 3 === 0).map((c) => ({ c: c.c, size: c.size * 1.75 }));
    this.far = clusterGeometryAttributes(farLayout, seed + 1);
    const uniforms = {
      ...U,
      uAtlas: { value: atlas },
      uCrownY: { value: sp.trunkHeight + (sp.height - sp.trunkHeight) * 0.5 },
      uHeight: { value: sp.height },
      uSwayAmt: { value: sp.sway },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
    this.mat.userData.depth = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide });
    this.trunkGeo = trunkGeometry(sp);
    this.trunkMat = litMaterial({ outline: false, map: barkTexture() });
    this.colors = sp.colors.map((c) => hexToLinear(c));
  }

  /**
   * Instanced meshes for a list of trees packed as [x, y, z, scale, rot]*.
   * Returns crowns (near & far LOD share the instance data) and trunks.
   */
  makeTile(packed: Float32Array, seed: number): { near: THREE.Mesh; far: THREE.Mesh; trunks: THREE.InstancedMesh; sphere: THREE.Sphere } {
    const count = packed.length / 5;
    const iPos = new Float32Array(count * 4), iCol = new Float32Array(count * 4);
    const r = createRng(seed);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const x = packed[i * 5]!, y = packed[i * 5 + 1]!, z = packed[i * 5 + 2]!, s = packed[i * 5 + 3]!, rot = packed[i * 5 + 4]!;
      iPos.set([x, y, z, s], i * 4);
      const c = this.colors[r.int(0, this.colors.length)]!;
      iCol.set([c[0], c[1], c[2], rot / (Math.PI * 2)], i * 4);
      box.expandByPoint(v.set(x, y, z));
    }
    box.max.y += this.sp.height * 1.4;
    box.expandByScalar(this.sp.radius * 1.5);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const posAttr = new THREE.InstancedBufferAttribute(iPos, 4);
    const colAttr = new THREE.InstancedBufferAttribute(iCol, 4);
    const build = (a: ReturnType<typeof clusterGeometryAttributes>) => {
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', a.position);
      g.setAttribute('aCenter', a.aCenter);
      g.setAttribute('aCorner', a.aCorner);
      g.setAttribute('aSize', a.aSize);
      g.setAttribute('aAtlas', a.aAtlas);
      g.setIndex(a.index);
      g.setAttribute('iPos', posAttr);
      g.setAttribute('iColor', colAttr);
      g.instanceCount = count;
      g.boundingSphere = sphere.clone();
      const m = new THREE.Mesh(g, this.mat);
      m.name = 'crowns-' + this.sp.id;
      return m;
    };
    const near = build(this.near), far = build(this.far);
    near.userData.castShadow = true;
    far.userData.castShadow = false;
    far.userData.noReflect = true; // distant crowns are pixel-sized in the mirror anyway
    const trunks = new THREE.InstancedMesh(this.trunkGeo, this.trunkMat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      q.setFromAxisAngle(up, packed[i * 5 + 4]!);
      sc.setScalar(packed[i * 5 + 3]!);
      m.compose(v.set(packed[i * 5]!, packed[i * 5 + 1]! - 0.2, packed[i * 5 + 2]!), q, sc);
      trunks.setMatrixAt(i, m);
    }
    trunks.boundingSphere = sphere.clone();
    trunks.userData.castShadow = true;
    trunks.userData.noReflect = true;
    trunks.name = 'trunks-' + this.sp.id;
    return { near, far, trunks, sphere };
  }

  dispose(): void { this.mat.dispose(); this.trunkMat.dispose(); }
}
