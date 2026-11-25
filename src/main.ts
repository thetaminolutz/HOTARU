/** Boot: renderer, loading screen, world build, title screen, game loop, lifecycle. */
import * as THREE from 'three';
import { Game } from './app/game';
import { params } from './core/params';
import { DEFAULT_SEED } from './config';
import { clock } from './core/clock';
import { bus } from './core/events';
import { UIManager } from './ui/manager';
import { settings } from './app/settings';
import { registerPwa, restartToUpdate } from './app/pwa';
import { readSave, writeSave, requestPersistence, type SaveData } from './save/save';
import { installAudioUnlock, suspendAudio, audioContext } from './audio/unlock';
import { AudioSystem } from './audio/audio';
import { renderPiece } from './audio/music';
import { uiSound } from './ui/widgets';
import { DebugPanel } from './debug/panel';
import { Benchmark } from './debug/benchmark';
import { shotByName } from './app/shots';

const gameCanvas = document.getElementById('game') as HTMLCanvasElement;
const uiCanvas = document.getElementById('ui') as HTMLCanvasElement;

// ---------- prevent browser behaviours (SPEC §2) ----------
for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart'])
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (!(e.target as HTMLElement).closest?.('textarea,input,select,[data-scroll]')) e.preventDefault(); }, { passive: false });

const state = {
  mode: 'loading' as 'loading' | 'title' | 'play' | 'shot' | 'gallery',
  save: null as SaveData | null,
  running: true,
  persisted: false,
};

let game: Game;
try {
  game = new Game(gameCanvas, params.seed ?? DEFAULT_SEED, params.quality ?? settings.quality);
} catch (err) {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:40% 0 auto;text-align:center;color:#ffe6a3;font:16px monospace">Hotaru needs WebGL2.<br>${String(err)}</div>`);
  throw err;
}

const ui = new UIManager(uiCanvas, {
  wander: () => startPlay(true),
  newJourney: () => startPlay(false),
  openMenu: () => openMenu(),
  hasSave: () => state.save !== null,
  gameClick: () => game.input.requestPointerLock(),
  penTap: (x, y) => {
    game.input.lastDevice = 'pen';
    // turn toward the tapped point; if something interactable is there, use it
    const ndc = new THREE.Vector3((x / ui.ui.w) * 2 - 1, -(y / ui.ui.h) * 2 + 1, 0.5);
    const dir = ndc.unproject(game.camera).sub(game.camera.position).normalize();
    game.controller.turnToward(dir);
    game.interactions.update(game.controller.position, dir);
    if (game.interactions.target) game.input.touchInteract = true;
  },
  penLook: (dx, dy) => { game.input.lastDevice = 'pen'; game.input.addLook(dx, dy, 0.006); },
});
game.input.attachLookElement(uiCanvas);
ui.settings.onRebind = (done) => { game.input.rebindListener = (code) => { game.input.rebindListener = null; done(code); }; };
const bench = new Benchmark(game);
const debug = new DebugPanel(game, bench, () => { state.mode = 'gallery'; ui.show('gallery'); });
if (params.debug) debug.show(true);

let audio: AudioSystem | null = null;
const audioVolumes = () => ({ master: settings.volMaster, music: settings.volMusic, ambience: settings.volAmbience, sfx: settings.volSfx, musicFrequency: settings.musicFrequency });
/** Audio starts on the first gesture (iOS); the title screen opens with the main theme. */
function updateAudio(dt: number): void {
  if (!audio) {
    const ctx = audioContext();
    if (!ctx || ctx.state !== 'running' || state.mode === 'loading' || state.mode === 'shot' || params.shot) return;
    audio = new AudioSystem(ctx, game, audioVolumes());
    uiSound.press = () => audio?.sfx.ui('tick');
    if (state.mode === 'title') audio.music.playNow();
  }
  audio.update(dt, state.mode);
}

function applySettings(): void {
  if (state.mode !== 'shot') game.setClimate(settings.seasonMode === 'cycle' ? null : settings.seasonMode, settings.seasonDays, settings.weatherMode === 'fair' ? 'clear' : null);
  game.pipeline.settings.dither = settings.dither;
  game.pipeline.toggles.outlines = settings.outlines;
  ui.hud.showFps = settings.showFps;
}
bus.on('settings:changed', ({ key }) => {
  if (key === 'quality') { game.setQuality(settings.quality); ui.resize(game.pipeline.scale); }
  applySettings();
  audio?.setVolumes(audioVolumes());
});
bus.on('app:update-ready', () => ui.hud.toast('A new version is ready — tap to restart', 1e9, restartToUpdate, performance.now() / 1000));

function resize(): void {
  game.resize();
  ui.resize(game.pipeline.scale);
}

async function save(): Promise<void> {
  if (state.mode !== 'play') return;
  const c = game.controller;
  await writeSave(1, { seed: game.world.seed, pos: [c.position.x, c.position.y, c.position.z], yaw: c.yaw, pitch: c.pitch, hour: clock.hour, day: clock.day });
  state.save = await readSave(1);
}

function startPlay(continueSave: boolean): void {
  const c = game.controller;
  const s = continueSave ? state.save : null;
  game.frozenElapsed = null;
  if (s) {
    c.placeAt(s.pos[0], s.pos[2]);
    c.yaw = s.yaw; c.pitch = s.pitch;
    clock.setHour(s.hour); clock.day = s.day;
  } else {
    const S = game.world.dock.anchors.shore!;
    c.placeAt(S.x + 1, S.z + 3);
    c.lookAt(game.world.dock.anchors.pierEnd!.clone().setY(1.5));
    clock.setHour(17.4);
  }
  c.mode = 'walk';
  game.camera.fov = settings.fov;
  game.camera.updateProjectionMatrix();
  game.windStrength = 0.5;
  game.world.dock.rowOverride = null;
  game.pipeline.buildLutNow(clock.hour);
  state.mode = 'play';
  ui.show('play');
  ui.hud.hint = ui.hud.touchMode ? 'Left thumb to walk · drag on the right to look' : 'Click to look around · WASD to walk · Esc for the menu';
  ui.hud.hintUntil = performance.now() / 1000 + 8;
  void save();
}

function openMenu(): void {
  if (state.mode !== 'play') return;
  void save();
  if (document.pointerLockElement) document.exitPointerLock();
  state.mode = 'title';
  game.startDrift();
  ui.show('title');
}



// ---------- lifecycle (SPEC §2): pause & save when hidden, resume on return ----------
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { void save(); suspendAudio(); state.running = false; bus.emit('app:pause', { reason: 'hidden' }); }
  else { state.running = true; void audioContext()?.resume(); last = performance.now(); bus.emit('app:resume'); requestAnimationFrame(loop); }
});
addEventListener('pagehide', () => { void save(); });
setInterval(() => { void save(); }, 60_000);

gameCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); state.running = false; });
gameCanvas.addEventListener('webglcontextrestored', () => {
  game.pipeline.buildLutNow(clock.hour);
  resize();
  state.running = true;
  last = performance.now();
  requestAnimationFrame(loop);
});

// ---------- main loop ----------
let last = performance.now();
let fps = 60;
function loop(now: number): void {
  if (!state.running) return;
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  const frameMs = now - last;
  last = now;
  fps += (1000 / Math.max(1, frameMs) - fps) * 0.05;
  if (state.mode === 'play' && ui.hud.touchMode) {
    const v = ui.hud.stickVector();
    game.input.touchMove.x = v.x; game.input.touchMove.z = v.z; game.input.touchMove.active = v.active;
    game.input.addLook(ui.hud.look.dx, ui.hud.look.dy, 0.012);
    ui.hud.look.dx = 0; ui.hud.look.dy = 0;
  }
  if (ui.hud.jumpTap) { game.input.touchJump = true; ui.hud.jumpTap = false; }
  if (ui.hud.actTap) { game.input.touchInteract = true; ui.hud.actTap = false; }
  game.input.touchTimelapse = ui.hud.timelapseHeld;
  if (game.input.menuPressed) { game.input.menuPressed = false; if (state.mode === 'play') openMenu(); }
  game.input.enabled = state.mode === 'play';
  bench.update(dt, frameMs);
  if (state.mode !== 'gallery') game.frame(dt);
  ui.hud.fps = fps;
  ui.hud.fade = game.fade;
  // interact prompt: the targeted thing, or sit / lie / stand where you are
  if (state.mode === 'play') {
    const c = game.controller, t = game.interactions.target;
    ui.hud.prompt = t && !c.sitting ? { icon: t.kind === 'sit' ? 'sit' : 'hand', label: t.label }
      : c.sitHint ? { icon: c.sitHint, label: '' } : null;
    ui.hud.canTimelapse = c.sitting;
  } else ui.hud.prompt = null;
  ui.frame(now / 1000, dt);
  debug.update(fps);
  updateAudio(dt);
  requestAnimationFrame(loop);
}

async function boot(): Promise<void> {
  installAudioUnlock();
  resize();
  addEventListener('resize', resize);
  const draw = () => new Promise<void>((r) => requestAnimationFrame(() => { ui.frame(performance.now() / 1000, 0.016); r(); }));
  await draw();
  const steps = game.world.stepCount;
  for (let i = 0; i < steps; i++) {
    await game.world.runStep(i);
    ui.loading.progress = ((i + 1) / steps) * 0.4;
    await draw();
  }
  game.finishInit(params.hour ?? 21.4);
  // stream the terrain and forest around the start (and the title drift) before showing it
  await game.world.preload(game.controller.position, (f) => { ui.loading.progress = 0.4 + 0.6 * f; ui.frame(performance.now() / 1000, 0.016); });
  applySettings();
  ui.loading.progress = 1;
  await draw();
  resize();
  state.save = await readSave(1);
  state.persisted = await requestPersistence();
  ui.settings.persisted = state.persisted;
  if (!params.nosw) void registerPwa();

  if (params.ui === 'gallery') { state.mode = 'gallery'; ui.show('gallery'); }
  else if (params.shot || (params.cam && params.look)) {
    state.mode = 'shot';
    ui.hidden = params.ui === '0' || params.ui === undefined;
    ui.show('play');
    const shot = shotByName(params.shot);
    if (shot) game.applyShot(shot);
    if (params.cam && params.look) {
      const S = game.world.dock.anchors.shore!;
      game.controller.mode = 'fixed';
      game.controller.position.set(S.x + params.cam[0]!, S.y + params.cam[1]!, S.z + params.cam[2]!);
      game.controller.lookAt(S.clone().set(S.x + params.look[0]!, S.y + params.look[1]!, S.z + params.look[2]!));
      if (params.fov) { game.camera.fov = params.fov; game.camera.updateProjectionMatrix(); }
      game.frozenElapsed ??= 4200;
    }
    if (params.hour !== undefined) { clock.setHour(params.hour); game.pipeline.buildLutNow(params.hour); }
    clock.paused = true;
    // stream the world around the shot before reporting ready
    await game.world.preload(game.controller.position);
  } else if (params.play) startPlay(state.save !== null);
  else { state.mode = 'title'; game.startDrift(); ui.show('title'); }
  if (params.freeze !== undefined) game.frozenElapsed = params.freeze;
  for (const name of params.hide) game.world.scene.traverse((o) => { if (o.name === name) o.visible = false; });
  for (const k of params.off) if (k in game.pipeline.toggles) (game.pipeline.toggles as Record<string, boolean>)[k] = false;

  last = performance.now();
  requestAnimationFrame(loop);
  (window as unknown as { __hotaru: unknown }).__hotaru = {
    ready: true, game, ui, state, clock, bench, THREE,
    get audio() { return audio; },
    renderPiece: async (region: string, hour: number, title: boolean, sec: number) => Array.from(await renderPiece(region, hour, title, sec)),
    readInternal: () => Array.from(game.pipeline.readPixels()),
    readReflection: () => {
      const t = game.world.water.target;
      const raw = new Uint16Array(t.width * t.height * 4);
      game.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, raw);
      return { w: t.width, h: t.height, px: Array.from(raw, (v) => Math.min(255, Math.round(Math.pow(THREE.DataUtils.fromHalfFloat(v), 1 / 2.2) * 255))) };
    },
    save, readSave: () => readSave(1),
  };
}

void boot();
