/** UI manager: owns the UI canvas, the active screen, and routes pointer input UI ↔ game. */
import { UICanvas } from './uiCanvas';
import type { Pointer } from './widgets';
import { LoadingScreen } from './screens/loading';
import { TitleScreen } from './screens/title';
import { SettingsScreen } from './screens/settings';
import { Hud } from './screens/hud';
import { GalleryScreen } from './screens/gallery';

export type ScreenName = 'loading' | 'title' | 'settings' | 'play' | 'gallery';

export type UIActions = {
  wander: () => void;
  newJourney: () => void;
  openMenu: () => void;
  hasSave: () => boolean;
  /** Non-UI pointer input on desktop (click to capture the mouse). */
  gameClick: () => void;
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
  private t = 0;

  constructor(canvas: HTMLCanvasElement, private actions: UIActions) {
    this.ui = new UICanvas(canvas);
    this.title = new TitleScreen({ wander: actions.wander, newJourney: actions.newJourney, settings: () => this.show('settings') }, actions.hasSave);
    this.settings = new SettingsScreen(() => this.show('title'));
    this.hud = new Hud(actions.openMenu);
    this.hud.touchMode = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const send = (type: Pointer['type'], e: PointerEvent) => {
      const [x, y] = this.ui.toUI(e.clientX, e.clientY);
      this.pointer({ type, x, y, id: e.pointerId });
    };
    canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); send('down', e); });
    canvas.addEventListener('pointermove', (e) => send('move', e));
    canvas.addEventListener('pointerup', (e) => send('up', e));
    canvas.addEventListener('pointercancel', (e) => send('up', e));
  }

  show(s: ScreenName): void { this.screen = s; }

  private pointer(p: Pointer): void {
    switch (this.screen) {
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
      }
    }
    ui.present();
  }
}
