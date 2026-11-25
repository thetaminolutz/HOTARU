/** Settings drawer (first version): quality, dithering, outlines, FPS. Full tansu in M14. */
import type { UICanvas } from '../uiCanvas';
import { bodyFont, headingFont } from '../font';
import { C } from '../art';
import { Button, Slider, Toggle, panel, type Pointer, type Widget } from '../widgets';
import { settings, setSetting } from '../../app/settings';
import type { QualityName } from '../../config';

export class SettingsScreen {
  private q: Button[];
  private dither: Slider;
  private outlines: Toggle;
  private fps: Toggle;
  private back: Button;
  constructor(onBack: () => void) {
    const names: QualityName[] = ['low', 'medium', 'high'];
    this.q = names.map((n) => new Button(n[0]!.toUpperCase() + n.slice(1), () => setSetting('quality', n), 46));
    this.dither = new Slider('Dithering', settings.dither, (v) => setSetting('dither', v), 120);
    this.outlines = new Toggle('Outlines', settings.outlines, (v) => setSetting('outlines', v));
    this.fps = new Toggle('Show FPS', settings.showFps, (v) => setSetting('showFps', v));
    this.back = new Button('Back', onBack, 60);
  }
  get widgets(): Widget[] { return [...this.q, this.dither, this.outlines, this.fps, this.back]; }

  draw(ui: UICanvas, t: number): void {
    const pw = 190, ph = 150;
    const x = Math.round(ui.w / 2 - pw / 2), y = Math.round(ui.h / 2 - ph / 2);
    panel(ui, 'indigo', x, y, pw, ph);
    ui.text(headingFont, 'Settings', x + pw / 2, y + 6, C.amberCore, { align: 'center', shadow: C.indigoDark });
    ui.text(bodyFont, 'Quality', x + 12, y + 34, C.moon, { shadow: C.indigoDark });
    this.q.forEach((b, i) => { b.selected = settings.quality === ['low', 'medium', 'high'][i]; b.place(x + 12 + i * 56, y + 46); b.draw(ui); });
    this.dither.place(x + 12, y + 70).draw(ui);
    this.outlines.place(x + 12, y + 96).draw(ui, t);
    this.fps.place(x + 100, y + 96).draw(ui, t);
    this.back.place(x + pw / 2 - 30, y + ph - 26).draw(ui);
  }

  pointer(p: Pointer): boolean {
    let used = false;
    for (const w of this.widgets) used = w.pointer(p) || used;
    return used;
  }
}
