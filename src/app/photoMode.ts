/**
 * Photo mode & sketchbook (SPEC §11): the camera leaves your eyes and floats within ~15 m;
 * FOV, roll, palette filters and frames; time can be paused; the self-portrait shows the
 * traveller where you stand. The shutter puts the framed picture in the journal's album; the
 * sketch button inks the view instead.
 */
import * as THREE from 'three';
import type { Game } from './game';
import { clock } from '../core/clock';
import { FILTERS, FRAMES, fromGL, frame, inkWash, encode, travellerMesh, type Img } from '../items/photo';
import { REGIONS } from '../world/data/regions';

const RANGE = 15;

export class PhotoMode {
  active = false;
  filter = 0;
  frame = 1;
  roll = 0;
  fov = 60;
  selfie = false;
  timePaused = false;
  /** the last picture taken (shown briefly) */
  last: { img: Img; t: number; kind: 'photo' | 'sketch' } | null = null;
  onShutter: (() => void) | null = null;
  private home = new THREE.Vector3();
  private saved = { yaw: 0, pitch: 0, fov: 75, mode: 'walk' as Game['controller']['mode'] };
  private traveller: THREE.Mesh | null = null;

  constructor(private g: Game) {}

  enter(): void {
    const c = this.g.controller;
    if (this.active || (c.mode !== 'walk' && c.mode !== 'boat')) return;
    this.active = true;
    this.home.copy(c.position);
    Object.assign(this.saved, { yaw: c.yaw, pitch: c.pitch, fov: this.g.camera.fov, mode: c.mode });
    this.fov = this.g.camera.fov;
    c.mode = 'fixed';
    if (!this.traveller) { this.traveller = travellerMesh(); this.g.world.scene.add(this.traveller); }
    this.traveller.position.set(this.home.x, this.home.y - c.eye, this.home.z);
    this.traveller.rotation.y = c.yaw;
  }

  exit(): void {
    if (!this.active) return;
    const c = this.g.controller;
    this.active = false;
    c.position.copy(this.home);
    c.yaw = this.saved.yaw; c.pitch = this.saved.pitch; c.mode = this.saved.mode;
    this.g.camera.fov = this.saved.fov; this.g.camera.updateProjectionMatrix();
    this.g.pipeline.filter = 0;
    this.roll = 0;
    if (this.traveller) this.traveller.visible = false;
    if (this.timePaused) { clock.paused = false; this.timePaused = false; }
  }

  togglePause(): void { this.timePaused = !this.timePaused; clock.paused = this.timePaused; }
  nextFilter(): void { this.filter = (this.filter + 1) % FILTERS.length; }
  nextFrame(): void { this.frame = (this.frame + 1) % FRAMES.length; }

  update(dt: number): void {
    if (!this.active) return;
    const c = this.g.controller, inp = this.g.input;
    c.yaw += inp.lookDX; c.pitch = THREE.MathUtils.clamp(c.pitch + inp.lookDY, -1.5, 1.5);
    inp.lookDX = 0; inp.lookDY = 0;
    const f = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(c.pitch, c.yaw, 0, 'YXZ'));
    const r = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    const sp = 3 * dt;
    c.position.addScaledVector(f, inp.moveZ * sp).addScaledVector(r, inp.moveX * sp);
    c.position.y += inp.up * sp;
    if (inp.key('KeyQ')) this.roll += dt * 0.6;
    if (inp.key('KeyE')) this.roll -= dt * 0.6;
    const off = c.position.clone().sub(this.home);
    if (off.length() > RANGE) c.position.copy(this.home).addScaledVector(off.normalize(), RANGE);
    c.position.y = Math.max(c.position.y, this.g.world.groundHeight(c.position.x, c.position.z) + 0.3);
    this.g.camera.fov = this.fov;
    this.g.camera.updateProjectionMatrix();
    this.g.pipeline.filter = this.filter;
    if (this.traveller) this.traveller.visible = this.selfie;
    if (this.last && (this.last.t += dt) > 2.5) this.last = null;
  }

  private place(): string {
    const p = this.home, r = this.g.world.world.regionAt(p.x, p.z);
    const v = this.g.world.villages.villages.find((v) => Math.hypot(v.layout.def.x - p.x, v.layout.def.z - p.z) < v.layout.def.r);
    return v ? v.layout.def.name : r >= 0 ? REGIONS[r]!.name : 'Somewhere';
  }

  /** Take the picture (or ink a sketch of the view). */
  shoot(kind: 'photo' | 'sketch'): Img {
    const [w, h] = this.g.pipeline.pixelSize;
    const raw = fromGL(this.g.pipeline.readPixels(), w, h);
    const img = kind === 'sketch' ? frame(inkWash(raw, clock.day * 31 + Math.floor(clock.hour * 10)), 'scroll') : frame(raw, FRAMES[this.frame]!);
    this.g.adv.journey.addAlbum({ kind, day: clock.day, hour: clock.hour, place: this.place(), w: img.w, h: img.h, data: encode(img) });
    this.last = { img, t: 0, kind };
    this.onShutter?.();
    return img;
  }
}
