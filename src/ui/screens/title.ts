/** Title screen (SPEC §9): pixel logo with seal, plaques hanging from strings, drifting fireflies. */
import type { UICanvas } from '../uiCanvas';
import { bodyFont, headingFont, tinyFont, BitmapFont } from '../font';
import { C, seal } from '../art';
import { Button, UIFireflies, type Pointer, type Widget } from '../widgets';
import type { Pixmap } from '../../render/pixmap';

/** Logo letters: the brush heading font, upscaled once more with Scale2x-like smoothing. */
let logoFont: BitmapFont | null = null;
function getLogoFont(): BitmapFont {
  if (logoFont) return logoFont;
  const f = new BitmapFont(44, 3, 12, 28);
  for (const [ch, g] of headingFont.glyphs) {
    const W = g.w * 2, H = g.h * 2, bits = new Uint8Array(W * H);
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? 0 : g.bits[y * g.w + x]!);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), Cc = at(x - 1, y), D = at(x, y + 1);
      bits[(y * 2) * W + x * 2] = Cc === A && Cc !== D && A !== B ? A : P;
      bits[(y * 2) * W + x * 2 + 1] = A === B && A !== Cc && B !== D ? B : P;
      bits[(y * 2 + 1) * W + x * 2] = D === Cc && D !== B && Cc !== A ? Cc : P;
      bits[(y * 2 + 1) * W + x * 2 + 1] = B === D && B !== A && D !== Cc ? D : P;
    }
    f.glyphs.set(ch, { w: W, h: H, bits, top: 0 });
  }
  logoFont = f;
  return f;
}

export class TitleScreen {
  private buttons: Button[];
  private flies = new UIFireflies(16, 7);
  private sealArt: Pixmap = seal();
  constructor(actions: { wander: () => void; newJourney: () => void; settings: () => void }, private hasSave: () => boolean) {
    this.buttons = [
      new Button('Wander', actions.wander, 84),
      new Button('New Journey', actions.newJourney, 84),
      new Button('Settings', actions.settings, 84),
    ];
  }

  get widgets(): Widget[] { return this.buttons; }

  draw(ui: UICanvas, t: number, dt: number): void {
    const W = ui.w, H = ui.h;
    // darken the top so the logo reads over the scene
    ui.ditherRect(0, 0, W, Math.round(H * 0.34), C.night, 0.45);
    ui.ditherRect(0, Math.round(H * 0.34), W, 6, C.night, 0.2);

    const lf = getLogoFont();
    const logoY = Math.max(ui.safe.top + 10, Math.round(H * 0.08));
    const lw = lf.measure('HOTARU');
    const lx = Math.round(W / 2);
    ui.text(lf, 'HOTARU', lx + 2, logoY + 3, C.indigoDark, { align: 'center' });
    ui.text(lf, 'HOTARU', lx, logoY, C.amberCore, { align: 'center', outline: C.ink });
    // gold highlight on the upper strokes of the letters
    for (let y = logoY; y < logoY + 6; y++) for (let x = lx - lw / 2; x < lx + lw / 2; x++) {
      const i = (y * ui.pix.w + Math.round(x)) * 4;
      if (ui.pix.data[i] === ((C.amberCore >> 16) & 255) && ui.pix.data[i + 1] === ((C.amberCore >> 8) & 255)) ui.blend(Math.round(x), y, 0xfff6d8);
    }
    ui.sprite(this.sealArt, Math.round(lx + lw / 2 + 8), logoY + 8);
    ui.text(bodyFont, 'a quiet land of lanterns and fireflies', lx, logoY + 50, C.moon, { align: 'center', shadow: C.indigoDark });

    // plaques hanging from strings, chained like ema boards
    const bw = 84, gap = 8;
    const x0 = Math.round(W / 2 - bw / 2);
    let y = logoY + 72;
    const sway = (i: number) => Math.round(Math.sin(t * 0.8 + i * 1.3) * 1.2);
    ui.vline(x0 + 10 + sway(0), logoY + 62, y, C.string);
    ui.vline(x0 + bw - 11 + sway(0), logoY + 62, y, C.string);
    this.buttons.forEach((b, i) => {
      if (i === 0) b.label = this.hasSave() ? 'Wander' : 'Wander';
      b.place(x0 + sway(i), y);
      b.draw(ui);
      if (i < this.buttons.length - 1) {
        ui.vline(x0 + 10 + sway(i), y + b.h, y + b.h + gap, C.string);
        ui.vline(x0 + bw - 11 + sway(i), y + b.h, y + b.h + gap, C.string);
      }
      y += b.h + gap;
    });

    this.flies.draw(ui, t, dt);
    ui.text(tinyFont, 'M1', W - ui.safe.right - 4, H - ui.safe.bottom - 8, C.moon, { align: 'right' });
  }

  pointer(p: Pointer): boolean {
    let used = false;
    for (const b of this.buttons) used = b.pointer(p) || used;
    return used;
  }
}
