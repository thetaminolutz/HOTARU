/**
 * Rowing (SPEC §8, §21): the moored rowboat at the Tomoshibi pier. Forward/back are strokes,
 * left/right turn; the boat glides and slows on its own. It stays on open water (the lake, the
 * sea, wide rivers) and you step ashore wherever there's a pier or a bank close by.
 */
import * as THREE from 'three';

export type WaterProbe = { terrain(x: number, z: number): number; water(x: number, z: number): number; ground(x: number, z: number): number };

const MAX = 2.6, TURN = 0.9, DRAG = 0.55, DRAFT = 0.35;

export class Rowboat {
  x = 0; z = 0; heading = 0; speed = 0; turn = 0; stroke = 0;
  private phase = 0;
  /** stroke sound hook (once per pull) */
  onStroke: (() => void) | null = null;

  constructor(private q: WaterProbe) {}

  board(x: number, z: number, heading: number): void { this.x = x; this.z = z; this.heading = heading; this.speed = 0; this.turn = 0; }

  /** deep enough for the boat at (x, z) */
  floats(x: number, z: number): boolean { return this.q.water(x, z) - this.q.terrain(x, z) > DRAFT; }

  update(dt: number, moveZ: number, moveX: number): void {
    // a pull every ~1.2 s while rowing; speed comes in surges
    if (Math.abs(moveZ) > 0.1) {
      const before = this.phase;
      this.phase += dt / 1.2;
      const k = Math.sin(this.phase * Math.PI * 2);
      this.stroke = k;
      if (Math.floor(before) !== Math.floor(this.phase)) this.onStroke?.();
      this.speed += Math.sign(moveZ) * Math.max(0, k) * 2.4 * dt * Math.abs(moveZ);
    } else this.stroke *= Math.exp(-dt * 3);
    this.speed = THREE.MathUtils.clamp(this.speed, -MAX * 0.5, MAX);
    this.speed *= Math.exp(-DRAG * dt);
    this.turn += (-moveX * TURN - this.turn) * (1 - Math.exp(-dt * 2.5));
    this.heading += this.turn * dt * (0.35 + Math.min(1, Math.abs(this.speed)));
    const nx = this.x + Math.sin(this.heading) * this.speed * dt, nz = this.z + Math.cos(this.heading) * this.speed * dt;
    // bow probe: bump softly off shallows
    const bx = nx + Math.sin(this.heading) * 2 * Math.sign(this.speed || 1), bz = nz + Math.cos(this.heading) * 2 * Math.sign(this.speed || 1);
    if (this.floats(nx, nz) && this.floats(bx, bz)) { this.x = nx; this.z = nz; }
    else this.speed *= -0.25;
  }

  /** Eye position (seated in the middle). */
  eye(out: THREE.Vector3, t: number): THREE.Vector3 {
    return out.set(this.x, this.q.water(this.x, this.z) + 1.15 + Math.sin(t * 1.1) * 0.03, this.z);
  }

  /** A spot to step ashore near the boat, or null (piers and gentle banks). */
  landing(): THREE.Vector3 | null {
    const w = this.q.water(this.x, this.z);
    let best: THREE.Vector3 | null = null, bd = 1e9;
    for (let a = 0; a < 16; a++) for (const d of [1.6, 2.4, 3.2, 4]) {
      const ang = (a / 16) * Math.PI * 2, x = this.x + Math.sin(ang) * d, z = this.z + Math.cos(ang) * d;
      const g = this.q.ground(x, z);
      if (g > w + 0.05 && g < w + 1.6 && d < bd) { bd = d; best = new THREE.Vector3(x, g, z); }
    }
    return best;
  }
}
