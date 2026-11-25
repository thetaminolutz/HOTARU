/** The game: renderer, world, time of day, camera and the per-frame update. */
import * as THREE from 'three';
import { PixelPipeline } from '../render/pipeline';
import { GameWorld } from '../scene/gameWorld';
import { Controller, type Collider } from '../player/controller';
import { Interactions } from '../interact/interactions';
import { settings } from './settings';
import { InputState } from '../player/input';
import { createTodState, evaluateTod, moonPhase, type TodState } from '../sky/timeOfDay';
import { U } from '../render/uniforms';
import { clock } from '../core/clock';
import { QUALITY, type Quality, type QualityName } from '../config';
import { SHOTS, shotByName, type Shot } from './shots';
import { srgbToLinear } from '../render/color';

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly pipeline: PixelPipeline;
  readonly world: GameWorld;
  readonly camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.2, 22000);
  readonly tod: TodState = createTodState();
  readonly input: InputState;
  readonly controller: Controller;
  quality: Quality;
  /** Time used for animation; frozen for deterministic shots. */
  frozenElapsed: number | null = null;
  /** Logical (unsnapped) camera; the render camera is snapped to pixel angles. */
  snapRotation = true;
  private driftT = 0;
  stats = { drawCalls: 0, triangles: 0, frameMs: 0 };
  windStrength = 0.5;
  /** Cloud cover 0..1 (until the weather system in M6). */
  cloudCover = 0.45;

  constructor(readonly canvas: HTMLCanvasElement, seed: number, quality: QualityName) {
    this.quality = QUALITY[quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.pipeline = new PixelPipeline(this.renderer, this.quality);
    this.world = new GameWorld(seed, this.quality);
    this.input = new InputState(canvas);
    const w = this.world;
    const colliders: Collider[] = [];
    this.controller = new Controller({
      ground: (x, z) => w.groundHeight(x, z),
      terrain: (x, z) => w.height(x, z),
      onDeck: (x, z) => w.dock.deckHeight(x, z) > -Infinity,
      snowy: (x, z, h) => h > 980 || (h > 620 && w.world.biome(x, z).special === 3),
      colliders,
    });
    this.colliders = colliders;
    this.controller.onSoftLanding = () => { this.fade = 1; };
  }

  private colliders: Collider[];
  readonly interactions = new Interactions();
  /** 0..1 screen fade (soft landings); the UI draws it. */
  fade = 0;
  /** Time-lapse is active (sitting + holding the button/key). */
  timelapse = false;

  /** Finish building after all world steps ran. */
  finishInit(hour: number): void {
    const w = this.world;
    const S = w.dock.anchors.shore!;
    this.colliders.push(...w.dock.colliders);
    for (const sp of w.dock.sitSpots) {
      this.interactions.add({
        id: 'sit-' + sp.x.toFixed(1), kind: 'sit', label: sp.label, pos: new THREE.Vector3(sp.x, sp.y + 0.6, sp.z), reach: 2.6, yaw: sp.yaw,
        use: () => this.controller.sitAt(sp.x, sp.z, sp.y, sp.yaw),
      });
    }
    this.controller.placeAt(S.x + 1, S.z + 3);
    this.controller.lookAt(w.dock.anchors.pierEnd!.clone().add(new THREE.Vector3(-10, 1, -20)));
    clock.setHour(hour);
    this.pipeline.buildLutNow(hour);
    this.resize();
  }

  setQuality(name: QualityName): void {
    this.quality = QUALITY[name];
    this.world.setQuality(this.quality);
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, true);
    const dw = Math.floor(w * dpr), dh = Math.floor(h * dpr);
    this.pipeline.resize(dw, dh, this.quality, this.world.water);
    this.camera.aspect = this.pipeline.width / this.pipeline.height;
    this.camera.updateProjectionMatrix();
  }

  applyShot(shot: Shot | string): void {
    const s = typeof shot === 'string' ? shotByName(shot) : shot;
    if (!s) return;
    clock.setHour(s.hour);
    this.frozenElapsed = s.elapsed;
    this.camera.fov = s.fov ?? 75;
    this.camera.updateProjectionMatrix();
    this.controller.mode = 'fixed';
    this.controller.position.copy(s.pos(this.world));
    this.controller.lookAt(s.look(this.world));
    this.windStrength = s.wind ?? 0.5;
    const S = this.world.dock.anchors.shore!;
    this.world.dock.rowOverride = s.boat ? { x: S.x + s.boat[0], z: S.z + s.boat[1], heading: s.boat[2] } : null;
    this.pipeline.buildLutNow(s.hour);
  }

  get shots(): Shot[] { return SHOTS; }

  /** Title screen: slow drift over the lake near the dock. */
  startDrift(): void { this.controller.mode = 'drift'; this.driftT = 0; this.camera.fov = 70; this.camera.updateProjectionMatrix(); }

  private updateDrift(dt: number): void {
    this.driftT += dt;
    const S = this.world.dock.anchors.shore!;
    const a = this.driftT * 0.012 + 0.3;
    const c = this.controller;
    c.position.set(S.x + 18 + Math.cos(a) * 10, 4.2 + Math.sin(this.driftT * 0.1) * 0.4, S.z - 6 + Math.sin(a) * 8);
    c.lookAt(S.clone().add(new THREE.Vector3(-8, 2.4, -14)));
  }

  frame(dt: number): void {
    const t0 = performance.now();
    clock.tick(dt);
    const elapsed = this.frozenElapsed ?? clock.elapsed;
    U.uTime.value = elapsed;
    this.input.poll();
    const c0 = this.controller;
    if (c0.mode === 'walk' || c0.mode === 'fly') {
      if (this.camera.fov !== settings.fov) { this.camera.fov = settings.fov; this.camera.updateProjectionMatrix(); }
      c0.headBob = settings.headBob;
      // interact: a targeted thing, else sit / lie / stand where you are
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(c0.pitch, c0.yaw, 0, 'YXZ'));
      this.interactions.update(c0.position, dir);
      if (this.input.interactPressed && c0.mode === 'walk') {
        const t = this.interactions.target;
        if (t && !c0.sitting) t.use();
        else c0.cyclePose();
      }
      // time-lapse while sitting (SPEC §21): ×20 to watch a sunset, a storm, the stars wheel
      this.timelapse = c0.sitting && this.input.timelapse;
      clock.timeScale = this.timelapse ? 20 : 1;
    }
    this.fade = Math.max(0, this.fade - dt * 0.8);
    if (c0.mode === 'drift') this.updateDrift(dt);
    else c0.update(dt, this.input);
    this.input.endFrame();

    // M1 look shots use a full moon; the running game follows the 8-day cycle
    const phase = this.frozenElapsed !== null ? 0.5 : moonPhase(clock.day + 4, clock.hour);
    this.world.sky.uniforms.uMoonPhase.value = phase;
    evaluateTod(clock.hour, this.tod, phase);
    U.uCloudCover.value = this.cloudCover * (this.tod.stars > 0.5 ? 0.6 : 1);
    this.applyTod();

    // wind: calm at dusk (mirror lake), a light breeze otherwise
    const w = U.uWind.value;
    w.set(0.85, 0.5, this.windStrength * (0.75 + 0.25 * Math.sin(elapsed * 0.05)), 0.6);
    const waterU = this.world.water.material.uniforms;
    waterU.uWaves!.value = 0.04 + this.windStrength * 1.7;

    this.world.dock.update(elapsed, w);
    this.world.update(this.controller.position);
    this.pipeline.uploadLights(this.world.dock.lights, this.controller.position, this.quality.maxPointLights, this.tod.lamps);
    this.pipeline.updatePalette(clock.hour);

    // smooth pixel camera: snap rotation to whole pixel angles, shift the image by the remainder
    const c = this.controller;
    const q = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.pipeline.height;
    let yaw = c.yaw, pitch = c.pitch + c.breath;
    if (this.snapRotation) {
      const yi = Math.round(yaw / q), pi = Math.round(pitch / q);
      const ry = yaw, rp = pitch;
      yaw = yi * q; pitch = pi * q;
      this.pipeline.shift.set(((ry - yaw) / q), -((rp - pitch) / q));
      this.pipeline.ditherOffset.set(-yi, pi);
      // reflections render at a lower resolution: snap them to whole reflection texels
      const H = this.pipeline.height, M = 2;
      const renderFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * (H + 2 * M) / H));
      const rq = this.world.water.texelAngle(renderFov);
      Object.assign(this.pipeline.reflectAngles, { yaw: Math.round(c.yaw / rq) * rq, pitch: Math.round(c.pitch / rq) * rq, use: true });
    } else {
      this.pipeline.shift.set(0, 0);
      this.pipeline.reflectAngles.use = false;
    }
    this.camera.position.copy(c.position);
    this.camera.rotation.set(pitch, yaw, c.roll, 'YXZ');
    this.camera.updateMatrixWorld();

    this.renderer.info.reset();
    this.pipeline.render(this.world.scene, this.camera, this.tod, this.world.water, this.world.sky.mesh);
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    this.stats.frameMs = performance.now() - t0;
  }

  private applyTod(): void {
    const s = this.tod;
    U.uKeyDir.value.copy(s.keyDir);
    U.uKeyColor.value.copy(s.keyColor);
    U.uAmbSky.value.copy(s.ambSky); U.uAmbGround.value.copy(s.ambGround);
    U.uShadowTint.value.copy(s.shadowTint); U.uRim.value.copy(s.rim);
    U.uZenith.value.copy(s.zenith); U.uHorizon.value.copy(s.horizon); U.uSunGlow.value.copy(s.sunGlow);
    U.uSunDir.value.copy(s.sunDir); U.uMoonDir.value.copy(s.moonDir);
    U.uFog.value = s.fog; U.uHeightFog.value = s.heightFog;
    U.uLamps.value = s.lamps; U.uStars.value = s.stars;
    U.uClouds.value.copy(s.clouds); U.uCloudLit.value.copy(s.cloudLit);
    U.uPixelAngle.value = this.world.sky.uniforms.uPixelAngle.value = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.pipeline.height;
    const wu = this.world.water.material.uniforms;
    (wu.uDeep!.value as THREE.Color).copy(s.zenith).lerp(s.horizon, 0.3).multiplyScalar(0.35);
    (wu.uShallow!.value as THREE.Color).copy(s.horizon).multiplyScalar(0.35).add(new THREE.Color(srgbToLinear(0.05), srgbToLinear(0.06), srgbToLinear(0.05)).multiplyScalar(s.ambSky.r + 0.2));
    (wu.uHighlight!.value as THREE.Color).copy(s.horizon).lerp(s.zenith, 0.2).multiplyScalar(1.4);
    (wu.uKeyColor2!.value as THREE.Color).copy(s.keyColor);
  }
}
