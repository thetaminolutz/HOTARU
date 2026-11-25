/** Rebindable keyboard actions (SPEC §8 controls, §26 rebinding). */
export const ACTIONS = ['forward', 'back', 'left', 'right', 'jog', 'slow', 'jump', 'interact', 'timelapse', 'menu'] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Forward', back: 'Back', left: 'Left', right: 'Right', jog: 'Jog', slow: 'Slow walk',
  jump: 'Jump', interact: 'Interact / sit', timelapse: 'Time-lapse (sitting)', menu: 'Menu',
};

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jog: ['ShiftLeft', 'ShiftRight'],
  slow: ['ControlLeft', 'KeyC'],
  jump: ['Space'],
  interact: ['KeyE'],
  timelapse: ['KeyT'],
  menu: ['Escape'],
};

/** Short display name for a key code ("KeyW" → "W"). */
export function keyName(code: string): string {
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', ' L').replace('Right', ' R').replace('Arrow', '');
}
