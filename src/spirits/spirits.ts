/**
 * Spirits & the mystical layer (SPEC §23), gentle and never scary:
 * - lantern spirits: little glowing paper lanterns with faces that drift over the lake on some
 *   nights and lead toward the island shrine;
 * - kodama: tiny moss-coloured tree spirits that appear around you in old forests when you stand
 *   still for a while; they click their heads and vanish when you move;
 * - a white fox with a glowing tail that leads you toward a shrine you haven't found, at night;
 * - the great forest guardian: a huge, slow deer-like silhouette in the cedar mist at dawn,
 *   always far away;
 * - echoes of the past: soft blue pixel ghosts in the castle at dusk replaying happy moments
 *   (the siblings watching fireflies, a tea gathering, children playing);
 * - spirit lights: aurora-like ribbons on rare clear winter nights;
 * - a tsukumogami: the old umbrella by your chest blinks and hops when you're not looking.
 * Each one is a "spirit encounter" secret the first time.
 */
import * as THREE from 'three';
import { boxUV, chochin, mergeGeoms } from '../buildings/kit';
import { litMaterial, ensureColor } from '../render/materials';
import { COMMON_PARS, FOG_FN, NOISE, SKY_FN } from '../render/shaders/common';
import { U } from '../render/uniforms';
import type { GameWorld } from '../scene/gameWorld';
import { REGIONS } from '../world/data/regions';

export const SPIRIT_SECRETS: [string, string][] = [
  ['spirit-lanterns', 'Lantern spirits over the lake'],
  ['spirit-kodama-cedar', 'Kodama in the cedar forest'],
  ['spirit-kodama-bamboo', 'Kodama in the bamboo grove'],
  ['spirit-kodama-maple', 'Kodama under the maples'],
  ['spirit-fox', 'The fox with the glowing tail'],
  ['spirit-guardian', 'The great forest guardian'],
  ['spirit-echo-siblings', 'An echo: two children and the fireflies'],
  ['spirit-echo-tea', 'An echo: a tea gathering in the castle'],
  ['spirit-aurora', 'Spirit lights in the winter sky'],
  ['spirit-umbrella', 'The umbrella that hops'],
];

const GHOST_VERT = /* glsl */ `
${COMMON_PARS}
varying vec3 vWorldPos;
varying vec3 vN;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const GHOST_FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
uniform float uFade;
uniform vec3 uGhost;
varying vec3 vWorldPos;
varying vec3 vN;
float bayer4(vec2 p){
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
void main(){
  if (dot(vec4(vWorldPos, 1.0), uClipPlane) < 0.0) discard;
  float shimmer = 0.75 + 0.25 * sin(uTime * 2.0 + vWorldPos.y * 6.0);
  if (uFade * 0.6 * shimmer < bayer4(gl_FragCoord.xy)) discard;
  float rim = 0.6 + 0.4 * (1.0 - abs(vN.y));
  gl_FragColor = vec4(applyFog(uGhost * rim * 1.8, vWorldPos), 0.5);
}`;

const AURORA_VERT = /* glsl */ `
${COMMON_PARS}
varying vec2 vUv;
varying vec3 vWorldPos;
void main(){
  vUv = uv;
  vec3 p = position;
  p.x += sin(uv.y * 3.0 + uTime * 0.08) * 120.0;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const AURORA_FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
uniform float uFade;
varying vec2 vUv;
varying vec3 vWorldPos;
float bayer4(vec2 p){
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
void main(){
  float band = vnoise(vec2(vUv.x * 9.0 + uTime * 0.05, uTime * 0.03)) * (1.0 - vUv.y * 0.8) * smoothstep(0.0, 0.2, vUv.y);
  float rays = 0.55 + 0.45 * sin(vUv.x * 160.0 + vnoise(vec2(vUv.x * 30.0, uTime * 0.1)) * 6.0);
  float a = band * rays * uFade * 1.8;
  if (a < bayer4(gl_FragCoord.xy) * 0.9 + 0.08) discard;
  vec3 c = mix(vec3(0.15, 1.0, 0.55), vec3(0.6, 0.35, 1.0), smoothstep(0.3, 1.0, vUv.y));
  gl_FragColor = vec4(c * (1.4 + 1.5 * a), 0.0);
}`;

export const ghostMat = (rgb: [number, number, number]) => new THREE.ShaderMaterial({ uniforms: { ...U, uFade: { value: 0 }, uGhost: { value: new THREE.Vector3(...rgb) } }, vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG });

/** A little figure (child / adult / kneeling) for the echoes. */
export function figure(h: number, kneel = false): THREE.BufferGeometry {
  const body = kneel ? boxUV(0.4, h * 0.42, 0.45, 1).translate(0, h * 0.21, 0) : boxUV(0.36, h * 0.6, 0.26, 1).translate(0, h * 0.4, 0);
  const head = new THREE.SphereGeometry(h * 0.1, 6, 4).toNonIndexed().translate(0, kneel ? h * 0.52 : h * 0.82, 0);
  return mergeGeoms([body, ensureColor(head)]);
}

export class Spirits {
  readonly group = new THREE.Group();
  /** first sightings → the secrets */
  onSeen: ((id: string) => void) | null = null;
  private lanterns: THREE.Mesh[] = [];
  private kodama: THREE.Mesh[] = [];
  private kodamaOn = 0;
  private still = 0;
  private lastPos = new THREE.Vector3();
  private guardian: THREE.Mesh;
  private echoes: { mesh: THREE.Group; mat: THREE.ShaderMaterial; id: string; pos: THREE.Vector3 }[] = [];
  private aurora: THREE.Mesh;
  private umbrella: THREE.Mesh;
  private umbrellaHop = 0;
  private foxNight = -1;
  /** a kodama click (for the sound) */
  onClick: ((pos: THREE.Vector3) => void) | null = null;
  private clickT = 2;
  private b = { forest: 0, moisture: 0, autumn: 0, special: 0, specialW: 0, grass: [0, 0, 0] as [number, number, number], region: 0 };

  constructor(private w: GameWorld) {
    this.group.name = 'spirits';
    // lantern spirits: a paper lantern with two dark eyes and a little mouth
    const lm = litMaterial({ emissive: new THREE.Color(1, 0.7, 0.35), emissiveIntensity: 3, flicker: true });
    const lg = mergeGeoms([chochin(0.32, 0.55), boxUV(0.05, 0.05, 0.02, 1, [0.1, 0.06, 0.05]).translate(-0.09, -0.22, 0.3), boxUV(0.05, 0.05, 0.02, 1, [0.1, 0.06, 0.05]).translate(0.09, -0.22, 0.3), boxUV(0.08, 0.02, 0.02, 1, [0.5, 0.15, 0.1]).translate(0, -0.33, 0.3)]);
    for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(lg, lm); m.visible = false; this.lanterns.push(m); this.group.add(m); }
    // kodama: pale moss bodies, round heads, two dark eyes
    const km = litMaterial({ outline: true, emissive: new THREE.Color(0.6, 0.9, 0.6), emissiveIntensity: 0.6 });
    const kg = mergeGeoms([
      ensureColor(new THREE.CylinderGeometry(0.08, 0.11, 0.26, 6).toNonIndexed().translate(0, 0.13, 0), [0.72, 0.82, 0.6], 0.3),
      ensureColor(new THREE.SphereGeometry(0.13, 6, 5).toNonIndexed().scale(1.1, 0.95, 1).translate(0, 0.38, 0), [0.8, 0.88, 0.68], 0.3),
      boxUV(0.035, 0.05, 0.02, 1, [0.08, 0.1, 0.08]).translate(-0.05, 0.4, 0.13), boxUV(0.035, 0.05, 0.02, 1, [0.08, 0.1, 0.08]).translate(0.05, 0.4, 0.13),
    ]);
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(kg, km); m.visible = false; m.userData.castShadow = true; this.kodama.push(m); this.group.add(m); }
    // the guardian: a tall slow stag of shadow with pale antlers
    const gp: THREE.BufferGeometry[] = [boxUV(3.2, 3.4, 9, 2, [0.12, 0.14, 0.16]).translate(0, 9, 0), boxUV(1.4, 4.5, 1.6, 2, [0.12, 0.14, 0.16]).translate(0, 12.5, 4.2).rotateX(0), boxUV(1.2, 1.3, 2.6, 2, [0.12, 0.14, 0.16]).translate(0, 15, 5.4)];
    for (const [x, z] of [[-1, -3.5], [1, -3.5], [-1, 3.5], [1, 3.5]] as const) gp.push(boxUV(0.6, 7.5, 0.6, 2, [0.1, 0.12, 0.14]).translate(x, 3.75, z));
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) gp.push(boxUV(0.2, 2.2 - k * 0.3, 0.2, 1, [0.8, 0.9, 0.85], 0.6).rotateZ(s * (0.4 + k * 0.25)).translate(s * (0.6 + k * 0.5), 16.4 + k * 0.6, 5));
    this.guardian = new THREE.Mesh(mergeGeoms(gp), litMaterial({ emissive: new THREE.Color(0.7, 0.9, 0.8), emissiveIntensity: 1.2 }));
    this.guardian.visible = false;
    this.group.add(this.guardian);
    // echoes in the castle
    const C = w.world.sites.castle;
    const echo = (id: string, dx: number, dz: number, figs: [number, number, number, boolean][], rgb: [number, number, number]) => {
      const mat = ghostMat(rgb), g = new THREE.Group();
      for (const [x, z, h, kneel] of figs) { const m = new THREE.Mesh(figure(h, kneel), mat); m.position.set(x, 0, z); g.add(m); }
      const pos = new THREE.Vector3(C.x + dx, w.groundHeight(C.x + dx, C.z + dz), C.z + dz);
      g.position.copy(pos); g.visible = false;
      this.group.add(g);
      this.echoes.push({ mesh: g, mat, id, pos });
    };
    echo('spirit-echo-siblings', 10, 22, [[0, 0, 1.25, false], [0.6, 0.1, 1.05, false]], [0.45, 0.7, 1]);
    echo('spirit-echo-tea', -12, 8, [[0, 0, 1.6, true], [1.3, 0, 1.6, true], [0.65, 1.1, 1.6, true], [0.65, -1.1, 1.5, true]], [0.55, 0.75, 1]);
    // aurora: a long curtain, high in the northern sky
    const ag = new THREE.PlaneGeometry(4200, 900, 40, 1);
    this.aurora = new THREE.Mesh(ag, new THREE.ShaderMaterial({ uniforms: { ...U, uFade: { value: 0 } }, vertexShader: AURORA_VERT, fragmentShader: AURORA_FRAG, side: THREE.DoubleSide, depthWrite: true }));
    this.aurora.frustumCulled = false; this.aurora.visible = false; this.aurora.renderOrder = -1;
    this.group.add(this.aurora);
    // the old umbrella on your engawa
    const ug = mergeGeoms([
      ensureColor(new THREE.ConeGeometry(0.16, 0.9, 8).toNonIndexed().rotateX(Math.PI).translate(0, 0.55, 0), [0.62, 0.22, 0.16]),
      boxUV(0.03, 0.2, 0.03, 1, [0.3, 0.2, 0.12]).translate(0, 0.08, 0),
      boxUV(0.06, 0.06, 0.02, 1, [1, 0.95, 0.8], 1).translate(0, 0.62, 0.11),
    ]);
    this.umbrella = new THREE.Mesh(ug, litMaterial({ outline: true, emissive: new THREE.Color(1, 1, 0.9), emissiveIntensity: 1 }));
    this.umbrella.userData.castShadow = true;
    this.group.add(this.umbrella);
  }

  /** where the umbrella stands (next to your chest) */
  placeUmbrella(p: THREE.Vector3): void { this.umbrella.position.copy(p); }

  private seen(id: string): void { this.onSeen?.(id); }

  update(dt: number, t: number, cam: THREE.Vector3, look: THREE.Vector3, hour: number, day: number, W: { cloud: number; fog: number; rain: number }, winter: number, brighter: boolean): void {
    const night = hour > 20 || hour < 4.3, wo = this.w.world;
    // ---- lantern spirits: every third night (every night once the story ends), over the lake
    const lakeNight = night && (day % 3 === 1 || brighter) && W.rain < 0.2 && Math.hypot(cam.x, cam.z) < 1100;
    const isl = this.w.secrets.list.find((s) => s.id === 'shrine-island')?.pos ?? new THREE.Vector3(0, 0, 0);
    this.lanterns.forEach((m, i) => {
      m.visible = lakeNight;
      if (!lakeNight) return;
      // a loose group 30–60 m out, drifting slowly toward the island shrine and back
      const k = 0.5 - 0.5 * Math.cos(t * 0.01), dir = isl.clone().sub(cam).setY(0);
      const len = Math.min(dir.length(), 400); dir.normalize();
      const cx = cam.x + dir.x * (16 + k * len * 0.6), cz = cam.z + dir.z * (16 + k * len * 0.6);
      m.position.set(cx + Math.sin(i * 2.1 + t * 0.2) * 8, 1.6 + Math.sin(t * 1.3 + i * 1.7) * 0.5 + (i % 3) * 0.6, cz + Math.cos(i * 1.7 + t * 0.15) * 8);
      m.rotation.y = Math.sin(t * 0.4 + i) * 0.5;
    });
    if (lakeNight && this.lanterns[0]!.position.distanceTo(cam) < 80) this.seen('spirit-lanterns');
    // ---- kodama: stand still in an old forest
    const moved = cam.distanceTo(this.lastPos);
    this.lastPos.copy(cam);
    wo.biome(cam.x, cam.z, this.b);
    const r = wo.regionAt(cam.x, cam.z), rid = r >= 0 ? ['cedar', 'bamboo', 'maple'].find((x) => x === REGION_IDS[r]) : undefined;
    this.still = moved < 0.02 * Math.max(1, dt * 60) ? this.still + dt : 0;
    const forest = this.b.forest > 0.7 && hour > 5 && hour < 20 && !!rid;
    const want = forest && this.still > 6 ? 1 : 0;
    if (want && !this.kodamaOn) {
      this.kodama.forEach((m, i) => {
        // in a loose arc ahead of you, half hidden among the roots
        const a = Math.atan2(look.x, look.z) + (i - 2.5) * 0.32, d = 4 + (i % 3) * 1.8, x = cam.x + Math.sin(a) * d, z = cam.z + Math.cos(a) * d;
        m.position.set(x, this.w.groundHeight(x, z), z);
        m.rotation.y = Math.atan2(cam.x - x, cam.z - z);
      });
      this.seen('spirit-kodama-' + rid);
    }
    this.kodamaOn = want ? Math.min(1, this.kodamaOn + dt * 0.5) : 0;
    this.kodama.forEach((m, i) => {
      m.visible = this.kodamaOn > i / 7;
      // the head click: a quick tilt now and then
      m.rotation.z = Math.sin(t * 0.7 + i * 2.3) > 0.97 ? 0.35 : 0;
    });
    if (this.kodamaOn > 0.5) { this.clickT -= dt; if (this.clickT < 0) { this.clickT = 0.8 + Math.random() * 2.5; this.onClick?.(this.kodama[Math.floor(Math.random() * 6)]!.position); } }
    // ---- the white fox: once a night, near an unfound shrine in the woods or by the temple
    if (night && this.foxNight !== day) {
      const unfound = this.w.secrets.list.find((s) => s.kind === 'shrine' && !this.w.secrets.found.has(s.id) && s.pos.distanceTo(cam) < 300 && s.pos.distanceTo(cam) > 25);
      if (unfound) {
        this.foxNight = day;
        const d = unfound.pos.clone().sub(cam).setY(0).normalize();
        for (const a of this.w.fauna.spawnAt('whiteFox', cam.x + d.x * 8, cam.z + d.z * 8, 1, hour, 0.5)) { a.state = 'wander'; a.sleep = 0; a.target.copy(unfound.pos); a.timer = 120; }
        this.seen('spirit-fox');
      }
    }
    // ---- the guardian: cedar forest, dawn, mist; always ~220 m ahead and to the side
    const dawn = hour > 4.5 && hour < 7;
    const guard = dawn && REGION_IDS[r] === 'cedar';
    this.guardian.visible = guard;
    if (guard) {
      const yaw = Math.atan2(look.x, look.z) + 0.3, gx = cam.x + Math.sin(yaw) * 75, gz = cam.z + Math.cos(yaw) * 75;
      if (this.guardian.position.distanceTo(cam) > 120 || this.guardian.position.distanceTo(cam) < 50) this.guardian.position.set(gx, this.w.groundHeight(gx, gz), gz);
      this.guardian.position.x += Math.sin(t * 0.02) * dt * 0.8;
      this.guardian.rotation.y = 1.2 + Math.sin(t * 0.03) * 0.2;
      if (look.dot(this.guardian.position.clone().sub(cam).normalize()) > 0.8) this.seen('spirit-guardian');
    }
    // ---- echoes in the castle, at dusk and at night: fade in as you come, out if you step too close
    for (const e of this.echoes) {
      const d = e.pos.distanceTo(cam), on = (hour > 17.5 || hour < 3) && d < 40 && d > 3;
      const f = e.mat.uniforms.uFade!;
      f.value = Math.max(0, Math.min(1, f.value + (on ? dt * 0.3 : -dt * 0.8)));
      e.mesh.visible = f.value > 0.01;
      e.mesh.children.forEach((c, i) => { c.rotation.y = Math.sin(t * 0.3 + i) * 0.3; c.position.y = Math.sin(t * 1.2 + i) * 0.03; });
      if (f.value > 0.6) this.seen(e.id);
    }
    // ---- aurora: clear winter nights, one in four
    const aur = night && winter > 0.5 && W.cloud < 0.55 && day % 4 === 2;
    const af = (this.aurora.material as THREE.ShaderMaterial).uniforms.uFade!;
    af.value = Math.max(0, Math.min(1, af.value + (aur ? dt * 0.25 : -dt * 0.15)));
    this.aurora.visible = af.value > 0.01;
    if (this.aurora.visible) { this.aurora.position.set(cam.x, cam.y + 1600, cam.z - 3200); if (af.value > 0.5) this.seen('spirit-aurora'); }
    // ---- the umbrella: hop when you're not looking, blink when you are
    const u = this.umbrella, to = u.position.clone().sub(cam), ud = to.length();
    const looking = look.dot(to.normalize()) > 0.6;
    if (ud < 30 && !looking && Math.random() < dt * 0.3) this.umbrellaHop = 0.5;
    this.umbrellaHop = Math.max(0, this.umbrellaHop - dt);
    u.rotation.z = this.umbrellaHop > 0 ? Math.sin(this.umbrellaHop * 25) * 0.15 : 0;
    u.scale.y = this.umbrellaHop > 0 ? 1 + Math.sin(this.umbrellaHop * Math.PI * 2) * 0.1 : 1;
    if (looking && ud < 6 && this.umbrellaHop > 0) this.seen('spirit-umbrella');
    if (looking && ud < 4 && Math.sin(t * 0.9) > 0.995) this.seen('spirit-umbrella');
  }
}

/** region ids by index (cheap lookup) */
const REGION_IDS = REGIONS.map((r) => r.id);
