/** Fish (SPEC §21): 30 species by water, region, hour, season and weather. Sizes in cm. */
export type Water = 'lake' | 'river' | 'sea' | 'pond' | 'marsh' | 'mountain';
export type FishDef = {
  id: string; name: string; text: string;
  water: Water[]; size: [number, number];
  /** active hours [from, to] (wraps over midnight) */
  hours?: [number, number];
  /** seasons (0 spring … 3 winter), default all */
  seasons?: number[];
  rain?: boolean;
  /** relative rarity weight */
  weight: number;
  colors: [string, string];
};

export const FISH: FishDef[] = [
  { id: 'carp', name: 'Carp', text: 'Old and patient. It has seen a lot of lanterns.', water: ['lake', 'pond', 'marsh'], size: [30, 80], weight: 5, colors: ['#8a7a4a', '#c8b070'] },
  { id: 'koi', name: 'Koi', text: 'Orange and white, like a festival.', water: ['pond'], size: [25, 70], weight: 4, colors: ['#e86a2a', '#f4f0e8'] },
  { id: 'goldenKoi', name: 'Golden koi', text: 'Said to bring a year of good luck. Let it go.', water: ['pond', 'lake'], size: [40, 80], hours: [17, 19], weight: 0.3, colors: ['#ffc840', '#fff0a0'] },
  { id: 'crucian', name: 'Crucian carp', text: 'Round and content.', water: ['lake', 'pond', 'marsh'], size: [12, 30], weight: 6, colors: ['#9a8a5a', '#c8b888'] },
  { id: 'ayu', name: 'Ayu sweetfish', text: 'Smells faintly of melon. Truly.', water: ['river'], size: [12, 25], seasons: [1, 2], weight: 5, colors: ['#8aa0a0', '#e8d080'] },
  { id: 'yamame', name: 'Yamame trout', text: 'Wears the river’s spots.', water: ['river', 'mountain'], size: [15, 30], weight: 4, colors: ['#7a8a7a', '#d8a0a0'] },
  { id: 'iwana', name: 'Iwana char', text: 'Lives where the water is coldest.', water: ['mountain'], size: [20, 40], weight: 3, colors: ['#5a6a5a', '#e8c890'] },
  { id: 'amago', name: 'Amago', text: 'Red dots like tiny lanterns.', water: ['river', 'mountain'], size: [15, 30], weight: 2.5, colors: ['#7a8a8a', '#e05a3a'] },
  { id: 'catfish', name: 'Catfish', text: 'Grumbles about earthquakes.', water: ['lake', 'marsh', 'river'], size: [30, 90], hours: [19, 5], rain: true, weight: 2.5, colors: ['#4a4a3a', '#8a8a6a'] },
  { id: 'eel', name: 'Eel', text: 'Slips away mid-sentence.', water: ['river', 'marsh'], size: [40, 90], hours: [20, 4], weight: 2, colors: ['#3a3a2a', '#7a7a5a'] },
  { id: 'loach', name: 'Pond loach', text: 'Whiskered, wriggly, delighted.', water: ['marsh', 'pond'], size: [8, 15], weight: 5, colors: ['#8a7a5a', '#c8b898'] },
  { id: 'medaka', name: 'Medaka', text: 'A rice-paddy fish smaller than your thumb.', water: ['marsh', 'pond'], size: [2, 4], weight: 4, colors: ['#c8a870', '#f0e0b0'] },
  { id: 'smelt', name: 'Wakasagi smelt', text: 'Silver and quick. Best in winter.', water: ['lake'], size: [8, 14], seasons: [3, 0], weight: 5, colors: ['#a8b8c8', '#e8f0f8'] },
  { id: 'lakeTrout', name: 'Lake trout', text: 'Comes up only in the cool of the evening.', water: ['lake'], size: [30, 60], hours: [16, 22], weight: 2, colors: ['#6a7a8a', '#c8d0d8'] },
  { id: 'bass', name: 'Black bass', text: 'Not from here, but it seems happy.', water: ['lake'], size: [25, 50], weight: 3, colors: ['#4a5a3a', '#a8b088'] },
  { id: 'bitterling', name: 'Bitterling', text: 'Rainbow-sided, lays eggs in mussels.', water: ['pond', 'river'], size: [5, 9], seasons: [0], weight: 3, colors: ['#a890b8', '#e8c8d8'] },
  { id: 'snakehead', name: 'Snakehead', text: 'Looks fierce. Is shy.', water: ['marsh'], size: [40, 70], seasons: [1], weight: 1, colors: ['#5a5a3a', '#9a9a6a'] },
  { id: 'seaBream', name: 'Red sea bream', text: 'The fish of celebrations.', water: ['sea'], size: [30, 60], weight: 3, colors: ['#e87a6a', '#f8d0c0'] },
  { id: 'mackerel', name: 'Mackerel', text: 'Tiger-striped and in a hurry.', water: ['sea'], size: [25, 45], seasons: [2, 3], weight: 5, colors: ['#3a6a7a', '#d8e0e8'] },
  { id: 'horseMackerel', name: 'Horse mackerel', text: 'Comes in shoals at dusk.', water: ['sea'], size: [15, 35], hours: [16, 21], weight: 5, colors: ['#7a9aa8', '#e8e8d8'] },
  { id: 'flounder', name: 'Flounder', text: 'Both eyes on one side, minding its business.', water: ['sea'], size: [25, 60], weight: 2.5, colors: ['#8a7a5a', '#f0e8d8'] },
  { id: 'rockfish', name: 'Rockfish', text: 'Lives between the stones of the breakwater.', water: ['sea'], size: [15, 35], weight: 4, colors: ['#8a5a4a', '#d8a890'] },
  { id: 'puffer', name: 'Pufferfish', text: 'Balloons up, offended. Return it gently.', water: ['sea'], size: [15, 40], weight: 1.5, colors: ['#b8a878', '#f8f0d8'] },
  { id: 'squid', name: 'Firefly squid', text: 'Glows blue in the night tide.', water: ['sea'], size: [5, 8], hours: [21, 3], seasons: [0], weight: 1, colors: ['#5a7ab8', '#a8e0ff'] },
  { id: 'octopus', name: 'Octopus', text: 'Hugs the line, then politely lets go.', water: ['sea'], size: [30, 80], weight: 1.2, colors: ['#c86a5a', '#e8a898'] },
  { id: 'yellowtail', name: 'Yellowtail', text: 'Grows a new name every year.', water: ['sea'], size: [50, 100], seasons: [3], weight: 1.2, colors: ['#4a6a8a', '#e8d060'] },
  { id: 'sweetSmelt', name: 'Rain trout', text: 'Rises only when it rains.', water: ['river', 'lake'], size: [20, 40], rain: true, weight: 1.5, colors: ['#6a8a9a', '#c8e0e8'] },
  { id: 'salamander', name: 'Giant salamander', text: 'Not a fish. Very old. Very dignified.', water: ['mountain'], size: [60, 120], hours: [19, 5], weight: 0.4, colors: ['#4a3a2a', '#8a6a4a'] },
  { id: 'mirrorCarp', name: 'Mirror carp', text: 'Big scales like coins. Lives in the mirror lakes.', water: ['mountain', 'lake'], size: [40, 90], weight: 0.8, colors: ['#9a8a4a', '#e8d898'] },
  { id: 'lanternFish', name: 'Lantern fish', text: 'A little light swims under the pier at night.', water: ['lake'], size: [6, 12], hours: [21, 3], seasons: [1], weight: 0.6, colors: ['#3a4a6a', '#ffd070'] },
];

/** Pick a fish for the water, hour, season and rain; r in [0,1). */
export function pickFish(water: Water, hour: number, season: number, rain: boolean, r: number): FishDef {
  const inHours = (h?: [number, number]) => !h || (h[0] <= h[1] ? hour >= h[0] && hour < h[1] : hour >= h[0] || hour < h[1]);
  const ok = FISH.filter((f) => f.water.includes(water) && inHours(f.hours) && (!f.seasons || f.seasons.includes(season)) && (!f.rain || rain));
  const pool = ok.length ? ok : FISH.filter((f) => f.water.includes(water));
  let sum = 0;
  for (const f of pool) sum += f.weight;
  let t = r * sum;
  for (const f of pool) if ((t -= f.weight) <= 0) return f;
  return pool[pool.length - 1]!;
}
