/**
 * Pixel particles (SPEC §13) for the M1 scene: fireflies over the reeds and maple leaves
 * riding the wind. Points are 1–2 internal pixels, so they stay crisp after upscaling.
 */
import * as THREE from 'three';
import { U } from '../render/uniforms';
import { COMMON_PARS, FOG_FN, NOISE, SKY_FN, WIND } from '../render/shaders/common';
import { createRng } from '../core/rng';

const FIREFLY_VERT = /* glsl */ `
${COMMON_PARS}
attribute vec4 aSeed; // phase, speed, radius, blink
uniform float uPxScale;
varying float vGlow;
varying vec3 vWorldPos;
void main(){
  float t = uTime * aSeed.y + aSeed.x * 40.0;
  vec3 p = position + vec3(sin(t * 0.7 + aSeed.x * 9.0), sin(t * 1.1) * 0.35, cos(t * 0.6 + aSeed.x * 4.0)) * aSeed.z;
  // slow rhythmic blink, with occasional synchronised waves
  float wave = sin(uTime * 0.35 + p.x * 0.05) * 0.5 + 0.5;
  float b = sin(uTime * (1.2 + aSeed.w) + aSeed.x * 31.0);
  vGlow = smoothstep(0.55, 0.95, b) * (0.5 + 0.5 * wave) * uLamps;
  vWorldPos = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vGlow > 0.6 && -mv.z < 18.0 ? 2.0 : 1.0;
}
`;
const FIREFLY_FRAG = /* glsl */ `
${COMMON_PARS}
varying float vGlow;
varying vec3 vWorldPos;
void main(){
  if (vGlow < 0.05) discard;
  if (dot(vec4(vWorldPos, 1.0), uClipPlane) < 0.0) discard;
  gl_FragColor = vec4(vec3(1.6, 2.4, 0.7) * vGlow * 1.6, 0.5);
}
`;

const LEAF_VERT = /* glsl */ `
${COMMON_PARS}
${WIND}
attribute vec4 aSeed; // phase, fall speed, drift, colour index
uniform vec3 uBox;    // spawn box size
uniform float uFloor;
varying vec3 vCol;
varying vec3 vWorldPos;
void main(){
  float life = fract(uTime * aSeed.y * 0.05 + aSeed.x);
  vec3 p = position;
  p.y -= life * uBox.y;
  float g = gust(p.xz);
  vec2 wd = normalize(uWind.xy);
  p.xz += wd * life * 14.0 * g + vec2(sin(uTime * 2.0 + aSeed.x * 20.0), cos(uTime * 1.7 + aSeed.x * 13.0)) * 0.5 * aSeed.z;
  p.y = max(p.y, uFloor);
  vWorldPos = p;
  float flip = sin(uTime * 6.0 + aSeed.x * 50.0) * 0.5 + 0.5;
  vec3 c0 = vec3(0.6, 0.12, 0.05), c1 = vec3(0.85, 0.3, 0.06), c2 = vec3(0.8, 0.55, 0.12);
  vec3 base = aSeed.w < 0.4 ? c0 : (aSeed.w < 0.75 ? c1 : c2);
  vCol = base * (uKeyColor * (0.4 + 0.6 * flip) + uAmbSky * 1.2) + base * 0.08 * uLamps;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = -mv.z < 6.0 ? 2.0 : 1.0;
}
`;
const LEAF_FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
varying vec3 vCol;
varying vec3 vWorldPos;
void main(){
  if (dot(vec4(vWorldPos, 1.0), uClipPlane) < 0.0) discard;
  gl_FragColor = vec4(applyFog(vCol, vWorldPos), 0.5);
}
`;

export function createFireflies(center: THREE.Vector3, radius: number, count: number, height: (x: number, z: number) => number, seed = 7): THREE.Points {
  const r = createRng(seed);
  const pos = new Float32Array(count * 3), s = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const a = r.next() * Math.PI * 2, d = Math.sqrt(r.next()) * radius;
    const x = center.x + Math.cos(a) * d, z = center.z + Math.sin(a) * d;
    const y = Math.max(height(x, z), 0) + 0.4 + r.next() * 2.2;
    pos.set([x, y, z], i * 3);
    s.set([r.next(), 0.3 + r.next() * 0.5, 0.6 + r.next() * 1.4, r.next()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(s, 4));
  const m = new THREE.ShaderMaterial({ uniforms: { ...U, uPxScale: { value: 1 } }, vertexShader: FIREFLY_VERT, fragmentShader: FIREFLY_FRAG });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.name = 'fireflies';
  return pts;
}

export function createLeaves(origin: THREE.Vector3, box: THREE.Vector3, count: number, floor: number, seed = 11): THREE.Points {
  const r = createRng(seed);
  const pos = new Float32Array(count * 3), s = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos.set([origin.x + (r.next() - 0.5) * box.x, origin.y + r.next() * 0.5, origin.z + (r.next() - 0.5) * box.z], i * 3);
    s.set([r.next(), 0.6 + r.next() * 0.8, r.next(), r.next()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(s, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { ...U, uBox: { value: box.clone() }, uFloor: { value: floor } },
    vertexShader: LEAF_VERT, fragmentShader: LEAF_FRAG,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.name = 'leaves';
  return pts;
}
