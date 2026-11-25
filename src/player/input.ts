/**
 * Input state shared by keyboard/mouse, touch & Apple Pencil (fed by the UI layer) and
 * gamepad (standard mapping). Movement axes are continuous; actions are edge-triggered.
 */
import { settings } from '../app/settings';
import type { Action } from './bindings';

export class InputState {
  /** -1..1 strafe / forward */
  moveX = 0;
  moveZ = 0;
  /** accumulated look deltas in radians, consumed each frame */
  lookDX = 0;
  lookDY = 0;
  jog = false;
  slow = false;
  /** vertical axis for free-fly (debug) */
  up = 0;
  /** held actions */
  timelapse = false;
  /** edge-triggered actions (consumed by the controller) */
  jumpPressed = false;
  interactPressed = false;
  menuPressed = false;
  /** edge-triggered: journal, map, photo mode, use the current tool */
  journalPressed = false;
  mapPressed = false;
  photoPressed = false;
  toolPressed = false;
  /** interact (or tool) is being held: reeling in a fish */
  interactHeld = false;
  /** touch: the interact token is being held */
  touchInteractHeld = false;
  private keys = new Set<string>();
  private jogToggled = false;
  private padPrev: boolean[] = [];
  enabled = false;
  /** Radians per mouse pixel at sensitivity 1. */
  mouseSensitivity = 0.0022;
  /** Touch & Pencil writers. */
  touchMove = { x: 0, z: 0, active: false };
  touchJump = false;
  touchInteract = false;
  touchTimelapse = false;
  lastDevice: 'keyboard' | 'touch' | 'pen' | 'gamepad' = 'keyboard';
  rebindListener: ((code: string) => void) | null = null;

  constructor(private el: HTMLElement) {
    addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.rebindListener) { e.preventDefault(); this.rebindListener(e.code); return; }
      if (!this.keys.has(e.code)) this.onPress(e.code);
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
    });
    addEventListener('keyup', (e: KeyboardEvent) => { this.keys.delete(e.code); });
    addEventListener('blur', () => this.keys.clear());
    this.attachLookElement(el);
  }

  private is(action: Action, code: string): boolean { return settings.bindings[action].includes(code); }
  held(action: Action): boolean { return settings.bindings[action].some((c) => this.keys.has(c)); }

  private onPress(code: string): void {
    if (this.is('jump', code)) this.jumpPressed = true;
    if (this.is('interact', code)) this.interactPressed = true;
    if (this.is('menu', code)) this.menuPressed = true;
    if (this.is('journal', code)) this.journalPressed = true;
    if (this.is('map', code)) this.mapPressed = true;
    if (this.is('photo', code)) this.photoPressed = true;
    if (this.is('tool', code)) this.toolPressed = true;
    if (this.is('jog', code) && settings.toggleJog) this.jogToggled = !this.jogToggled;
  }

  /** The element that captures the mouse (the UI canvas sits on top of the game canvas). */
  attachLookElement(el: HTMLElement): void {
    this.el = el;
    el.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== el) return;
      this.addLook(e.movementX, e.movementY, this.mouseSensitivity);
    });
  }

  /** Add look input in pixels × radians-per-pixel, honouring sensitivity and invert-Y. */
  addLook(dx: number, dy: number, radPerPx: number): void {
    const k = radPerPx * settings.sensitivity;
    this.lookDX -= dx * k;
    this.lookDY -= dy * k * (settings.invertY ? -1 : 1);
  }

  requestPointerLock(): void {
    if (matchMedia('(pointer: fine)').matches) this.el.requestPointerLock?.()?.catch?.(() => undefined);
  }

  key(code: string): boolean { return this.keys.has(code); }

  poll(): void {
    let x = 0, z = 0, up = 0;
    if (this.held('forward')) z += 1;
    if (this.held('back')) z -= 1;
    if (this.held('left')) x -= 1;
    if (this.held('right')) x += 1;
    if (this.held('jump')) up += 1;
    if (this.held('slow')) up -= 1;
    this.jog = settings.toggleJog ? this.jogToggled : this.held('jog');
    this.slow = this.held('slow');
    this.timelapse = this.held('timelapse') || this.touchTimelapse;
    this.interactHeld = this.held('interact') || this.held('tool') || this.touchInteractHeld;

    // gamepad: standard mapping
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p) continue;
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
      const ax = dz(p.axes[0] ?? 0), az = dz(p.axes[1] ?? 0), lx = dz(p.axes[2] ?? 0), ly = dz(p.axes[3] ?? 0);
      if (ax || az || lx || ly || p.buttons.some((b) => b.pressed)) this.lastDevice = 'gamepad';
      x += ax; z -= az;
      this.addLook(lx * 14, ly * 10, 0.0022);
      const pressed = (i: number) => !!p.buttons[i]?.pressed;
      const edge = (i: number) => pressed(i) && !this.padPrev[i];
      if (edge(0)) this.jumpPressed = true;        // A
      if (edge(2) || edge(1)) this.interactPressed = true; // X / B
      if (edge(9)) this.menuPressed = true;        // Start
      if (pressed(10) || pressed(7)) this.jog = true; // L3 / RT
      if (pressed(4) || pressed(6)) this.slow = true; // LB / LT
      if (pressed(3)) this.timelapse = true;       // Y (held)
      if (pressed(2) || pressed(1)) this.interactHeld = true;
      if (edge(5)) this.toolPressed = true;        // RB
      if (edge(8)) this.journalPressed = true;     // Back/Select
      if (edge(12)) this.mapPressed = true;        // d-pad up
      if (edge(13)) this.photoPressed = true;      // d-pad down
      this.padPrev = p.buttons.map((b) => b.pressed);
    }

    if (this.touchMove.active) {
      x += this.touchMove.x; z += this.touchMove.z;
      const m = Math.hypot(this.touchMove.x, this.touchMove.z);
      this.jog ||= m > 0.92; // push the stick to the rim to jog
      this.slow ||= m < 0.35 && m > 0; // a gentle push walks slowly
    }
    if (this.touchJump) { this.jumpPressed = true; this.touchJump = false; }
    if (this.touchInteract) { this.interactPressed = true; this.touchInteract = false; }
    const len = Math.hypot(x, z);
    this.moveX = len > 1 ? x / len : x;
    this.moveZ = len > 1 ? z / len : z;
    this.up = up;
  }

  /** Clear edge-triggered actions after the frame consumed them. */
  endFrame(): void { this.jumpPressed = false; this.interactPressed = false; this.toolPressed = false; }
}
