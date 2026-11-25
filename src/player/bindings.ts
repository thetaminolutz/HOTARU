/** Rebindable keyboard actions (SPEC §8 controls, §26 rebinding). */
export const ACTIONS = ['forward', 'back', 'left', 'right', 'jog', 'slow', 'jump', 'interact', 'timelapse', 'journal', 'map', 'photo', 'tool', 'menu'] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Forward', back: 'Back', left: 'Left', right: 'Right', jog: 'Jog', slow: 'Slow walk',
  jump: 'Jump', interact: 'Interact / sit', timelapse: 'Time-lapse (sitting)', journal: 'Journal', map: 'Map', photo: 'Photo mode', tool: 'Use tool', menu: 'Menu',
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
  journal: ['KeyJ'],
  map: ['KeyM'],
  photo: ['KeyP'],
  tool: ['KeyF'],
  menu: ['Escape'],
};

/** Short display name for a key code ("KeyW" → "W"). */
export function keyName(code: string): string {
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', ' L').replace('Right', ' R').replace('Arrow', '');
}
