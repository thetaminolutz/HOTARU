/**
 * Fish you can see (owner request): small schools drifting just under the surface of the lake,
 * rivers, ponds and the sea near you — dark, dithered shapes that wag their tails, turn together,
 * and dart away when you come close. Koi in ponds and village streams are orange and white.
 * One instanced draw; the fish are steered on the CPU (a few dozen around you).
 */
import * as THREE from 'three';
import { COMMON_PARS, FOG_FN, NOISE, SKY_FN } from '../render/shaders/common';
import { U } from '../render/uniforms';
import { createRng } from '../core/rng';
import type { World } from '../world/heightfield';

const N = 72;

const VERT = /* glsl */ `
${COMMON_PARS}
attribute vec4 iPos;    // x, y, z, heading
attribute vec4 iInfo;   // length, kind (0 dark, 1 koi, 2 silver), phase, alpha
varying vec2 vUv;
varying vec4 vInfo;
varying vec3 vWorldPos;
void main(){
  vInfo = iInfo;
  vUv = position.xz;                 // −0.5..0.5 along the fish, across it
  float L = iInfo.x, w = L * 0.36;
  // the tail half wags
  float wag = sin(uTime * 9.0 + iInfo.z * 20.0) * 0.12 * smoothstep(0.0, -0.5, position.x);
  vec2 local = vec2(position.x * L, (position.z + wag) * w);
  float c = cos(iPos.w), s = sin(iPos.w);
  vec3 wp = vec3(iPos.x + local.x * s + local.y * c, iPos.y, iPos.z + local.x * c - local.y * s);
  vWorldPos = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
varying vec2 vUv;
varying vec4 vInfo;
varying vec3 vWorldPos;
float bayer4(vec2 p){
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
void main(){
  if (dot(vec4(vWorldPos, 1.0), uClipPlane) < 0.0) discard;
  // a fish silhouette: an oval body and a forked tail
  float x = vUv.x, y = vUv.y * 2.0;
  float body = (x > -0.3) ? step(pow((x - 0.08) / 0.42, 2.0) + y * y / pow(0.9 - 0.5 * max(0.0, x - 0.1), 2.0), 1.0) : 0.0;
  float tail = (x <= -0.28 && x > -0.5) ? step(abs(y), 0.15 + (-0.28 - x) * 3.2) * step(0.08 + (-0.28 - x) * 0.9, abs(y) + 0.12) : 0.0;
  float a = max(body, tail) * vInfo.w;
  if (a * 0.95 < bayer4(gl_FragCoord.xy)) discard;
  vec3 col = vInfo.y > 1.5 ? vec3(0.55, 0.62, 0.66) : vInfo.y > 0.5 ? (fract(vInfo.z * 7.0) > 0.5 ? vec3(0.95, 0.45, 0.15) : vec3(0.92, 0.9, 0.86)) : vec3(0.06, 0.08, 0.1);
  // seen through the water: tinted toward the water's own colour
  col = mix(col, uAmbSky * 0.25, vInfo.y > 0.5 ? 0.25 : 0.1) * (0.7 + 0.3 * uKeyColor);
  gl_FragColor = vec4(applyFog(col, vWorldPos), 0.5);
}`;

type Fish = { x: number; z: number; y: number; h: number; speed: number; len: number; kind: number; ph: number; fade: number; school: number };

export class FishSchools {
  readonly mesh: THREE.Mesh;
  private fish: Fish[] = [];
  private iPos: Float32Array;
  private iInfo: Float32Array;
  private r = createRng(0xf15a);
  private schools: { x: number; z: number; h: number }[] = [];

  constructor(private w: World, private waterLevel: (x: number, z: number) => number, private isPond: (x: number, z: number) => boolean) {
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1, 4, 1).rotateX(-Math.PI / 2);
    g.index = q.index; g.setAttribute('position', q.getAttribute('position'));
    this.iPos = new Float32Array(N * 4); this.iInfo = new Float32Array(N * 4);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.iPos, 4));
    g.setAttribute('iInfo', new THREE.InstancedBufferAttribute(this.iInfo, 4));
    g.instanceCount = N;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'fish';
    this.mesh.userData.noReflect = true;
  }

  /** Water at least ~0.6 m deep, not under a pier. */
  private deep(x: number, z: number): number { const l = this.waterLevel(x, z); return l - this.w.height(x, z) > 0.6 ? l : NaN; }

  private spawnSchool(cx: number, cz: number, k: number): void {
    for (let t = 0; t < 12; t++) {
      const a = this.r.next() * Math.PI * 2, d = 8 + this.r.next() * 35, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const l = this.deep(x, z);
      if (Number.isNaN(l)) continue;
      this.schools[k] = { x, z, h: this.r.next() * 6.28 };
      return;
    }
    this.schools[k] = { x: 1e9, z: 1e9, h: 0 };
  }

  update(dt: number, player: THREE.Vector3): void {
    const S = 8, per = N / S;
    if (!this.fish.length) for (let i = 0; i < N; i++) this.fish.push({ x: 1e9, z: 1e9, y: 0, h: 0, speed: 0.4, len: 0.3, kind: 0, ph: this.r.next(), fade: 0, school: Math.floor(i / per) });
    for (let k = 0; k < S; k++) {
      const sc = this.schools[k];
      if (!sc || Math.hypot(sc.x - player.x, sc.z - player.z) > 70) {
        this.spawnSchool(player.x, player.z, k);
        const s2 = this.schools[k]!, pond = s2.x < 1e8 && this.isPond(s2.x, s2.z), sea = s2.x > 3500;
        for (const f of this.fish) if (f.school === k) {
          f.x = s2.x + (this.r.next() - 0.5) * 4; f.z = s2.z + (this.r.next() - 0.5) * 4; f.h = s2.h; f.fade = 0;
          f.kind = pond ? 1 : sea && this.r.next() < 0.6 ? 2 : 0;
          f.len = (pond ? 0.55 : 0.4) + this.r.next() * (pond ? 0.4 : 0.4);
        }
        continue;
      }
      // the school wanders, turning slowly, keeping to deep water
      sc.h += Math.sin(performance.now() * 0.0003 + k) * dt * 0.4;
      const nx = sc.x + Math.sin(sc.h) * dt * 0.5, nz = sc.z + Math.cos(sc.h) * dt * 0.5;
      if (Number.isNaN(this.deep(nx, nz))) sc.h += Math.PI * 0.6; else { sc.x = nx; sc.z = nz; }
    }
    for (let i = 0; i < N; i++) {
      const f = this.fish[i]!, sc = this.schools[f.school]!;
      if (sc.x > 1e8) { f.fade = 0; this.iInfo[i * 4 + 3] = 0; continue; }
      // swim toward a spot in the school, flee the player when close
      const tx = sc.x + Math.sin(f.ph * 40 + performance.now() * 0.0004) * 1.8, tz = sc.z + Math.cos(f.ph * 31 + performance.now() * 0.0005) * 1.8;
      let want = Math.atan2(tx - f.x, tz - f.z), sp = 0.5;
      const pd = Math.hypot(f.x - player.x, f.z - player.z);
      if (pd < 4.5) { want = Math.atan2(f.x - player.x, f.z - player.z); sp = 3.2; }
      let da = want - f.h; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      f.h += da * Math.min(1, dt * 3);
      f.speed += (sp - f.speed) * Math.min(1, dt * 2);
      const nx = f.x + Math.sin(f.h) * f.speed * dt, nz = f.z + Math.cos(f.h) * f.speed * dt;
      const l = this.deep(nx, nz);
      if (!Number.isNaN(l)) { f.x = nx; f.z = nz; f.y = l + 0.025; } // drawn on the (opaque) surface, tinted as if under it else f.h += 1.5 * dt;
      f.fade = Math.min(1, f.fade + dt * 0.5);
      this.iPos.set([f.x, f.y, f.z, f.h], i * 4);
      this.iInfo.set([f.len, f.kind, f.ph, f.fade * (pd > 60 ? 0 : 1)], i * 4);
    }
    const g = this.mesh.geometry as THREE.InstancedBufferGeometry;
    g.getAttribute('iPos').needsUpdate = true; g.getAttribute('iInfo').needsUpdate = true;
  }
}
