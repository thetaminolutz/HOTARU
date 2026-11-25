/**
 * Player controller (SPEC §8): calm first-person movement — walk, jog (no stamina), slow walk,
 * modest jump, auto step-up onto ledges ≤ 0.6 m, wading, calm swimming (no drowning), gentle
 * snow sliding, sitting and lying down, soft landings (no fall damage). Camera feel: head bob,
 * idle breathing, slight lean into turns, landing dip.
 */
import * as THREE from 'three';
import type { InputState } from './input';
import { clamp, lerp } from '../core/math';

export type ControlMode = 'walk' | 'fly' | 'drift' | 'fixed' | 'boat';
export type Pose = 'stand' | 'air' | 'wade' | 'swim' | 'slide' | 'sit' | 'lie';

export type Collider = { x0: number; z0: number; x1: number; z1: number; top: number };

export type WorldQuery = {
  /** Walkable surface height (terrain or deck). */
  ground(x: number, z: number, feet?: number): number;
  /** Raw terrain height (lake/sea bed below water). */
  terrain(x: number, z: number): number;
  /** true if a deck (pier, engawa) is under (x, z). */
  onDeck(x: number, z: number): boolean;
  /** Snowy ground for sliding. */
  snowy(x: number, z: number, h: number): boolean;
  colliders: Collider[];
  /** Water surface at (x, z): rivers and ponds above the lake (optional; default the lake/sea at 0). */
  water?(x: number, z: number): number;
  /** Push a body (radius r) out of obstacles; how much a bush slows it (0..1). */
  collide?(x: number, z: number, feet: number, r: number): { x: number; z: number; slow: number };
  /** Does a body (radius r) at (x, z) overlap anything solid? */
  blocked?(x: number, z: number, feet: number, r: number): boolean;
};

const WATER = 0;
const GRAVITY = 13;
const JUMP_V = 4.4;
const STEP_UP = 0.6;
const MAX_CLIMB = 0.95; // rise per metre of travel that can still be walked up (~43°)
/** the player's body radius for collisions (m): wide enough that the near plane never reaches a wall */
const BODY_R = 0.36;

export class Controller {
  readonly position = new THREE.Vector3();
  /** Feet height (position.y is the eye). */
  feet = 0;
  yaw = 0;
  pitch = 0;
  mode: ControlMode = 'walk';
  pose: Pose = 'stand';
  eye = 1.6;
  walkSpeed = 2.2;
  jogSpeed = 4.8;
  slowSpeed = 1.1;
  flySpeed = 18;
  headBob = true;
  readonly vel = new THREE.Vector3();
  private bob = 0;
  private dip = 0;
  private dipV = 0;
  private lean = 0;
  private t = 0;
  private eyeNow = 1.6;
  private fallStart = 0;
  /** Smooth turn target (Pencil tap "look there"). */
  private turnTo: { yaw: number; pitch: number } | null = null;
  /** Called on hard landings so the UI can do a soft fade. */
  onSoftLanding: (() => void) | null = null;
  /** Sound hooks: a footfall (speed m/s), jump, landing (impact m/s), swim stroke. */
  onStep: ((speed: number) => void) | null = null;
  onJump: (() => void) | null = null;
  onLand: ((impact: number) => void) | null = null;
  onStroke: (() => void) | null = null;
  private stepPhase = 0;
  /** Hint for the HUD: what interact would do now. */
  sitHint: 'sit' | 'lie' | 'stand' | null = null;

  constructor(private q: WorldQuery) {}

  /** The water surface where the player stands (lake/sea at 0, or a river or pond above it). */
  waterLevel(): number {
    return Math.max(WATER, this.q.water?.(this.position.x, this.position.z) ?? -Infinity);
  }

  lookAt(target: THREE.Vector3): void {
    const d = target.clone().sub(this.position);
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  }

  /** Turn smoothly toward a world direction (Apple Pencil tap). */
  turnToward(dir: THREE.Vector3): void {
    this.turnTo = { yaw: Math.atan2(-dir.x, -dir.z), pitch: clamp(Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), -1.2, 1.2) };
  }

  /** Place the player standing at (x, z). */
  placeAt(x: number, z: number): void {
    this.feet = this.q.ground(x, z);
    this.position.set(x, this.feet + this.eye, z);
    this.vel.set(0, 0, 0);
    this.pose = 'stand';
  }

  /** Sit at a spot facing a direction (benches, pier edge). */
  sitAt(x: number, z: number, y: number, yaw: number): void {
    this.position.x = x; this.position.z = z; this.feet = y;
    this.yaw = yaw; this.pitch = -0.05;
    this.vel.set(0, 0, 0);
    this.pose = 'sit';
  }

  get sitting(): boolean { return this.pose === 'sit' || this.pose === 'lie'; }

  /** Interact with "nothing in particular": stand → sit → lie → stand. */
  cyclePose(): void {
    if (this.pose === 'stand' || this.pose === 'wade') this.pose = 'sit';
    else if (this.pose === 'sit') { this.pose = 'lie'; this.pitch = 0.9; }
    else if (this.pose === 'lie') { this.pose = 'stand'; this.pitch = 0; }
  }

  update(dt: number, input: InputState): void {
    this.t += dt;
    if (this.mode === 'fixed' || this.mode === 'drift') return;

    // look
    if (this.turnTo) {
      let dy = this.turnTo.yaw - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const k = 1 - Math.exp(-dt * 6);
      this.yaw += dy * k;
      this.pitch += (this.turnTo.pitch - this.pitch) * k;
      if (Math.abs(dy) < 0.003 && Math.abs(this.turnTo.pitch - this.pitch) < 0.003) this.turnTo = null;
    }
    if (input.lookDX || input.lookDY) this.turnTo = null;
    const yawRate = input.lookDX / Math.max(dt, 1e-3);
    this.yaw += input.lookDX;
    const pitchMin = this.pose === 'lie' ? 0.2 : -1.45;
    this.pitch = clamp(this.pitch + input.lookDY, pitchMin, 1.45);
    input.lookDX = 0; input.lookDY = 0;
    // in a boat the boat moves you; you only look around
    if (this.mode === 'boat') { this.vel.set(0, 0, 0); return; }

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);

    if (this.mode === 'fly') {
      const sp = this.flySpeed * (input.jog ? 3 : 1);
      const f3 = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      this.position.addScaledVector(f3, input.moveZ * sp * dt).addScaledVector(right, input.moveX * sp * dt);
      this.position.y += input.up * sp * dt;
      this.position.y = Math.max(this.position.y, this.q.ground(this.position.x, this.position.z, this.feet) + 0.5);
      this.feet = this.position.y - this.eye;
      return;
    }

    const moving = Math.abs(input.moveX) + Math.abs(input.moveZ) > 0.05;
    // sitting / lying: movement or jump stands up; time-lapse is handled by the game
    if (this.sitting) {
      this.sitHint = this.pose === 'sit' ? 'lie' : 'stand';
      if (moving || input.jumpPressed) { this.pose = 'stand'; this.pitch = Math.min(this.pitch, 0.3); }
      else { this.applyEye(dt, 0, yawRate); return; }
    }

    const ground = this.q.ground(this.position.x, this.position.z, this.feet);
    const deck = this.q.onDeck(this.position.x, this.position.z);
    const W = this.waterLevel();
    const depth = deck ? 0 : W - this.q.terrain(this.position.x, this.position.z);
    const airborne = this.feet > ground + 0.05 && this.pose !== 'swim';

    // pose from surroundings
    if (!airborne) {
      if (depth > 1.35) this.pose = 'swim';
      else if (depth > 0.3) this.pose = 'wade';
      else if (this.pose !== 'slide') this.pose = 'stand';
    } else this.pose = 'air';

    // horizontal velocity
    let speed = input.jog ? this.jogSpeed : input.slow ? this.slowSpeed : this.walkSpeed;
    if (this.pose === 'wade') speed *= 0.55;
    if (this.pose === 'swim') speed = input.jog ? 1.8 : 1.2;
    const want = new THREE.Vector3().addScaledVector(fwd, input.moveZ).addScaledVector(right, input.moveX).multiplyScalar(speed);
    const accel = this.pose === 'air' ? 1.5 : this.pose === 'swim' ? 2.5 : 8;
    this.vel.x = lerp(this.vel.x, want.x, 1 - Math.exp(-dt * accel));
    this.vel.z = lerp(this.vel.z, want.z, 1 - Math.exp(-dt * accel));

    // gentle slide down snowy slopes
    if (this.pose !== 'air' && this.pose !== 'swim') {
      const e = 1.5;
      const gx = (this.q.terrain(this.position.x + e, this.position.z) - this.q.terrain(this.position.x - e, this.position.z)) / (2 * e);
      const gz = (this.q.terrain(this.position.x, this.position.z + e) - this.q.terrain(this.position.x, this.position.z - e)) / (2 * e);
      const slope = Math.hypot(gx, gz);
      if (!deck && slope > 0.35 && this.q.snowy(this.position.x, this.position.z, ground)) {
        this.pose = 'slide';
        this.vel.x -= gx * 6 * dt; this.vel.z -= gz * 6 * dt;
      } else if (this.pose === 'slide') this.pose = 'stand';
    }

    // move with step-up, slope limit and colliders, axis by axis
    const tryMove = (nx: number, nz: number): boolean => {
      if (this.blocked(nx, nz)) return false;
      const g2 = this.q.ground(nx, nz, this.feet);
      const rise = g2 - this.feet;
      if (this.pose === 'air' || this.pose === 'swim') return rise < STEP_UP || this.feet > g2;
      const dist = Math.hypot(nx - this.position.x, nz - this.position.z);
      if (rise > STEP_UP) return false;
      if (!this.q.onDeck(nx, nz) && rise > 0 && rise / Math.max(dist, 1e-3) > MAX_CLIMB && rise > 0.05) return false;
      return true;
    };
    let nx = this.position.x + this.vel.x * dt, nz = this.position.z + this.vel.z * dt;
    // bump into things: slide along walls, around trunks and posts; bushes slow you down
    if (this.q.collide && (this.mode === 'walk')) {
      const r = this.q.collide(nx, nz, this.feet, BODY_R);
      nx = r.x; nz = r.z;
      // pushing through a bush: at most ~half speed in the thick of it
      if (r.slow > 0) {
        const cap = this.walkSpeed * (1 - 0.5 * r.slow), sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp > cap) { this.vel.x *= cap / sp; this.vel.z *= cap / sp; }
      }
    }
    if (tryMove(nx, nz)) { this.position.x = nx; this.position.z = nz; }
    else if (tryMove(nx, this.position.z)) { this.position.x = nx; this.vel.z *= 0.5; }
    else if (tryMove(this.position.x, nz)) { this.position.z = nz; this.vel.x *= 0.5; }
    else { this.vel.x *= 0.2; this.vel.z *= 0.2; }

    // vertical
    const g = this.q.ground(this.position.x, this.position.z, this.feet);
    if (this.pose === 'swim') {
      const target = this.waterLevel() - 1.25 + Math.sin(this.t * 1.6) * 0.04;
      this.feet = lerp(this.feet, target, 1 - Math.exp(-dt * 3));
      this.vel.y = 0;
    } else {
      if (input.jumpPressed && this.pose !== 'air') { this.vel.y = JUMP_V; this.fallStart = this.feet; this.onJump?.(); }
      if (this.feet > g + 0.02 || this.vel.y > 0) {
        if (this.vel.y <= 0 && this.pose !== 'air') this.fallStart = this.feet;
        this.vel.y -= GRAVITY * dt;
        this.feet += this.vel.y * dt;
        if (this.feet <= g) {
          // landing: camera dip by impact; long falls end in a soft fade (no damage, ever)
          const impact = -this.vel.y;
          this.dipV -= Math.min(impact * 0.05, 0.4);
          if (this.fallStart - g > 9) this.onSoftLanding?.();
          if (impact > 1.5) this.onLand?.(impact);
          this.feet = g; this.vel.y = 0;
        }
      } else {
        // follow the ground smoothly (steps up onto decks are eased)
        const k = g > this.feet ? 1 - Math.exp(-dt * 14) : 1;
        this.feet = lerp(this.feet, g, k);
        this.vel.y = 0;
      }
      // water slows wading
      if (this.feet < this.waterLevel() - 1.3 && !deck) this.pose = 'swim';
    }
    this.sitHint = this.pose === 'stand' && !moving ? 'sit' : null;
    this.applyEye(dt, Math.hypot(this.vel.x, this.vel.z), yawRate);
  }

  private blocked(x: number, z: number): boolean {
    if (this.q.blocked) return this.q.blocked(x, z, this.feet, BODY_R - 0.03);
    for (const c of this.q.colliders) {
      if (x > c.x0 - 0.25 && x < c.x1 + 0.25 && z > c.z0 - 0.25 && z < c.z1 + 0.25 && this.feet < c.top - 0.3) return true;
    }
    return false;
  }

  private applyEye(dt: number, speed: number, yawRate: number): void {
    const targetEye = this.pose === 'sit' ? 0.95 : this.pose === 'lie' ? 0.35 : this.pose === 'swim' ? 1.6 : this.pose === 'wade' ? 1.5 : 1.6;
    this.eyeNow = lerp(this.eyeNow, targetEye, 1 - Math.exp(-dt * 5));
    // landing dip spring
    this.dipV += -this.dip * 60 * dt;
    this.dipV *= Math.exp(-dt * 9);
    this.dip += this.dipV * dt * 10;
    this.bob += dt * speed * 2.2;
    // footfalls at the bottom of each bob (one per step), swim strokes every ~1.4 s
    const grounded = this.pose === 'stand' || this.pose === 'wade' || this.pose === 'slide';
    const ph = Math.floor(this.bob / Math.PI + 0.25);
    if (grounded && speed > 0.4 && this.feet <= this.q.ground(this.position.x, this.position.z, this.feet) + 0.05 && ph !== this.stepPhase) this.onStep?.(speed);
    this.stepPhase = ph;
    if (this.pose === 'swim' && speed > 0.3 && Math.floor(this.t / 1.4) !== Math.floor((this.t - dt) / 1.4)) this.onStroke?.();
    const bobAmt = this.headBob && (this.pose === 'stand' || this.pose === 'wade') ? Math.min(1, speed / 2) : 0;
    const bobY = Math.sin(this.bob * 2) * 0.035 * bobAmt;
    const swimBob = this.pose === 'swim' ? Math.sin(this.t * 1.6) * 0.05 : 0;
    this.position.y = this.feet + this.eyeNow + bobY + swimBob + this.dip;
    // lean into turns, very slightly
    this.lean = lerp(this.lean, clamp(-yawRate * 0.012, -0.03, 0.03), 1 - Math.exp(-dt * 4));
  }

  /** Breathing sway when idle (radians), and the head-bob side sway. */
  apply(cam: THREE.PerspectiveCamera): void {
    const idle = Math.hypot(this.vel.x, this.vel.z) < 0.1;
    const breathe = idle && this.headBob ? Math.sin(this.t * 1.5) * 0.0035 : 0;
    cam.position.copy(this.position);
    cam.rotation.set(this.pitch + breathe, this.yaw, this.lean, 'YXZ');
    cam.updateMatrixWorld();
  }

  /** Camera roll (lean) for the snapped render camera. */
  get roll(): number { return this.mode === 'walk' ? this.lean : 0; }
  /** Idle breathing sway — only while playing on foot (never in shots, drift or fly). */
  get breath(): number { return this.mode === 'walk' && Math.hypot(this.vel.x, this.vel.z) < 0.1 && this.headBob ? Math.sin(this.t * 1.5) * 0.0035 : 0; }
}
