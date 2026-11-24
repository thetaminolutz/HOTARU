export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const fract = (v: number) => v - Math.floor(v);
export const TAU = Math.PI * 2;
/** Wrap an hour value into [0, 24). */
export const wrapHour = (h: number) => ((h % 24) + 24) % 24;
