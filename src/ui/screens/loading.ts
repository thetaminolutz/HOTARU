/** Loading screen: a pixel lantern being lit, a haiku, and a string of lanterns as progress. */
import type { UICanvas } from '../uiCanvas';
import { bodyFont } from '../font';
import { C, bigLantern, lanternIcon } from '../art';

const HAIKU = [
  ['one paper lantern', 'and the whole dark lake leans in', 'to remember light'],
  ['fireflies at dusk', 'stitching the reeds to the stars', 'with thread made of gold'],
  ['the boat knocks its post', 'softly, softly, like someone', 'coming home at last'],
];

export class LoadingScreen {
  progress = 0;
  private haiku = HAIKU[Math.floor(Date.now() / 86400000) % HAIKU.length]!;

  draw(ui: UICanvas, t: number): void {
    ui.rect(0, 0, ui.w, ui.h, C.night);
    ui.ditherRect(0, Math.round(ui.h * 0.55), ui.w, Math.round(ui.h * 0.45), 0x1c2550, 0.5);
    const cx = Math.round(ui.w / 2), cy = Math.round(ui.h * 0.36);
    const lit = Math.min(1, this.progress * 1.2);
    // halo
    if (lit > 0) for (let r = 22; r > 12; r -= 2) ui.ditherRect(cx - r, cy - r + 4, r * 2, r * 2, C.amber, 0.06 * lit);
    ui.sprite(bigLantern(lit, 0.5 + 0.5 * Math.sin(t * 11)), cx - 12, cy - 17);
    ui.vline(cx, 0, cy - 18, C.string);
    this.haiku.forEach((line, i) => ui.text(bodyFont, line, cx, Math.round(ui.h * 0.6) + i * 12, i === 1 ? C.amberCore : C.moon, { align: 'center' }));
    // progress: a string of lanterns lighting up one by one
    const n = 10, span = 120, y = Math.round(ui.h * 0.86);
    const x0 = cx - span / 2;
    for (let i = 0; i <= span; i++) ui.blend(x0 + i, y + Math.round(Math.sin((i / span) * Math.PI) * 4), C.string);
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + ((i + 0.5) / n) * span);
      const sag = Math.round(Math.sin(((i + 0.5) / n) * Math.PI) * 4);
      ui.sprite(lanternIcon(this.progress >= (i + 1) / n, 0.5 + 0.5 * Math.sin(t * 8 + i)), x - 6, y + sag - 1);
    }
  }
}
