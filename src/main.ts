/** Boot: renderer, loading screen, world build, title screen, game loop, lifecycle. */
import * as THREE from 'three';
import { Game } from './app/game';
import { params } from './core/params';
import { DEFAULT_SEED } from './config';
import { clock } from './core/clock';
import { bus } from './core/events';
import { UIManager } from './ui/manager';
import { settings, setSetting } from './app/settings';
import { registerPwa, restartToUpdate } from './app/pwa';
import { readSave, writeSave, requestPersistence, exportSave, importSave, type SaveData } from './save/save';
import { installAudioUnlock, suspendAudio, audioContext } from './audio/unlock';
import { AudioSystem } from './audio/audio';
import { renderPiece } from './audio/music';
import { uiSound } from './ui/widgets';
import { DebugPanel } from './debug/panel';
import { Benchmark } from './debug/benchmark';
import { shotByName } from './app/shots';
import { wireScreens } from './app/screens';
import { Hints } from './app/hints';

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
  played: false,
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
  newJourney: () => newJourney(),
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
const screens = wireScreens(game, ui);
const hints = new Hints(game, () => ui.hud.touchMode || game.input.lastDevice === 'touch' || game.input.lastDevice === 'pen');
ui.settings.onRebind = (done) => { game.input.rebindListener = (code) => { game.input.rebindListener = null; done(code); }; };
// save slots, export & import (SPEC §27)
const slotInfo = new Map<number, string>();
async function refreshSlots(): Promise<void> {
  for (const n of [1, 2, 3]) {
    const sv = await readSave(n);
    slotInfo.set(n, sv ? `Day ${sv.day + 1}, ${String(Math.floor(sv.hour)).padStart(2, '0')}:${String(Math.floor((sv.hour % 1) * 60)).padStart(2, '0')}  -  ${new Date(sv.savedAt).toLocaleDateString()}` : 'empty');
  }
}
ui.settings.saves = {
  info: (n) => slotInfo.get(n) ?? '',
  useSlot: (n) => { setSetting('saveSlot', n); void readSave(n).then((sv) => { state.save = sv; ui.settings.note = 'Slot ' + n + (sv ? ' - Wander continues it' : ' - empty, a new journey'); }); },
  exportSave: () => { void readSave(settings.saveSlot).then((sv) => { if (sv) { exportSave(sv, settings.saveSlot); ui.settings.note = 'Saved to a file.'; } else ui.settings.note = 'This slot is empty.'; }); },
  importSave: () => { void importSave(settings.saveSlot).then((sv) => { ui.settings.note = sv ? 'Imported into slot ' + settings.saveSlot + '.' : 'That file is not a Hotaru save.'; if (sv) state.save = sv; void refreshSlots(); }); },
};
void refreshSlots();
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
    audio.setMono(settings.monoAudio);
    audio.onCaption = (text) => { if (settings.subtitles) ui.hud.caption(text, performance.now() / 1000); };
    if (state.mode === 'title') audio.music.playNow();
  }
  audio.update(dt, state.mode);
}

game.onToast = (text) => ui.hud.toast(text, undefined, undefined, performance.now() / 1000);

function applySettings(): void {
  if (state.mode !== 'shot') game.setClimate(settings.seasonMode === 'cycle' ? null : settings.seasonMode, settings.seasonDays, settings.weatherMode === 'fair' ? 'clear' : null);
  game.pipeline.settings.dither = settings.dither;
  game.pipeline.toggles.outlines = settings.outlines;
  ui.hud.showFps = settings.showFps;
  ui.hud.leftHanded = settings.leftHanded;
  ui.hud.highContrast = settings.highContrast;
  game.reducedMotion = settings.reducedMotion;
  audio?.setMono(settings.monoAudio);
}
bus.on('settings:changed', ({ key }) => {
  if (key === 'quality') { game.setQuality(settings.quality); autoQ.level = settings.quality; resize(); }
  if (key === 'largeText') resize();
  if (key === 'saveSlot') void refreshSlots();
  applySettings();
  audio?.setVolumes(audioVolumes());
});
bus.on('app:update-ready', () => ui.hud.toast('A new version is ready — tap to restart', 1e9, restartToUpdate, performance.now() / 1000));

function resize(): void {
  game.resize();
  ui.resize(game.pipeline.scale + (settings.largeText ? 1 : 0));
}

async function save(): Promise<void> {
  if (state.mode !== 'play') return;
  const c = game.controller;
  await writeSave(settings.saveSlot, { seed: game.world.seed, pos: [c.position.x, c.position.y, c.position.z], yaw: c.yaw, pitch: c.pitch, hour: clock.hour, day: clock.day, memory: game.world.people.memory, trust: game.world.fauna.trust, found: [...game.world.secrets.found], shrines: game.world.secrets.shrineState, gate: game.world.landmarks.gateOpen > 0, adv: game.adv.toJSON() as SaveData['adv'], story: game.mystic.toJSON() });
  state.save = await readSave(settings.saveSlot);
}

function startPlay(continueSave: boolean): void {
  const c = game.controller;
  const s = continueSave ? state.save : null;
  game.frozenElapsed = null;
  state.played = true;
  if (s) {
    c.placeAt(s.pos[0], s.pos[2]);
    c.yaw = s.yaw; c.pitch = s.pitch;
    clock.setHour(s.hour); clock.day = s.day;
    if (s.memory) game.world.people.memory = s.memory;
    if (s.trust) game.world.fauna.trust = s.trust;
    if (s.found) game.world.secrets.found = new Set(s.found);
    if (s.shrines) { game.world.secrets.shrineState = s.shrines; game.world.secrets.refresh(); }
    if (s.gate) game.world.landmarks.openGate();
    if (s.story) game.mystic.load(s.story);
    if (s.adv) game.adv.load(s.adv as Parameters<typeof game.adv.load>[0]);
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

/** A new journey replaces the slot's save: ask once; start from a clean world (reload) if we've played. */
let confirmNew = 0;
function newJourney(): void {
  const now = performance.now() / 1000;
  if (state.save && now > confirmNew) {
    confirmNew = now + 6;
    ui.hud.toast(`Tap New Journey again to start over in slot ${settings.saveSlot}. (Other slots: Settings - Saves.)`, 6, undefined, now);
    return;
  }
  if (state.played) { try { sessionStorage.setItem('hotaru.new', '1'); } catch { /* fine */ } location.reload(); return; }
  state.save = null;
  startPlay(false);
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
/** Auto quality (SPEC §3.13): step down while frames stay slow, back up when there's room. */
const autoQ = { level: settings.quality as 'low' | 'medium' | 'high', slow: 0, fast: 0, ms: 16 };
function autoQuality(frameMs: number, dt: number): void {
  if (!settings.autoQuality || state.mode !== 'play' || bench.running) return;
  autoQ.ms += (Math.min(100, frameMs) - autoQ.ms) * 0.05;
  const order = ['low', 'medium', 'high'] as const, i = order.indexOf(autoQ.level), max = order.indexOf(settings.quality);
  const budget = settings.fpsCap === 30 ? 36 : 20;
  autoQ.slow = autoQ.ms > budget ? autoQ.slow + dt : 0;
  autoQ.fast = autoQ.ms < budget * 0.55 ? autoQ.fast + dt : 0;
  const to = autoQ.slow > 6 && i > 0 ? order[i - 1]! : autoQ.fast > 40 && i < max ? order[i + 1]! : null;
  if (to) { autoQ.level = to; autoQ.slow = autoQ.fast = 0; game.setQuality(to); resize(); }
}
function loop(now: number): void {
  if (!state.running) return;
  // frame cap: skip frames that come too early
  if (settings.fpsCap && now - last < 1000 / settings.fpsCap - 2) { requestAnimationFrame(loop); return; }
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
  if (game.input.menuPressed) { game.input.menuPressed = false; if (state.mode === 'play' && !screens.close()) openMenu(); }
  if (state.mode === 'play') screens.update();
  game.input.enabled = state.mode === 'play';
  bench.update(dt, frameMs);
  autoQuality(frameMs, dt);
  hints.update(dt, state.mode === 'play' && ui.screen === 'play');
  if (state.mode !== 'gallery') game.frame(dt);
  ui.hud.fps = fps;
  ui.hud.dialogue = game.dialogue;
  const ml = game.mystic.line;
  ui.hud.haiku = game.viewPan ? { text: game.viewPan.haiku, t: game.viewPan.t } : ml ? { text: ml.text, t: ml.t + 1 } : null;
  ui.hud.fade = game.fade;
  // interact prompt: the targeted thing, or sit / lie / stand where you are
  if (state.mode === 'play') {
    const c = game.controller, t = game.interactions.target;
    const ICON: Record<string, string> = { sit: 'sit', pick: 'pick', fish: 'fish', row: 'row', give: 'gift', read: 'book' };
    const shore = game.adv.boating && game.adv.boat.landing();
    ui.hud.prompt = game.adv.fishing.active ? null : game.adv.boating ? (shore ? { icon: 'row', label: 'Step ashore' } : null)
      : t && !c.sitting ? { icon: ICON[t.kind] ?? 'hand', label: t.label }
      : c.sitHint ? { icon: c.sitHint, label: '' } : null;
    ui.hud.canTimelapse = c.sitting;
  } else ui.hud.prompt = null;
  ui.frame(now / 1000, dt);
  debug.update(fps);
  try { updateAudio(dt); } catch (e) { console.warn('audio', e); }
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
  state.save = await readSave(settings.saveSlot);
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
    save, readSave: () => readSave(settings.saveSlot), autoQuality, setSetting,
  };
}

void boot();
