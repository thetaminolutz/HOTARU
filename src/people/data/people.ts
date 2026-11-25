/**
 * Villagers and wanderers (SPEC §16, §17): name parts, personalities, jobs with their daily
 * schedules, looks by profession, and the named wanderers with their haunts.
 */
export type Personality = 'shy' | 'cheerful' | 'grumpy' | 'dreamy' | 'chatty';
export const PERSONALITIES: Personality[] = ['shy', 'cheerful', 'grumpy', 'dreamy', 'chatty'];

export type Age = 'child' | 'adult' | 'elder';

/** Where an activity happens. */
export type Place = 'home' | 'work' | 'plaza' | 'teahouse' | 'field' | 'dock' | 'lanterns' | 'street' | 'shrine' | 'river';
export type Activity = 'sleep' | 'eat' | 'work' | 'walk' | 'chat' | 'tea' | 'play' | 'sit' | 'lightLanterns' | 'snuffLanterns' | 'sweep' | 'pray' | 'fish';
export type Slot = { at: number; act: Activity; place: Place };

export type Job = 'farmer' | 'fisher' | 'lanternMaker' | 'potter' | 'weaver' | 'carpenter' | 'merchant' | 'innkeeper' | 'tea' | 'monk' | 'child' | 'elder';

/** Daily schedules (hour → activity). Children and elders have their own. */
export const SCHEDULES: Record<Job, Slot[]> = {
  farmer: [{ at: 0, act: 'sleep', place: 'home' }, { at: 5, act: 'eat', place: 'home' }, { at: 5.8, act: 'work', place: 'field' }, { at: 12, act: 'sit', place: 'field' }, { at: 13.2, act: 'work', place: 'field' }, { at: 17.6, act: 'walk', place: 'home' }, { at: 18.5, act: 'eat', place: 'home' }, { at: 19.6, act: 'chat', place: 'plaza' }, { at: 21, act: 'sleep', place: 'home' }],
  fisher: [{ at: 0, act: 'sleep', place: 'home' }, { at: 4.5, act: 'walk', place: 'dock' }, { at: 5, act: 'fish', place: 'dock' }, { at: 9, act: 'work', place: 'dock' }, { at: 12, act: 'eat', place: 'home' }, { at: 13.5, act: 'work', place: 'home' }, { at: 17.5, act: 'tea', place: 'teahouse' }, { at: 21, act: 'sleep', place: 'home' }],
  lanternMaker: [{ at: 0, act: 'sleep', place: 'home' }, { at: 5.2, act: 'snuffLanterns', place: 'lanterns' }, { at: 6.5, act: 'eat', place: 'home' }, { at: 7.5, act: 'work', place: 'work' }, { at: 17.2, act: 'lightLanterns', place: 'lanterns' }, { at: 19.4, act: 'chat', place: 'plaza' }, { at: 21.5, act: 'sleep', place: 'home' }],
  potter: [{ at: 0, act: 'sleep', place: 'home' }, { at: 6.5, act: 'eat', place: 'home' }, { at: 7.5, act: 'work', place: 'work' }, { at: 12, act: 'tea', place: 'teahouse' }, { at: 13, act: 'work', place: 'work' }, { at: 18, act: 'walk', place: 'street' }, { at: 19, act: 'eat', place: 'home' }, { at: 22, act: 'sleep', place: 'home' }],
  weaver: [{ at: 0, act: 'sleep', place: 'home' }, { at: 6, act: 'eat', place: 'home' }, { at: 7, act: 'work', place: 'work' }, { at: 15, act: 'chat', place: 'plaza' }, { at: 16, act: 'work', place: 'work' }, { at: 18.5, act: 'eat', place: 'home' }, { at: 21.5, act: 'sleep', place: 'home' }],
  carpenter: [{ at: 0, act: 'sleep', place: 'home' }, { at: 5.5, act: 'eat', place: 'home' }, { at: 6.5, act: 'work', place: 'work' }, { at: 12, act: 'sit', place: 'plaza' }, { at: 13, act: 'work', place: 'street' }, { at: 17, act: 'tea', place: 'teahouse' }, { at: 19, act: 'eat', place: 'home' }, { at: 21, act: 'sleep', place: 'home' }],
  merchant: [{ at: 0, act: 'sleep', place: 'home' }, { at: 6.5, act: 'eat', place: 'home' }, { at: 7.5, act: 'work', place: 'work' }, { at: 18, act: 'chat', place: 'plaza' }, { at: 19.5, act: 'eat', place: 'home' }, { at: 22.5, act: 'sleep', place: 'home' }],
  innkeeper: [{ at: 0, act: 'sleep', place: 'home' }, { at: 5.5, act: 'sweep', place: 'work' }, { at: 7, act: 'work', place: 'work' }, { at: 23, act: 'sleep', place: 'home' }],
  tea: [{ at: 0, act: 'sleep', place: 'home' }, { at: 6, act: 'sweep', place: 'work' }, { at: 7, act: 'work', place: 'work' }, { at: 20, act: 'eat', place: 'home' }, { at: 22, act: 'sleep', place: 'home' }],
  monk: [{ at: 0, act: 'sleep', place: 'home' }, { at: 4.8, act: 'pray', place: 'shrine' }, { at: 6, act: 'sweep', place: 'shrine' }, { at: 9, act: 'pray', place: 'shrine' }, { at: 12, act: 'eat', place: 'home' }, { at: 13, act: 'walk', place: 'street' }, { at: 16, act: 'sweep', place: 'shrine' }, { at: 17.8, act: 'pray', place: 'shrine' }, { at: 20, act: 'sleep', place: 'home' }],
  child: [{ at: 0, act: 'sleep', place: 'home' }, { at: 6.5, act: 'eat', place: 'home' }, { at: 7.5, act: 'play', place: 'plaza' }, { at: 12, act: 'eat', place: 'home' }, { at: 13, act: 'play', place: 'street' }, { at: 16, act: 'play', place: 'river' }, { at: 18, act: 'eat', place: 'home' }, { at: 20, act: 'sleep', place: 'home' }],
  elder: [{ at: 0, act: 'sleep', place: 'home' }, { at: 5, act: 'sweep', place: 'home' }, { at: 7, act: 'eat', place: 'home' }, { at: 8.5, act: 'sit', place: 'plaza' }, { at: 12, act: 'eat', place: 'home' }, { at: 14, act: 'tea', place: 'teahouse' }, { at: 16.5, act: 'sit', place: 'river' }, { at: 18.5, act: 'eat', place: 'home' }, { at: 20.5, act: 'sleep', place: 'home' }],
};

/** Clothes by job: kimono, obi/accent (sRGB). */
export const CLOTHES: Record<Job, [string, string][]> = {
  farmer: [['#5a6a7a', '#c8b898'], ['#6a5a4a', '#3a4a5a'], ['#4a5a4a', '#d8c8a8']],
  fisher: [['#2a3a5a', '#e8e0d0'], ['#3a4a6a', '#a83a2a']],
  lanternMaker: [['#8a3a2a', '#e8b84a']],
  potter: [['#7a6a5a', '#4a3a30'], ['#5a4a40', '#a89878']],
  weaver: [['#3a4a8a', '#e8d8b8'], ['#6a3a5a', '#d8b878']],
  carpenter: [['#5a4a3a', '#2a2a2a'], ['#4a4a40', '#8a6a4a']],
  merchant: [['#2a4a4a', '#c8a050'], ['#4a2a3a', '#e0c890'], ['#3a3a5a', '#b04a3a']],
  innkeeper: [['#7a2a3a', '#e8d8a8'], ['#4a3a6a', '#d8a858']],
  tea: [['#4a6a4a', '#e8dcc0'], ['#8a5a6a', '#f0e0c8']],
  monk: [['#2a2a2a', '#c8782a'], ['#6a4a30', '#2a2a2a']],
  child: [['#c84a3a', '#f0d040'], ['#3a7ac8', '#f0f0f0'], ['#e0905a', '#5a3a8a'], ['#5aa05a', '#f0e0a0']],
  elder: [['#4a4a50', '#8a7a68'], ['#5a4a40', '#a8a098'], ['#3a3a48', '#c8b898']],
};

export const GIVEN = ['Haru', 'Yuki', 'Sora', 'Aki', 'Natsu', 'Ren', 'Kai', 'Mio', 'Hana', 'Tomo', 'Kei', 'Rin', 'Sato', 'Mika', 'Nao', 'Kiku', 'Taro', 'Jiro', 'Ume', 'Fuji', 'Kaede', 'Momo', 'Shin', 'Toki', 'Asa', 'Yoru', 'Kumo', 'Mizu', 'Hoshi', 'Tsuki', 'Kiyo', 'Masa', 'Nobu', 'Sumi', 'Chiyo', 'Isamu', 'Hiro', 'Daichi', 'Koharu', 'Ayame'];
export const FAMILY = ['Kawa', 'Yama', 'Mori', 'Hashi', 'Ishi', 'Mura', 'Tani', 'Hara', 'Shima', 'Oka', 'Nishi', 'Higashi', 'Kita', 'Minami', 'Sugi', 'Matsu', 'Take', 'Ume', 'Kiri', 'Fuji'];
export const FAMILY_END = ['moto', 'da', 'ta', 'no', 'mura', 'saki', 'zawa', 'kawa', 'yama', 'shita'];

export type WandererDef = {
  id: string; name: string; title: string; job: Job;
  clothes: [string, string]; hat: boolean; age: Age;
  /** places they move between (village ids, 'dock', 'waterfall', 'hill', 'castle'); at night they rest */
  route: string[];
  /** hours they are about (else resting out of sight) */
  hours: [number, number];
  pitch: number;
};

export const WANDERERS: WandererDef[] = [
  { id: 'poet', name: 'Bashō-san', title: 'the Travelling Poet', job: 'elder', clothes: ['#3a3a4a', '#c8b898'], hat: true, age: 'elder', route: ['dock', 'sakuraoka', 'kumoji', 'castle'], hours: [7, 19], pitch: 0.8 },
  { id: 'pilgrim', name: 'Jōkei', title: 'the Pilgrim with the Bell', job: 'monk', clothes: ['#e8e4d8', '#8a7a68'], hat: true, age: 'adult', route: ['kumoji', 'yukemuri', 'inaho', 'ichiba', 'sakuraoka'], hours: [6, 18], pitch: 0.9 },
  { id: 'peddler', name: 'Tōbei', title: 'the Peddler', job: 'merchant', clothes: ['#5a4a3a', '#c8a050'], hat: true, age: 'adult', route: ['ichiba', 'chabatake', 'inaho', 'dock', 'shiomachi'], hours: [7, 18], pitch: 1.0 },
  { id: 'painter', name: 'Fumiko', title: 'the Painter', job: 'weaver', clothes: ['#6a8aa8', '#f0e0c8'], hat: false, age: 'adult', route: ['dock', 'waterfall', 'sakuraoka', 'chabatake'], hours: [8, 17], pitch: 1.25 },
  { id: 'oldFisher', name: 'Old Genzō', title: 'the Old Fisherman of the Lake', job: 'fisher', clothes: ['#2a3a5a', '#d8d0c0'], hat: true, age: 'elder', route: ['dock'], hours: [4, 20], pitch: 0.75 },
  { id: 'akari', name: 'Akari', title: 'the Lantern Maker of the lake', job: 'lanternMaker', clothes: ['#8a3a2a', '#e8b84a'], hat: false, age: 'adult', route: ['dock'], hours: [6, 22], pitch: 1.3 },
  { id: 'masked', name: '???', title: 'the Masked Stranger', job: 'elder', clothes: ['#2a2430', '#e8e4dc'], hat: false, age: 'adult', route: ['castle', 'kumoji', 'dock'], hours: [17.5, 20], pitch: 0.6 },
  { id: 'lostCat', name: 'Little Nono', title: 'the Child Who Lost Her Cat', job: 'child', clothes: ['#e07a8a', '#f0e060'], hat: false, age: 'child', route: ['inaho'], hours: [8, 18], pitch: 1.6 },
  { id: 'hermit', name: 'Kōsetsu', title: 'the Hermit of the Waterfall', job: 'monk', clothes: ['#5a5a4a', '#8a7a5a'], hat: false, age: 'elder', route: ['waterfall'], hours: [5, 21], pitch: 0.7 },
  { id: 'starWatcher', name: 'Seiji', title: 'the Star Watcher', job: 'elder', clothes: ['#1e2a4a', '#c8c8e0'], hat: false, age: 'adult', route: ['hill'], hours: [19, 5], pitch: 0.95 },
  { id: 'postman', name: 'Hayato', title: 'the Postman', job: 'carpenter', clothes: ['#2a4a6a', '#d8c070'], hat: true, age: 'adult', route: ['ichiba', 'inaho', 'chabatake', 'ichiba', 'sakuraoka', 'shiomachi', 'kumoji', 'dock'], hours: [6.5, 17], pitch: 1.1 },
  { id: 'musician', name: 'Kinu', title: 'the Wandering Musician', job: 'tea', clothes: ['#6a3a5a', '#e8c878'], hat: true, age: 'adult', route: ['shiomachi', 'ichiba', 'yukemuri', 'dock'], hours: [10, 21], pitch: 1.35 },
  { id: 'botanist', name: 'Dr. Midori', title: 'the Plant Collector', job: 'weaver', clothes: ['#4a6a3a', '#e8dcc0'], hat: true, age: 'elder', route: ['chabatake', 'inaho', 'yukemuri', 'castle'], hours: [7, 17], pitch: 1.15 },
  { id: 'kiteMaker', name: 'Grandpa Tako', title: 'the Kite Flyer', job: 'elder', clothes: ['#7a5a3a', '#e8a040'], hat: false, age: 'elder', route: ['inaho', 'sakuraoka'], hours: [9, 17], pitch: 0.85 },
  { id: 'teaMerchant', name: 'Osen', title: 'the Tea Merchant', job: 'tea', clothes: ['#3a5a3a', '#f0e0b0'], hat: true, age: 'adult', route: ['chabatake', 'ichiba', 'yukemuri', 'kumoji'], hours: [6, 16], pitch: 1.2 },
  { id: 'ferryman', name: 'Matabei', title: 'the Ferryman', job: 'fisher', clothes: ['#3a3a3a', '#a89878'], hat: true, age: 'elder', route: ['shiomachi'], hours: [5, 19], pitch: 0.7 },
];
