/** Input state shared by keyboard/mouse, touch (fed by the UI touch controls) and gamepad. */
export class InputState {
  /** -1..1 strafe / forward */
  moveX = 0;
  moveZ = 0;
  /** accumulated look deltas in radians, consumed each frame */
  lookDX = 0;
  lookDY = 0;
  jog = false;
  up = 0;
  private keys = new Set<string>();
  enabled = false;
  mouseSensitivity = 0.0022;

  constructor(private el: HTMLElement) {
    addEventListener('keydown', (e: KeyboardEvent) => { this.keys.add(e.code); });
    addEventListener('keyup', (e: KeyboardEvent) => { this.keys.delete(e.code); });
    addEventListener('blur', () => this.keys.clear());
    this.attachLookElement(el);
  }

  /** The element that captures the mouse (the UI canvas sits on top of the game canvas). */
  attachLookElement(el: HTMLElement): void {
    this.el = el;
    el.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== el) return;
      this.lookDX -= e.movementX * this.mouseSensitivity;
      this.lookDY -= e.movementY * this.mouseSensitivity;
    });
  }

  requestPointerLock(): void {
    if (matchMedia('(pointer: fine)').matches) this.el.requestPointerLock?.()?.catch?.(() => undefined);
  }

  key(code: string): boolean { return this.keys.has(code); }

  /** Merge keyboard + gamepad into move axes. Touch writes moveX/moveZ directly via touchMove. */
  touchMove = { x: 0, z: 0, active: false };

  poll(): void {
    let x = 0, z = 0, up = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('Space')) up += 1;
    if (this.keys.has('KeyC') || this.keys.has('ControlLeft')) up -= 1;
    this.jog = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p) continue;
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
      x += dz(p.axes[0] ?? 0); z -= dz(p.axes[1] ?? 0);
      this.lookDX -= dz(p.axes[2] ?? 0) * 0.04; this.lookDY -= dz(p.axes[3] ?? 0) * 0.03;
      if (p.buttons[10]?.pressed) this.jog = true;
    }
    if (this.touchMove.active) { x += this.touchMove.x; z += this.touchMove.z; this.jog ||= Math.hypot(this.touchMove.x, this.touchMove.z) > 0.92; }
    const len = Math.hypot(x, z);
    this.moveX = len > 1 ? x / len : x;
    this.moveZ = len > 1 ? z / len : z;
    this.up = up;
  }
}
