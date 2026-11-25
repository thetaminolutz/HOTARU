/**
 * M1 camera controller: calm first-person walk on terrain and decks, or free fly (debug).
 * The full movement set (jog, jump, wade, swim, sit, …) arrives in M3.
 */
import * as THREE from 'three';
import type { InputState } from './input';
import { clamp } from '../core/math';

export type ControlMode = 'walk' | 'fly' | 'drift' | 'fixed';

export class Controller {
  readonly position = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  mode: ControlMode = 'walk';
  eye = 1.6;
  walkSpeed = 2.2;
  jogSpeed = 4.8;
  flySpeed = 18;
  private bob = 0;
  private velocity = new THREE.Vector3();

  constructor(private ground: (x: number, z: number) => number, private walkable: (x: number, z: number) => boolean) {}

  lookAt(target: THREE.Vector3): void {
    const d = target.clone().sub(this.position);
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  }

  update(dt: number, input: InputState): void {
    if (this.mode === 'fixed' || this.mode === 'drift') return;
    this.yaw += input.lookDX;
    this.pitch = clamp(this.pitch + input.lookDY, -1.45, 1.45);
    input.lookDX = 0; input.lookDY = 0;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const want = new THREE.Vector3().addScaledVector(fwd, input.moveZ).addScaledVector(right, input.moveX);
    if (this.mode === 'fly') {
      const sp = this.flySpeed * (input.jog ? 3 : 1);
      const f3 = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      this.position.addScaledVector(f3, input.moveZ * sp * dt).addScaledVector(right, input.moveX * sp * dt);
      this.position.y += input.up * sp * dt;
      this.position.y = Math.max(this.position.y, this.ground(this.position.x, this.position.z) + 0.5);
      return;
    }
    const speed = input.jog ? this.jogSpeed : this.walkSpeed;
    // gentle acceleration for a calm feel
    this.velocity.lerp(want.multiplyScalar(speed), 1 - Math.exp(-dt * 8));
    const nx = this.position.x + this.velocity.x * dt, nz = this.position.z + this.velocity.z * dt;
    if (this.walkable(nx, nz)) { this.position.x = nx; this.position.z = nz; }
    else if (this.walkable(nx, this.position.z)) this.position.x = nx;
    else if (this.walkable(this.position.x, nz)) this.position.z = nz;
    const g = this.ground(this.position.x, this.position.z);
    const moving = this.velocity.length();
    this.bob += dt * moving * 2.2;
    const targetY = g + this.eye + Math.sin(this.bob * 2) * 0.03 * Math.min(1, moving / 2);
    this.position.y += (targetY - this.position.y) * (1 - Math.exp(-dt * 12));
  }

  apply(cam: THREE.PerspectiveCamera, breathe = 0): void {
    cam.position.copy(this.position);
    cam.rotation.set(this.pitch + breathe, this.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
  }
}
