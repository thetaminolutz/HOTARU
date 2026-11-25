/** Small retained-mode UI toolkit (SPEC §9.4): plaque buttons, lantern toggles, bead sliders, panels. */
import type { UICanvas } from './uiCanvas';
import { bodyFont } from './font';
import { C, plaque, lanternIcon, bead, washi, lacquer, indigoCloth } from './art';
import type { Pixmap } from '../render/pixmap';

/** Sound hook for presses (set by the audio system). */
export const uiSound = { press: (): void => undefined };

export type Pointer = { type: 'down' | 'move' | 'up'; x: number; y: number; id: number; kind?: 'mouse' | 'touch' | 'pen' };

export abstract class Widget {
  x = 0; y = 0; w = 0; h = 0;
  hover = false;
  pressed = false;
  /** Extra touch slop so hit areas are ≥ 44 pt even when the art is smaller. */
  slop = 4;
  abstract draw(ui: UICanvas, t: number): void;
  hit(px: number, py: number): boolean {
    return px >= this.x - this.slop && py >= this.y - this.slop && px < this.x + this.w + this.slop && py < this.y + this.h + this.slop;
  }
  pointer(_p: Pointer): boolean { return false; }
  place(x: number, y: number): this { this.x = Math.round(x); this.y = Math.round(y); return this; }
}

const ART: { plaque?: Pixmap; plaqueHi?: Pixmap; washi?: Pixmap; lacquer?: Pixmap; indigo?: Pixmap; beadG?: Pixmap; beadS?: Pixmap } = {};
export function art() {
  ART.plaque ??= plaque(0); ART.plaqueHi ??= plaque(1); ART.washi ??= washi(); ART.lacquer ??= lacquer(); ART.indigo ??= indigoCloth();
  ART.beadG ??= bead(C.gold); ART.beadS ??= bead(C.vermilion);
  return ART as Required<typeof ART>;
}

export class Button extends Widget {
  constructor(public label: string, public onTap: () => void, w = 0, h = 17) {
    super();
    this.w = w || bodyFont.measure(label) + 16;
    this.h = h;
  }
  selected = false;
  draw(ui: UICanvas): void {
    const a = art();
    const hi = this.hover || this.pressed || this.selected;
    const dy = this.pressed ? 1 : 0;
    ui.nine(hi ? a.plaqueHi : a.plaque, this.x, this.y + dy, this.w, this.h, 5);
    ui.text(bodyFont, this.label, this.x + this.w / 2, this.y + 4 + dy, hi ? C.amberCore : C.paperLight, { align: 'center', shadow: C.woodDark });
    if (hi) { ui.blend(this.x - 4, this.y + this.h / 2, C.amberCore); ui.blend(this.x - 5, this.y + this.h / 2, C.amber, 140); }
  }
  override pointer(p: Pointer): boolean {
    const inside = this.hit(p.x, p.y);
    if (p.type === 'move') { this.hover = inside; return false; }
    if (p.type === 'down' && inside) { this.pressed = true; return true; }
    if (p.type === 'up') {
      const was = this.pressed;
      this.pressed = false;
      if (was && inside) { uiSound.press(); this.onTap(); return true; }
    }
    return false;
  }
}

export class Toggle extends Widget {
  constructor(public label: string, public value: boolean, public onChange: (v: boolean) => void) {
    super();
    this.w = 18 + bodyFont.measure(label);
    this.h = 16;
  }
  draw(ui: UICanvas, t: number): void {
    ui.sprite(lanternIcon(this.value, 0.5 + 0.5 * Math.sin(t * 9)), this.x, this.y);
    ui.text(bodyFont, this.label, this.x + 17, this.y + 4, this.value ? C.amberCore : C.moon, { shadow: C.indigoDark });
  }
  override pointer(p: Pointer): boolean {
    if (p.type === 'down' && this.hit(p.x, p.y)) { uiSound.press(); this.value = !this.value; this.onChange(this.value); return true; }
    return false;
  }
}

/** Slider as beads on a string; the big gold bead is the handle. */
export class Slider extends Widget {
  private dragging = -1;
  /** How the value is shown (default: percent). */
  format: (v: number) => string = (v) => Math.round(v * 100) + '%';
  constructor(public label: string, public value: number, public onChange: (v: number) => void, w = 90) {
    super();
    this.w = w;
    this.h = 20;
  }
  draw(ui: UICanvas): void {
    const a = art();
    ui.text(bodyFont, this.label, this.x, this.y, C.moon, { shadow: C.indigoDark });
    const y = this.y + 14, x0 = this.x + 3, x1 = this.x + this.w - 4;
    ui.hline(x0, x1, y, C.string);
    for (let i = 0; i <= 8; i++) {
      const bx = Math.round(x0 + ((x1 - x0) * i) / 8);
      ui.disc(bx, y, 1, i / 8 <= this.value ? C.vermilion : C.woodDark);
    }
    ui.sprite(a.beadG, Math.round(x0 + (x1 - x0) * this.value) - 3, y - 3);
    ui.text(bodyFont, this.format(this.value), this.x + this.w, this.y, C.paperDark, { align: 'right', shadow: C.indigoDark });
  }
  override pointer(p: Pointer): boolean {
    const set = () => {
      const x0 = this.x + 3, x1 = this.x + this.w - 4;
      this.value = Math.min(1, Math.max(0, (p.x - x0) / (x1 - x0)));
      this.onChange(this.value);
    };
    if (p.type === 'down' && this.hit(p.x, p.y)) { this.dragging = p.id; set(); return true; }
    if (p.type === 'move' && this.dragging === p.id) { set(); return true; }
    if (p.type === 'up' && this.dragging === p.id) { this.dragging = -1; return true; }
    return false;
  }
}

export type PanelStyle = 'washi' | 'lacquer' | 'indigo';
export function panel(ui: UICanvas, style: PanelStyle, x: number, y: number, w: number, h: number): void {
  const a = art();
  if (style === 'washi') ui.nine(a.washi, x, y, w, h, 6);
  else if (style === 'lacquer') ui.nine(a.lacquer, x, y, w, h, 7);
  else ui.nine(a.indigo, x, y, w, h, 6);
}

/** Fireflies that drift across menus. */
export class UIFireflies {
  private flies: { x: number; y: number; vx: number; vy: number; ph: number }[] = [];
  constructor(count: number, seed = 1) {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) this.flies.push({ x: rnd(), y: 0.35 + rnd() * 0.65, vx: (rnd() - 0.5) * 0.02, vy: (rnd() - 0.5) * 0.01, ph: rnd() * 10 });
  }
  draw(ui: UICanvas, t: number, dt: number): void {
    for (const f of this.flies) {
      f.x += (f.vx + Math.sin(t * 0.7 + f.ph) * 0.006) * dt;
      f.y += (f.vy + Math.cos(t * 0.5 + f.ph) * 0.004) * dt;
      if (f.x < -0.02) f.x = 1.02; if (f.x > 1.02) f.x = -0.02;
      if (f.y < 0.2) f.vy = Math.abs(f.vy); if (f.y > 0.98) f.vy = -Math.abs(f.vy);
      const b = Math.sin(t * 1.3 + f.ph * 3);
      if (b < 0.1) continue;
      const x = Math.round(f.x * ui.w), y = Math.round(f.y * ui.h);
      ui.blend(x, y, 0xf6ffb0, 255 * b);
      if (b > 0.6) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) ui.blend(x + dx, y + dy, 0xb8e06a, 120 * b);
    }
  }
}
