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

type Tab = 'graphics' | 'camera' | 'sound' | 'world' | 'comfort' | 'keys' | 'saves';
const TABS: Tab[] = ['graphics', 'camera', 'sound', 'world', 'comfort', 'keys', 'saves'];
const CAPS = [30, 60, 0] as const;
const SEASON_MODES = ['cycle', 'spring', 'summer', 'autumn', 'winter'] as const;
const SEASON_DAYS = [3, 7, 14] as const;
const FREQS = ['often', 'occasional', 'rare', 'off'] as const;

export class SettingsScreen {
  tab: Tab = 'graphics';
  private tabs: Button[];
  private vols: Slider[];
  private seasonBtns: Button[];
  private dayBtns: Button[];
  private weatherBtns: Button[];
  private freq: Button[];
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
  private auto: Toggle;
  private caps: Button[];
  private comfort: Toggle[];
  private slots: Button[];
  private saveBtns: Button[];
  /** set by the app: slot summaries, export, import */
  saves: { info: (slot: number) => string; exportSave: () => void; importSave: () => void; useSlot: (slot: number) => void } | null = null;
  note = '';
  /** Action waiting for a key press. */
  rebinding: Action | null = null;
  /** Set by the app: start listening for one key. */
  onRebind: ((done: (code: string) => void) => void) | null = null;
  persisted = true;

  constructor(onBack: () => void) {
    this.tabs = TABS.map((t) => new Button(t[0]!.toUpperCase() + t.slice(1), () => (this.tab = t), 44, 15));
    this.auto = new Toggle('Auto quality', settings.autoQuality, (v) => setSetting('autoQuality', v));
    this.caps = CAPS.map((c) => new Button(c ? c + ' fps' : 'No cap', () => setSetting('fpsCap', c), 50));
    const tg = (label: string, key: 'reducedMotion' | 'largeText' | 'highContrast' | 'subtitles' | 'monoAudio' | 'leftHanded') => new Toggle(label, settings[key], (v) => setSetting(key, v));
    this.comfort = [tg('Reduced motion', 'reducedMotion'), tg('Large text', 'largeText'), tg('High contrast', 'highContrast'), tg('Subtitles', 'subtitles'), tg('Mono sound', 'monoAudio'), tg('Left-handed', 'leftHanded'),
      new Toggle('Villager hints', settings.hints === 'gentle', (v) => setSetting('hints', v ? 'gentle' : 'off'))];
    this.slots = [1, 2, 3].map((n) => new Button('Slot ' + n, () => this.saves?.useSlot(n), 52));
    this.saveBtns = [new Button('Export save', () => this.saves?.exportSave(), 90), new Button('Import save', () => this.saves?.importSave(), 90)];
    this.seasonBtns = SEASON_MODES.map((m) => new Button(m === 'cycle' ? 'Cycle' : m[0]!.toUpperCase() + m.slice(1), () => setSetting('seasonMode', m), 42));
    this.dayBtns = SEASON_DAYS.map((d) => new Button(d + ' days', () => setSetting('seasonDays', d), 50));
    this.weatherBtns = (['dynamic', 'fair'] as const).map((m) => new Button(m === 'dynamic' ? 'Changing' : 'Always fair', () => setSetting('weatherMode', m), 70));
    const vol = (label: string, key: 'volMaster' | 'volMusic' | 'volAmbience' | 'volSfx') => {
      const sl = new Slider(label, settings[key], (v) => setSetting(key, v), 150);
      sl.format = (v) => Math.round(v * 100) + '%';
      return sl;
    };
    this.vols = [vol('Volume', 'volMaster'), vol('Music', 'volMusic'), vol('Nature & places', 'volAmbience'), vol('Footsteps & UI', 'volSfx')];
    this.freq = FREQS.map((f) => new Button(f[0]!.toUpperCase() + f.slice(1), () => setSetting('musicFrequency', f), 50));
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
    if (this.tab === 'graphics') return [...common, ...this.q, this.dither, this.outlines, this.fps, this.auto, ...this.caps];
    if (this.tab === 'comfort') return [...common, ...this.comfort];
    if (this.tab === 'saves') return [...common, ...this.slots, ...this.saveBtns];
    if (this.tab === 'camera') return [...common, this.fov, this.sens, this.invert, this.bob, this.toggleJog];
    if (this.tab === 'sound') return [...common, ...this.vols, ...this.freq];
    if (this.tab === 'world') return [...common, ...this.seasonBtns, ...this.dayBtns, ...this.weatherBtns];
    return [...common, ...this.keys];
  }

  draw(ui: UICanvas, t: number): void {
    const pw = 330, ph = 232;
    const x = Math.round(ui.w / 2 - pw / 2), y = Math.round(ui.h / 2 - ph / 2);
    panel(ui, 'indigo', x, y, pw, ph);
    ui.text(headingFont, 'Settings', x + pw / 2, y + 5, C.amberCore, { align: 'center', shadow: C.indigoDark });
    this.tabs.forEach((b, i) => { b.selected = this.tab === TABS[i]; b.place(x + 6 + i * 46, y + 29); b.draw(ui); });
    const cy = y + 52;
    if (this.tab === 'graphics') {
      ui.text(bodyFont, 'Quality', x + 14, cy, C.moon, { shadow: C.indigoDark });
      this.q.forEach((b, i) => { b.selected = settings.quality === ['low', 'medium', 'high'][i]; b.place(x + 14 + i * 56, cy + 12); b.draw(ui); });
      this.dither.place(x + 14, cy + 38).draw(ui);
      this.outlines.place(x + 14, cy + 64).draw(ui, t);
      this.fps.place(x + 120, cy + 64).draw(ui, t);
      this.auto.place(x + 14, cy + 84).draw(ui, t);
      ui.text(bodyFont, 'Frame cap', x + 14, cy + 106, C.moon, { shadow: C.indigoDark });
      this.caps.forEach((b, i) => { b.selected = settings.fpsCap === CAPS[i]; b.place(x + 80 + i * 54, cy + 103); b.draw(ui); });
    } else if (this.tab === 'comfort') {
      this.comfort.forEach((tg, i) => tg.place(x + 14 + (i % 2) * 150, cy + Math.floor(i / 2) * 24).draw(ui, t));
      ui.textBlock(bodyFont, 'Reduced motion: no head bob, no lightning flashes, gentler camera. Subtitles name the sounds around you.', x + 14, cy + 100, pw - 28, C.moon);
    } else if (this.tab === 'saves') {
      this.slots.forEach((b, i) => {
        b.selected = settings.saveSlot === i + 1;
        b.place(x + 14, cy + i * 24); b.draw(ui);
        ui.text(bodyFont, this.saves?.info(i + 1) ?? '', x + 74, cy + i * 24 + 4, C.moon, { shadow: C.indigoDark });
      });
      this.saveBtns.forEach((b, i) => { b.place(x + 14 + i * 100, cy + 80); b.draw(ui); });
      if (this.note) ui.text(bodyFont, this.note, x + pw / 2, cy + 106, C.amberCore, { align: 'center', shadow: C.indigoDark });
      if (!this.persisted) ui.text(bodyFont, 'Saves may be cleared by the system - export them.', x + pw / 2, cy + 124, C.ember, { align: 'center' });
    } else if (this.tab === 'camera') {
      this.fov.place(x + 14, cy).draw(ui);
      this.sens.place(x + 14, cy + 26).draw(ui);
      this.invert.place(x + 14, cy + 54).draw(ui, t);
      this.bob.place(x + 120, cy + 54).draw(ui, t);
      this.toggleJog.place(x + 14, cy + 74).draw(ui, t);
    } else if (this.tab === 'world') {
      ui.text(bodyFont, 'Seasons', x + 14, cy, C.moon, { shadow: C.indigoDark });
      this.seasonBtns.forEach((b, i) => { b.selected = settings.seasonMode === SEASON_MODES[i]; b.place(x + 10 + i * 44, cy + 12); b.draw(ui); });
      ui.text(bodyFont, 'A season lasts', x + 14, cy + 38, C.moon, { shadow: C.indigoDark });
      this.dayBtns.forEach((b, i) => { b.selected = settings.seasonDays === SEASON_DAYS[i]; b.place(x + 14 + i * 54, cy + 50); b.draw(ui); });
      ui.text(bodyFont, 'Weather', x + 14, cy + 76, C.moon, { shadow: C.indigoDark });
      this.weatherBtns.forEach((b, i) => { b.selected = settings.weatherMode === (['dynamic', 'fair'] as const)[i]; b.place(x + 14 + i * 76, cy + 88); b.draw(ui); });
    } else if (this.tab === 'sound') {
      this.vols.forEach((sl, i) => sl.place(x + 14, cy + i * 24).draw(ui));
      ui.text(bodyFont, 'Music', x + 14, cy + 98, C.moon, { shadow: C.indigoDark });
      this.freq.forEach((b, i) => { b.selected = settings.musicFrequency === FREQS[i]; b.place(x + 14 + i * 54, cy + 110); b.draw(ui); });
    } else {
      ACTIONS.forEach((a, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const bx = x + 12 + col * 160, by = cy + row * 18;
        ui.text(bodyFont, ACTION_LABELS[a].split(' (')[0]!, bx, by + 3, C.moon, { shadow: C.indigoDark });
        const b = this.keys[i]!;
        b.label = this.rebinding === a ? '…' : keyName(settings.bindings[a][0] ?? '—');
        b.selected = this.rebinding === a;
        b.place(bx + 90, by);
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
