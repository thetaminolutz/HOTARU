/**
 * In-game HUD (SPEC §9): almost nothing. FPS (optional), toasts, a first-time hint,
 * and on touch devices a koi stick (left) + look drag (right) + a menu token.
 */
import type { UICanvas } from '../uiCanvas';
import { bodyFont, tinyFont } from '../font';
import { C, koiStick, token } from '../art';
import { panel, type Pointer } from '../widgets';
import type { Pixmap } from '../../render/pixmap';

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
  lastUse = 0;

  constructor(private onMenu: () => void) {}

  toast(text: string, seconds = 5, onTap?: () => void, now = performance.now() / 1000): void {
    this.toasts.push({ text, until: now + seconds, onTap });
  }

  draw(ui: UICanvas, t: number, controls = true): void {
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
    }
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
