/**
 * Debug panel (SPEC §2): toggled with ` or a three-finger tap. A developer tool, so it is
 * plain DOM (the player-facing UI is all pixel art).
 */
import type { Game } from '../app/game';
import { clock } from '../core/clock';
import type { Benchmark } from './benchmark';
import { setSetting, settings } from '../app/settings';
import type { QualityName } from '../config';
import { WorldMap } from './worldMap';

export class DebugPanel {
  readonly el: HTMLDivElement;
  private stats: HTMLPreElement;
  private time: HTMLInputElement;
  private benchOut: HTMLTextAreaElement;
  visible = false;
  private map: WorldMap;

  constructor(private game: Game, bench: Benchmark, onGallery: () => void) {
    const el = (this.el = document.createElement('div'));
    el.style.cssText = 'position:fixed;top:8px;right:8px;width:290px;max-height:90vh;overflow:auto;z-index:20;background:rgba(14,20,48,.92);color:#ffe6a3;font:11px/1.35 ui-monospace,monospace;padding:8px;border:1px solid #7d8fc2;display:none;user-select:text;-webkit-user-select:text;touch-action:auto';
    el.innerHTML = `<b>HOTARU debug</b> <span style="opacity:.6">(\` or 3-finger tap)</span>`;
    this.stats = document.createElement('pre');
    this.stats.style.cssText = 'margin:6px 0;white-space:pre-wrap;color:#c8d0f0';
    el.append(this.stats);

    const row = (label: string, node: HTMLElement) => {
      const d = document.createElement('div');
      d.style.margin = '4px 0';
      const l = document.createElement('span');
      l.textContent = label + ' ';
      d.append(l, node);
      el.append(d);
      return d;
    };
    const btn = (text: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.style.cssText = 'margin:2px;font:inherit;background:#33406b;color:#ffe6a3;border:1px solid #7d8fc2;padding:2px 6px';
      b.onclick = fn;
      return b;
    };
    const check = (label: string, get: () => boolean, set: (v: boolean) => void) => {
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = get();
      c.onchange = () => set(c.checked);
      const s = document.createElement('label');
      s.style.marginRight = '8px';
      s.append(c, ' ' + label);
      return s;
    };

    this.time = document.createElement('input');
    this.time.type = 'range'; this.time.min = '0'; this.time.max = '24'; this.time.step = '0.05';
    this.time.oninput = () => { clock.setHour(Number(this.time.value)); game.pipeline.buildLutNow(clock.hour); };
    row('time', this.time);
    const timeRow = document.createElement('div');
    timeRow.append(
      check('pause time', () => clock.paused, (v) => (clock.paused = v)),
      btn('×20', () => (clock.timeScale = clock.timeScale === 20 ? 1 : 20)),
    );
    el.append(timeRow);

    const weather = document.createElement('select');
    weather.innerHTML = '<option>clear</option>';
    weather.disabled = true;
    row('weather (M6)', weather);
    const season = document.createElement('select');
    season.innerHTML = '<option>autumn</option>';
    season.disabled = true;
    row('season (M6)', season);

    const q = document.createElement('select');
    for (const n of ['low', 'medium', 'high']) q.add(new Option(n, n, false, settings.quality === n));
    q.onchange = () => setSetting('quality', q.value as QualityName);
    row('quality', q);

    const tp = document.createElement('div');
    tp.append(document.createTextNode('teleport: '));
    for (const s of game.shots) tp.append(btn(s.label, () => { game.applyShot(s); void game.world.preload(game.controller.position); }));
    tp.append(btn('walk', () => { game.frozenElapsed = null; game.controller.mode = 'walk'; }));
    el.append(tp);

    const cam = document.createElement('div');
    cam.append(
      check('free fly', () => game.controller.mode === 'fly', (v) => { game.frozenElapsed = null; game.controller.mode = v ? 'fly' : 'walk'; }),
      check('pixel snap', () => game.snapRotation, (v) => (game.snapRotation = v)),
    );
    el.append(cam);

    const passes = document.createElement('div');
    passes.append(document.createTextNode('passes: '));
    for (const k of Object.keys(game.pipeline.toggles) as (keyof typeof game.pipeline.toggles)[]) {
      passes.append(check(k, () => game.pipeline.toggles[k], (v) => (game.pipeline.toggles[k] = v)));
    }
    el.append(passes);

    const seed = document.createElement('input');
    seed.value = String(game.world.seed);
    seed.style.width = '90px';
    row('seed', seed).append(btn('go', () => { const u = new URL(location.href); u.searchParams.set('seed', seed.value); location.href = u.toString(); }));

    const b = document.createElement('div');
    b.append(btn('Benchmark (current preset)', () => bench.start([game.quality.name])), btn('All presets (3 min)', () => bench.start(['low', 'medium', 'high'])));
    el.append(b);
    this.benchOut = document.createElement('textarea');
    this.benchOut.style.cssText = 'width:100%;height:70px;font:inherit;background:#0e1430;color:#ffe6a3;border:1px solid #33406b';
    this.benchOut.placeholder = 'benchmark result appears here — copy it';
    el.append(this.benchOut);
    el.append(btn('Copy result', () => { this.benchOut.select(); void navigator.clipboard?.writeText(this.benchOut.value); }));
    el.append(btn('UI gallery', onGallery));
    const mapHead = document.createElement('div');
    mapHead.textContent = 'world map (click to teleport):';
    mapHead.style.marginTop = '6px';
    this.map = new WorldMap(game);
    el.append(mapHead, this.map.el);
    bench.onProgress = (t) => (this.benchOut.value = t);
    bench.onDone = (line) => { this.benchOut.value = line; this.show(true); };

    document.body.append(el);
    addEventListener('keydown', (e) => { if (e.code === 'Backquote') this.show(!this.visible); });
    addEventListener('touchstart', (e) => { if (e.touches.length === 3) this.show(!this.visible); }, { passive: true });
  }

  show(v: boolean): void {
    this.visible = v;
    this.el.style.display = v ? 'block' : 'none';
    if (v) this.map.draw();
  }

  update(fps: number): void {
    if (!this.visible) return;
    const g = this.game, p = g.pipeline, s = g.stats;
    this.stats.textContent =
      `fps ${fps.toFixed(0)}  frame ${s.frameMs.toFixed(1)}ms (cpu)\n` +
      `draws ${s.drawCalls}  tris ${(s.triangles / 1000).toFixed(0)}k\n` +
      `internal ${p.width}x${p.height} ×${p.scale}  ${p.isHdr ? 'HDR' : 'LDR'}\n` +
      `terrain nodes ${g.world.terrain.stats.drawn} drawn / ${g.world.terrain.stats.cached} cached, jobs ${g.world.terrain.stats.loading}\n` +
      `forest tiles ${g.world.forest.stats.tiles}, trees ${g.world.forest.stats.trees}  lights ${g.world.dock.lights.length}\n` +
      `hour ${clock.hour.toFixed(2)}  pos ${g.controller.position.toArray().map((v) => v.toFixed(1)).join(',')}`;
    if (document.activeElement !== this.time) this.time.value = String(clock.hour);
    this.map.update();
  }
}
