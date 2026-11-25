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
import { installAudioUnlock, suspendAudio } from './audio/unlock';
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
});
game.input.attachLookElement(uiCanvas);
const bench = new Benchmark(game);
const debug = new DebugPanel(game, bench, () => { state.mode = 'gallery'; ui.show('gallery'); });
if (params.debug) debug.show(true);

function applySettings(): void {
  game.pipeline.settings.dither = settings.dither;
  game.pipeline.toggles.outlines = settings.outlines;
  ui.hud.showFps = settings.showFps;
}
bus.on('settings:changed', ({ key }) => {
  if (key === 'quality') { game.setQuality(settings.quality); ui.resize(game.pipeline.scale); }
  applySettings();
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
    c.position.set(...s.pos);
    c.yaw = s.yaw; c.pitch = s.pitch;
    clock.setHour(s.hour); clock.day = s.day;
  } else {
    const S = game.world.dock.anchors.shore!;
    c.position.set(S.x + 1, game.world.groundHeight(S.x + 1, S.z + 3) + 1.6, S.z + 3);
    c.lookAt(game.world.dock.anchors.pierEnd!.clone().setY(1.5));
    clock.setHour(17.4);
  }
  c.mode = 'walk';
  game.camera.fov = 75;
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

addEventListener('keydown', (e) => { if (e.code === 'Escape') openMenu(); });

// ---------- lifecycle (SPEC §2): pause & save when hidden, resume on return ----------
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { void save(); suspendAudio(); state.running = false; bus.emit('app:pause', { reason: 'hidden' }); }
  else { state.running = true; last = performance.now(); bus.emit('app:resume'); requestAnimationFrame(loop); }
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
    game.input.lookDX -= ui.hud.look.dx * 0.012; game.input.lookDY -= ui.hud.look.dy * 0.012;
    ui.hud.look.dx = 0; ui.hud.look.dy = 0;
  }
  game.input.enabled = state.mode === 'play';
  bench.update(dt, frameMs);
  if (state.mode !== 'gallery') game.frame(dt);
  ui.hud.fps = fps;
  ui.frame(now / 1000, dt);
  debug.update(fps);
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
  } else if (params.play) startPlay(state.save !== null);
  else { state.mode = 'title'; game.startDrift(); ui.show('title'); }
  if (params.freeze !== undefined) game.frozenElapsed = params.freeze;
  for (const name of params.hide) game.world.scene.traverse((o) => { if (o.name === name) o.visible = false; });
  for (const k of params.off) if (k in game.pipeline.toggles) (game.pipeline.toggles as Record<string, boolean>)[k] = false;

  last = performance.now();
  requestAnimationFrame(loop);
  (window as unknown as { __hotaru: unknown }).__hotaru = {
    ready: true, game, ui, state, clock, bench,
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
