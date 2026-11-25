/**
 * People in the pixel style (SPEC §16): one body made of boxes for everyone (clothing,
 * face, hairstyles; straw hat, rain cape, umbrella and basket as optional parts), drawn
 * with ONE instanced draw. Per-person colours and flags are instance attributes; the vertex
 * shader animates walking, sitting (seiza), bowing, waving / reaching up to a lantern, working,
 * and an elder's stoop.
 */
import * as THREE from 'three';
import { U } from '../render/uniforms';
import { COMMON_PARS, FOG_FN, LIGHTING, NOISE, SKY_FN } from '../render/shaders/common';

// parts
const P = {
  skirt: 0, head: 1, armL: 2, armR: 3, legL: 4, legR: 5, hat: 6, umbrella: 7, basket: 8, torso: 9,
  bun: 10, topknot: 11, ponytail: 12, bob: 13, mino: 14, headband: 15, sleeveL: 16, sleeveR: 17, shorts: 18, towel: 19, eyes: 20, mouth: 21,
} as const;
// colour slots
const S = { kimono: 0, accent: 1, hair: 2, skin: 3, straw: 4, dark: 5, paper: 6, forearm: 7, leg: 8, white: 9, lips: 10 } as const;

type V3 = [number, number, number];

/**
 * One clothed figure with every optional piece; the shader shows the ones each person wears:
 * hairstyles (a bun, a topknot, a ponytail, a child's bob), outfits (kimono with wide sleeves;
 * work clothes — a short jacket, trousers, rolled sleeves and a headband; a straw rain cape;
 * a bath wrap with a towel on the head; a summer jinbei), and a face that blinks and smiles.
 */
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
  const hip: V3 = [0, 0.82, 0], shoulderL: V3 = [-0.2, 1.3, 0], shoulderR: V3 = [0.2, 1.3, 0], neck: V3 = [0, 1.36, 0];
  // legs: trousers/skin by outfit (slot `leg`), sandals with a thong
  for (const [sx, pt] of [[-0.08, P.legL], [0.08, P.legR]] as const) {
    box([sx, 0.47, 0], [0.11, 0.7, 0.12], pt, S.leg, [sx, hip[1], 0]);
    box([sx, 0.1, 0.0], [0.1, 0.12, 0.11], pt, S.skin, [sx, hip[1], 0]); // ankle
    box([sx, 0.03, 0.03], [0.12, 0.05, 0.22], pt, S.straw, [sx, hip[1], 0]);
    box([sx, 0.065, 0.1], [0.03, 0.025, 0.06], pt, S.dark, [sx, hip[1], 0]);
  }
  // kimono skirt (a little flare at the hem), torso, obi with its knot, the crossed collar
  box([0, 0.55, 0], [0.38, 0.62, 0.26], P.skirt, S.kimono);
  box([0, 0.24, 0], [0.42, 0.16, 0.3], P.skirt, S.kimono);
  box([0.05, 0.55, 0.131], [0.02, 0.6, 0.01], P.skirt, S.dark); // the overlap seam
  box([0, 1.08, 0], [0.4, 0.5, 0.26], P.torso, S.kimono, hip);
  box([0, 0.92, 0], [0.42, 0.12, 0.28], P.torso, S.accent, hip);
  box([0, 0.93, -0.16], [0.16, 0.1, 0.06], P.torso, S.accent, hip); // obi knot
  box([-0.05, 1.26, 0.131], [0.09, 0.18, 0.012], P.torso, S.white, hip); // collar (left over right)
  box([0.05, 1.24, 0.132], [0.06, 0.16, 0.012], P.torso, S.accent, hip);
  // trousers seat (work clothes) / summer shorts
  box([0, 0.72, 0], [0.38, 0.24, 0.27], P.shorts, S.leg);
  // arms: upper arm, forearm (sleeve colour or skin), hand; wide hanging sleeves on kimono
  for (const [sx, pt, sl, sh] of [[-1, P.armL, P.sleeveL, shoulderL], [1, P.armR, P.sleeveR, shoulderR]] as const) {
    box([sx * 0.25, 1.2, 0], [0.12, 0.22, 0.14], pt, S.kimono, sh);
    box([sx * 0.25, 0.97, 0.01], [0.1, 0.24, 0.11], pt, S.forearm, sh);
    box([sx * 0.25, 0.82, 0.02], [0.08, 0.09, 0.08], pt, S.skin, sh);
    box([sx * 0.26, 1.0, -0.01], [0.13, 0.3, 0.24], sl, S.kimono, sh);
  }
  // head: face, ears, nose, brows, a base cap of hair (every style)
  box([0, 1.5, 0], [0.24, 0.26, 0.24], P.head, S.skin, neck);
  for (const sx of [-1, 1]) box([sx * 0.125, 1.49, -0.01], [0.03, 0.07, 0.05], P.head, S.skin, neck);
  box([0, 1.48, 0.125], [0.035, 0.05, 0.03], P.head, S.skin, neck);
  for (const sx of [-0.065, 0.065]) box([sx, 1.555, 0.121], [0.06, 0.016, 0.01], P.head, S.hair, neck);
  box([0, 1.615, -0.02], [0.26, 0.07, 0.27], P.head, S.hair, neck);
  box([0, 1.52, -0.105], [0.26, 0.2, 0.06], P.head, S.hair, neck);
  for (const sx of [-1, 1]) box([sx * 0.12, 1.56, 0.0], [0.03, 0.1, 0.2], P.head, S.hair, neck); // sideburns / temples
  // eyes (they blink) and a mouth (it smiles)
  for (const sx of [-0.06, 0.06]) box([sx, 1.515, 0.121], [0.045, 0.035, 0.01], P.eyes, S.dark, [sx, 1.515, 0.12]);
  box([0, 1.425, 0.121], [0.06, 0.016, 0.01], P.mouth, S.lips, [0, 1.425, 0.12]);
  // hairstyles
  box([0, 1.67, -0.07], [0.12, 0.1, 0.12], P.bun, S.hair, neck);
  box([0, 1.64, -0.11], [0.2, 0.06, 0.06], P.bun, S.accent, neck); // a comb in the bun
  box([0, 1.64, 0.03], [0.1, 0.02, 0.17], P.topknot, S.skin, neck); // the shaved pate
  box([0, 1.67, -0.02], [0.06, 0.05, 0.2], P.topknot, S.hair, neck); // the folded queue
  box([0, 1.48, -0.16], [0.08, 0.28, 0.06], P.ponytail, S.hair, neck);
  box([0, 1.6, -0.14], [0.08, 0.05, 0.05], P.ponytail, S.accent, neck); // the tie
  box([0, 1.575, 0.11], [0.26, 0.06, 0.04], P.bob, S.hair, neck); // fringe
  for (const sx of [-1, 1]) box([sx * 0.13, 1.47, -0.02], [0.03, 0.18, 0.22], P.bob, S.hair, neck);
  // headband (hachimaki), towel folded on the head (bathers)
  box([0, 1.6, 0.0], [0.275, 0.045, 0.275], P.headband, S.white, neck);
  box([0, 1.66, -0.13], [0.04, 0.04, 0.12], P.headband, S.white, neck);
  box([0, 1.665, 0], [0.2, 0.05, 0.18], P.towel, S.white, neck);
  // straw hat (kasa)
  const hat = new THREE.ConeGeometry(0.34, 0.16, 10, 1);
  hat.translate(0, 1.71, 0);
  box([0, 0, 0], [0, 0, 0], P.hat, S.straw, neck, hat);
  // straw rain cape (mino) over the shoulders and back
  const mino = new THREE.CylinderGeometry(0.2, 0.36, 0.72, 9, 1, true);
  mino.translate(0, 1.0, -0.03);
  box([0, 0, 0], [0, 0, 0], P.mino, S.straw, hip, mino);
  box([0, 1.33, -0.02], [0.36, 0.08, 0.3], P.mino, S.straw, hip);
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
attribute vec4 iColB;  // accent rgb, flags (1 hat, 2 umbrella, 4 basket, 8 elder, 16 rain cape, 32 headband)
attribute vec4 iColC;  // hair rgb, skin tone
attribute vec4 iStyle; // hair style (0 bun, 1 topknot, 2 ponytail, 3 bob), outfit (0 kimono, 1 work, 2 —, 3 bath wrap, 4 summer), smile 0..1, body pose (0 upright, 1 lying, 2 swimming)
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
bool has(float flags, float bit){ return mod(floor(flags / bit), 2.0) > 0.5; }
bool isHead(float part){ return part == 1.0 || part == 6.0 || (part >= 10.0 && part <= 13.0) || part == 15.0 || part >= 19.0; }
void main(){
  vec3 p = position, n = normal;
  float part = aPart, flags = iColB.w;
  float hair = iStyle.x, outfit = iStyle.y, smile = iStyle.z, body = iStyle.w;
  bool kimono = outfit < 0.5 || (outfit > 1.5 && outfit < 3.5);
  // optional parts
  bool hide = (part == 6.0 && !has(flags, 1.0)) || (part == 7.0 && !has(flags, 2.0)) || (part == 8.0 && !has(flags, 4.0))
    || (part == 14.0 && !has(flags, 16.0)) || (part == 15.0 && !has(flags, 32.0))
    || (part == 0.0 && !kimono) || ((part == 16.0 || part == 17.0) && (!kimono || outfit > 2.5)) || (part == 18.0 && kimono)
    || (part == 19.0 && abs(outfit - 3.0) > 0.5)
    || (part >= 10.0 && part <= 13.0 && abs(part - 10.0 - hair) > 0.5)
    || (part >= 10.0 && part <= 13.0 && abs(outfit - 3.0) < 0.5 && part != 13.0);
  if (hide) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vWorldPos = vec3(0.0); vNormal = vec3(0.0, 1.0, 0.0); vColor = vec3(0.0); return; }
  float ph = iAnim.x, gait = iAnim.y, pose = iAnim.z, arm = iAnim.w;
  float seiza = clamp(pose, 0.0, 1.0) * step(pose, 1.5);
  float bow = pose > 1.5 ? pose - 2.0 : 0.0;
  float swim = step(1.5, body) * step(body, 2.5), lying = step(0.5, body) * step(body, 1.5);
  float idle = (1.0 - gait) * (1.0 - swim) * (1.0 - lying);
  // the face: blink now and then, smile (wider mouth, softer eyes)
  if (part == 20.0) {
    float blink = step(fract(uTime * 0.23 + ph * 0.37), 0.035);
    float sy = max(0.12, (1.0 - blink) * (1.0 - smile * 0.55));
    p = aPivot + vec3(1.0, sy, 1.0) * (p - aPivot);
  }
  if (part == 21.0) p = aPivot + vec3(1.0 + smile * 0.9, 1.0 + smile * 0.6, 1.0) * (p - aPivot);
  mat3 R = mat3(1.0);
  if (part == 4.0 || part == 5.0) {
    float side = part == 4.0 ? 0.0 : 3.14159;
    float kick = swim * sin(uTime * 7.0 + side) * 0.35;
    R = rotX(sin(ph + side) * gait * 0.55 + seiza * 1.45 + kick);
  } else if (part == 2.0 || part == 3.0 || part == 7.0 || part == 16.0 || part == 17.0) {
    float left = (part == 2.0 || part == 16.0) ? 1.0 : 0.0;
    float side = left > 0.5 ? 3.14159 : 0.0;
    float swing = sin(ph + side) * gait * 0.45;
    float right = 1.0 - left;
    float a = swing + idle * sin(uTime * 0.9 + ph + side) * 0.03;
    if (arm > 0.5 && arm < 1.5 && right > 0.5) a = -2.5 + sin(uTime * 6.0) * 0.12;      // raised: wave / reach a lantern
    if (arm > 1.5) a = -0.9 + sin(uTime * 3.0 + side) * 0.35;                        // working
    if (swim > 0.5) a = -3.14159 + mod(uTime * 2.6 + side, 6.28318);                  // crawl stroke
    if (lying > 0.5) a = -2.6 + left * 0.2;                                           // hands behind the head
    if (part == 7.0) a = -0.15;                                                       // umbrella stays up
    R = rotX(a) * rotZ((left > 0.5 ? -1.0 : 1.0) * 0.08);
  }
  p = aPivot + R * (p - aPivot);
  n = R * n;
  // the head turns to look about while standing, and nods with the breath
  if (isHead(part)) {
    vec3 nk = vec3(0.0, 1.36, 0.0);
    float look = idle * (sin(uTime * 0.37 + ph * 1.7) * 0.45 + sin(uTime * 0.13 + ph) * 0.25);
    float lift = swim * -0.9 + lying * 0.25;
    mat3 Hm = rotY(look) * rotX(lift);
    p = nk + Hm * (p - nk); n = Hm * n;
  }
  // breathing: the chest rises a little
  if (part == 9.0 || part == 14.0) p.y += idle * sin(uTime * 1.6 + ph) * 0.006 * (p.y - 0.82);
  // upper body: bow / elder's stoop, pivoting at the hips; a little sway in the stride
  bool upper = part == 1.0 || part == 2.0 || part == 3.0 || part == 6.0 || part == 7.0 || part == 8.0 || part == 9.0 || part >= 10.0 && part != 18.0;
  if (upper) {
    float lean = bow * 0.75 + (has(flags, 8.0) ? 0.22 : 0.0);
    vec3 hp = vec3(0.0, 0.82, 0.0);
    mat3 L = rotY(sin(ph) * gait * 0.07) * rotX(lean);
    p = hp + L * (p - hp);
    n = L * n;
  }
  // seiza: the whole figure kneels down
  p.y -= seiza * 0.5;
  p.y += abs(sin(ph)) * gait * 0.03;
  // whole-body poses: lying on the back in the grass; swimming face-down with the head up
  if (lying > 0.5) { vec3 o = vec3(0.0, 0.14, 0.0); p = o + rotX(-1.5708) * (p - o); n = rotX(-1.5708) * n; p.y += 0.01 * sin(uTime * 1.2 + ph); }
  if (swim > 0.5) { vec3 o = vec3(0.0, 0.9, 0.0); p = o + rotX(1.35) * (p - o) - vec3(0.0, 0.9, 0.0); n = rotX(1.35) * n; p.y += sin(uTime * 2.6 + ph) * 0.03; }
  mat3 W = rotY(iPos.w);
  vec3 wp = iPos.xyz + W * (p * iColA.w);
  vWorldPos = wp;
  vNormal = normalize(W * n);
  float s = aSlot;
  vec3 skin = mix(vec3(0.6, 0.36, 0.24), vec3(0.42, 0.24, 0.15), iColC.w);
  vec3 cloth = abs(outfit - 3.0) < 0.5 ? vec3(0.62, 0.6, 0.55) : iColA.rgb;   // bath wrap: plain cotton
  vec3 trousers = outfit > 3.5 ? skin : mix(iColA.rgb, vec3(0.05, 0.06, 0.09), 0.5);
  vColor = s < 0.5 ? cloth : s < 1.5 ? iColB.rgb : s < 2.5 ? iColC.rgb : s < 3.5 ? skin : s < 4.5 ? vec3(0.7, 0.58, 0.34) : s < 5.5 ? vec3(0.08, 0.07, 0.07)
    : s < 6.5 ? iColB.rgb * 1.1 + vec3(0.1)
    : s < 7.5 ? (kimono && outfit < 2.5 ? cloth : skin)
    : s < 8.5 ? (kimono ? cloth : part == 18.0 ? (outfit > 3.5 ? cloth : trousers) : trousers)
    : s < 9.5 ? vec3(0.72, 0.7, 0.66)
    : skin * vec3(0.8, 0.5, 0.5);
  if (part == 14.0) vColor *= vec3(0.62, 0.58, 0.5);   // weathered straw
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
