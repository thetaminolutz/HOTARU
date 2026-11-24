/** UI gallery (debug, ?ui=gallery): every UI element on one page for review (SPEC §9.4). */
import type { UICanvas } from '../uiCanvas';
import { bodyFont, headingFont, tinyFont } from '../font';
import { C, seal, lanternIcon, firefly, koiStick, token, bigLantern, bead } from '../art';
import { Button, Slider, Toggle, panel, UIFireflies, type Pointer, type Widget } from '../widgets';

export class GalleryScreen {
  private widgets: Widget[] = [
    new Button('Plaque', () => undefined, 70),
    Object.assign(new Button('Selected', () => undefined, 70), { selected: true }),
    new Toggle('Lantern on', true, () => undefined),
    new Toggle('Lantern off', false, () => undefined),
    new Slider('Bead slider', 0.6, () => undefined, 110),
  ];
  private flies = new UIFireflies(10, 3);

  draw(ui: UICanvas, t: number, dt: number): void {
    ui.rect(0, 0, ui.w, ui.h, 0x141a38);
    ui.ditherRect(0, 0, ui.w, ui.h, 0x1c2550, 0.5);
    let y = 6;
    ui.text(headingFont, 'Hotaru UI', 8, y, C.amberCore, { shadow: C.ink });
    ui.sprite(seal(), 8 + headingFont.measure('Hotaru UI') + 6, y);
    y += 26;
    // fonts
    panel(ui, 'washi', 6, y, 300, 66);
    ui.text(bodyFont, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ÄÖÜ', 14, y + 7, C.ink);
    ui.text(bodyFont, 'abcdefghijklmnopqrstuvwxyz äöüß', 14, y + 18, C.ink);
    ui.text(bodyFont, '0123456789 .,!?:;-+=()[]/\'"%&*<>_#@', 14, y + 29, C.inkSoft);
    ui.text(bodyFont, 'Discovered: ', 14, y + 41, C.ink);
    ui.text(bodyFont, 'The Weeping Pine', 14 + bodyFont.measure('Discovered: ') + 3, y + 41, C.vermilion);
    ui.text(tinyFont, '0123456789 60 FPS 16.6ms', 14, y + 55, C.inkSoft);
    y += 72;
    ui.text(headingFont, 'Brush Heading Äß', 10, y, C.amberCore, { outline: C.ink });
    y += 26;
    // panels
    panel(ui, 'washi', 6, y, 90, 50); ui.text(bodyFont, 'washi', 51, y + 20, C.ink, { align: 'center' });
    panel(ui, 'lacquer', 102, y, 90, 50); ui.text(bodyFont, 'lacquer', 147, y + 20, C.gold, { align: 'center' });
    panel(ui, 'indigo', 198, y, 90, 50); ui.text(bodyFont, 'indigo cloth', 243, y + 20, C.moon, { align: 'center' });
    y += 58;
    // widgets
    let x = 8;
    this.widgets.forEach((w) => {
      if (x + w.w > ui.w - 10) { x = 8; y += 26; }
      w.place(x, y);
      w.draw(ui, t);
      x += w.w + 12;
    });
    // icons column on the right
    const rx = 318;
    let ry = 34;
    ui.sprite(bigLantern(0.2, 0.5), rx, ry); ui.sprite(bigLantern(1, 0.5 + 0.5 * Math.sin(t * 10)), rx + 30, ry);
    ry += 40;
    ui.sprite(lanternIcon(false), rx, ry); ui.sprite(lanternIcon(true), rx + 16, ry);
    ui.sprite(firefly(1), rx + 34, ry + 4); ui.sprite(bead(C.gold), rx + 44, ry + 4); ui.sprite(bead(C.vermilion), rx + 54, ry + 4);
    ry += 22;
    ui.sprite(koiStick(), rx, ry); ui.sprite(token(), rx + 38, ry + 7);
    ry += 40;
    ui.sprite(seal(), rx, ry, 2);
    this.flies.draw(ui, t, dt);
  }

  pointer(p: Pointer): boolean {
    let used = false;
    for (const w of this.widgets) used = w.pointer(p) || used;
    return used;
  }
}
