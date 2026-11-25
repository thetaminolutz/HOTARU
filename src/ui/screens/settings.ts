/**
 * Settings drawer (SPEC §26): Graphics, Camera and Keys tabs. Sliders are beads on a string,
 * toggles are paper lanterns; keys are rebound by tapping a plaque and pressing a key.
 */
import type { UICanvas } from '../uiCanvas';
import { bodyFont, headingFont } from '../font';
import { C } from '../art';
import { Button, Slider, Toggle, panel, type Pointer, type Widget } from '../widgets';
import { settings, setSetting } from '../../app/settings';
import type { QualityName } from '../../config';
import { ACTIONS, ACTION_LABELS, keyName, type Action } from '../../player/bindings';

type Tab = 'graphics' | 'camera' | 'keys';

export class SettingsScreen {
  tab: Tab = 'graphics';
  private tabs: Button[];
  private q: Button[];
  private dither: Slider;
  private outlines: Toggle;
  private fps: Toggle;
  private fov: Slider;
  private sens: Slider;
  private invert: Toggle;
  private bob: Toggle;
  private toggleJog: Toggle;
  private keys: Button[];
  private back: Button;
  /** Action waiting for a key press. */
  rebinding: Action | null = null;
  /** Set by the app: start listening for one key. */
  onRebind: ((done: (code: string) => void) => void) | null = null;
  persisted = true;

  constructor(onBack: () => void) {
    this.tabs = (['graphics', 'camera', 'keys'] as Tab[]).map((t) => new Button(t[0]!.toUpperCase() + t.slice(1), () => (this.tab = t), 60, 15));
    const names: QualityName[] = ['low', 'medium', 'high'];
    this.q = names.map((n) => new Button(n[0]!.toUpperCase() + n.slice(1), () => setSetting('quality', n), 50));
    this.dither = new Slider('Dithering', settings.dither, (v) => setSetting('dither', v), 150);
    this.outlines = new Toggle('Outlines', settings.outlines, (v) => setSetting('outlines', v));
    this.fps = new Toggle('Show FPS', settings.showFps, (v) => setSetting('showFps', v));
    this.fov = new Slider('Field of view', (settings.fov - 60) / 40, (v) => setSetting('fov', Math.round(60 + v * 40)), 150);
    this.fov.format = (v) => Math.round(60 + v * 40) + '°';
    this.sens = new Slider('Look sensitivity', (settings.sensitivity - 0.25) / 1.75, (v) => setSetting('sensitivity', 0.25 + v * 1.75), 150);
    this.sens.format = (v) => '×' + (0.25 + v * 1.75).toFixed(2);
    this.invert = new Toggle('Invert Y', settings.invertY, (v) => setSetting('invertY', v));
    this.bob = new Toggle('Head bob', settings.headBob, (v) => setSetting('headBob', v));
    this.toggleJog = new Toggle('Tap to jog', settings.toggleJog, (v) => setSetting('toggleJog', v));
    this.keys = ACTIONS.map((a) => new Button('', () => this.startRebind(a), 56, 13));
    this.back = new Button('Back', onBack, 60);
  }

  private startRebind(a: Action): void {
    this.rebinding = a;
    this.onRebind?.((code) => {
      if (code !== 'Escape' || a === 'menu') setSetting('bindings', { ...settings.bindings, [a]: [code] });
      this.rebinding = null;
    });
  }

  get widgets(): Widget[] {
    const common: Widget[] = [...this.tabs, this.back];
    if (this.tab === 'graphics') return [...common, ...this.q, this.dither, this.outlines, this.fps];
    if (this.tab === 'camera') return [...common, this.fov, this.sens, this.invert, this.bob, this.toggleJog];
    return [...common, ...this.keys];
  }

  draw(ui: UICanvas, t: number): void {
    const pw = 240, ph = 196;
    const x = Math.round(ui.w / 2 - pw / 2), y = Math.round(ui.h / 2 - ph / 2);
    panel(ui, 'indigo', x, y, pw, ph);
    ui.text(headingFont, 'Settings', x + pw / 2, y + 5, C.amberCore, { align: 'center', shadow: C.indigoDark });
    this.tabs.forEach((b, i) => { b.selected = this.tab === (['graphics', 'camera', 'keys'] as Tab[])[i]; b.place(x + 18 + i * 70, y + 29); b.draw(ui); });
    const cy = y + 52;
    if (this.tab === 'graphics') {
      ui.text(bodyFont, 'Quality', x + 14, cy, C.moon, { shadow: C.indigoDark });
      this.q.forEach((b, i) => { b.selected = settings.quality === ['low', 'medium', 'high'][i]; b.place(x + 14 + i * 56, cy + 12); b.draw(ui); });
      this.dither.place(x + 14, cy + 38).draw(ui);
      this.outlines.place(x + 14, cy + 64).draw(ui, t);
      this.fps.place(x + 120, cy + 64).draw(ui, t);
      if (!this.persisted) ui.text(bodyFont, 'Saves may be cleared by the system — export them.', x + pw / 2, cy + 90, C.ember, { align: 'center' });
    } else if (this.tab === 'camera') {
      this.fov.place(x + 14, cy).draw(ui);
      this.sens.place(x + 14, cy + 26).draw(ui);
      this.invert.place(x + 14, cy + 54).draw(ui, t);
      this.bob.place(x + 120, cy + 54).draw(ui, t);
      this.toggleJog.place(x + 14, cy + 74).draw(ui, t);
    } else {
      ACTIONS.forEach((a, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const bx = x + 12 + col * 114, by = cy + row * 21;
        ui.text(bodyFont, ACTION_LABELS[a].split(' (')[0]!, bx, by + 3, C.moon, { shadow: C.indigoDark });
        const b = this.keys[i]!;
        b.label = this.rebinding === a ? '…' : keyName(settings.bindings[a][0] ?? '—');
        b.selected = this.rebinding === a;
        b.place(bx + 54, by);
        b.draw(ui);
      });
    }
    this.back.place(x + pw / 2 - 30, y + ph - 24).draw(ui);
  }

  pointer(p: Pointer): boolean {
    let used = false;
    for (const w of this.widgets) used = w.pointer(p) || used;
    return used;
  }
}
