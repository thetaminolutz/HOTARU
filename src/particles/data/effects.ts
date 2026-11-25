/**
 * Ambient particle effects (SPEC §13). Every effect is one draw of pixel points that wrap
 * around the camera (world-anchored, so walking through them feels right); "local" effects
 * rise from a fixed origin instead (smoke, steam, sparks). Amounts are set per frame by
 * `AmbientFx` from region, time of day, wind and (from M6) weather.
 */
export type Motion = 'drift' | 'fall' | 'blink' | 'rise' | 'bank' | 'flutter';

export type EffectDef = {
  id: string;
  count: number;
  /** wrap box around the camera (m), or the local plume size */
  box: [number, number, number];
  /** base velocity (m/s) */
  vel: [number, number, number];
  /** how much the wind carries it (m/s at full gust) */
  wind: number;
  /** random swirl radius (m) */
  swirl: number;
  /** point size in internal pixels, near / far */
  size: [number, number];
  /** sRGB colours, two picked per particle */
  colors: [string, string];
  /** 0 = lit by the scene, 1 = glows (fireflies, sparks) */
  emissive: number;
  /** 0..1 dither coverage (mist, smoke); 1 = solid */
  opacity: number;
  motion: Motion;
  local?: boolean;
};

export const EFFECTS: EffectDef[] = [
  { id: 'fireflies', count: 1400, box: [48, 5, 48], vel: [0, 0, 0], wind: 0.3, swirl: 1.4, size: [2, 1], colors: ['#d8ff6a', '#f0ff9a'], emissive: 1, opacity: 1, motion: 'blink' },
  { id: 'leaves', count: 260, box: [60, 22, 60], vel: [0, -0.9, 0], wind: 3.5, swirl: 0.6, size: [2, 1], colors: ['#b8402a', '#e0902e'], emissive: 0, opacity: 1, motion: 'flutter' },
  { id: 'petals', count: 320, box: [60, 20, 60], vel: [0, -0.6, 0], wind: 4, swirl: 0.8, size: [2, 1], colors: ['#f4c8d4', '#ffe4ea'], emissive: 0, opacity: 1, motion: 'flutter' },
  { id: 'pollen', count: 260, box: [40, 6, 40], vel: [0, 0.05, 0], wind: 1.2, swirl: 0.8, size: [1, 1], colors: ['#fff0a0', '#ffffff'], emissive: 0.4, opacity: 1, motion: 'drift' },
  { id: 'motes', count: 200, box: [30, 10, 30], vel: [0, -0.02, 0], wind: 0.2, swirl: 0.5, size: [1, 1], colors: ['#fff4d0', '#ffe8b0'], emissive: 0.6, opacity: 1, motion: 'drift' },
  { id: 'rain', count: 2200, box: [36, 20, 36], vel: [0, -9, 0], wind: 2, swirl: 0, size: [3, 3], colors: ['#a8b8c8', '#c8d4e0'], emissive: 0, opacity: 1, motion: 'fall' },
  { id: 'snow', count: 900, box: [50, 24, 50], vel: [0, -0.9, 0], wind: 2.2, swirl: 0.7, size: [2, 1], colors: ['#ffffff', '#e8eef8'], emissive: 0.15, opacity: 1, motion: 'flutter' },
  { id: 'spray', count: 260, box: [60, 6, 60], vel: [0, 0.3, 0], wind: 4, swirl: 0.6, size: [1, 1], colors: ['#ffffff', '#dce8f0'], emissive: 0.1, opacity: 1, motion: 'drift' },
  { id: 'moths', count: 60, box: [40, 6, 40], vel: [0, 0, 0], wind: 0.2, swirl: 0.6, size: [1, 1], colors: ['#e8dcc0', '#c8b898'], emissive: 0, opacity: 1, motion: 'drift' },
  { id: 'smoke', count: 70, box: [3, 14, 3], vel: [0, 0.6, 0], wind: 2.5, swirl: 0.6, size: [9, 2], colors: ['#a8a4a0', '#c8c4c0'], emissive: 0, opacity: 0.45, motion: 'rise', local: true },
  { id: 'steam', count: 90, box: [6, 9, 6], vel: [0, 0.8, 0], wind: 1.5, swirl: 0.8, size: [10, 2], colors: ['#f0f0f0', '#ffffff'], emissive: 0.1, opacity: 0.4, motion: 'rise', local: true },
  { id: 'sparks', count: 40, box: [1, 5, 1], vel: [0, 1.4, 0], wind: 1, swirl: 0.3, size: [1, 1], colors: ['#ffb040', '#ff7a20'], emissive: 1, opacity: 1, motion: 'rise', local: true },
];
