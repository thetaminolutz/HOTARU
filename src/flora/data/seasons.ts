/**
 * How every tree species looks through the year (SPEC §12 seasons). Autumn is each species'
 * own per-tree palette (src/flora/data/trees.ts). The other seasons replace the crown colour
 * (`mix` 1 = fully), drop leaves (`bare` = share of leaf clusters gone) or bloom.
 */
export type SeasonLook = { col: string | null; mix: number; bare: number };
type Year = [SeasonLook, SeasonLook, SeasonLook, SeasonLook]; // spring, summer, autumn, winter

const own: SeasonLook = { col: null, mix: 0, bare: 0 };
const c = (col: string, mix = 1, bare = 0): SeasonLook => ({ col, mix, bare });
const deciduous = (spring: string, summer: string, bare = 0.85): Year => [c(spring), c(summer), own, c('#5a4a40', 0.6, bare)];
const evergreen: Year = [own, own, own, own];

export const SEASON_LOOKS: Record<string, Year> = {
  maple: deciduous('#8cbc4c', '#3e7c36'),
  larch: deciduous('#9ccc5c', '#4a8c46', 0.75),
  fir: evergreen, pine: evergreen, cedar: evergreen, hinoki: evergreen, bamboo: evergreen, camphor: evergreen,
  shrub: deciduous('#7ab04a', '#3e7a36', 0.6),
  cherry: [c('#f4a6c2'), c('#4a7c3c'), own, c('#5a4a44', 0.6, 0.9)], // sakura in spring
  plum: [c('#f0c4d4'), c('#4e8040'), own, c('#e8a0b8', 0.5, 0.6)],   // ume blooms at winter's end
  ginkgo: deciduous('#a0cc64', '#5a9c4a', 0.9),
  birch: deciduous('#acc866', '#5a9a4a', 0.9),
  willow: [c('#b4d070'), c('#7ab050'), c('#c8b450'), c('#8a8050', 0.6, 0.7)],
  persimmon: deciduous('#9cc45a', '#4a843e', 0.8),
  zelkova: deciduous('#a0c862', '#4c8840', 0.9),
  azalea: [c('#e0588a'), c('#3e7a3a'), own, c('#4a5a3a', 0.6, 0.3)],
  hydrangea: [c('#6a9a4a'), own, c('#8a6a5a'), c('#6a5a4a', 0.7, 0.5)],
  camellia: [own, own, own, c('#c8282a', 0.4, 0)], // red flowers in the snow
};

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type SeasonName = (typeof SEASONS)[number];

/** Grass/terrain tint multipliers per season (autumn = the regions' own colours). */
export const GRASS_TINT: [number, number, number][] = [
  [0.82, 1.12, 0.74], // spring: fresh
  [0.7, 1.06, 0.72],  // summer: deep green
  [1, 1, 1],          // autumn
  [0.92, 0.84, 0.76], // winter: dry and dull
];

/** Weights of the four seasons at a continuous season value (0 spring … 4 = spring again). */
export function seasonWeights(s: number): [number, number, number, number] {
  const w: [number, number, number, number] = [0, 0, 0, 0];
  const v = ((s % 4) + 4) % 4, i = Math.floor(v), f = v - i;
  // hold each season for most of its span, blend over the last fifth into the next
  const t = Math.max(0, (f - 0.8) / 0.2);
  w[i] = 1 - t;
  w[(i + 1) % 4] += t;
  return w;
}

/** The look of a species at a season value: colour (linear-ready hex mix), mix and bareness. */
export function lookAt(species: string, s: number): { col: [number, number, number] | null; mix: number; bare: number } {
  const year = SEASON_LOOKS[species] ?? evergreen;
  const w = seasonWeights(s);
  let mix = 0, bare = 0;
  const col: [number, number, number] = [0, 0, 0];
  w.forEach((k, i) => {
    if (!k) return;
    const L = year[i]!;
    bare += L.bare * k;
    if (L.col && L.mix) {
      const n = parseInt(L.col.slice(1), 16);
      const lin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      col[0] += lin((n >> 16) & 255) * L.mix * k; col[1] += lin((n >> 8) & 255) * L.mix * k; col[2] += lin(n & 255) * L.mix * k;
      mix += L.mix * k;
    }
  });
  if (mix > 1e-4) { col[0] /= mix; col[1] /= mix; col[2] /= mix; }
  return { col: mix > 1e-4 ? col : null, mix, bare };
}
