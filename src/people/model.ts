/**
 * People in the pixel style (SPEC §16): one body made of boxes for everyone (kimono, obi,
 * sleeves, head and hair, sandals; straw hat, umbrella and basket as optional parts), drawn
 * with ONE instanced draw. Per-person colours and flags are instance attributes; the vertex
 * shader animates walking, sitting (seiza), bowing, waving / reaching up to a lantern, working,
 * and an elder's stoop.
 */
import * as THREE from 'three';
import { U } from '../render/uniforms';
import { COMMON_PARS, FOG_FN, LIGHTING, NOISE, SKY_FN } from '../render/shaders/common';

// parts
const P = { skirt: 0, head: 1, armL: 2, armR: 3, legL: 4, legR: 5, hat: 6, umbrella: 7, basket: 8, torso: 9 } as const;
// colour slots
const S = { kimono: 0, accent: 1, hair: 2, skin: 3, straw: 4, dark: 5, paper: 6 } as const;

type V3 = [number, number, number];

export function personGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], part: number[] = [], slot: number[] = [], piv: number[] = [];
  const box = (c: V3, s: V3, pt: number, sl: number, pv: V3 = [0, 0, 0], geo?: THREE.BufferGeometry) => {
    const g = (geo ?? new THREE.BoxGeometry(...s)).toNonIndexed();
    if (!geo) g.translate(...c);
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i));
      part.push(pt); slot.push(sl); piv.push(...pv);
    }
  };
  const hip: V3 = [0, 0.82, 0], shoulderL: V3 = [-0.2, 1.3, 0], shoulderR: V3 = [0.2, 1.3, 0];
  // legs & sandals (mostly hidden under the kimono)
  for (const [sx, pt] of [[-0.08, P.legL], [0.08, P.legR]] as const) {
    box([sx, 0.42, 0], [0.11, 0.8, 0.12], pt, S.kimono, [sx, hip[1], 0]);
    box([sx, 0.03, 0.03], [0.12, 0.06, 0.2], pt, S.dark, [sx, hip[1], 0]);
  }
  // kimono skirt (flares a little), torso, obi, collar
  box([0, 0.55, 0], [0.38, 0.62, 0.26], P.skirt, S.kimono);
  box([0, 0.24, 0], [0.42, 0.16, 0.3], P.skirt, S.kimono);
  box([0, 1.08, 0], [0.4, 0.5, 0.26], P.torso, S.kimono, hip);
  box([0, 0.92, 0], [0.42, 0.12, 0.28], P.torso, S.accent, hip);
  box([0, 1.3, 0.11], [0.14, 0.12, 0.06], P.torso, S.accent, hip);
  // arms with wide sleeves and hands
  for (const [sx, pt, sh] of [[-1, P.armL, shoulderL], [1, P.armR, shoulderR]] as const) {
    box([sx * 0.25, 1.08, 0], [0.12, 0.46, 0.14], pt, S.kimono, sh);
    box([sx * 0.26, 0.98, 0], [0.14, 0.24, 0.2], pt, S.kimono, sh); // sleeve
    box([sx * 0.25, 0.82, 0.02], [0.08, 0.09, 0.08], pt, S.skin, sh);
  }
  // head, hair, eyes
  const neck: V3 = [0, 1.36, 0];
  box([0, 1.5, 0], [0.24, 0.26, 0.24], P.head, S.skin, neck);
  box([0, 1.6, -0.02], [0.26, 0.1, 0.27], P.head, S.hair, neck);
  box([0, 1.5, -0.1], [0.26, 0.24, 0.07], P.head, S.hair, neck);
  box([0, 1.64, -0.08], [0.1, 0.08, 0.1], P.head, S.hair, neck); // bun
  for (const sx of [-0.06, 0.06]) box([sx, 1.5, 0.121], [0.04, 0.03, 0.01], P.head, S.dark, neck);
  // straw hat (kasa)
  const hat = new THREE.ConeGeometry(0.34, 0.16, 10, 1);
  hat.translate(0, 1.71, 0);
  box([0, 0, 0], [0, 0, 0], P.hat, S.straw, neck, hat);
  // umbrella (bangasa) held over the head
  const canopy = new THREE.ConeGeometry(0.62, 0.22, 12, 1, true);
  canopy.translate(0.12, 2.02, 0.02);
  box([0, 0, 0], [0, 0, 0], P.umbrella, S.paper, shoulderR, canopy);
  box([0.12, 1.55, 0.02], [0.025, 0.95, 0.025], P.umbrella, S.dark, shoulderR);
  // basket on the back
  box([0, 1.05, -0.22], [0.3, 0.32, 0.18], P.basket, S.straw, hip);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute('aSlot', new THREE.Float32BufferAttribute(slot, 1));
  g.setAttribute('aPivot', new THREE.Float32BufferAttribute(piv, 3));
  return g;
}

const VERT = /* glsl */ `
${COMMON_PARS}
attribute float aPart;
attribute float aSlot;
attribute vec3 aPivot;
attribute vec4 iPos;   // x, y, z, yaw
attribute vec4 iAnim;  // phase, gait, pose (0 stand, 1 seiza, 2 bow amount), arm (0 rest, 1 raised, 2 working)
attribute vec4 iColA;  // kimono rgb, scale
attribute vec4 iColB;  // accent rgb, flags (1 hat, 2 umbrella, 4 basket, 8 elder)
attribute vec4 iColC;  // hair rgb, skin tone
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
bool has(float flags, float bit){ return mod(floor(flags / bit), 2.0) > 0.5; }
void main(){
  vec3 p = position, n = normal;
  float part = aPart, flags = iColB.w;
  // optional parts
  if ((part == 6.0 && !has(flags, 1.0)) || (part == 7.0 && !has(flags, 2.0)) || (part == 8.0 && !has(flags, 4.0))) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vWorldPos = vec3(0.0); vNormal = vec3(0.0, 1.0, 0.0); vColor = vec3(0.0); return;
  }
  float ph = iAnim.x, gait = iAnim.y, pose = iAnim.z, arm = iAnim.w;
  float seiza = clamp(pose, 0.0, 1.0) * step(pose, 1.5);
  float bow = pose > 1.5 ? pose - 2.0 : 0.0;
  mat3 R = mat3(1.0);
  if (part == 4.0 || part == 5.0) {
    float side = part == 4.0 ? 0.0 : 3.14159;
    R = rotX(sin(ph + side) * gait * 0.55 + seiza * 1.45);
  } else if (part == 2.0 || part == 3.0 || part == 7.0) {
    float side = part == 2.0 ? 3.14159 : 0.0;
    float swing = sin(ph + side) * gait * 0.45;
    float right = part == 3.0 || part == 7.0 ? 1.0 : 0.0;
    float a = swing;
    if (arm > 0.5 && arm < 1.5 && right > 0.5) a = -2.5 + sin(uTime * 6.0) * 0.12;      // raised: wave / reach a lantern
    if (arm > 1.5) a = -0.9 + sin(uTime * 3.0 + side) * 0.35;                        // working
    if (part == 7.0) a = -0.15;                                                       // umbrella stays up
    R = rotX(a) * rotZ((part == 2.0 ? -1.0 : 1.0) * 0.08);
  }
  p = aPivot + R * (p - aPivot);
  n = R * n;
  // upper body: bow / elder's stoop, pivoting at the hips
  if (part == 1.0 || part == 2.0 || part == 3.0 || part == 6.0 || part == 7.0 || part == 8.0 || part == 9.0) {
    float lean = bow * 0.75 + (has(flags, 8.0) ? 0.22 : 0.0);
    vec3 hp = vec3(0.0, 0.82, 0.0);
    p = hp + rotX(lean) * (p - hp);
    n = rotX(lean) * n;
  }
  // seiza: the whole figure kneels down
  p.y -= seiza * 0.5;
  p.y += abs(sin(ph)) * gait * 0.03;
  mat3 W = rotY(iPos.w);
  vec3 wp = iPos.xyz + W * (p * iColA.w);
  vWorldPos = wp;
  vNormal = normalize(W * n);
  float s = aSlot;
  vec3 skin = mix(vec3(0.6, 0.36, 0.24), vec3(0.42, 0.24, 0.15), iColC.w);
  vColor = s < 0.5 ? iColA.rgb : s < 1.5 ? iColB.rgb : s < 2.5 ? iColC.rgb : s < 3.5 ? skin : s < 4.5 ? vec3(0.7, 0.58, 0.34) : s < 5.5 ? vec3(0.08, 0.07, 0.07) : iColB.rgb * 1.1 + vec3(0.1);
  if (n.y > 0.5) vColor *= 1.08; else if (n.y < -0.5) vColor *= 0.7;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
${LIGHTING}
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
void main(){
  clipCheck(vWorldPos);
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 col = shade(vColor * 1.6, N, vWorldPos, 0.25, 1.0, 0.2);
  col = applyFog(col, vWorldPos);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function peopleMaterial(): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
  m.userData.depth = new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: VERT, fragmentShader: 'void main(){ gl_FragColor = vec4(1.0); }', side: THREE.DoubleSide });
  return m;
}
