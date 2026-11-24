/**
 * Time-of-day lighting keyframes (SPEC §3, §4, §12). Colours are sRGB hex and converted
 * to linear at evaluation. Intensities are linear multipliers in HDR.
 */
export type TodKey = {
  hour: number;
  /** Colours */
  zenith: string; horizon: string; sunGlow: string;
  sun: string; sunI: number;
  moonI: number;
  ambSky: string; ambGround: string; ambI: number;
  shadowTint: string;
  rim: string; rimI: number;
  fog: number; heightFog: number;
  exposure: number;
  /** Grade: lift (shadows), gain (highlights) tints; saturation */
  lift: string; gain: string; sat: number;
  stars: number;
  /** Lanterns & windows on (0..1). */
  lamps: number;
  clouds: string; cloudLit: string;
};

export const TOD_KEYS: TodKey[] = [
  { hour: 0, zenith: '#060a1e', horizon: '#1a2450', sunGlow: '#000000', sun: '#8aa0e0', sunI: 0, moonI: 0.38,
    ambSky: '#24306a', ambGround: '#140e18', ambI: 0.42, shadowTint: '#1a1e44', rim: '#7d8fc2', rimI: 0.15,
    fog: 0.0007, heightFog: 0.25, exposure: 1.25, lift: '#0a1030', gain: '#e8ecff', sat: 0.95, stars: 1, lamps: 1,
    clouds: '#161d40', cloudLit: '#4a5888' },
  { hour: 4.6, zenith: '#0a1026', horizon: '#26305a', sunGlow: '#000000', sun: '#8aa0e0', sunI: 0, moonI: 0.32,
    ambSky: '#28346c', ambGround: '#16101a', ambI: 0.42, shadowTint: '#1a1e44', rim: '#7d8fc2', rimI: 0.15,
    fog: 0.0008, heightFog: 0.5, exposure: 1.25, lift: '#0a1030', gain: '#e8ecff', sat: 0.95, stars: 0.9, lamps: 1,
    clouds: '#1a2246', cloudLit: '#4a5888' },
  { hour: 5.6, zenith: '#2e3a6e', horizon: '#d89a9a', sunGlow: '#f2a070', sun: '#ffb080', sunI: 0.6, moonI: 0,
    ambSky: '#6a6aa0', ambGround: '#3a2a30', ambI: 0.55, shadowTint: '#4a3a78', rim: '#ffb080', rimI: 0.6,
    fog: 0.0008, heightFog: 1.0, exposure: 1.1, lift: '#1a1438', gain: '#fff0e4', sat: 1.0, stars: 0.2, lamps: 0.6,
    clouds: '#6a5a88', cloudLit: '#f4b090' },
  { hour: 7.5, zenith: '#6a9ab0', horizon: '#c8e0d8', sunGlow: '#f6e0a8', sun: '#fff0d0', sunI: 2.2, moonI: 0,
    ambSky: '#8ab4c0', ambGround: '#4a5a3a', ambI: 0.55, shadowTint: '#4a5a8a', rim: '#ffe8b0', rimI: 0.25,
    fog: 0.0006, heightFog: 0.7, exposure: 1.0, lift: '#142030', gain: '#fffaf0', sat: 1.0, stars: 0, lamps: 0,
    clouds: '#c8d8dc', cloudLit: '#fff6e0' },
  { hour: 12, zenith: '#3e7ec0', horizon: '#b8d8ee', sunGlow: '#fff8e8', sun: '#fff6e8', sunI: 3.0, moonI: 0,
    ambSky: '#7aaad8', ambGround: '#5a6a40', ambI: 0.6, shadowTint: '#4a5a9a', rim: '#ffffff', rimI: 0.05,
    fog: 0.00035, heightFog: 0.2, exposure: 0.95, lift: '#101828', gain: '#fffcf4', sat: 1.0, stars: 0, lamps: 0,
    clouds: '#e8eef4', cloudLit: '#ffffff' },
  { hour: 16, zenith: '#4a78b0', horizon: '#d8d0c8', sunGlow: '#ffe0b0', sun: '#ffe8c8', sunI: 2.6, moonI: 0,
    ambSky: '#7a98c8', ambGround: '#5a5038', ambI: 0.55, shadowTint: '#5a5a9a', rim: '#ffd8a0', rimI: 0.3,
    fog: 0.0004, heightFog: 0.2, exposure: 0.98, lift: '#141830', gain: '#fff6ea', sat: 1.0, stars: 0, lamps: 0,
    clouds: '#e0dcdc', cloudLit: '#fff0dc' },
  // Golden hour (reference 2): lavender sky, peach horizon, warm low sun, lilac shadows.
  { hour: 17.6, zenith: '#5e6cb0', horizon: '#e8b8a8', sunGlow: '#f0b088', sun: '#ffc890', sunI: 2.2, moonI: 0,
    ambSky: '#7078bc', ambGround: '#3e2c44', ambI: 0.46, shadowTint: '#3e4490', rim: '#ffc078', rimI: 0.9,
    fog: 0.0005, heightFog: 0.3, exposure: 0.92, lift: '#1a1c48', gain: '#fff0dc', sat: 1.08, stars: 0, lamps: 0.1,
    clouds: '#a898cc', cloudLit: '#ffc8a8' },
  { hour: 18.6, zenith: '#46508e', horizon: '#e89a8a', sunGlow: '#ff9a6a', sun: '#ff9a68', sunI: 1.1, moonI: 0,
    ambSky: '#6a5ea0', ambGround: '#3a2438', ambI: 0.46, shadowTint: '#4a3a88', rim: '#ff9a60', rimI: 1.0,
    fog: 0.0006, heightFog: 0.4, exposure: 1.05, lift: '#20163e', gain: '#ffe8d8', sat: 1.05, stars: 0.05, lamps: 0.6,
    clouds: '#8a6a98', cloudLit: '#ff9a7a' },
  // Blue hour.
  { hour: 19.5, zenith: '#1c2458', horizon: '#5a5a92', sunGlow: '#a06a8a', sun: '#8a90d0', sunI: 0, moonI: 0.22,
    ambSky: '#3a4282', ambGround: '#1e1624', ambI: 0.5, shadowTint: '#262a5a', rim: '#8a90d0', rimI: 0.2,
    fog: 0.0007, heightFog: 0.4, exposure: 1.2, lift: '#10123a', gain: '#eeeeff', sat: 1.0, stars: 0.5, lamps: 1,
    clouds: '#2e3264', cloudLit: '#6a6aa0' },
  // Night (reference 1).
  { hour: 21, zenith: '#070b20', horizon: '#1c2552', sunGlow: '#000000', sun: '#8aa0e0', sunI: 0, moonI: 0.4,
    ambSky: '#26326e', ambGround: '#160e18', ambI: 0.44, shadowTint: '#1a1e44', rim: '#7d8fc2', rimI: 0.15,
    fog: 0.0007, heightFog: 0.25, exposure: 1.25, lift: '#0a1030', gain: '#e8ecff', sat: 0.95, stars: 1, lamps: 1,
    clouds: '#171e42', cloudLit: '#4c5a8c' },
  { hour: 24, zenith: '#060a1e', horizon: '#1a2450', sunGlow: '#000000', sun: '#8aa0e0', sunI: 0, moonI: 0.38,
    ambSky: '#24306a', ambGround: '#140e18', ambI: 0.42, shadowTint: '#1a1e44', rim: '#7d8fc2', rimI: 0.15,
    fog: 0.0007, heightFog: 0.25, exposure: 1.25, lift: '#0a1030', gain: '#e8ecff', sat: 0.95, stars: 1, lamps: 1,
    clouds: '#161d40', cloudLit: '#4a5888' },
];
