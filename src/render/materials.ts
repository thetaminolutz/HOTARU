/**
 * Material factory. Every world material is a custom ShaderMaterial using the shared
 * uniforms and lighting chunks, plus a matching depth-only variant for the shadow pass.
 */
import * as THREE from 'three';
import { U } from './uniforms';
import { COMMON_PARS, FOG_FN, LIGHTING, NOISE, SKY_FN, WIND } from './shaders/common';

export type LitOptions = {
  map?: THREE.Texture | null;
  tint?: THREE.ColorRepresentation;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  /** Emissive flickers like a flame. */
  flicker?: boolean;
  /** Emissive follows the lamps-on state of the time of day. */
  lampDriven?: boolean;
  sss?: number;
  wrap?: number;
  alphaTest?: number;
  outline?: boolean;
  side?: THREE.Side;
  /** Lamp-driven emissive that still glows this much by day (shōji with daylight behind). */
  dayGlow?: number;
  /** Gentle sway (lanterns, cloth); amplitude in metres per metre above the object origin. */
  sway?: number;
};

const LIT_VERT = /* glsl */ `
${COMMON_PARS}
${WIND}
attribute vec4 aColor;
uniform float uSway;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;
varying vec4 vColor;
void main(){
  vec4 lp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp;
  #endif
  vec4 wp = modelMatrix * lp;
  if (uSway > 0.0) {
    vec3 origin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float h = max(origin.y - wp.y, 0.0);
    float g = gust(origin.xz);
    wp.xz += normalize(uWind.xy) * h * uSway * g * (0.6 + 0.4 * sin(uTime * 2.1 + origin.x));
  }
  vWorldPos = wp.xyz;
  mat3 nm = mat3(modelMatrix);
  #ifdef USE_INSTANCING
    nm = nm * mat3(instanceMatrix);
  #endif
  vNormal = normalize(nm * normal);
  vUv = uv;
  vColor = aColor;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const LIT_FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
${LIGHTING}
uniform sampler2D uMap;
uniform float uHasMap;
uniform vec3 uTint;
uniform vec3 uEmissive;
uniform float uEmissiveI;
uniform float uFlicker;
uniform float uLampDriven;
uniform float uDayGlow;
uniform float uSss;
uniform float uWrap;
uniform float uAlphaTest;
uniform float uOutline;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;
varying vec4 vColor;
void main(){
  clipCheck(vWorldPos);
  vec4 tex = uHasMap > 0.5 ? texture2D(uMap, vUv) : vec4(1.0);
  if (tex.a < uAlphaTest) discard;
  vec3 albedo = tex.rgb * uTint * vColor.rgb;
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 col = shade(albedo, N, vWorldPos, uSss, 1.0, uWrap);
  float em = vColor.a * uEmissiveI;
  if (uLampDriven > 0.5) em *= max(uLamps, uDayGlow);
  if (uFlicker > 0.5) {
    float ph = dot(floor(vWorldPos * 2.0), vec3(1.7, 3.1, 2.3));
    em *= 0.88 + 0.12 * (sin(uTime * 9.0 + ph) * 0.5 + 0.5) * (sin(uTime * 23.0 + ph * 1.3) * 0.5 + 0.5);
  }
  col += uEmissive * em * tex.rgb;
  col = applyFog(col, vWorldPos);
  gl_FragColor = vec4(col, uOutline > 0.5 ? 1.0 : 0.5);
}
`;

const DEPTH_FRAG = /* glsl */ `
${COMMON_PARS}
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uAlphaTest;
varying vec3 vWorldPos;
varying vec2 vUv;
void main(){
  if (uHasMap > 0.5 && uAlphaTest > 0.0 && texture2D(uMap, vUv).a < uAlphaTest) discard;
  gl_FragColor = vec4(1.0);
}
`;

export function litMaterial(o: LitOptions = {}): THREE.ShaderMaterial {
  const uniforms = {
    ...U,
    uMap: { value: o.map ?? null },
    uHasMap: { value: o.map ? 1 : 0 },
    uTint: { value: new THREE.Color(o.tint ?? 0xffffff) },
    uEmissive: { value: new THREE.Color(o.emissive ?? 0x000000) },
    uEmissiveI: { value: o.emissiveIntensity ?? 1 },
    uFlicker: { value: o.flicker ? 1 : 0 },
    uLampDriven: { value: o.lampDriven ? 1 : 0 },
    uDayGlow: { value: o.dayGlow ?? 0 },
    uSss: { value: o.sss ?? 0 },
    uWrap: { value: o.wrap ?? 0 },
    uAlphaTest: { value: o.alphaTest ?? 0 },
    uOutline: { value: o.outline ? 1 : 0 },
    uSway: { value: o.sway ?? 0 },
  };
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: LIT_VERT, fragmentShader: LIT_FRAG, side: o.side ?? THREE.FrontSide });
  m.userData.depth = new THREE.ShaderMaterial({
    uniforms, vertexShader: LIT_VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide,
  });
  return m;
}

/** Make sure a geometry has the aColor attribute (rgb tint, a = emissive mask). */
export function ensureColor(g: THREE.BufferGeometry, rgb: [number, number, number] = [1, 1, 1], emissive = 0): THREE.BufferGeometry {
  if (!g.getAttribute('aColor')) {
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { a[i * 4] = rgb[0]; a[i * 4 + 1] = rgb[1]; a[i * 4 + 2] = rgb[2]; a[i * 4 + 3] = emissive; }
    g.setAttribute('aColor', new THREE.BufferAttribute(a, 4));
  }
  return g;
}

/** Register a mesh as shadow caster using its material's depth variant. */
export function castShadow(obj: THREE.Object3D): void {
  obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.userData.castShadow = true; });
}
