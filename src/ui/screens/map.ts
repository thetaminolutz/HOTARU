/**
 * The map screen (SPEC §11): the painted map, revealed only where you've been (soft dithered
 * edges into blank washi), names of places you've discovered, your position, 8 stamps to place
 * (tap a stamp, tap the map; tap a stamp on the map to lift it) and ink drawing — with Apple
 * Pencil the line follows pressure; with a finger or mouse pick the brush first. Drag pans,
 * the + / − plaques zoom.
 */
import type { UICanvas } from '../uiCanvas';
import { bodyFont, tinyFont, headingFont } from '../font';
import { C } from '../art';
import { Button, panel, type Pointer } from '../widgets';
import { Pixmap } from '../../render/pixmap';
import { MAP_PX, PAPER, toMap, fromMap, stampIcon, STAMPS, paintMap } from '../mapArt';
import { MAP_CELLS, type Journey } from '../../items/journey';
import { REGIONS } from '../../world/data/regions';
import type { World } from '../../world/heightfield';
import { cleanText } from './hud';

export type MapSource = { world: World; journey: Journey; player: () => { x: number; z: number; yaw: number }; dock: { x: number; z: number }; villages: { id: string; name: string; x: number; z: number }[]; info: () => string };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export class MapScreen {
  private art: Pixmap | null = null;
  private zoom = 1;
  /** map-space centre of the view */
  private cu = MAP_PX / 2; private cv = MAP_PX / 2;
  private view = { x: 0, y: 0, w: 0, h: 0, k: 1 };
  private tool: number = -1; // −1 pan, 0..7 stamp, 8 brush
  private drag: { id: number; x: number; y: number; pen: boolean; stroke: number[] | null; w: number[] } | null = null;
  private buttons: Button[];
  private stampIcons = STAMPS.map((_, i) => stampIcon(i));
  constructor(private src: MapSource, private onClose: () => void) {
    this.buttons = [
      new Button('+', () => { this.zoom = Math.min(4, this.zoom * 2); }, 17),
      new Button('-', () => { this.zoom = Math.max(1, this.zoom / 2); }, 17),
      new Button('Me', () => this.centre(), 26),
      new Button('Close', () => this.onClose(), 40),
    ];
  }

  open(): void {
    this.art ??= paintMap(this.src.world, this.src.dock);
    this.centre();
  }
  private centre(): void { const p = this.src.player(); [this.cu, this.cv] = toMap(p.x, p.z); }

  private toScreen(u: number, v: number): [number, number] {
    const V = this.view;
    return [V.x + V.w / 2 + (u - this.cu) * V.k, V.y + V.h / 2 + (v - this.cv) * V.k];
  }
  private toMapPx(x: number, y: number): [number, number] {
    const V = this.view;
    return [this.cu + (x - V.x - V.w / 2) / V.k, this.cv + (y - V.y - V.h / 2) / V.k];
  }

  draw(ui: UICanvas, t: number): void {
    const s = ui.safe, j = this.src.journey;
    ui.rect(0, 0, ui.w, ui.h, C.indigoDark, 200);
    const side = 46;
    const H = ui.h - s.top - s.bottom - 12, W = Math.min(ui.w - s.left - s.right - side - 16, H);
    const x0 = Math.round((ui.w - W - side) / 2), y0 = s.top + 6;
    panel(ui, 'washi', x0 - 4, y0 - 4, W + 8, H + 8);
    const base = Math.min(W, H) / MAP_PX;
    this.view = { x: x0, y: y0, w: W, h: H, k: base * this.zoom };
    const V = this.view, art = this.art!;
    // clamp panning to the map
    const hw = V.w / 2 / V.k, hh = V.h / 2 / V.k;
    this.cu = Math.min(MAP_PX - Math.min(hw, MAP_PX / 2), Math.max(Math.min(hw, MAP_PX / 2), this.cu));
    this.cv = Math.min(MAP_PX - Math.min(hh, MAP_PX / 2), Math.max(Math.min(hh, MAP_PX / 2), this.cv));
    const R = MAP_PX / MAP_CELLS;
    for (let y = 0; y < V.h; y++) for (let x = 0; x < V.w; x++) {
      const u = this.cu + (x - V.w / 2) / V.k, v = this.cv + (y - V.h / 2) / V.k;
      if (u < 0 || v < 0 || u >= MAP_PX || v >= MAP_PX) continue;
      // fog of war: bilinear reveal, dithered edge
      const fu = u / R - 0.5, fv = v / R - 0.5, iu = Math.floor(fu), iv = Math.floor(fv), du = fu - iu, dv = fv - iv;
      const rv = (a: number, b: number) => (a < 0 || b < 0 || a >= MAP_CELLS || b >= MAP_CELLS ? 0 : j.reveal[b * MAP_CELLS + a]!);
      const rev = ((rv(iu, iv) * (1 - du) + rv(iu + 1, iv) * du) * (1 - dv) + (rv(iu, iv + 1) * (1 - du) + rv(iu + 1, iv + 1) * du) * dv) / 255;
      const th = (BAYER[((y & 3) << 2) | (x & 3)]! + 0.5) / 16;
      ui.blend(V.x + x, V.y + y, rev > th * 0.9 + 0.05 ? art.get(Math.floor(u), Math.floor(v)) : PAPER);
    }
    // your drawings and stamps
    for (const st of j.strokes) for (let i = 2; i < st.pts.length; i += 2) {
      const [ax, ay] = this.toScreen(...toMap(st.pts[i - 2]!, st.pts[i - 1]!)), [bx, by] = this.toScreen(...toMap(st.pts[i]!, st.pts[i + 1]!));
      const wd = Math.max(1, Math.round((st.w[i / 2] ?? 1) * Math.min(2, this.zoom)));
      for (let o = 0; o < wd; o++) ui.line(Math.round(ax + o * 0.5), Math.round(ay + o * 0.5), Math.round(bx + o * 0.5), Math.round(by + o * 0.5), st.color, 230);
    }
    for (const st of j.stamps) {
      const [sx, sy] = this.toScreen(...toMap(st.x, st.z));
      if (sx > V.x && sy > V.y && sx < V.x + V.w && sy < V.y + V.h) ui.sprite(this.stampIcons[st.icon]!, sx - 4, sy - 4);
    }
    // names of places you've been
    for (const r of REGIONS) if (j.places[r.id] !== undefined) {
      const [sx, sy] = this.toScreen(...toMap(r.x, r.z));
      if (sx > V.x + 10 && sy > V.y + 4 && sx < V.x + V.w - 10 && sy < V.y + V.h - 8) ui.text(tinyFont, cleanText(r.name).toUpperCase(), Math.round(sx), Math.round(sy), C.ink, { align: 'center', outline: C.paperLight });
    }
    if (this.zoom >= 2) for (const v of this.src.villages) if (j.places['v-' + v.id] !== undefined) {
      const [sx, sy] = this.toScreen(...toMap(v.x, v.z));
      if (sx > V.x + 10 && sy > V.y + 8 && sx < V.x + V.w - 10 && sy < V.y + V.h - 4) ui.text(bodyFont, v.name, Math.round(sx), Math.round(sy) - 12, C.vermilion, { align: 'center', outline: C.paperLight });
    }
    // you: a small red arrow, pulsing
    const p = this.src.player(), [px, py] = this.toScreen(...toMap(p.x, p.z));
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if (Math.sin(t * 4) > -0.6) {
      ui.line(Math.round(px), Math.round(py), Math.round(px + fx * 5), Math.round(py + fz * 5), C.seal);
      ui.disc(Math.round(px), Math.round(py), 2, C.seal);
      ui.disc(Math.round(px), Math.round(py), 1, C.paperLight);
    }
    // title and a corner note
    ui.text(headingFont, 'Map', x0 + 6, y0 + 2, C.ink, { outline: C.paperLight });
    ui.text(tinyFont, (Math.round(j.explored * 1000) / 10).toFixed(1) + '% EXPLORED  ' + this.src.info().toUpperCase(), x0 + 6, y0 + H - 9, C.inkSoft, { outline: C.paperLight });
    // the side bar: zoom, stamps, brush
    const sx = x0 + W + 10;
    let by = y0;
    this.buttons.forEach((b, i) => { b.place(i < 2 ? sx + i * 20 : sx, by); b.draw(ui); if (i !== 0) by += 21; });
    by += 4;
    for (let i = 0; i < 8; i++) {
      const bx = sx + (i % 2) * 20, yy = by + Math.floor(i / 2) * 18;
      panel(ui, this.tool === i ? 'lacquer' : 'washi', bx, yy, 17, 16);
      ui.sprite(this.stampIcons[i]!, bx + 4, yy + 4);
    }
    by += 76;
    panel(ui, this.tool === 8 ? 'lacquer' : 'washi', sx, by, 37, 16);
    ui.text(bodyFont, 'Brush', sx + 18, by + 3, this.tool === 8 ? C.amberCore : C.ink, { align: 'center' });
    this.brushRect = { x: sx, y: by, w: 37, h: 16 };
    by += 19;
    panel(ui, 'washi', sx, by, 37, 16);
    ui.text(bodyFont, 'Clear', sx + 18, by + 3, C.ink, { align: 'center' });
    this.clearRect = { x: sx, y: by, w: 37, h: 16 };
    this.stampRect = { x: sx, y: by - 19 - 76, w: 37, h: 72 };
  }
  private brushRect = { x: 0, y: 0, w: 0, h: 0 };
  private clearRect = { x: 0, y: 0, w: 0, h: 0 };
  private stampRect = { x: 0, y: 0, w: 0, h: 0 };

  pointer(p: Pointer & { pressure?: number }): void {
    for (const b of this.buttons) if (b.pointer(p)) return;
    const j = this.src.journey, inR = (r: { x: number; y: number; w: number; h: number }) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
    if (p.type === 'down') {
      if (inR(this.brushRect)) { this.tool = this.tool === 8 ? -1 : 8; return; }
      if (inR(this.clearRect)) { j.strokes = []; return; }
      if (inR(this.stampRect)) { const i = Math.floor((p.y - this.stampRect.y) / 18) * 2 + Math.floor((p.x - this.stampRect.x) / 20); if (i >= 0 && i < 8) this.tool = this.tool === i ? -1 : i; return; }
      const V = this.view;
      if (p.x < V.x || p.y < V.y || p.x >= V.x + V.w || p.y >= V.y + V.h) return;
      const [u, v] = this.toMapPx(p.x, p.y), [wx, wz] = fromMap(u, v);
      // lift a stamp under the finger
      const hit = j.stamps.findIndex((s) => { const [sx, sy] = this.toScreen(...toMap(s.x, s.z)); return Math.abs(sx - p.x) < 6 && Math.abs(sy - p.y) < 6; });
      if (hit >= 0 && this.tool < 8) { j.stamps.splice(hit, 1); return; }
      if (this.tool >= 0 && this.tool < 8) { j.stamps.push({ x: wx, z: wz, icon: this.tool }); return; }
      const pen = p.kind === 'pen' || this.tool === 8;
      this.drag = { id: p.id, x: p.x, y: p.y, pen, stroke: pen ? [wx, wz] : null, w: [this.width(p)] };
      if (pen) j.strokes.push({ pts: this.drag.stroke!, w: this.drag.w, color: 0x2a1e24 });
      return;
    }
    const d = this.drag;
    if (!d || d.id !== p.id) return;
    if (p.type === 'move') {
      if (d.pen) {
        const [u, v] = this.toMapPx(p.x, p.y), [wx, wz] = fromMap(u, v);
        if (Math.hypot(p.x - d.x, p.y - d.y) >= 1) { d.stroke!.push(wx, wz); d.w.push(this.width(p)); d.x = p.x; d.y = p.y; }
      } else { this.cu -= (p.x - d.x) / this.view.k; this.cv -= (p.y - d.y) / this.view.k; d.x = p.x; d.y = p.y; }
    } else {
      if (d.pen && j.strokes.length > 200) j.strokes.shift();
      this.drag = null;
    }
  }
  private width(p: { pressure?: number; kind?: string }): number { return p.kind === 'pen' ? 0.6 + (p.pressure ?? 0.5) * 2.4 : 1.2; }

  wheel(dy: number): void { this.zoom = dy < 0 ? Math.min(4, this.zoom * 2) : Math.max(1, this.zoom / 2); }
}
