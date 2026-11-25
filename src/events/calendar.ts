/**
 * The festival calendar (SPEC §22): one festival a season, on the fourth day of it, from dusk
 * to late night, plus New Year on the first night of spring. Villagers announce a festival in
 * the days before. Works with the season cycle (`seasonDays` per season) and with a season
 * locked in the settings (then each festival returns every `seasonDays` days).
 */
export type FestivalId = 'hanami' | 'tanabata' | 'tsukimi' | 'yukitoro' | 'newYear';

export type FestivalDef = {
  id: FestivalId; name: string; sub: string; season: number;
  /** where it is held: a village id, or 'dock' for Lantern Lake */
  place: string;
  /** hours it runs */
  hours: [number, number];
  /** what people say in the days before */
  announce: string[];
};

export const FESTIVALS: FestivalDef[] = [
  { id: 'hanami', name: 'Hanami', sub: 'Blossom viewing under the old cherry', season: 0, place: 'sakuraoka', hours: [10, 23],
    announce: ['The old cherry in Sakuraoka is nearly open. Hanami in a few days - bring a blanket!', 'We sing under the blossoms at hanami. Badly, but with feeling.', 'At night they hang lanterns in the cherry branches. The petals glow like little moons.'] },
  { id: 'tanabata', name: 'Lantern & Firefly Festival', sub: 'Lanterns float on Lantern Lake', season: 1, place: 'dock', hours: [17, 24],
    announce: ['The Lantern Festival is coming! Stalls, taiko, and fireworks over the lake.', 'On festival night we float lanterns on the lake. Each one carries a wish home.', 'Akari has been painting lanterns all week for the festival. Her fingers are blue.'] },
  { id: 'tsukimi', name: 'Tsukimi', sub: 'Moon viewing on the hill', season: 2, place: 'inaho', hours: [17, 23.5],
    announce: ['The harvest moon is close. We will put out pampas grass and dumplings for tsukimi.', 'Tsukimi soon. Everyone sits on the hill and looks up. That is the whole festival. It is perfect.', 'The rabbit in the moon makes rice cakes. Grandmother says so, and I believe her.'] },
  { id: 'yukitoro', name: 'Snow Lantern Night', sub: 'Candles in the snow at Yukemuri', season: 3, place: 'yukemuri', hours: [16.5, 23.5],
    announce: ['In Yukemuri they will light the snow lanterns soon. Hundreds of little candles in the snow.', 'Snow Lantern Night is coming. Warm amazake, quiet music, cold toes.', 'The children are already building snow lanterns for the festival. Some look like cats.'] },
  { id: 'newYear', name: 'New Year', sub: '108 bells at Kumoji', season: 0, place: 'kumoji', hours: [22, 24],
    announce: ['The New Year is close. At midnight the temple bell rings one hundred and eight times.', 'Watch the first sunrise of the year from the temple, they say. Above the sea of clouds.'] },
];

const DAY_OF_FESTIVAL = 3;

/** Season position for a day (as the weather computes it): 0 spring … 4, wrapping. */
export type SeasonClock = { seasonDays: number; startSeason: number; lock: number | null };

function seasonIndexAndDay(day: number, c: SeasonClock): [number, number] {
  if (c.lock !== null) return [c.lock, ((day % c.seasonDays) + c.seasonDays) % c.seasonDays];
  const s = c.startSeason * c.seasonDays + day;
  const len = c.seasonDays * 4;
  const k = ((s % len) + len) % len;
  return [Math.floor(k / c.seasonDays), k % c.seasonDays];
}

/** The festival on this day (any hour), or null. */
export function festivalOn(day: number, c: SeasonClock): FestivalDef | null {
  const [season, d] = seasonIndexAndDay(day, c);
  if (season === 0 && d === 0) return FESTIVALS.find((f) => f.id === 'newYear')!;
  if (d !== Math.min(DAY_OF_FESTIVAL, c.seasonDays - 1)) return null;
  return FESTIVALS.find((f) => f.season === season && f.id !== 'newYear') ?? null;
}

/** A festival happening right now (day + hour in its hours). New Year spills past midnight. */
export function festivalNow(day: number, hour: number, c: SeasonClock): FestivalDef | null {
  const f = festivalOn(day, c);
  if (f && hour >= f.hours[0] && hour < f.hours[1]) return f;
  // the bells of New Year go on a little after midnight; the first sunrise belongs to it too
  const prev = festivalOn(day + 1, c);
  if (prev?.id === 'newYear' && hour >= 22) return prev;
  const y = festivalOn(day, c);
  if (y?.id === 'newYear' && hour < 7) return y;
  return null;
}

/** The next festival within `days` days (for villagers to talk about), with days until it. */
export function festivalSoon(day: number, c: SeasonClock, days = 3): { f: FestivalDef; in: number } | null {
  for (let k = 1; k <= days; k++) { const f = festivalOn(day + k, c); if (f) return { f, in: k }; }
  return null;
}
