/**
 * Debug world map: height/biome image of the whole world, region list, click-to-teleport,
 * and the POI density heatmap (red = more than ~2 minutes of walking without anything).
 */
import type { Game } from '../app/game';
import { REGIONS, EXTENT, HALF } from '../world/data/regions';
import { POIS, POI_RADIUS } from '../secrets/poi';

export class WorldMap {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private drawn = false;
  private heat = false;
  private readonly S = 256;

  constructor(private game: Game) {
    this.el = document.createElement('div');
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = this.S;
    this.canvas.style.cssText = 'width:256px;height:256px;image-rendering:pixelated;cursor:crosshair;border:1px solid #7d8fc2;display:block';
    this.canvas.onclick = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * EXTENT * 2 - EXTENT;
      const z = ((e.clientY - r.top) / r.height) * EXTENT * 2 - EXTENT;
      this.teleport(x, z);
    };
    const heat = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.onchange = () => { this.heat = cb.checked; this.drawn = false; this.draw(); };
    heat.append(cb, ' POI heatmap');
    const list = document.createElement('div');
    for (const r of REGIONS) {
      const b = document.createElement('button');
      b.textContent = r.sub;
      b.style.cssText = 'margin:1px;font:inherit;font-size:10px;background:#1c2550;color:#c8d0f0;border:1px solid #33406b';
      b.onclick = () => this.teleport(r.x, r.z);
      list.append(b);
    }
    this.el.append(this.canvas, heat, list);
  }

  teleport(x: number, z: number): void {
    const g = this.game;
    g.frozenElapsed = null;
    g.controller.mode = 'fly';
    g.controller.position.set(x, Math.max(g.world.height(x, z), 0) + 40, z);
    g.controller.pitch = -0.25;
  }

  draw(): void {
    if (this.drawn) return;
    this.drawn = true;
    const S = this.S, w = this.game.world.world;
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = -EXTENT + ((i + 0.5) / S) * EXTENT * 2, z = -EXTENT + ((j + 0.5) / S) * EXTENT * 2;
      const h = w.height(x, z);
      const hx = w.height(x + 40, z);
      const shade = Math.max(0.5, Math.min(1.4, 1 + (h - hx) * 0.01));
      let c: number[];
      if (h < 0) c = [30, 50, 110];
      else if (h > 950) c = [225, 225, 235];
      else {
        const b = w.biome(x, z);
        c = [b.grass[0] * 600, b.grass[1] * 600, b.grass[2] * 600];
        if (b.forest > 0.6) c = c.map((v) => v * 0.65);
      }
      if (this.heat && h >= 0 && Math.abs(x) < HALF && Math.abs(z) < HALF) {
        const near = POIS.some((p) => Math.hypot(p.x - x, p.z - z) < POI_RADIUS);
        if (!near) c = [c[0]! * 0.5 + 120, c[1]! * 0.5, c[2]! * 0.5];
      }
      const k = (j * S + i) * 4;
      img.data[k] = Math.min(255, c[0]! * shade); img.data[k + 1] = Math.min(255, c[1]! * shade); img.data[k + 2] = Math.min(255, c[2]! * shade); img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = '#ff6060';
    const p = (v: number) => ((v + EXTENT) / (EXTENT * 2)) * S;
    ctx.strokeRect(p(-HALF), p(-HALF), p(HALF) - p(-HALF), p(HALF) - p(-HALF));
    ctx.fillStyle = '#ffe6a3';
    for (const q of POIS) ctx.fillRect(p(q.x) - 1, p(q.z) - 1, 2, 2);
  }

  /** Mark the player on the map (cheap overlay redraw). */
  update(): void {
    if (!this.drawn) return;
    const ctx = this.canvas.getContext('2d')!;
    const c = this.game.controller.position;
    const p = (v: number) => ((v + EXTENT) / (EXTENT * 2)) * this.S;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p(c.x) - 1, p(c.z) - 1, 3, 3);
  }
}
