/**
 * Animal material: one instanced draw per species. The vertex shader animates parts:
 * legs swing with the gait, the head lowers to graze / bow, tails wag, wings fold or flap,
 * and a sleeping animal folds its legs and lies down. Shaded with the shared lighting.
 */
import * as THREE from 'three';
import { U } from '../render/uniforms';
import { COMMON_PARS, FOG_FN, LIGHTING, NOISE, SKY_FN } from '../render/shaders/common';

const VERT = /* glsl */ `
${COMMON_PARS}
attribute vec4 aColor;
attribute float aPart;
attribute vec3 aPivot;
attribute vec4 iPos;   // x, y, z, yaw
attribute vec4 iAnim;  // gait phase, gait amount (0..1), head (rad, + = down), wing (0 folded … 1 flapping)
attribute vec4 iMisc;  // scale, sleep (0..1), tail wag, pitch (rad, flying birds)
uniform float uLegH;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec4 vColor;

mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

void main(){
  vec3 p = position;
  vec3 n = normal;
  float part = aPart;
  float sleep = iMisc.y;
  mat3 R = mat3(1.0);
  if (part > 1.5 && part < 5.5) {
    // legs: front-left & back-right move together
    float off = (part < 2.5 || part > 4.5) ? 0.0 : 3.14159;
    float swing = sin(iAnim.x + off) * iAnim.y * 0.75;
    R = rotX(swing);
    // lying down: legs tuck under the body
    p.y = aPivot.y + (p.y - aPivot.y) * (1.0 - sleep * 0.85);
  } else if (part > 0.5 && part < 1.5) {
    R = rotX(iAnim.z);
  } else if (part > 5.5 && part < 6.5) {
    R = rotY(sin(uTime * (3.0 + iMisc.z * 6.0) + iAnim.x) * (0.15 + iMisc.z * 0.45));
  } else if (part > 6.5) {
    float side = part < 7.5 ? -1.0 : 1.0;
    float folded = 1.45 * (1.0 - iAnim.w);
    float flap = sin(iAnim.x * 2.0) * 0.75 * iAnim.w;
    R = rotZ(side * (flap - folded));
  }
  p = aPivot + R * (p - aPivot);
  n = R * n;
  // a sleeping body sinks onto its tucked legs
  p.y -= sleep * uLegH * 0.8;
  // body bob with the gait
  p.y += abs(sin(iAnim.x)) * iAnim.y * 0.02;
  // pitch (flying), yaw, scale, position
  mat3 W = rotY(iPos.w) * rotX(-iMisc.w);
  vec3 wp = iPos.xyz + W * (p * iMisc.x);
  vWorldPos = wp;
  vNormal = normalize(W * n);
  vColor = aColor;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
${LIGHTING}
uniform float uOutline;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec4 vColor;
void main(){
  clipCheck(vWorldPos);
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 col = shade(vColor.rgb, N, vWorldPos, 0.2, 1.0, 0.25);
  col = applyFog(col, vWorldPos);
  gl_FragColor = vec4(col, uOutline > 0.5 ? 1.0 : 0.5);
}
`;

const DEPTH = /* glsl */ `void main(){ gl_FragColor = vec4(1.0); }`;

export function faunaMaterial(legH: number, outline: boolean): THREE.ShaderMaterial {
  const uniforms = { ...U, uLegH: { value: legH }, uOutline: { value: outline ? 1 : 0 } };
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
  m.userData.depth = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: DEPTH, side: THREE.DoubleSide });
  return m;
}
