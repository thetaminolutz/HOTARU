/**
 * The ending moment (SPEC §19) — not a game end. With most of the story pieced together, the
 * masked stranger gives you the thousandth lantern. On the night of the Lantern & Firefly
 * Festival you float it from the end of the pier: the fireflies gather into a path across the
 * lake to the castle, the sister's spirit walks it home, the stranger takes off the mask, and
 * the castle garden blooms. Afterwards the world is a little brighter: more lanterns, more
 * fireflies, lantern spirits every night.
 */
import * as THREE from 'three';
import type { Game } from '../app/game';
import { clock } from '../core/clock';
import { COMMON_PARS, FOG_FN, NOISE, SKY_FN } from '../render/shaders/common';
import { U } from '../render/uniforms';
import { boxUV, chochin, mergeGeoms } from '../buildings/kit';
import { litMaterial, ensureColor } from '../render/materials';
import { portrait as portraitOf } from '../people/portrait';

/** tablets needed before the stranger hands over the lantern */
export const LORE_NEEDED = 15;

const PATH_N = 420;

const VERT = /* glsl */ `
${COMMON_PARS}
attribute vec4 aSeed;
uniform float uShow;
uniform vec3 uFrom, uTo;
varying float vA;
varying vec3 vWorldPos;
void main(){
  float k = aSeed.x;
  vec3 p = mix(uFrom, uTo, k);
  p.y += sin(k * 3.14159) * 60.0 * smoothstep(0.55, 1.0, k) + 1.2;
  p += vec3(sin(uTime * 1.3 + aSeed.y * 40.0), sin(uTime * 0.9 + aSeed.z * 30.0) * 0.4, cos(uTime * 1.1 + aSeed.y * 25.0)) * (0.6 + 2.0 * aSeed.w);
  vA = smoothstep(k, k + 0.05, uShow) * (0.6 + 0.4 * sin(uTime * 2.0 + aSeed.y * 50.0));
  vWorldPos = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vA < 0.05 ? 0.0 : (-mv.z < 80.0 ? 2.0 : 1.0);
}`;
const FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
varying float vA;
varying vec3 vWorldPos;
void main(){
  if (vA < 0.3) discard;
  gl_FragColor = vec4(applyFog(vec3(0.85, 1.0, 0.45) * (2.0 + vA), vWorldPos), 0.5);
}`;

export class Ending {
  done = false;
  /** the sequence time (s) while it plays, else −1 */
  t = -1;
  /** shown in the HUD as brush text */
  line: { text: string; t: number } | null = null;
  private path: THREE.Points;
  private lantern: THREE.Mesh;
  private sister: THREE.Mesh;
  private sisterMat: THREE.ShaderMaterial;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private saved: { mode: Game['controller']['mode']; yaw: number; pitch: number } | null = null;
  onChime: (() => void) | null = null;

  constructor(private g: Game, ghost: (rgb: [number, number, number]) => THREE.ShaderMaterial, figure: (h: number) => THREE.BufferGeometry) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(PATH_N * 3), seed = new Float32Array(PATH_N * 4);
    for (let i = 0; i < PATH_N; i++) { seed[i * 4] = i / PATH_N; seed[i * 4 + 1] = Math.random(); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = Math.random(); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.path = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: { ...U, uShow: { value: 0 }, uFrom: { value: this.from }, uTo: { value: this.to } }, vertexShader: VERT, fragmentShader: FRAG }));
    this.path.frustumCulled = false; this.path.visible = false;
    this.lantern = new THREE.Mesh(mergeGeoms([chochin(0.25, 0.45), ensureColor(boxUV(0.5, 0.06, 0.5, 1, [0.4, 0.28, 0.18]))]), litMaterial({ emissive: new THREE.Color(1, 0.75, 0.4), emissiveIntensity: 3.5, flicker: true }));
    this.lantern.visible = false;
    this.sisterMat = ghost([1, 0.85, 0.6]);
    this.sister = new THREE.Mesh(figure(1.45), this.sisterMat);
    this.sister.visible = false;
    g.world.scene.add(this.path, this.lantern, this.sister);
  }

  /** Can the lantern be floated right now (at the pier end, festival night, lantern in hand)? */
  ready(festivalId: string | undefined): boolean {
    return !this.done && this.t < 0 && festivalId === 'tanabata' && clock.hour >= 19.5 && this.g.adv.inv.slots.includes('lantern1000');
  }

  start(): void {
    const g = this.g, c = g.controller, pe = g.world.dock.anchors.pierEnd!, K = g.world.landmarks.keepTop;
    g.adv.inv.remove('lantern1000');
    this.t = 0;
    this.from.set(pe.x, 0.3, pe.z - 2);
    this.to.set(K.x, K.y, K.z);
    this.saved = { mode: c.mode, yaw: c.yaw, pitch: c.pitch };
    c.mode = 'fixed';
    c.lookAt(this.from.clone().lerp(this.to, 0.25).setY(6));
    this.lantern.position.copy(this.from);
    this.lantern.visible = true;
    this.path.visible = true;
    this.onChime?.();
  }

  private say(text: string): void { this.line = { text, t: 0 }; }

  update(dt: number): void {
    if (this.line) { this.line.t += dt; if (this.line.t > 9) this.line = null; }
    if (this.t < 0) return;
    const g = this.g, prev = this.t;
    this.t += dt;
    const t = this.t, at = (s: number) => prev < s && t >= s;
    // the lantern drifts out
    const lk = Math.min(1, t / 30);
    this.lantern.position.copy(this.from).lerp(this.to, lk * 0.12).setY(0.25 + Math.sin(t * 1.4) * 0.03);
    (this.path.material as THREE.ShaderMaterial).uniforms.uShow!.value = Math.max(0, (t - 5) / 18);
    if (at(1)) this.say('The lantern drifts out / onto the dark water / and the lake grows still');
    if (at(9)) this.say('One by one the fireflies / come down from the reeds / and draw a path');
    // the sister walks the path home
    const sk = (t - 16) / 26;
    this.sister.visible = sk > 0 && sk < 1;
    if (this.sister.visible) {
      const p = this.from.clone().lerp(this.to, 0.08 + sk * 0.55);
      p.y = Math.max(0.05, p.y < 2 ? 0.05 : p.y - 1.2);
      this.sister.position.copy(p);
      this.sister.rotation.y = Math.atan2(this.to.x - this.from.x, this.to.z - this.from.z);
      this.sisterMat.uniforms.uFade!.value = Math.min(1, sk * 5, (1 - sk) * 4);
      g.controller.lookAt(p.clone().setY(p.y + 1));
    }
    if (at(17)) { this.say('A small figure / walking on the light / she does not look back'); this.onChime?.(); }
    if (at(32)) this.say('A thousand lanterns / for a thousand nights / she was always on her way');
    if (at(44)) {
      // the masked stranger takes off the mask
      const m = g.world.people.people.find((p) => p.wanderer?.id === 'masked');
      g.controller.mode = 'walk';
      if (m) {
        m.unmasked = true;
        const pe = g.world.dock.anchors.pierEnd!;
        m.pos.set(pe.x - 1.5, pe.y, pe.z + 2);
        g.dialogue = { who: m, name: 'Haruto', title: 'the last lantern keeper', portrait: portraitOf(m), lines: [
          '...(The stranger stands beside you and slowly takes off the fox mask.)',
          'My family kept the promise for three hundred years. One lantern every night.',
          'I wore her mask so someone would remember her face. You found her story, piece by piece.',
          'She is home now. Thank you. The lanterns can be lit for joy from now on.',
        ], index: 0, shown: 0 };
      }
    }
    if (at(48)) {
      g.world.landmarks.setBloom(1);
      g.onToast?.('Far away, the garden of Kagejo is in bloom.');
      this.onChime?.();
    }
    if (t > 50 && !g.dialogue) this.finish();
  }

  private finish(): void {
    const c = this.g.controller;
    this.t = -1;
    this.done = true;
    this.lantern.visible = false; this.sister.visible = false;
    (this.path.material as THREE.ShaderMaterial).uniforms.uShow!.value = 1;
    this.path.visible = false;
    if (this.saved) { c.mode = this.saved.mode === 'fixed' ? 'walk' : this.saved.mode; }
    this.say('The world goes on / a little brighter now / the lanterns, for joy');
    this.g.world.secrets.discoverId('spirit-sister');
  }
}


