/**
 * Fishing (SPEC §21): cast, wait and watch the float (small nibbles, ripples), then a bite —
 * press in time to set the hook and reel in gently. Missing a bite costs nothing: the fish
 * comes back. There is no line to break and no fail state. 30 species by water, hour, season
 * and weather; each catch is recorded with its size, then released or kept for a villager.
 */
import * as THREE from 'three';
import { pickFish, type FishDef, type Water } from './data/fish';
import { litMaterial } from '../render/materials';
import { boxUV, mergeGeoms } from '../buildings/kit';

export type FishState = 'idle' | 'cast' | 'wait' | 'bite' | 'reel' | 'landed';

export class Fishing {
  state: FishState = 'idle';
  t = 0;
  /** float position on the water */
  readonly float = new THREE.Vector3();
  water: Water = 'lake';
  /** reel progress 0..1 */
  reel = 0;
  fish: FishDef | null = null;
  size = 0;
  /** the last message for the HUD */
  note = '';
  readonly mesh: THREE.Mesh;
  private waitFor = 5;
  private line: THREE.Line;
  /** rod tip in world space (set by the game each frame) */
  readonly tip = new THREE.Vector3();

  /** Bend the line from the rod tip down to the float. */
  private drawLine(): void {
    const a = this.line.geometry.getAttribute('position') as THREE.BufferAttribute, m = this.mesh.position;
    for (let i = 0; i < 9; i++) {
      const k = i / 8, sag = Math.sin(k * Math.PI) * 0.4 * (this.state === 'reel' ? 0.2 : 1);
      a.setXYZ(i, (this.tip.x - m.x) * (1 - k), (this.tip.y - m.y) * (1 - k) * (1 - k) - sag * (1 - k) + 0.1 * k, (this.tip.z - m.z) * (1 - k));
    }
    a.needsUpdate = true;
  }
  private nibbleT = 0;
  private from = new THREE.Vector3();
  /** splash / plop hooks */
  onPlop: ((pos: THREE.Vector3, big: boolean) => void) | null = null;

  constructor() {
    const g = mergeGeoms([
      boxUV(0.08, 0.06, 0.08, 1, [0.85, 0.15, 0.1]).translate(0, 0.03, 0),
      boxUV(0.08, 0.05, 0.08, 1, [0.95, 0.95, 0.9]).translate(0, -0.025, 0),
      boxUV(0.015, 0.1, 0.015, 1, [0.2, 0.2, 0.2]).translate(0, 0.1, 0),
    ]);
    this.mesh = new THREE.Mesh(g.scale(2, 2, 2), litMaterial({ outline: true }));
    this.mesh.name = 'fishing-float';
    this.mesh.visible = false;
    // the line: rod tip → float, sagging a little
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9 * 3), 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xe8e0d0, transparent: true, opacity: 0.7 }));
    this.line.frustumCulled = false;
    this.mesh.add(this.line);
  }

  get active(): boolean { return this.state !== 'idle'; }

  /** Cast toward a point on the water. */
  cast(from: THREE.Vector3, to: THREE.Vector3, water: Water): void {
    this.from.copy(from); this.float.copy(to); this.water = water;
    this.state = 'cast'; this.t = 0; this.reel = 0; this.fish = null; this.note = '';
    this.waitFor = 3 + Math.random() * 9;
    this.mesh.visible = true;
  }

  stop(): void { this.state = 'idle'; this.mesh.visible = false; this.note = ''; }

  /** One step. `press` is the interact edge; returns a landed fish once. */
  update(dt: number, press: boolean, hold: boolean, hour: number, season: number, rain: boolean): FishDef | null {
    this.t += dt;
    let bob = 0;
    switch (this.state) {
      case 'cast': {
        const k = Math.min(1, this.t / 0.8);
        this.mesh.position.lerpVectors(this.from, this.float, k).setY(THREE.MathUtils.lerp(this.from.y, this.float.y, k) + Math.sin(k * Math.PI) * 2.5);
        this.drawLine();
        if (k >= 1) { this.state = 'wait'; this.t = 0; this.onPlop?.(this.float, false); this.note = 'Wait, and watch the float.'; }
        return null;
      }
      case 'wait':
        this.nibbleT -= dt;
        if (this.nibbleT < 0 && this.t > 1.5) { this.nibbleT = 1.5 + Math.random() * 2.5; bob = -0.03; }
        bob += Math.sin(this.t * 2.1) * 0.012;
        if (press) { this.stop(); this.note = 'You reel in the line.'; return null; }
        if (this.t > this.waitFor) {
          this.state = 'bite'; this.t = 0;
          this.fish = pickFish(this.water, hour, season, rain, Math.random());
          this.onPlop?.(this.float, true);
          this.note = 'A bite!';
        }
        break;
      case 'bite':
        bob = -0.12 + Math.sin(this.t * 18) * 0.03;
        if (press) { this.state = 'reel'; this.t = 0; this.note = 'Hold to reel it in gently.'; }
        else if (this.t > 1.6) { this.state = 'wait'; this.t = 0; this.waitFor = 3 + Math.random() * 6; this.note = 'It slipped away. It will be back.'; }
        break;
      case 'reel': {
        // hold to reel; the fish pulls back in waves, letting go a moment is fine
        const pull = 0.5 + 0.5 * Math.sin(this.t * 2.3);
        this.reel = Math.max(0, Math.min(1, this.reel + (hold || press ? 0.32 - 0.18 * pull : -0.04) * dt));
        bob = -0.05 * pull;
        this.float.lerp(this.from.clone().setY(this.float.y), (hold ? 0.12 : 0) * dt);
        if (this.reel >= 1) {
          const f = this.fish!;
          this.size = Math.round(f.size[0] + (f.size[1] - f.size[0]) * Math.pow(Math.random(), 1.6));
          this.state = 'landed'; this.t = 0; this.mesh.visible = false;
          this.note = '';
          return f;
        }
        break;
      }
      case 'landed':
        if (press || this.t > 6) this.stop();
        return null;
      default: return null;
    }
    this.mesh.position.copy(this.float).setY(this.float.y + bob);
    this.drawLine();
    return null;
  }
}

/** What kind of water is at (x, z) for fishing. */
export function waterKind(x: number, z: number, terrain: number, special: number, inPond: boolean, river: boolean, level: number): Water {
  if (inPond) return level > 200 ? 'mountain' : 'pond';
  if (river) return level > 150 ? 'mountain' : 'river';
  if (special === 7) return 'marsh';
  if (x > 3000 && terrain < -1) return 'sea';
  if (level > 200) return 'mountain';
  return Math.hypot(x, z) < 1200 ? 'lake' : 'sea';
}
