/** UI manager: owns the UI canvas, the active screen, and routes pointer input UI ↔ game. */
import { UICanvas } from './uiCanvas';
import type { Pointer } from './widgets';
import { LoadingScreen } from './screens/loading';
import { TitleScreen } from './screens/title';
import { SettingsScreen } from './screens/settings';
import { Hud } from './screens/hud';
import { GalleryScreen } from './screens/gallery';
import { brushCursor } from './art';
import type { JournalScreen } from './screens/journal';
import type { MapScreen } from './screens/map';
import type { PhotoScreen } from './screens/photo';

export type ScreenName = 'loading' | 'title' | 'settings' | 'play' | 'gallery' | 'journal' | 'map' | 'photo';

export type UIActions = {
  wander: () => void;
  newJourney: () => void;
  openMenu: () => void;
  hasSave: () => boolean;
  /** Non-UI pointer input on desktop (click to capture the mouse). */
  gameClick: () => void;
  /** Apple Pencil in play: a tap turns the view there and uses what's there. */
  penTap: (x: number, y: number) => void;
  /** Apple Pencil drag: precise look (UI pixels). */
  penLook: (dx: number, dy: number) => void;
};

export class UIManager {
  readonly ui: UICanvas;
  screen: ScreenName = 'loading';
  readonly loading = new LoadingScreen();
  readonly title: TitleScreen;
  readonly settings: SettingsScreen;
  readonly hud: Hud;
  readonly gallery = new GalleryScreen();
  hidden = false;
  /** M11 screens, attached once the game exists */
  journal: JournalScreen | null = null;
  map: MapScreen | null = null;
  photo: PhotoScreen | null = null;
  private t = 0;
  /** Brush cursor position (mouse in menus, Apple Pencil anywhere); null = hidden. */
  private cursor: { x: number; y: number; until: number } | null = null;
  private cursorArt = brushCursor();
  private pen = { id: -1, x0: 0, y0: 0, x: 0, y: 0, dragged: false };

  constructor(canvas: HTMLCanvasElement, private actions: UIActions) {
    this.ui = new UICanvas(canvas);
    this.title = new TitleScreen({ wander: actions.wander, newJourney: actions.newJourney, settings: () => this.show('settings') }, actions.hasSave);
    this.settings = new SettingsScreen(() => this.show('title'));
    this.hud = new Hud(actions.openMenu);
    this.hud.touchMode = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const send = (type: Pointer['type'], e: PointerEvent) => {
      const [x, y] = this.ui.toUI(e.clientX, e.clientY);
      const kind = e.pointerType === 'pen' ? 'pen' : e.pointerType === 'touch' ? 'touch' : 'mouse';
      if (kind === 'pen' || (kind === 'mouse' && !document.pointerLockElement)) this.cursor = { x, y, until: this.t + (kind === 'pen' ? 1.5 : 1e9) };
      if (kind === 'pen' && this.screen === 'play') { this.penPointer(type, x, y, e.pointerId); return; }
      this.pointer({ type, x, y, id: e.pointerId, kind, pressure: e.pressure });
    };
    canvas.addEventListener('pointerleave', () => { this.cursor = null; });
    canvas.style.cursor = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { canvas.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone: fine */ }
      send('down', e);
    });
    canvas.addEventListener('pointermove', (e) => send('move', e));
    canvas.addEventListener('pointerup', (e) => send('up', e));
    canvas.addEventListener('pointercancel', (e) => send('up', e));
    canvas.addEventListener('wheel', (e) => { if (this.screen === 'map') { e.preventDefault(); this.map?.wheel(e.deltaY); } }, { passive: false });
  }

  show(s: ScreenName): void { this.screen = s; }

  /** Apple Pencil while playing: tap = look there & interact, drag = precise look. */
  private penPointer(type: Pointer['type'], x: number, y: number, id: number): void {
    const p = this.pen;
    if (type === 'down') { Object.assign(p, { id, x0: x, y0: y, x, y, dragged: false }); return; }
    if (id !== p.id) return;
    if (type === 'move') {
      if (Math.hypot(x - p.x0, y - p.y0) > 3) p.dragged = true;
      if (p.dragged) this.actions.penLook(x - p.x, y - p.y);
      p.x = x; p.y = y;
    } else {
      if (!p.dragged) this.actions.penTap(x, y);
      p.id = -1;
    }
  }

  private pointer(p: Pointer & { pressure?: number }): void {
    switch (this.screen) {
      case 'journal': this.journal?.pointer(p); break;
      case 'map': this.map?.pointer(p); break;
      case 'photo': {
        if (this.photo?.pointer(p)) break;
        const used = this.hud.pointer(p, this.ui, this.t);
        if (!used && p.type === 'down' && !this.hud.touchMode) this.actions.gameClick();
        break;
      }
      case 'title': this.title.pointer(p); break;
      case 'settings': this.settings.pointer(p); break;
      case 'gallery': this.gallery.pointer(p); break;
      case 'play': {
        const used = this.hud.pointer(p, this.ui, this.t);
        if (!used && p.type === 'down' && !this.hud.touchMode) this.actions.gameClick();
        break;
      }
      default: break;
    }
  }

  resize(scale: number): void { this.ui.resize(scale); }

  frame(t: number, dt: number): void {
    this.t = t;
    const ui = this.ui;
    ui.clear();
    if (!this.hidden) {
      switch (this.screen) {
        case 'loading': this.loading.draw(ui, t); break;
        case 'title': this.title.draw(ui, t, dt); this.hud.draw(ui, t, false); break;
        case 'settings': this.settings.draw(ui, t); break;
        case 'gallery': this.gallery.draw(ui, t, dt); break;
        case 'play': this.hud.draw(ui, t); break;
        case 'journal': this.journal?.draw(ui, t); break;
        case 'map': this.map?.draw(ui, t); break;
        case 'photo': this.photo?.draw(ui, t, dt); break;
      }
      this.hud.drawFade(ui);
      if (this.cursor && t < this.cursor.until && ((this.screen !== 'play' && this.screen !== 'photo') || !document.pointerLockElement)) ui.sprite(this.cursorArt, this.cursor.x, this.cursor.y);
    }
    ui.present();
  }
}
