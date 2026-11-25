/** Seeded PRNGs. Same seed → same sequence, everywhere. */

/** 32-bit string hash (FNV-1a) used to derive sub-seeds from names. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Integer hash of up to 3 ints → uint32. */
export function hash3(x: number, y: number, z = 0, seed = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ (y | 0), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ (z | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  return h >>> 0;
}

export type Rng = {
  /** float in [0,1) */
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  /** Fork a named, independent stream. */
  fork(name: string): Rng;
  readonly seed: number;
};

/** sfc32 seeded via splitmix32. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const splitmix = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = splitmix(), b = splitmix(), c = splitmix(), d = splitmix();
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  const rng: Rng = {
    seed: seed >>> 0,
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor((max - min) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)]!,
    chance: (p) => next() < p,
    fork: (name) => createRng(hashString(name) ^ seed),
  };
  return rng;
}
