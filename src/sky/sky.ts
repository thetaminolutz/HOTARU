/** Sky dome: gradient, pixel stars, moon & sun discs with halos, banded clouds, Milky Way. */
import * as THREE from 'three';
import { U } from '../render/uniforms';
import { COMMON_PARS, NOISE, SKY_FN } from '../render/shaders/common';
import { createNoise } from '../core/noise';

const VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // at the far plane
}
`;

const FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
uniform float uStars;
uniform vec3 uClouds;
uniform vec3 uCloudLit;
uniform float uMoonPhase;
varying vec3 vDir;

vec3 stars(vec3 d){
  if (d.y < 0.02) return vec3(0.0);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float az = atan(d.z, d.x);
  float cellA = uPixelAngle * 2.3;
  vec2 g = vec2(az * cos(el), el) / cellA;
  vec2 cell = floor(g);
  float h = hash12(cell + 7.3);
  float density = 0.025 + 0.05 * smoothstep(0.25, 0.0, abs(dot(d, normalize(vec3(0.55, 0.35, -0.76)))));
  if (h > density) return vec3(0.0);
  vec2 sp = cell + 0.25 + 0.5 * vec2(hash12(cell + 1.7), hash12(cell + 9.1));
  vec2 dd = (g - sp) * cellA / uPixelAngle;
  if (max(abs(dd.x), abs(dd.y)) > 0.5) return vec3(0.0);
  float b = hash12(cell + 3.3);
  float tw = 0.75 + 0.25 * sin(uTime * (1.5 + b * 3.0) + b * 40.0);
  vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.92, 0.8), hash12(cell + 5.5));
  return tint * (0.25 + 1.2 * b * b * b) * tw * smoothstep(0.02, 0.2, d.y);
}

float milkyWay(vec3 d){
  vec3 n = normalize(vec3(0.55, 0.35, -0.76));
  float band = exp(-pow(dot(d, n) / 0.16, 2.0));
  float cl = fbm(vec2(atan(d.z, d.x) * 6.0, d.y * 9.0));
  return band * smoothstep(0.35, 0.75, cl) * smoothstep(0.0, 0.25, d.y);
}

void main(){
  vec3 d = normalize(vDir);
  vec3 c = skyColor(d);

  // clouds: a flat layer projected from the horizon, stretched like brush strokes
  float cy = max(d.y, 0.0);
  if (cy > 0.012) {
    vec2 p = d.xz / (cy + 0.06);
    p = vec2(p.x * 0.45 + uTime * 0.004, p.y * 1.4);
    float f = fbm(p * 1.3) + 0.35 * fbm(p * 4.1 + 3.0);
    float cov = smoothstep(0.0, 0.25, cy) * (1.0 - smoothstep(0.55, 0.9, cy));
    float dens = (f - 0.62) * cov;
    if (dens > 0.0) {
      // lit edge towards the brightest light (sun by day, moon by night)
      vec3 L = uSunDir.y > -0.05 ? uSunDir : uMoonDir;
      float toward = dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(L.x, 0.0, L.z) + 1e-4));
      float edge = 1.0 - smoothstep(0.0, 0.09, dens);
      vec3 body = mix(uClouds, uCloudLit, step(0.55, edge * (0.6 + 0.4 * toward)));
      body = mix(body, uCloudLit * 1.15, step(0.88, edge) * step(0.2, toward));
      c = mix(c, body, step(0.0, dens) * min(1.0, 0.75 + dens * 6.0));
    }
  }

  // stars & Milky Way at night
  if (uStars > 0.01) {
    c += stars(d) * uStars;
    c += vec3(0.22, 0.24, 0.36) * milkyWay(d) * uStars * 0.12;
  }

  // moon
  vec3 md = normalize(uMoonDir);
  float mdot = dot(d, md);
  float mr = 0.028;
  if (md.y > -0.1) {
    float ang = acos(clamp(mdot, -1.0, 1.0));
    if (ang < mr) {
      vec3 right = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(right, md);
      vec2 q = vec2(dot(d - md, right), dot(d - md, up)) / mr;
      // phase: 0 new → 0.5 full → 1 new; waxing lit from the right, waning from the left
      float side = uMoonPhase < 0.5 ? q.x : -q.x;
      float lit = step(cos(6.2831853 * uMoonPhase) * sqrt(max(0.0, 1.0 - q.y * q.y)), side);
      float crater = step(0.62, vnoise(floor(q * 6.0) + 4.0));
      vec3 mc = mix(vec3(1.25, 1.22, 1.08), vec3(0.95, 0.95, 1.0), crater) * (0.85 + 0.15 * q.y);
      c = mix(c, mc * 1.6, max(lit, 0.08) * smoothstep(0.0, 0.08, md.y + 0.05));
    } else {
      c += vec3(0.25, 0.3, 0.5) * pow(max(mdot, 0.0), 900.0) * 1.2 * uStars;
      c += vec3(0.08, 0.1, 0.18) * pow(max(mdot, 0.0), 60.0) * uStars;
    }
  }

  // sun disc
  float sd = dot(d, normalize(uSunDir));
  if (sd > cos(0.022) && uSunDir.y > -0.03) c = mix(c, vec3(4.0, 3.2, 2.2), 1.0);

  gl_FragColor = vec4(c, 0.0);
}
`;

export function createSky(): { mesh: THREE.Mesh; uniforms: { uPixelAngle: { value: number }; uMoonPhase: { value: number } } } {
  const extra = { uPixelAngle: { value: 0.0036 }, uMoonPhase: { value: 0.0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, ...extra },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  return { mesh, uniforms: extra };
}

const BACK_VERT = /* glsl */ `
attribute float aLayer;
attribute float aTop;
varying vec3 vWorldPos;
varying float vLayer;
varying float vTop;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz; vLayer = aLayer; vTop = aTop;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BACK_FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
varying vec3 vWorldPos;
varying float vLayer;
varying float vTop;
void main(){
  vec3 D = normalize(vWorldPos - uCamPos);
  vec3 hz = skyColor(normalize(vec3(D.x, 0.03, D.z)));
  vec3 dark = mix(uAmbGround * 0.6 + uShadowTint * 0.35, hz, 0.25);
  // stepped aerial perspective: every layer is a flat tone closer to the sky
  float haze = 0.42 + vLayer * 0.17;
  vec3 c = mix(dark, hz, haze);
  // sunlit ridge band
  float facing = max(dot(normalize(vec3(D.x, 0.0, D.z)) * -1.0, normalize(vec3(uKeyDir.x, 0.0, uKeyDir.z))), 0.0);
  c += uKeyColor * 0.06 * step(0.82, vTop) * (0.3 + facing) * (1.0 - vLayer * 0.3);
  // haze thickens towards the foot of each range
  c = mix(c, hz, (1.0 - vTop) * 0.35);
  gl_FragColor = vec4(c, 0.0);
}
`;

/** Rings of distant mountain silhouettes beyond the playable area (SPEC §5, §3.5). */
export function createBackdrop(seed: number, center = new THREE.Vector2(0, 0)): THREE.Mesh {
  const n = createNoise(seed ^ 0xbac);
  const layers = [
    { r: 11500, h: 900, v: 1300 },
    { r: 14000, h: 1300, v: 1700 },
    { r: 17000, h: 1700, v: 2200 },
  ];
  const SEG = 900;
  const pos: number[] = [], layerA: number[] = [], topA: number[] = [], idx: number[] = [];
  layers.forEach((L, li) => {
    const base = pos.length / 3;
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const x = center.x + Math.cos(a) * L.r, z = center.y + Math.sin(a) * L.r;
      const ridge = 0.35 + 0.65 * (n.fbm2(Math.cos(a) * 4 + li * 7, Math.sin(a) * 4 + li * 3, 5) * 0.5 + 0.5) + 0.25 * n.ridged2(Math.cos(a) * 9 + li, Math.sin(a) * 9, 3);
      // taller to the north, a gap towards the sea in the east (SPEC §6.15)
      const north = 0.6 + 0.6 * Math.max(0, -Math.sin(a));
      const east = 1 - 0.95 * Math.exp(-(((a - 0) / 0.5) ** 2)) - 0.95 * Math.exp(-(((a - Math.PI * 2) / 0.5) ** 2));
      const top = (L.h + L.v * ridge * north) * east + 30;
      pos.push(x, -200, z, x, top, z);
      layerA.push(li, li); topA.push(0, 1);
    }
    for (let s = 0; s < SEG; s++) {
      const a = base + s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aLayer', new THREE.Float32BufferAttribute(layerA, 1));
  g.setAttribute('aTop', new THREE.Float32BufferAttribute(topA, 1));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: BACK_VERT, fragmentShader: BACK_FRAG, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.name = 'backdrop';
  return mesh;
}
