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
import { Weather, type WeatherId } from '../sky/weather';
import { deckAt } from '../buildings/villages';
import type { Secret } from '../secrets/secrets';
import { KIND_NAMES } from '../secrets/secrets';
import { lookAt as seasonLook, type SeasonName } from '../flora/data/seasons';
import { REGIONS } from '../world/data/regions';
import { talk } from '../people/dialogue';
import { NICKNAMES } from '../people/dialogue';
import { portrait } from '../people/portrait';
import type { Person } from '../people/people';
import { createRng, hashString } from '../core/rng';
import { SEASONS } from '../flora/data/seasons';
import { Pixmap } from '../render/pixmap';
import { Adventure } from './adventure';
import { PhotoMode } from './photoMode';
import { Mystic } from './mystic';

let stoneImg: Pixmap | null = null;
/** A little grey stone for the dialogue box when a tablet or shrine 'speaks'. */
function stoneIcon(): Pixmap {
  if (stoneImg) return stoneImg;
  const m = new Pixmap(28, 28);
  m.fill(0xe8d8b4);
  for (let y = 4; y < 25; y++) for (let x = 7; x < 21; x++) if (!((y === 4 || y === 24) && (x === 7 || x === 20))) m.set(x, y, (x + y) % 5 === 0 ? 0x6a6a64 : 0x8a8a80);
  for (let y = 8; y < 21; y += 3) for (let x = 10; x < 18; x++) if ((x * 3 + y) % 4) m.set(x, y, 0x4a4a46);
  for (let i = 0; i < 28; i++) { m.set(i, 0, 0x4e2e22); m.set(i, 27, 0x4e2e22); m.set(0, i, 0x4e2e22); m.set(27, i, 0x4e2e22); }
  stoneImg = m;
  return m;
}

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
      ground: (x, z, feet) => w.groundHeight(x, z, feet),
      terrain: (x, z) => w.height(x, z),
      onDeck: (x, z) => w.dock.deckHeight(x, z) > -Infinity || w.villages.floorHeight(x, z) > -Infinity || deckAt(w.landmarks.decks, x, z) > -Infinity,
      snowy: (x, z, h) => h > 980 || (h > 620 && w.world.biome(x, z).special === 3),
      colliders,
      water: (x, z) => w.world.hydro.waterAt(x, z),
    });
    this.colliders = colliders;
    this.controller.onSoftLanding = () => { this.fade = 1; };
  }

  private colliders: Collider[];
  readonly interactions = new Interactions();
  /** items, journal, map, fishing, boats, your house (M11) */
  readonly adv = new Adventure(this);
  readonly photo = new PhotoMode(this);
  /** festivals, spirits, world events, the story's ending, dreams (M12) */
  readonly mystic = new Mystic(this);
  /** 0..1 screen fade (soft landings); the UI draws it. */
  fade = 0;
  /** A fish jumped (or similar): the audio system plays a splash there. */
  onSplash: ((pos: THREE.Vector3) => void) | null = null;
  private rippleT = 0;
  private fishT = 8;
  readonly weather = new Weather();
  /** a conversation in progress (the HUD draws it) */
  dialogue: { who: Person; name: string; title: string; portrait: Pixmap; lines: string[]; index: number; shown: number } | null = null;
  /** a few letters were spoken: the audio system babbles in their voice */
  onBabble: ((pitch: number) => void) | null = null;
  private talkSeed = 1;
  /** messages for the HUD (discoveries, offerings) */
  onToast: ((text: string) => void) | null = null;
  /** a discovery, an offering, the bell: the audio system plays a sound */
  onEvent: ((kind: 'found' | 'offer' | 'bell' | 'gate', pos: THREE.Vector3) => void) | null = null;
  /** viewpoint: a slow pan with a haiku while you sit */
  viewPan: { t: number; haiku: string } | null = null;
  private foxDay = -1;
  private snowBellT = 30;
  /** wind fixed by a screenshot (else the weather decides) */
  private shotWind: number | null = null;
  private lastSeason = -1;
  /** Bow gesture timer (s); the camera dips and comes back up. */
  bowT = 0;
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
    this.colliders.push(...w.villages.colliders, ...w.landmarks.colliders);
    for (const sp of w.villages.sits) {
      this.interactions.add({
        id: 'sit-' + sp.x.toFixed(1) + ',' + sp.z.toFixed(1), kind: 'sit', label: sp.label, pos: new THREE.Vector3(sp.x, sp.y + 0.4, sp.z), reach: 2.2, yaw: sp.yaw,
        use: () => this.controller.sitAt(sp.x, sp.z, sp.y, sp.yaw),
      });
    }
    // animals you can pet or bow to appear as interactables while they're close
    w.fauna.onNear = (a, near) => {
      const id = 'animal-' + a.id;
      if (!near) { this.interactions.remove(id); return; }
      const bow = !!a.sp.bows;
      this.interactions.add({
        id, kind: bow ? 'bow' : 'pet', label: (bow ? 'Bow to the ' : 'Pet the ') + a.sp.name.toLowerCase(), pos: a.pos, reach: 3.4,
        use: () => { if (bow) { this.bowT = 1.6; w.fauna.bow(a); } else w.fauna.pet(a); },
      });
    };
    for (const sc of w.secrets.list) this.registerSecret(sc);
    for (const sp of w.landmarks.spots) {
      this.interactions.add({
        id: sp.id, kind: sp.id === 'temple-bell' ? 'ring' : 'open', label: sp.label, pos: sp.pos, reach: 3.2,
        use: () => {
          if (sp.id === 'temple-bell') this.onEvent?.('bell', sp.pos);
          else if (sp.id === 'hidden-gate' && !w.landmarks.gateOpen) { w.landmarks.openGate(); this.onEvent?.('gate', sp.pos); this.onToast?.('The ivy parts. There is a garden behind the wall.'); }
        },
      });
    }
    w.secrets.onFound = (sc, n, of) => { this.onEvent?.('found', sc.pos); this.onToast?.(sc.label + '  -  ' + KIND_NAMES[sc.kind] + ' ' + n + ' of ' + of); };
    w.secrets.refresh();
    w.people.onNear = (p, near) => {
      const id = 'person-' + p.id;
      if (!near) { this.interactions.remove(id); return; }
      this.interactions.add({ id, kind: 'talk', label: 'Talk to ' + p.name.split(' ')[0], pos: p.pos, reach: 3.2, use: () => this.talkTo(p) });
    };
    this.adv.init();
    this.mystic.init();
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
    this.weather.forced = s.weather ?? 'clear';
    this.weather.seasonLock = s.season ?? 'autumn';
    this.shotWind = s.wind ?? null;
    const S = this.world.dock.anchors.shore!;
    this.world.dock.rowOverride = s.boat ? { x: S.x + s.boat[0], z: S.z + s.boat[1], heading: s.boat[2] } : null;
    this.pipeline.buildLutNow(s.hour);
    // animals placed in view for the shot
    const c = this.controller;
    for (const [id, ahead, right, n] of s.fauna ?? []) {
      const fx = Math.sin(c.yaw + Math.PI), fz = Math.cos(c.yaw + Math.PI);
      const x = c.position.x + fx * ahead - fz * right, z = c.position.z + fz * ahead + fx * right;
      this.world.fauna.spawnAt(id, x, z, n, s.hour, Math.max(1.2, n * 0.6));
    }
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
    if (c0.mode === 'boat') this.adv.update(dt);
    this.photo.update(dt);
    if (c0.mode === 'walk' || c0.mode === 'fly') {
      if (this.camera.fov !== settings.fov) { this.camera.fov = settings.fov; this.camera.updateProjectionMatrix(); }
      c0.headBob = settings.headBob;
      // interact: a targeted thing, else sit / lie / stand where you are
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(c0.pitch, c0.yaw, 0, 'YXZ'));
      this.interactions.update(c0.position, dir);
      if (this.adv.update(dt)) this.input.interactPressed = false;
      if (this.input.interactPressed && this.dialogue) {
        const d = this.dialogue, line = d.lines[d.index] ?? '';
        if (d.shown < line.length) d.shown = line.length;
        else if (++d.index >= d.lines.length) this.dialogue = null;
        else d.shown = 0;
      } else if (this.input.interactPressed && c0.mode === 'walk') {
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
    this.applyWeather(dt);
    U.uCloudCover.value = this.cloudCover * (this.tod.stars > 0.5 ? 0.6 : 1);
    this.applyTod();

    // wind: calm at dusk (mirror lake), a light breeze otherwise
    const w = U.uWind.value;
    w.set(0.85, 0.5, this.windStrength * (0.75 + 0.25 * Math.sin(elapsed * 0.05)), 0.6);
    const waterU = this.world.water.material.uniforms;
    waterU.uWaves!.value = 0.04 + this.windStrength * 1.7;

    this.world.dock.update(elapsed, w);
    this.world.update(this.controller.position);
    const cp = this.controller.position;
    const pv = this.controller.vel;
    this.world.fauna.update(dt, cp, Math.hypot(pv.x, pv.z), clock.hour);
    this.world.people.update(dt, cp, clock.hour, clock.day, this.weather.out);
    this.updateDialogue(dt);
    this.updateSecrets(dt);
    this.mystic.update(dt);
    this.updateRipples(dt);
    this.world.fx.update(cp, this.world.groundHeight(cp.x, cp.z), this.tod, clock.hour, this.windStrength, this.frozenElapsed !== null);
    this.world.villages.update(this.camera.position, this.controller.position, clock.hour, dt, this.world.people.openers());
    this.world.rivers.update(this.camera, this.tod.sunDir, 1 - this.tod.stars);
    const lights = this.world.dock.lights.concat(this.world.villages.lightsNear(this.controller.position) as typeof this.world.dock.lights, this.world.landmarks.lights as typeof this.world.dock.lights);
    const lamp = this.adv.lanternLight();
    if (lamp) lights.push(lamp);
    lights.push(...this.mystic.festivals.lights);
    this.world.landmarks.update(dt);
    this.pipeline.uploadLights(lights, this.controller.position, this.quality.maxPointLights, this.tod.lamps);
    this.pipeline.updatePalette(clock.hour);

    // smooth pixel camera: snap rotation to whole pixel angles, shift the image by the remainder
    const c = this.controller;
    const q = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.pipeline.height;
    this.bowT = Math.max(0, this.bowT - dt);
    const bowDip = this.bowT > 0 ? Math.sin((1 - this.bowT / 1.6) * Math.PI) * 0.55 : 0;
    const pan = this.viewPan ? Math.sin((this.viewPan.t / 16) * Math.PI * 2) * 0.42 * Math.min(1, this.viewPan.t / 2) : 0;
    let yaw = c.yaw + pan, pitch = c.pitch + c.breath - bowDip;
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
    this.camera.rotation.set(pitch, yaw, c.roll + (this.photo.active ? this.photo.roll : 0), 'YXZ');
    this.camera.updateMatrixWorld();

    this.renderer.info.reset();
    this.pipeline.render(this.world.scene, this.camera, this.tod, this.world.water, this.world.sky.mesh);
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    this.stats.frameMs = performance.now() - t0;
  }

  /** Shrines take offerings, viewpoints are for sitting, tablets for reading. */
  private registerSecret(sc: Secret): void {
    const w = this.world;
    if (sc.kind === 'shrine') this.interactions.add({
      id: sc.id, kind: 'pray', label: 'Make an offering', pos: sc.pos.clone().setY(sc.pos.y + 0.8), reach: 2.6,
      use: () => {
        const fresh = w.secrets.offer(sc, clock.day);
        this.onEvent?.('offer', sc.pos);
        this.showText('Hidden shrine', fresh ? [sc.text] : [sc.text, 'The shrine is content for today.']);
      },
    });
    else if (sc.kind === 'view') this.interactions.add({
      id: sc.id, kind: 'sit', label: 'Sit and take in the view', pos: sc.pos.clone().setY(sc.pos.y + 0.6), reach: 2.6, yaw: sc.yaw,
      use: () => {
        this.controller.sitAt(sc.pos.x, sc.pos.z, sc.pos.y + (sc.id === 'view-keep' || sc.id === 'view-pier' ? 0 : 0.42), sc.yaw);
        this.viewPan = { t: 0, haiku: sc.text };
        w.secrets.discover(sc);
      },
    });
    else if (sc.kind === 'tablet') this.interactions.add({
      id: sc.id, kind: 'read', label: 'Read the stone', pos: sc.pos.clone().setY(sc.pos.y + 0.8), reach: 2.6,
      use: () => {
        // the last fragment can only be read by moonlight
        const moonlit = (clock.hour > 20 || clock.hour < 4) && this.weather.out.cloud < 0.6;
        if (sc.id === 'tablet-29' && !moonlit) { this.showText(sc.label, ['Moss covers the stone. Something is carved here, too faint to read by day.']); return; }
        this.showText(sc.label, [sc.text]);
        w.secrets.discover(sc);
      },
    });
  }

  /** Show text in the dialogue box (stones, shrines). */
  private showText(title: string, lines: string[]): void {
    const p = { pos: this.controller.position.clone(), pitch: 0.6 } as unknown as Person;
    this.dialogue = { who: p, name: title, title: '', portrait: stoneIcon(), lines, index: 0, shown: 0 };
  }

  /** Rare moments and places found by being there. */
  private updateSecrets(dt: number): void {
    const w = this.world, p = this.controller.position, W = this.weather.out;
    const sunshower = this.weather.current === 'sunshower';
    for (const sc of w.secrets.update(p, clock.hour, W, sunshower)) void sc;
    // a fox wedding: white foxes walk in a line past the shrine during a sunshower
    const torii = w.villages.villages.find((v) => v.layout.def.id === 'kumoji')?.layout.torii;
    if (sunshower && torii && this.foxDay !== clock.day && Math.hypot(p.x - torii.x, p.z - torii.z) < 160) {
      this.foxDay = clock.day;
      for (const a of w.fauna.spawnAt('whiteFox', torii.x + 6, torii.z + 6, 7, clock.hour, 1.5)) { a.state = 'wander'; a.sleep = 0; a.target.set(torii.x - 40, a.pos.y, torii.z - 30); a.timer = 30; }
    }
    // the temple bell rings by itself in snowfall
    const bell = w.landmarks.bellPos;
    if (W.snow > 0.3 && bell.distanceTo(p) < 400) {
      this.snowBellT -= dt;
      if (this.snowBellT < 0) { this.snowBellT = 80 + Math.random() * 60; this.onEvent?.('bell', bell); }
    }
    if (this.viewPan) {
      this.viewPan.t += dt;
      if (this.viewPan.t > 16 || !this.controller.sitting) this.viewPan = null;
    }
  }

  /** Start a conversation with someone (greeting + topical lines from the dialogue bank). */
  talkTo(p: Person): void {
    const mem = this.world.people.memory;
    const met = mem.met[p.id] ?? 0;
    if (met >= 4 && !mem.nick[p.id]) mem.nick[p.id] = NICKNAMES[hashString(p.id) % NICKNAMES.length]!;
    const W = this.weather.out;
    const weather = W.storm > 0.5 ? 'storm' : W.snow > 0.3 ? 'snow' : W.rain > 0.2 ? 'rain' : W.fog > 0.6 ? 'fog' : 'fair';
    const season = SEASONS[W.weights.indexOf(Math.max(...W.weights))]!;
    const others = this.world.people.people.filter((o) => o.village === p.village && o.id !== p.id && !o.wanderer);
    const friend = others.length ? others[hashString(p.id + clock.day) % others.length]!.name.split(' ')[0]! : 'Akari';
    const lines = talk({ name: p.name.split(' ')[0]!, job: p.job, personality: p.personality, age: p.age, met, nick: mem.nick[p.id] ?? 'friend', hour: clock.hour, season, weather, village: p.villageName || 'Tomoshibi', friend, wanderer: p.wanderer?.id, ...this.talkContext(p) }, createRng(hashString(p.id) + this.talkSeed++ * 7919));
    mem.met[p.id] = met + 1;
    this.adv.afterTalk(p, lines);
    this.mystic.afterTalk(p, lines);
    const rumour = !p.wanderer ? this.mystic.rumour() : null;
    if (rumour && lines.length > 1 && (this.talkSeed + met) % 2 === 0) lines.splice(1, 0, rumour);
    this.dialogue = { who: p, name: p.name, title: p.wanderer?.title ?? '', portrait: portrait(p), lines, index: 0, shown: 0 };
    // they turn to you and greet you
    p.greetT = 0;
  }

  /** What a villager might bring up: where you've been lately, a festival, the story's end. */
  private talkContext(p: Person): { recent?: string; festival?: string; after?: boolean } {
    const pl = this.adv.journey.places, own = this.world.world.regionAt(p.pos.x, p.pos.z);
    const ownId = own >= 0 ? REGIONS[own]!.id : '';
    const recent = Object.keys(pl).filter((k) => !k.startsWith('v-') && k !== ownId && pl[k]! >= clock.day - 1).pop();
    const f = this.mystic.festivals.active;
    return { recent, festival: f && this.mystic.festivals.spot && this.mystic.festivals.spot.distanceTo(p.pos) < 120 ? f.id : undefined, after: this.mystic.ending.done };
  }

  private updateDialogue(dt: number): void {
    const d = this.dialogue;
    if (!d) return;
    if (d.who.pos.distanceTo(this.controller.position) > 5) { this.dialogue = null; return; }
    const line = d.lines[d.index] ?? '';
    if (d.shown < line.length) {
      const before = Math.floor(d.shown);
      d.shown = Math.min(line.length, d.shown + dt * 38);
      if (Math.floor(d.shown / 3) !== Math.floor(before / 3) && line[Math.floor(d.shown)] !== ' ') this.onBabble?.(d.who.pitch);
    }
  }

  /** Ripples on the lake and sea: the player wading or swimming, ducks, jumping fish. */
  private updateRipples(dt: number): void {
    const c = this.controller, p = c.position, wt = this.world.water;
    this.rippleT -= dt;
    const moving = Math.hypot(c.vel.x, c.vel.z) > 0.3;
    if ((c.pose === 'wade' || c.pose === 'swim') && c.waterLevel() < 0.3 && this.rippleT < 0 && (moving || c.pose === 'swim')) {
      wt.addRipple(p.x, p.z, c.pose === 'swim' ? 1.2 : 0.8);
      this.rippleT = moving ? 0.55 : 1.6;
    }
    for (const a of this.world.fauna.animals) {
      if (a.sp.move !== 'swim' || a.sp.plan === 'fish') continue;
      if (Math.abs(a.pos.x - p.x) > 60 || Math.abs(a.pos.z - p.z) > 60) continue;
      if (a.r.next() < dt * 0.35) wt.addRipple(a.pos.x, a.pos.z, 0.6);
    }
    // fish jump now and then (more at dusk) where the water is deep enough
    this.fishT -= dt * (clock.hour > 17 && clock.hour < 20 ? 2.5 : 1);
    if (this.fishT < 0) {
      this.fishT = 6 + Math.random() * 14;
      const a = Math.random() * Math.PI * 2, d = 12 + Math.random() * 40;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (this.world.height(x, z) < -1) {
        wt.addRipple(x, z, 1.5);
        this.onSplash?.(new THREE.Vector3(x, 0, z));
      }
    }
  }

  /** Weather & seasons: adjust the time-of-day light, set the shared uniforms and effects. */
  private applyWeather(dt: number): void {
    const p = this.controller.position, w = this.world;
    const reg = w.world.regionAt(p.x, p.z), rid = reg >= 0 ? REGIONS[reg]!.id : 'none';
    const cold = Math.max(rid === 'snow' ? 0.7 : 0, Math.min(1, (w.height(p.x, p.z) - 650) / 300));
    const dtH = clock.paused ? 0 : dt * clock.timeScale * (24 / (clock.dayLengthMinutes * 60));
    const W = this.weather.update(dtH, dt, clock.day, clock.hour, rid, cold, this.frozenElapsed !== null);
    // seasons: tree colours and bareness, grass tint
    if (Math.abs(W.season - this.lastSeason) > 0.002) {
      this.lastSeason = W.season;
      for (const [id, kit] of w.kits) { const L = seasonLook(id, W.season); kit.setSeason(L.col, L.mix, L.bare); }
    }
    this.weather.grassTint(U.uSeasonTint.value);
    U.uSeasonW.value.set(...W.weights);
    U.uSnowCover.value = W.snowCover;
    U.uWet.value = W.wet;
    this.cloudCover = W.cloud;
    this.windStrength = this.shotWind ?? W.wind;
    w.fx.rain = W.rain; w.fx.snow = W.snow; w.fx.season = W.weights;
    w.water.material.uniforms.uRain!.value = W.rain;
    // overcast light: dimmer sun, greyer sky and ambient; lightning lifts everything for a moment
    const s = this.tod, d = W.dark, f = W.flash;
    const grey = (c: THREE.Color, k: number) => { const l = c.r * 0.3 + c.g * 0.55 + c.b * 0.15; c.lerp(new THREE.Color(l, l, l * 1.05), k); };
    s.keyColor.multiplyScalar(1 - d * 0.8);
    s.sunGlow.multiplyScalar(1 - d);
    grey(s.ambSky, d * 0.6); grey(s.zenith, d * 0.85); grey(s.horizon, d * 0.8); grey(s.clouds, d * 0.85); grey(s.cloudLit, d * 0.9);
    s.zenith.multiplyScalar(1 - d * 0.25); s.horizon.multiplyScalar(1 - d * 0.15);
    s.clouds.multiplyScalar(1 - d * 0.45); s.cloudLit.multiplyScalar(1 - d * 0.55);
    s.fog *= 1 + W.fog * 3;
    if (f > 0) { const fl = new THREE.Color(0.8, 0.85, 1.0).multiplyScalar(f * 1.6); s.ambSky.add(fl); s.zenith.add(fl); s.horizon.add(fl); }
    w.rainbow.update(this.camera.position, s.sunDir, W.rainbow);
  }

  /** Lock the season or let it cycle; force or free the weather (settings, debug). */
  setClimate(season: SeasonName | null, days: number, weather: WeatherId | null): void {
    this.weather.seasonLock = season;
    this.weather.seasonDays = days;
    this.weather.forced = weather;
    this.shotWind = null;
    this.lastSeason = -1;
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
