/**
 * Time-of-day palettes (SPEC §4). Every palette has the SAME ramp slots in the same order,
 * so palettes can be blended colour-by-colour in OKLab as the day moves on.
 * Each ramp: [dark, mid, light] anchors, expanded to RAMP_STEPS shades.
 */
export const RAMP_SLOTS = [
  'sky', 'water', 'foliage', 'autumn', 'gold', 'wood', 'stone', 'light', 'accent', 'neutral',
] as const;
export type RampSlot = (typeof RAMP_SLOTS)[number];
export type PaletteDef = Record<RampSlot, [string, string, string]>;

export const RAMP_STEPS = 7;

export const PALETTES: Record<string, PaletteDef> = {
  // Reference 1: navy night, amber lanterns.
  night: {
    sky: ['#090d22', '#1c2550', '#4b5a92'],
    water: ['#080e20', '#1b2a52', '#7d8fc2'],
    foliage: ['#0b1416', '#1f3236', '#4b6a66'],
    autumn: ['#22101a', '#7a3326', '#e2622b'],
    gold: ['#2a1d16', '#9a682c', '#f6c35e'],
    wood: ['#1a1219', '#4e2e22', '#a8683a'],
    stone: ['#12141e', '#33384c', '#727690'],
    light: ['#7a3014', '#ffb347', '#fff1c8'],
    accent: ['#2e0e1c', '#b03e2c', '#f08a66'],
    neutral: ['#0a0c16', '#4a5068', '#c6cbe2'],
  },
  // Blue hour between sunset and night.
  blue: {
    sky: ['#141a3a', '#3a4478', '#8a8cc0'],
    water: ['#101836', '#34406e', '#9aa0d0'],
    foliage: ['#0f1a1e', '#26403e', '#5a7a6e'],
    autumn: ['#2e1420', '#943a2c', '#e8703a'],
    gold: ['#30221a', '#a8742e', '#f4c866'],
    wood: ['#1e161e', '#5a3628', '#b0744a'],
    stone: ['#181a2a', '#3e4462', '#8488aa'],
    light: ['#8a3a1a', '#ffb347', '#fff0cc'],
    accent: ['#3a1428', '#b8483a', '#f09a8a'],
    neutral: ['#101220', '#585c7a', '#d0d2ea'],
  },
  // Reference 2: lavender, peach, autumn red, golden yellow, pine, mountain blue.
  dusk: {
    sky: ['#4a5a8a', '#9c8fc4', '#f4d6bc'],
    water: ['#242a4a', '#6e72a4', '#c9c3e0'],
    foliage: ['#14221f', '#2f5a4a', '#7c9c6a'],
    autumn: ['#3e1618', '#c2452f', '#f4a06e'],
    gold: ['#4a2e16', '#e8b84a', '#fbe4a0'],
    wood: ['#24191e', '#64402e', '#c08a5a'],
    stone: ['#262438', '#4a5a8a', '#a4a2c2'],
    light: ['#a04a20', '#f2b38a', '#fff2d8'],
    accent: ['#5a2236', '#d9a0a8', '#f8d8d4'],
    neutral: ['#181826', '#6a6880', '#f0ecf2'],
  },
  morning: {
    sky: ['#3e6a78', '#7fa8a8', '#e6f0e8'],
    water: ['#1c3a44', '#4f8088', '#b8d8d4'],
    foliage: ['#16301e', '#4f8a4a', '#a8d08a'],
    autumn: ['#461c16', '#b8502e', '#f0a070'],
    gold: ['#4a3c1a', '#c8a848', '#f0d79a'],
    wood: ['#261c18', '#6e4a30', '#c49a6c'],
    stone: ['#2e3436', '#7a8480', '#d0d6cc'],
    light: ['#a05a20', '#f0d79a', '#fffaea'],
    accent: ['#5c1c1a', '#c8503a', '#f0a898'],
    neutral: ['#1c2224', '#64706c', '#eef0e6'],
  },
  noon: {
    sky: ['#3a6a9a', '#79b4e0', '#dcedf6'],
    water: ['#163444', '#3a7488', '#a8d0dc'],
    foliage: ['#163018', '#5c9a48', '#b4dc8a'],
    autumn: ['#4a1e16', '#c04a2e', '#f09a6a'],
    gold: ['#4e401a', '#d0aa3e', '#f4e29a'],
    wood: ['#2a1e18', '#7a5030', '#cc9e6c'],
    stone: ['#34343c', '#8a8478', '#dcd2be'],
    light: ['#a85a20', '#f0d79a', '#fff8e0'],
    accent: ['#641a18', '#d0452e', '#f4a090'],
    neutral: ['#202430', '#5a6478', '#eef0e6'],
  },
};

/** Which palette is active at which hour. Blended linearly between neighbours. */
export const PALETTE_KEYS: { hour: number; palette: keyof typeof PALETTES }[] = [
  { hour: 0, palette: 'night' },
  { hour: 4.8, palette: 'night' },
  { hour: 6.0, palette: 'dusk' },
  { hour: 7.5, palette: 'morning' },
  { hour: 10.5, palette: 'noon' },
  { hour: 15.5, palette: 'noon' },
  { hour: 17.2, palette: 'dusk' },
  { hour: 18.6, palette: 'dusk' },
  { hour: 19.5, palette: 'blue' },
  { hour: 20.6, palette: 'night' },
  { hour: 24, palette: 'night' },
];
