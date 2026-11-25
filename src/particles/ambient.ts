/**
 * Generic GPU pixel particles (SPEC §13): one Points draw per effect, all motion in the vertex
 * shader. Ambient effects wrap around the camera; local ones (smoke, steam, sparks) rise from
 * an emitter. `AmbientFx` decides each effect's amount from region, hour and wind.
 */
import * as THREE from 'three';
import { U } from '../render/uniforms';
import { COMMON_PARS, FOG_FN, NOISE, SKY_FN, WIND } from '../render/shaders/common';
import { createRng } from '../core/rng';
import { hexToLinear } from '../render/color';
import { EFFECTS, type EffectDef } from './data/effects';
import type { World } from '../world/heightfield';
import { REGIONS } from '../world/data/regions';
import type { TodState } from '../sky/timeOfDay';

const MOTION = { drift: 0, fall: 1, blink: 2, rise: 3, bank: 4, flutter: 5 } as const;

const VERT = /* glsl */ `
${COMMON_PARS}
${WIND}
attribute vec4 aSeed;
uniform vec3 uCenter, uBox, uVel, uCol0, uCol1;
uniform vec2 uSize;
uniform float uWindK, uSwirl, uAmount, uMotion, uLocal, uGroundY;
varying vec3 vCol;
varying vec3 vWorldPos;
varying float vA;
void main(){
  vec3 s = position; // 0..1 random
  float t = uTime;
  vec2 wd = normalize(uWind.xy + 1e-4) * uWind.z;
  vec3 p;
  float a = step(aSeed.w, uAmount);
  if (uLocal > 0.5) {
    // rising plume: life 0..1, spreads and drifts downwind as it rises
    float life = fract(t * uVel.y / uBox.y + s.x);
    vec2 jit = (vec2(s.y, s.z) - 0.5) * uBox.xz * (0.3 + life * 1.4);
    p = uCenter + vec3(jit.x, life * uBox.y, jit.y);
    p.xz += wd * uWindK * life * life * 4.0 + vec2(sin(t + s.y * 30.0), cos(t * 0.8 + s.z * 30.0)) * uSwirl * life;
    a *= (1.0 - life) * smoothstep(0.0, 0.08, life);
  } else {
    vec3 q = s * uBox + uVel * t;
    float g = gust(uCenter.xz + s.xz * uBox.xz);
    q.xz += wd * uWindK * t * (0.4 + 0.6 * g);
    float ph = aSeed.x * 40.0;
    q += vec3(sin(t * 0.7 + ph), sin(t * 0.9 + ph * 1.3) * 0.4, cos(t * 0.6 + ph * 0.7)) * uSwirl;
    if (uMotion == 5.0) q.xz += vec2(sin(t * 3.1 + ph), cos(t * 2.7 + ph)) * 0.35;
    // wrap into a box centred on the camera
    p = uCenter + mod(q - uCenter + uBox * 0.5, uBox) - uBox * 0.5;
    if (uMotion == 2.0 || uMotion == 4.0 || uMotion == 0.0) p.y = uGroundY + mod(q.y, uBox.y);
    vec3 cc = uCenter;
    if (uMotion == 2.0 || uMotion == 4.0 || uMotion == 0.0) cc.y = uGroundY + uBox.y * 0.5;
    vec3 e = abs(p - cc) / (uBox * 0.5);
    a *= 1.0 - smoothstep(0.75, 1.0, max(e.x, max(e.y, e.z)));
  }
  float col = aSeed.y;
  vCol = mix(uCol0, uCol1, col);
  if (uMotion == 2.0) { // fireflies: slow blink with drifting waves
    float wave = sin(t * 0.35 + p.x * 0.05) * 0.5 + 0.5;
    float b = sin(t * (1.2 + aSeed.z) + aSeed.x * 31.0);
    a *= smoothstep(0.3, 0.9, b) * (0.55 + 0.45 * wave);
  }
  if (uMotion == 5.0) vCol *= 0.6 + 0.4 * (sin(t * 6.0 + aSeed.x * 50.0) * 0.5 + 0.5); // flipping leaves
  vA = a;
  vWorldPos = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = a < 0.02 ? 0.0 : floor(max(uSize.y, min(uSize.x, uSize.x * 6.0 / max(d, 0.1))) + 0.5);
  if (uSize.x <= 2.0) gl_PointSize = a < 0.02 ? 0.0 : (d < 14.0 ? uSize.x : uSize.y);
}
`;

const FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
uniform float uEmissive, uOpacity, uMotion;
varying vec3 vCol;
varying vec3 vWorldPos;
varying float vA;
float bayer4(vec2 p){
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
void main(){
  if (vA < 0.02) discard;
  if (dot(vec4(vWorldPos, 1.0), uClipPlane) < 0.0) discard;
  float cover = uOpacity * vA;
  if (uOpacity < 1.0) {
    // soft round puff, dithered: pixel-art transparency
    vec2 c = gl_PointCoord - 0.5;
    cover *= 1.0 - smoothstep(0.2, 0.5, length(c));
  }
  // solid points: hard cut (glowing ones fade by brightness); soft ones: ordered dither
  if (uOpacity < 1.0 ? cover < bayer4(gl_FragCoord.xy) : cover < 0.15) discard;
  // rain falls as short vertical streaks
  if (uMotion == 1.0 && abs(gl_PointCoord.x - 0.5) > 0.2) discard;
  vec3 lit = vCol * (uKeyColor * 0.55 + uAmbSky * 1.3 + uAmbGround * 0.3);
  vec3 col = mix(lit, vCol * (1.4 + 1.2 * uLamps) * (uOpacity < 1.0 ? 1.0 : 0.4 + 0.8 * vA), uEmissive);
  gl_FragColor = vec4(applyFog(col, vWorldPos), 0.5);
}
`;

export class Effect {
  readonly points: THREE.Points;
  readonly u: Record<string, THREE.IUniform>;
  amount = 0;
  constructor(readonly def: EffectDef, seed: number) {
    const r = createRng(seed);
    const n = def.count;
    const pos = new Float32Array(n * 3), s = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      pos.set([r.next(), r.next(), r.next()], i * 3);
      s.set([r.next(), r.next(), r.next(), (i + r.next()) / n], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(s, 4));
    const lin = (h: string) => new THREE.Vector3(...hexToLinear(h));
    this.u = {
      uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...def.box) }, uVel: { value: new THREE.Vector3(...def.vel) },
      uCol0: { value: lin(def.colors[0]) }, uCol1: { value: lin(def.colors[1]) }, uSize: { value: new THREE.Vector2(...def.size) },
      uWindK: { value: def.wind }, uSwirl: { value: def.swirl }, uAmount: { value: 0 }, uMotion: { value: MOTION[def.motion] },
      uLocal: { value: def.local ? 1 : 0 }, uGroundY: { value: 0 }, uEmissive: { value: def.emissive }, uOpacity: { value: def.opacity },
    };
    const m = new THREE.ShaderMaterial({ uniforms: { ...U, ...this.u }, vertexShader: VERT, fragmentShader: FRAG });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.name = 'fx-' + def.id;
    this.points.userData.noReflect = def.opacity < 1 || def.id === 'rain';
    this.points.visible = false;
  }
  set(amount: number, center: THREE.Vector3, groundY = center.y - 2): void {
    this.amount = amount;
    this.u.uAmount!.value = amount;
    (this.u.uCenter!.value as THREE.Vector3).copy(center);
    this.u.uGroundY!.value = groundY;
    this.points.visible = amount > 0.01;
  }
}

/** A fixed emitter of a local effect (chimney smoke, a hot spring's steam, a fire's sparks). */
export type Emitter = { effect: string; pos: THREE.Vector3; amount: number };

export class AmbientFx {
  readonly group = new THREE.Group();
  readonly effects = new Map<string, Effect>();
  readonly emitters: Emitter[] = [];
  /** Set by the weather system (M6): 0..1 rain / snow. */
  rain = 0;
  snow = 0;
  /** season weights: spring, summer, autumn, winter */
  season: [number, number, number, number] = [0, 0, 1, 0];
  scale = 1;
  /** current ground-mist amount (eased) */
  mist = 0;
  private local = new Map<string, Effect[]>();
  private b = { forest: 0, moisture: 0, autumn: 0, special: 0, specialW: 0, grass: [0, 0, 0] as [number, number, number], region: 0 };

  constructor(private world: World, seed: number) {
    EFFECTS.forEach((d, i) => {
      if (d.local) return;
      const e = new Effect(d, seed + i * 13);
      this.effects.set(d.id, e);
      this.group.add(e.points);
    });
    this.group.name = 'ambient-fx';
  }

  addEmitter(em: Emitter): void {
    const d = EFFECTS.find((e) => e.id === em.effect);
    if (!d) return;
    const e = new Effect(d, this.emitters.length * 31 + 5);
    this.emitters.push(em);
    (this.local.get(em.effect) ?? this.local.set(em.effect, []).get(em.effect)!).push(e);
    this.group.add(e.points);
  }

  update(cam: THREE.Vector3, groundY: number, tod: TodState, hour: number, wind: number, instant = false): void {
    const w = this.world, b = w.biome(cam.x, cam.z, this.b);
    const reg = w.regionAt(cam.x, cam.z), rid = reg >= 0 ? REGIONS[reg]!.id : 'none';
    const night = tod.stars, day = 1 - night;
    const dusk = Math.max(0, 1 - Math.abs(hour - 19.5) / 2.5);
    const morning = Math.max(0, 1 - Math.abs(hour - 6.5) / 2.2);
    const nearWater = Math.max(0, 1 - Math.abs(w.height(cam.x, cam.z)) / 14);
    const s = this.scale;
    const [spring, summer, autumn, winter] = this.season;
    const dryAir = 1 - Math.min(1, this.rain * 1.5);
    const A = (id: string, amount: number, c = cam, gy = groundY) => this.effects.get(id)?.set(Math.min(1, Math.max(0, amount)) * s, c, gy);
    A('fireflies', (0.3 + summer * 1.2 + spring * 0.3 + autumn * 0.4) * (1 - winter) * dryAir * Math.max(night, dusk * 0.6) * (0.25 + 0.75 * Math.max(nearWater, b.moisture * (1 - b.forest * 0.5))) * (cam.y - groundY < 30 ? 1 : 0));
    A('leaves', (0.15 + autumn * 0.85 + winter * 0.15) * dryAir * (b.autumn * (0.3 + 0.7 * b.forest) + (rid === 'maple' || rid === 'ginkgo' ? 0.4 : 0)) * (0.4 + wind) * 0.9);
    A('petals', (spring * 1.5 + 0.1) * (rid === 'cherry' ? 0.9 : rid === 'wisteria' ? 0.35 : 0.12) * (0.5 + wind) * dryAir);
    A('pollen', (spring + summer) * dryAir * day * (1 - b.forest) * (0.2 + 0.6 * Math.max(0, 1 - b.autumn)) * (rid === 'sunflower' || rid === 'tea' ? 1.6 : 0.6));
    A('motes', day * b.forest * (0.3 + 0.7 * tod.keyColor.r) * 0.8);
    A('rain', this.rain);
    A('snow', Math.max(this.snow, rid === 'snow' && cam.y > 650 ? 0.35 : 0));
    // mist: deep forests always, lakes and valleys in the morning, a little at dusk on the water
    const mist = (rid === 'cedar' ? 1 : rid === 'bamboo' ? 0.45 : rid === 'mirror' || rid === 'temple' ? 0.35 : 0) * (0.6 + 0.4 * morning)
      + morning * (0.3 + 0.5 * nearWater) + dusk * nearWater * 0.15;
    this.mist += (Math.min(1, mist * (1 - Math.min(0.6, wind * 0.5))) - this.mist) * (instant ? 1 : 0.02);
    U.uMist.value = this.mist * 0.75;
    U.uMistY.value = groundY;
    A('spray', rid === 'coast' && w.height(cam.x, cam.z) < 40 ? 0.4 + wind * 0.6 : 0);
    A('moths', (1 - winter) * dryAir * night * (rid === 'market' || rid === 'lake' ? 0.8 : 0.3) * (1 - b.forest * 0.5));
    // local emitters within 400 m
    for (const [id, list] of this.local) {
      let k = 0;
      for (const em of this.emitters) if (em.effect === id) {
        const e = list[k++]!;
        e.set(em.pos.distanceTo(cam) < 400 ? em.amount * s : 0, em.pos);
      }
    }
  }
}
