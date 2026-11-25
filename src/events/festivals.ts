/**
 * Festivals (SPEC §22): the scenery, lights and crowd spot of each festival while it runs.
 * - Hanami: picnic blankets under the blossoms of Sakuraoka, lantern poles in a ring, petals.
 * - Lantern & Firefly Festival: food stalls along the Tomoshibi shore, a yagura with lanterns
 *   and a taiko drum, a hundred floating lanterns (tōrō nagashi) drifting out on the lake,
 *   fireworks reflected in the water.
 * - Tsukimi: an offering table with dumplings and pampas grass on the hill above Inaho.
 * - Snow Lantern Night: hundreds of candle-lit snow lanterns along the streets of Yukemuri.
 * - New Year: the temple bell of Kumoji rings 108 times.
 * Scenery is built the first time a festival is near and hidden afterwards; floating lanterns
 * and fireworks are glowing points updated on the CPU (a few hundred).
 */
import * as THREE from 'three';
import { boxUV, chochin, andon, mergeGeoms } from '../buildings/kit';
import { litMaterial, ensureColor } from '../render/materials';
import { COMMON_PARS, FOG_FN, NOISE, SKY_FN } from '../render/shaders/common';
import { U } from '../render/uniforms';
import { createRng } from '../core/rng';
import { FESTIVALS, type FestivalDef, type FestivalId } from './calendar';
import type { GameWorld } from '../scene/gameWorld';

type Light = { pos: THREE.Vector3; color: THREE.Color; radius: number; intensity: number; halo: number; phase: number };
const AMBER = new THREE.Color(1, 0.6, 0.28);

const GLOW_VERT = /* glsl */ `
${COMMON_PARS}
attribute vec4 aCol;
varying vec4 vCol;
varying vec3 vWorldPos;
void main(){
  vCol = aCol;
  vWorldPos = position;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aCol.a < 0.05 ? 0.0 : (-mv.z < 60.0 ? 3.0 : (-mv.z < 300.0 ? 2.0 : 1.0));
}`;
const GLOW_FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
varying vec4 vCol;
varying vec3 vWorldPos;
void main(){
  if (vCol.a < 0.15) discard;
  if (dot(vec4(vWorldPos, 1.0), uClipPlane) < 0.0) discard;
  gl_FragColor = vec4(applyFog(vCol.rgb * (1.5 + 2.0 * vCol.a), vWorldPos), 0.5);
}`;

/** A bag of glowing points the CPU moves. */
class Glow {
  readonly points: THREE.Points;
  readonly pos: Float32Array;
  readonly col: Float32Array;
  constructor(readonly n: number) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG }));
    this.points.frustumCulled = false;
  }
  set(i: number, x: number, y: number, z: number, r: number, g: number, b: number, a: number): void {
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
  }
  flush(): void { this.points.geometry.getAttribute('position').needsUpdate = true; this.points.geometry.getAttribute('aCol').needsUpdate = true; }
}

const FW_BURSTS = 6, FW_SPARKS = 70;
const FW_COLORS: [number, number, number][] = [[1, 0.5, 0.3], [1, 0.85, 0.4], [0.5, 0.8, 1], [1, 0.5, 0.8], [0.6, 1, 0.6], [1, 1, 0.9]];

export class Festivals {
  readonly group = new THREE.Group();
  active: FestivalDef | null = null;
  /** where people gather (for the crowd) */
  spot: THREE.Vector3 | null = null;
  readonly lights: Light[] = [];
  /** the New Year bell: called for each of the 108 strokes */
  onBell: ((n: number) => void) | null = null;
  /** a firework burst (for the sound): position, delay already applied */
  onBoom: ((pos: THREE.Vector3) => void) | null = null;
  private decor = new Map<FestivalId, { group: THREE.Group; spot: THREE.Vector3; lights: Light[] }>();
  private mat = litMaterial({ outline: true, emissive: AMBER, emissiveIntensity: 2.6, flicker: true });
  private floaters: Glow | null = null;
  private floatSeeds: { x: number; z: number; a: number; s: number; t0: number }[] = [];
  private fireworks: Glow | null = null;
  private bursts: { x: number; y: number; z: number; t: number; c: number; boomed: boolean }[] = [];
  private fwT = 0;
  private bells = 0;
  private bellT = 0;
  private r = createRng(0xfe57);
  /** extra floating lanterns after the story's ending */
  brighter = false;

  constructor(private w: GameWorld) { this.group.name = 'festivals'; }

  private ground(x: number, z: number): number { return this.w.groundHeight(x, z); }

  private village(id: string) { return this.w.villages.villages.find((v) => v.layout.def.id === id)?.layout; }

  /** Where each festival happens. */
  spotOf(id: FestivalId): THREE.Vector3 {
    const S = this.w.dock.anchors.shore!;
    const v = (vid: string, dx = 0, dz = 0) => { const L = this.village(vid); const x = (L?.def.x ?? 0) + dx, z = (L?.def.z ?? 0) + dz; return new THREE.Vector3(x, this.ground(x, z), z); };
    switch (id) {
      case 'tanabata': return new THREE.Vector3(S.x + 4, this.ground(S.x + 4, S.z + 12), S.z + 12);
      case 'hanami': return v('sakuraoka', 0, 30);
      case 'tsukimi': return v('inaho', 70, -90);
      case 'yukitoro': return v('yukemuri');
      case 'newYear': { const b = this.w.landmarks.bellPos; return new THREE.Vector3(b.x + 6, this.ground(b.x + 6, b.z + 6), b.z + 6); }
    }
  }

  private build(id: FestivalId): { group: THREE.Group; spot: THREE.Vector3; lights: Light[] } {
    const spot = this.spotOf(id), parts: THREE.BufferGeometry[] = [], lights: Light[] = [];
    const r = createRng(0x5eed ^ id.length * 977);
    const at = (g: THREE.BufferGeometry, x: number, z: number, dy = 0, ry = 0) => { if (ry) g.rotateY(ry); parts.push(g.translate(x, this.ground(x, z) + dy, z)); };
    const lantern = (x: number, y: number, z: number, rgb: [number, number, number] = [1, 0.55, 0.4]) => {
      const g = chochin(0.22, 0.42); const c = g.getAttribute('aColor') as THREE.BufferAttribute;
      for (let i = 0; i < c.count; i++) if (c.getW(i) > 0.5) c.setXYZ(i, rgb[0], rgb[1], rgb[2]);
      parts.push(g.translate(x, y, z));
    };
    const pole = (x: number, z: number, h = 3) => at(boxUV(0.12, h, 0.12, 1, [0.35, 0.22, 0.14]), x, z, h / 2);
    if (id === 'tanabata') {
      // stalls along the shore, each with a striped awning and a lantern
      for (let k = 0; k < 7; k++) {
        const x = spot.x - 24 + k * 7, z = spot.z + 8 + Math.sin(k) * 2, gy = this.ground(x, z);
        at(boxUV(3, 0.9, 1.4, 1, [0.55, 0.38, 0.24]), x, z, 0.45);
        for (let s = 0; s < 5; s++) at(boxUV(0.62, 0.08, 1.9, 1, s % 2 ? [0.92, 0.9, 0.85] : [0.75, 0.2, 0.18]), x - 1.25 + s * 0.62, z, 2.3);
        pole(x - 1.4, z + 0.8, 2.3); pole(x + 1.4, z + 0.8, 2.3);
        lantern(x, gy + 2.1, z + 0.9);
        lights.push({ pos: new THREE.Vector3(x, gy + 2, z + 1), color: AMBER.clone(), radius: 6, intensity: 1.3, halo: 0.6, phase: k });
      }
      // the yagura: a small tower with a taiko on top and lantern strings
      const yx = spot.x + 2, yz = spot.z - 4, gy = this.ground(yx, yz);
      for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) at(boxUV(0.2, 3, 0.2, 1, [0.6, 0.2, 0.15]), yx + dx!, yz + dz!, 1.5);
      at(boxUV(3.6, 0.2, 3.6, 1, [0.55, 0.38, 0.24]), yx, yz, 3);
      at(boxUV(3.8, 0.5, 0.06, 1, [0.92, 0.9, 0.85]), yx, yz + 1.85, 2.6); at(boxUV(3.8, 0.5, 0.06, 1, [0.92, 0.9, 0.85]), yx, yz - 1.85, 2.6);
      parts.push(ensureColor(new THREE.CylinderGeometry(0.55, 0.55, 0.7, 10).toNonIndexed(), [0.45, 0.22, 0.12]).rotateZ(Math.PI / 2).translate(yx, gy + 3.5, yz));
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; lantern(yx + Math.cos(a) * 7, gy + 3.4 - Math.abs(Math.sin(k * 0.5)) * 0.6, yz + Math.sin(a) * 7, k % 3 ? [1, 0.55, 0.4] : [1, 0.9, 0.7]); }
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; pole(yx + Math.cos(a) * 7.4, yz + Math.sin(a) * 7.4, 3.6); }
      lights.push({ pos: new THREE.Vector3(yx, gy + 3.5, yz), color: AMBER.clone(), radius: 12, intensity: 1.6, halo: 0.8, phase: 1 });
    } else if (id === 'hanami') {
      for (let k = 0; k < 9; k++) {
        const a = r.range(0, Math.PI * 2), d = r.range(4, 16), x = spot.x + Math.cos(a) * d, z = spot.z + Math.sin(a) * d;
        at(boxUV(2.2, 0.03, 1.8, 1, k % 2 ? [0.3, 0.45, 0.75] : [0.85, 0.3, 0.3]), x, z, 0.03, a);
        at(boxUV(0.5, 0.25, 0.35, 1, [0.25, 0.15, 0.1]), x + 0.4, z, 0.13, a);
      }
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, x = spot.x + Math.cos(a) * 18, z = spot.z + Math.sin(a) * 18; pole(x, z, 2.8); lantern(x, this.ground(x, z) + 2.7, z, [1, 0.75, 0.8]); }
      lights.push({ pos: spot.clone().setY(spot.y + 3), color: new THREE.Color(1, 0.7, 0.75), radius: 20, intensity: 1.2, halo: 0, phase: 0 });
    } else if (id === 'tsukimi') {
      // a low table: a pyramid of white dumplings, a vase of pampas grass
      at(boxUV(1.4, 0.4, 0.8, 1, [0.5, 0.32, 0.2]), spot.x, spot.z, 0.2);
      let n = 0;
      for (let lv = 0; lv < 3; lv++) for (let i = 0; i < 3 - lv; i++) for (let j = 0; j < 3 - lv; j++) { n++; parts.push(ensureColor(new THREE.SphereGeometry(0.07, 6, 4).toNonIndexed(), [0.97, 0.96, 0.92]).translate(spot.x - 0.3 + (i + lv * 0.5) * 0.14, spot.y + 0.47 + lv * 0.12, spot.z - 0.14 + (j + lv * 0.5) * 0.14)); }
      void n;
      at(boxUV(0.2, 0.35, 0.2, 1, [0.35, 0.3, 0.28]), spot.x + 0.4, spot.z, 0.57);
      for (let k = 0; k < 7; k++) { const g = boxUV(0.03, 1.1, 0.03, 1, [0.85, 0.78, 0.55]); g.rotateZ((k - 3) * 0.12); g.translate(0, 0.55, 0); parts.push(g.translate(spot.x + 0.4, spot.y + 0.7, spot.z)); }
      for (let k = 0; k < 8; k++) { const a = r.range(0, Math.PI * 2), d = r.range(3, 10); at(boxUV(1.6, 0.03, 1.3, 1, [0.5, 0.4, 0.3]), spot.x + Math.cos(a) * d, spot.z + Math.sin(a) * d, 0.03, a); }
      for (let k = 0; k < 6; k++) { const x = spot.x - 6 + k * 2.4, z = spot.z - 3; parts.push(andon().translate(x, this.ground(x, z), z)); }
      lights.push({ pos: spot.clone().setY(spot.y + 1.2), color: AMBER.clone(), radius: 9, intensity: 1.1, halo: 0.5, phase: 0 });
    } else if (id === 'yukitoro') {
      // snow lanterns: little white domes with a candle window, along every street
      const L = this.village('yukemuri');
      const pts: [number, number][] = [];
      for (const st of L?.streets ?? []) for (let i = 0; i < st.length; i++) { const [x, z] = st[i]!; pts.push([x + 1.8, z + 0.6], [x - 1.8, z - 0.6]); }
      pts.slice(0, 300).forEach(([x, z]) => {
        const gy = this.ground(x, z);
        parts.push(ensureColor(new THREE.SphereGeometry(0.22, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(), [0.95, 0.96, 1]).translate(x, gy, z));
        parts.push(boxUV(0.09, 0.09, 0.09, 1, [1, 0.7, 0.35], 1).translate(x, gy + 0.1, z + 0.17));
      });
      lights.push({ pos: spot.clone().setY(spot.y + 1), color: AMBER.clone(), radius: 40, intensity: 0.9, halo: 0, phase: 0 });
    } else if (id === 'newYear') {
      for (let k = 0; k < 10; k++) { const x = spot.x - 10 + k * 2.2, z = spot.z + 4; pole(x, z, 2.4); lantern(x, this.ground(x, z) + 2.4, z, [1, 0.95, 0.85]); }
      lights.push({ pos: spot.clone().setY(spot.y + 2), color: AMBER.clone(), radius: 14, intensity: 1.2, halo: 0.5, phase: 0 });
    }
    const group = new THREE.Group();
    group.name = 'festival-' + id;
    if (parts.length) { const m = new THREE.Mesh(mergeGeoms(parts), this.mat); m.userData.castShadow = true; group.add(m); }
    this.group.add(group);
    return { group, spot, lights };
  }

  /** The festival for now (from the calendar) → scenery, lights, effects. */
  update(f: FestivalDef | null, hour: number, player: THREE.Vector3, dt: number, elapsed: number): void {
    this.active = f;
    const near = f ? this.spotOf(f.id).distanceTo(player) < 900 : false;
    for (const [id, d] of this.decor) d.group.visible = !!f && f.id === id && near;
    this.lights.length = 0;
    this.spot = null;
    if (f && near) {
      const d = this.decor.get(f.id) ?? this.decor.set(f.id, this.build(f.id)).get(f.id)!;
      this.spot = d.spot;
      if (d.spot.distanceTo(player) < 300) this.lights.push(...d.lights);
    }
    const night = hour > 18.5 || hour < 4.5;
    this.updateFloaters(f?.id === 'tanabata' && near && night, elapsed);
    this.updateFireworks(f?.id === 'tanabata' && near && hour > 20 && hour < 23, dt, elapsed);
    // New Year: 108 strokes from 23:00, one every ~25 game-seconds
    if (f?.id === 'newYear' && hour >= 23 && this.bells < 108) {
      this.bellT -= dt;
      if (this.bellT < 0) { this.bellT = 2.2; this.bells++; this.onBell?.(this.bells); }
    }
    if (f?.id !== 'newYear') this.bells = 0;
  }

  /** Floating lanterns (tōrō nagashi): set out from the pier, drifting slowly across the lake. */
  private updateFloaters(on: boolean, t: number): void {
    const N = this.brighter ? 240 : 140;
    if (!this.floaters) {
      this.floaters = new Glow(240);
      this.group.add(this.floaters.points);
      for (let i = 0; i < 240; i++) this.floatSeeds.push({ x: this.r.range(-6, 6), z: this.r.range(-4, 4), a: this.r.range(-0.7, 0.7), s: this.r.range(0.08, 0.2), t0: this.r.range(0, 400) });
    }
    const F = this.floaters;
    F.points.visible = on;
    if (!on) return;
    const pe = this.w.dock.anchors.pierEnd!;
    for (let i = 0; i < 240; i++) {
      const s = this.floatSeeds[i]!, age = (t + s.t0) % 900, d = age * s.s;
      const x = pe.x + s.x + Math.sin(s.a) * d + Math.sin(age * 0.05 + i) * 1.5, z = pe.z - 3 + s.z - Math.cos(s.a) * d;
      const vis = i < N && this.w.world.height(x, z) < -0.3 ? Math.min(1, age / 20) : 0;
      const flick = 0.75 + 0.25 * Math.sin(t * 7 + i * 3);
      F.set(i, x, 0.12, z, 1, 0.55 + (i % 3) * 0.08, 0.25, vis * flick);
    }
    F.flush();
  }

  /** Fireworks over the lake, one burst every couple of seconds. */
  private updateFireworks(on: boolean, dt: number, t: number): void {
    if (!this.fireworks) { this.fireworks = new Glow(FW_BURSTS * FW_SPARKS); this.group.add(this.fireworks.points); }
    const F = this.fireworks;
    F.points.visible = on;
    if (!on) return;
    this.fwT -= dt;
    if (this.fwT < 0) {
      this.fwT = 1.2 + this.r.next() * 2.2;
      const pe = this.w.dock.anchors.pierEnd!;
      const b = { x: pe.x + this.r.range(-120, 120), y: this.r.range(70, 130), z: pe.z - this.r.range(150, 320), t, c: this.r.int(0, FW_COLORS.length), boomed: false };
      this.bursts.push(b);
      if (this.bursts.length > FW_BURSTS) this.bursts.shift();
    }
    for (let k = 0; k < FW_BURSTS; k++) {
      const b = this.bursts[k];
      for (let i = 0; i < FW_SPARKS; i++) {
        const j = k * FW_SPARKS + i;
        if (!b) { F.set(j, 0, -100, 0, 0, 0, 0, 0); continue; }
        const age = t - b.t;
        if (age > 0.4 && !b.boomed) { b.boomed = true; this.onBoom?.(new THREE.Vector3(b.x, b.y, b.z)); }
        // a sphere of sparks: fixed directions per spark, falling and fading
        const u = ((i * 0.618) % 1) * 2 - 1, ph = i * 2.399, rr = Math.sqrt(1 - u * u);
        const sp = 22 * Math.min(1, age * 2.5);
        const x = b.x + Math.cos(ph) * rr * sp, y = b.y + u * sp - age * age * 3, z = b.z + Math.sin(ph) * rr * sp;
        const a = age < 0.25 ? 0 : Math.max(0, 1 - (age - 0.25) / 2.6) * (i % 4 === 0 ? 1 : 0.85);
        const c = FW_COLORS[b.c]!;
        F.set(j, x, y, z, c[0], c[1], c[2], a);
      }
    }
    F.flush();
  }
}

export { FESTIVALS };
