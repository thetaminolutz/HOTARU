/**
 * In-game HUD (SPEC §9): almost nothing. FPS (optional), toasts, a first-time hint,
 * and on touch devices a koi stick (left) + look drag (right) + a menu token.
 */
import type { UICanvas } from '../uiCanvas';
import { bodyFont, tinyFont, headingFont } from '../font';
import { C, koiStick, token, icon } from '../art';
import { panel, type Pointer } from '../widgets';
import type { Pixmap } from '../../render/pixmap';
import { itemIcon } from '../../items/items';

export type Toast = { text: string; until: number; onTap?: () => void };

export class Hud {
  fps = 0;
  showFps = false;
  toasts: Toast[] = [];
  hint = '';
  hintUntil = 0;
  touchMode = false;
  /** Stick state written to the game input. */
  stick = { active: false, id: -1, cx: 0, cy: 0, x: 0, y: 0 };
  look = { id: -1, lx: 0, ly: 0, dx: 0, dy: 0 };
  private stickArt: Pixmap = koiStick();
  private tokenArt: Pixmap = token();
  private menuRect = { x: 0, y: 0, w: 19, h: 19 };
  private jumpRect = { x: 0, y: 0, w: 19, h: 19 };
  private actRect = { x: 0, y: 0, w: 19, h: 19 };
  private timeRect = { x: 0, y: 0, w: 19, h: 19 };
  lastUse = 0;
  /** What the interact button / bubble shows: an icon name and a label (or null). */
  prompt: { icon: string; label: string } | null = null;
  /** A viewpoint's haiku, faded in and out over `t` seconds of 16. */
  haiku: { text: string; t: number } | null = null;
  /** A conversation in progress: who, their portrait, the lines, the current line and how much is shown. */
  dialogue: { name: string; title: string; portrait: Pixmap; lines: string[]; index: number; shown: number } | null = null;
  /** Sitting: show the time-lapse token. */
  canTimelapse = false;
  timelapseHeld = false;
  private timeId = -1;
  /** Screen fade 0..1 (soft landings). */
  fade = 0;
  /** Touch tokens pressed this frame (read by the game). */
  jumpTap = false;
  actTap = false;
  /** the interact token is held (reeling in) */
  actHeld = false;
  private actId = -1;
  /** journal / map / photo / tool tokens tapped (touch) */
  taps = { journal: false, map: false, photo: false, tool: false };
  private quick: { key: keyof Hud['taps']; x: number; y: number }[] = [];
  /** the tool in hand (drawn in the lower right), a status line, the reel, a landed fish */
  held: { id: string; color: number; glow: boolean } | null = null;
  status = '';
  reel: number | null = null;
  landed: { name: string; text: string; size: number; best: boolean; colors: [string, string] } | null = null;

  constructor(private onMenu: () => void) {}

  toast(text: string, seconds = 5, onTap?: () => void, now = performance.now() / 1000): void {
    this.toasts.push({ text, until: now + seconds, onTap });
  }

  /** The dialogue box: a washi scroll along the bottom with a portrait and typewriter text. */
  private drawDialogue(ui: UICanvas, t: number): void {
    const d = this.dialogue;
    if (!d) return;
    const s = ui.safe;
    const w = Math.min(ui.w - 16, 300), h = 62;
    const x = Math.round(ui.w / 2 - w / 2), y = ui.h - s.bottom - h - 8;
    panel(ui, 'washi', x, y, w, h);
    ui.sprite(d.portrait, x + 8, y + 8);
    ui.text(bodyFont, cleanText(d.name), x + 42, y + 7, C.ink);
    if (d.title) ui.text(tinyFont, cleanText(d.title).toUpperCase(), x + 42 + bodyFont.measure(cleanText(d.name)) + 5, y + 9, C.inkSoft);
    const line = cleanText(d.lines[d.index] ?? '');
    ui.textBlock(bodyFont, line.slice(0, Math.floor(d.shown)), x + 42, y + 21, w - 52, C.ink);
    if (d.shown >= line.length && Math.sin(t * 5) > 0) ui.text(tinyFont, d.index < d.lines.length - 1 ? '>' : 'x', x + w - 12, y + h - 12, C.vermilion);
  }

  /** Haiku in brush lettering across the top of the view. */
  private drawHaiku(ui: UICanvas): void {
    const h = this.haiku;
    if (!h) return;
    const a = Math.min(1, Math.min(h.t - 1.5, 15 - h.t) / 1.5);
    if (a <= 0) return;
    const lines = cleanText(h.text).split(' / ');
    const y0 = ui.safe.top + 18;
    lines.forEach((l, i) => {
      // reveal line by line, like brush strokes
      if (h.t < 1.5 + i * 1.2) return;
      ui.text(headingFont, l, Math.round(ui.w / 2), y0 + i * (headingFont.lineHeight + 2), a > 0.5 ? C.paperLight : C.paperDark, { align: 'center', shadow: C.ink });
    });
  }

  /** Held item, fishing status, the reel and a landed fish (SPEC §8 hands, §21 fishing). */
  private drawExtras(ui: UICanvas, t: number): void {
    const s = ui.safe;
    if (this.held) {
      const bob = Math.round(Math.sin(t * 1.8) * 1.5), x = ui.w - s.right - (this.touchMode ? 92 : 40), y = ui.h - s.bottom - 34 + bob;
      if (this.held.glow) { ui.disc(x + 12, y + 12, 16, C.amber, 40); ui.disc(x + 12, y + 12, 10, C.amberCore, 50); }
      ui.sprite(itemIcon(this.held.id, this.held.color), x, y, 2);
    }
    if (this.status) ui.text(bodyFont, this.status, ui.w / 2, ui.h - s.bottom - (this.dialogue ? 84 : 30), C.paperLight, { align: 'center', shadow: C.indigoDark });
    if (this.reel !== null) {
      const w = 90, x = Math.round(ui.w / 2 - w / 2), y = ui.h - s.bottom - 44;
      ui.rect(x - 1, y - 1, w + 2, 6, C.woodDark);
      ui.rect(x, y, Math.round(w * this.reel), 4, C.gold);
      for (let k = 1; k < 6; k++) ui.vline(x + Math.round((w * k) / 6), y, y + 3, C.woodDark);
    }
    const L = this.landed;
    if (L) {
      const w = 150, h = 58, x = Math.round(ui.w / 2 - w / 2), y = Math.round(ui.h / 2 - h / 2) - 20;
      panel(ui, 'washi', x, y, w, h);
      const c0 = parseInt(L.colors[0].slice(1), 16), c1 = parseInt(L.colors[1].slice(1), 16);
      // a quick fish sketch: body, belly, tail, eye
      for (let i = 0; i < 26; i++) { const r = Math.round(Math.sin((i / 26) * Math.PI) * 6); ui.vline(x + 10 + i, y + 14 - r, y + 14, c0); ui.vline(x + 10 + i, y + 15, y + 14 + Math.round(r * 0.7), c1); }
      ui.line(x + 36, y + 14, x + 42, y + 8, c0); ui.line(x + 36, y + 14, x + 42, y + 20, c0); ui.vline(x + 42, y + 8, y + 20, c0);
      ui.blend(x + 14, y + 12, C.ink);
      ui.text(bodyFont, cleanText(L.name), x + 50, y + 7, C.ink);
      ui.text(tinyFont, L.size + ' CM' + (L.best ? '  NEW!' : ''), x + 50, y + 18, L.best ? C.vermilion : C.inkSoft);
      ui.textBlock(tinyFont, cleanText(L.text).toUpperCase(), x + 8, y + 30, w - 16, C.inkSoft);
      ui.text(tinyFont, 'RELEASED BACK INTO THE WATER', x + w / 2, y + h - 9, C.moon, { align: 'center' });
    }
  }

  draw(ui: UICanvas, t: number, controls = true): void {
    if (controls) this.drawExtras(ui, t);
    this.drawHaiku(ui);
    this.drawDialogue(ui, t);
    const s = ui.safe;
    if (this.showFps) {
      const txt = Math.round(this.fps) + ' FPS';
      ui.rect(s.left + 2, s.top + 2, tinyFont.measure(txt) + 6, 9, C.lacquer, 200);
      ui.text(tinyFont, txt, s.left + 5, s.top + 4, C.amberCore);
    }
    // toasts: small washi scrolls at the top centre
    this.toasts = this.toasts.filter((q) => q.until > t);
    this.toasts.forEach((q, i) => {
      const w = Math.min(ui.w - 20, bodyFont.measure(q.text) + 20), h = 19;
      const x = Math.round(ui.w / 2 - w / 2), y = s.top + 6 + i * 23;
      const fade = Math.min(1, (q.until - t) / 0.6);
      if (fade < 0.3) return;
      panel(ui, 'washi', x, y, w, h);
      ui.vline(x - 1, y + 1, y + h - 2, C.woodDark); ui.vline(x + w, y + 1, y + h - 2, C.woodDark);
      ui.text(bodyFont, q.text, ui.w / 2, y + 5, C.ink, { align: 'center' });
    });
    // interact prompt: a tiny paper bubble with a pixel icon (no big text, SPEC §9)
    if (this.prompt && !this.touchMode) {
      const bx = Math.round(ui.w / 2) + 8, by = Math.round(ui.h / 2) - 6;
      panel(ui, 'washi', bx, by, 15, 15);
      ui.sprite(icon(this.prompt.icon, C.ink), bx + 3, by + 3);
      ui.text(bodyFont, this.prompt.label, bx + 19, by + 3, C.paperLight, { shadow: C.indigoDark, alpha: 0.9 });
    }
    if (this.hint && t < this.hintUntil) {
      const a = Math.min(1, (this.hintUntil - t) / 1.5);
      ui.text(bodyFont, this.hint, ui.w / 2, ui.h - s.bottom - 16, C.paperLight, { align: 'center', shadow: C.indigoDark, alpha: a });
    }
    if (this.touchMode && controls) {
      const idle = t - this.lastUse > 4 ? 0.35 : 0.85;
      if (this.stick.active) {
        ui.sprite(this.stickArt, this.stick.cx - 16, this.stick.cy - 16, 1, 0.75);
        ui.disc(this.stick.x, this.stick.y, 4, C.paperLight, 200);
        ui.disc(this.stick.x, this.stick.y, 2, C.vermilion, 220);
      } else {
        ui.sprite(this.stickArt, s.left + 18, ui.h - s.bottom - 52, 1, idle * 0.6);
      }
      this.menuRect = { x: ui.w - s.right - 25, y: s.top + 6, w: 19, h: 19 };
      ui.sprite(this.tokenArt, this.menuRect.x, this.menuRect.y, 1, idle);
      for (let i = 0; i < 3; i++) ui.hline(this.menuRect.x + 6, this.menuRect.x + 12, this.menuRect.y + 6 + i * 3, C.gold, 255 * idle);
      // right-hand tokens: jump, and the contextual interact token above it
      const rx = ui.w - s.right - 30, ry = ui.h - s.bottom - 30;
      this.jumpRect = { x: rx, y: ry, w: 19, h: 19 };
      ui.sprite(this.tokenArt, rx, ry, 1, idle);
      ui.sprite(icon('jump', C.gold), rx + 5, ry + 5, 1, idle);
      this.actRect = { x: rx - 26, y: ry - 14, w: 19, h: 19 };
      if (this.prompt || this.reel !== null || this.status) {
        ui.sprite(this.tokenArt, this.actRect.x, this.actRect.y, 1, 0.95);
        ui.sprite(icon(this.prompt?.icon ?? 'fish', C.amberCore), this.actRect.x + 5, this.actRect.y + 5);
      }
      // journal, map, camera and tool tokens next to the menu
      this.quick = [];
      const keys: (keyof Hud['taps'])[] = this.held ? ['journal', 'map', 'photo', 'tool'] : ['journal', 'map', 'photo'];
      keys.forEach((k, i) => {
        const qx = this.menuRect.x - 24 * (i + 1), qy = this.menuRect.y;
        this.quick.push({ key: k, x: qx, y: qy });
        ui.sprite(this.tokenArt, qx, qy, 1, idle);
        ui.sprite(icon(k === 'journal' ? 'book' : k === 'photo' ? 'camera' : k, C.gold), qx + 5, qy + 5, 1, idle);
      });
      this.timeRect = { x: rx, y: ry - 30, w: 19, h: 19 };
      if (this.canTimelapse) {
        ui.sprite(this.tokenArt, this.timeRect.x, this.timeRect.y, 1, this.timelapseHeld ? 1 : 0.8);
        ui.sprite(icon('time', this.timelapseHeld ? C.amberCore : C.gold), this.timeRect.x + 5, this.timeRect.y + 5);
      }
    }
  }

  /** Draw the soft fade on top of everything. */
  drawFade(ui: UICanvas): void {
    if (this.fade > 0.01) ui.ditherRect(0, 0, ui.w, ui.h, C.night, Math.min(1, this.fade * 1.2));
  }

  pointer(p: Pointer, ui: UICanvas, now: number): boolean {
    // toast taps (e.g. "restart to update")
    if (p.type === 'down') {
      const s = ui.safe;
      for (let i = 0; i < this.toasts.length; i++) {
        const q = this.toasts[i]!;
        const y = s.top + 6 + i * 23;
        if (q.onTap && p.y >= y && p.y < y + 19) { q.onTap(); return true; }
      }
    }
    if (!this.touchMode) return false;
    this.lastUse = now;
    const m = this.menuRect;
    if (p.type === 'down' && p.x >= m.x - 6 && p.y >= m.y - 6 && p.x < m.x + m.w + 6 && p.y < m.y + m.h + 6) { this.onMenu(); return true; }
    const inRect = (r: { x: number; y: number; w: number; h: number }) => p.x >= r.x - 5 && p.y >= r.y - 5 && p.x < r.x + r.w + 5 && p.y < r.y + r.h + 5;
    if (p.type === 'down' && inRect(this.jumpRect)) { this.jumpTap = true; return true; }
    for (const q of this.quick) if (p.type === 'down' && inRect({ x: q.x, y: q.y, w: 19, h: 19 })) { this.taps[q.key] = true; return true; }
    if (p.type === 'down' && (this.prompt || this.reel !== null || this.status) && inRect(this.actRect)) { this.actTap = true; this.actHeld = true; this.actId = p.id; return true; }
    if (p.type === 'up' && p.id === this.actId) { this.actHeld = false; this.actId = -1; return true; }
    if (p.type === 'down' && this.canTimelapse && inRect(this.timeRect)) { this.timelapseHeld = true; this.timeId = p.id; return true; }
    if (p.type === 'up' && p.id === this.timeId) { this.timelapseHeld = false; this.timeId = -1; return true; }
    const R = 16;
    if (p.type === 'down') {
      if (p.x < ui.w * 0.45 && !this.stick.active) {
        Object.assign(this.stick, { active: true, id: p.id, cx: p.x, cy: p.y, x: p.x, y: p.y });
        return true;
      }
      if (this.look.id < 0) { Object.assign(this.look, { id: p.id, lx: p.x, ly: p.y }); return true; }
    } else if (p.type === 'move') {
      if (p.id === this.stick.id) {
        const dx = p.x - this.stick.cx, dy = p.y - this.stick.cy, d = Math.hypot(dx, dy);
        const k = d > R ? R / d : 1;
        this.stick.x = Math.round(this.stick.cx + dx * k); this.stick.y = Math.round(this.stick.cy + dy * k);
        return true;
      }
      if (p.id === this.look.id) {
        this.look.dx += p.x - this.look.lx; this.look.dy += p.y - this.look.ly;
        this.look.lx = p.x; this.look.ly = p.y;
        return true;
      }
    } else {
      if (p.id === this.stick.id) { this.stick.active = false; this.stick.id = -1; return true; }
      if (p.id === this.look.id) { this.look.id = -1; return true; }
    }
    return false;
  }

  /** Stick vector in -1..1 (x right, z forward). */
  stickVector(): { x: number; z: number; active: boolean } {
    if (!this.stick.active) return { x: 0, z: 0, active: false };
    return { x: (this.stick.x - this.stick.cx) / 16, z: -(this.stick.y - this.stick.cy) / 16, active: true };
  }
}

/** Map typographic characters to ones the pixel font has. */
export function cleanText(s: string): string {
  return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2014/g, ' - ').replace(/\u2026/g, '...').replace(/\u014d/g, 'o').replace(/\u016b/g, 'u');
}
