/**
 * Photo mode overlay (SPEC §11): a slim bamboo bar along the bottom — filter, frame, pause time,
 * self-portrait, sketch, the shutter and done — plus FOV and roll beads. "Hide" clears the
 * screen for a clean look; tap anywhere to bring the bar back. The frame you picked is shown
 * as a guide; after the shutter the picture flashes in the corner.
 */
import type { UICanvas } from '../uiCanvas';
import { bodyFont, tinyFont } from '../font';
import { C } from '../art';
import { Button, Slider, panel, type Pointer } from '../widgets';
import { FILTERS, FRAMES } from '../../items/photo';
import type { PhotoMode } from '../../app/photoMode';

export class PhotoScreen {
  private hidden = false;
  private buttons: Button[] = [];
  private fov: Slider;
  private roll: Slider;
  private flash = 0;
  constructor(private pm: PhotoMode, private onDone: () => void) {
    this.fov = new Slider('FOV', 0.5, (v) => { this.pm.fov = 35 + v * 65; }, 80);
    this.fov.format = (v) => Math.round(35 + v * 65) + '';
    this.roll = new Slider('Roll', 0.5, (v) => { this.pm.roll = (v - 0.5) * 0.8; }, 80);
    this.roll.format = (v) => Math.round((v - 0.5) * 46) + '';
  }

  open(): void { this.hidden = false; this.fov.value = (this.pm.fov - 35) / 65; this.roll.value = 0.5; }

  draw(ui: UICanvas, t: number, dt: number): void {
    const s = ui.safe, pm = this.pm;
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.flash > 0) ui.rect(0, 0, ui.w, ui.h, 0xffffff, Math.round(this.flash * 200));
    if (pm.last) {
      // the picture just taken, tilted into the corner
      const img = pm.last.img, k = 70 / img.w, w = 70, h = Math.round(img.h * k), x0 = ui.w - s.right - w - 8, y0 = s.top + 8;
      ui.rect(x0 - 2, y0 - 2, w + 4, h + 4, C.paperLight);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const q = (Math.floor(j / k) * img.w + Math.floor(i / k)) * 4;
        ui.blend(x0 + i, y0 + j, (img.px[q]! << 16) | (img.px[q + 1]! << 8) | img.px[q + 2]!);
      }
      ui.text(tinyFont, pm.last.kind === 'sketch' ? 'SKETCHED' : 'SAVED TO ALBUM', x0 + w / 2, y0 + h + 4, C.paperLight, { align: 'center', shadow: C.ink });
    }
    this.buttons = [];
    if (this.hidden) return;
    // frame guide
    const f = FRAMES[pm.frame];
    if (f !== 'none') {
      const m = f === 'polaroid' ? [6, 6, 6, 18] : f === 'scroll' ? [10, 4, 10, 4] : [7, 7, 7, 7];
      ui.rect(0, 0, ui.w, m[1]!, C.paperLight, 90); ui.rect(0, ui.h - m[3]!, ui.w, m[3]!, C.paperLight, 90);
      ui.rect(0, 0, m[0]!, ui.h, C.paperLight, 90); ui.rect(ui.w - m[2]!, 0, m[2]!, ui.h, C.paperLight, 90);
    }
    const H = 46, y0 = ui.h - s.bottom - H - 4, x0 = s.left + 6, W = ui.w - s.left - s.right - 12;
    panel(ui, 'lacquer', x0, y0, W, H);
    let x = x0 + 6;
    const add = (label: string, on: () => void, w = 0, sel = false) => { const b = new Button(label, on, w); b.selected = sel; b.place(x, y0 + 5); this.buttons.push(b); x += b.w + 4; };
    add(cap(FILTERS[pm.filter]!), () => pm.nextFilter(), 66);
    add(cap(FRAMES[pm.frame]!), () => pm.nextFrame(), 54);
    add(pm.timePaused ? 'Time stopped' : 'Time runs', () => pm.togglePause(), 0, pm.timePaused);
    add('Me', () => { pm.selfie = !pm.selfie; }, 0, pm.selfie);
    add('Sketch', () => { this.flash = 0.5; pm.shoot('sketch'); });
    add('Hide', () => { this.hidden = true; });
    add('Done', () => this.onDone());
    this.fov.place(x0 + 8, y0 + 24); this.fov.draw(ui);
    this.roll.place(x0 + 100, y0 + 24); this.roll.draw(ui);
    // the shutter: a big round token on the right
    const cx = x0 + W - 22, cy = y0 + H / 2;
    ui.disc(cx, cy, 15, C.woodDark); ui.disc(cx, cy, 13, C.paperLight); ui.disc(cx, cy, 10, Math.sin(t * 3) > 0 ? C.vermilion : C.seal);
    this.shutter = { x: cx - 16, y: cy - 16, w: 32, h: 32 };
    for (const b of this.buttons) b.draw(ui);
    ui.text(bodyFont, 'WASD / stick: move  Q E: roll', x0 + 196, y0 + 30, C.moon, { shadow: C.ink });
  }
  private shutter = { x: 0, y: 0, w: 0, h: 0 };

  /** Returns true if the pointer was used by the overlay (else it looks around). */
  pointer(p: Pointer): boolean {
    if (this.hidden) { if (p.type === 'down') { this.hidden = false; return true; } return false; }
    for (const b of this.buttons) if (b.pointer(p)) return true;
    if (this.fov.pointer(p) || this.roll.pointer(p)) return true;
    const r = this.shutter;
    if (p.type === 'down' && p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h) { this.snap(); return true; }
    return false;
  }
  snap(): void { this.flash = 1; this.pm.shoot('photo'); }
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
