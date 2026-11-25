/**
 * Fauna (SPEC §15): every species' body plan, colours, habitat, hours, behaviour and voice.
 * All peaceful. Body plans are built in code (src/fauna/models.ts) and animated in the vertex
 * shader (legs, head, tail, wings).
 */
export type Plan = 'quad' | 'bird' | 'fish' | 'insect' | 'crab' | 'tortoise' | 'frog';
export type Habitat = 'forest' | 'meadow' | 'water' | 'shore' | 'village' | 'farm' | 'temple' | 'coast' | 'snow' | 'marsh' | 'onsen' | 'sky' | 'flowers';
export type Move = 'walk' | 'hop' | 'fly' | 'circle' | 'swim' | 'flutter' | 'perch' | 'still';

export type Species = {
  id: string;
  name: string;
  plan: Plan;
  /** overall length in metres */
  size: number;
  /** body, belly/underside, head, legs/beak, accent (sRGB hex) */
  colors: [string, string, string, string, string];
  habitats: Habitat[];
  /** active hours [from, to) (may wrap midnight); outside them it sleeps or is absent */
  hours: [number, number];
  /** shown asleep outside its hours (deer lie in the grass) instead of absent */
  sleeps?: boolean;
  group: [number, number];
  move: Move;
  speed: number;
  /** distance at which a jogging player makes it flee (m); 0 = never */
  flee: number;
  /** 0..1 chance to come closer when you stand still or walk slowly */
  curious: number;
  pettable?: boolean;
  /** bows back when you bow (temple deer) */
  bows?: boolean;
  voice?: 'meow' | 'bark' | 'quack' | 'deer' | 'cluck' | 'whinny' | 'moo' | 'monkey' | 'crow' | 'gull' | 'owl' | 'kite' | 'crane' | 'coo' | 'frog';
  /** spawn weight (rarity) */
  weight: number;
  /** quad options */
  ears?: 'point' | 'round' | 'long' | 'none';
  tail?: number;
  neck?: number;
  legs?: number;
  antlers?: boolean;
  /** bird options */
  wing?: number;
  beak?: number;
  /** spots / stripes */
  pattern?: 'spots' | 'stripes' | 'patches' | 'mask';
};

export const SPECIES: Species[] = [
  // ---- land animals ----
  { id: 'sikaDeer', name: 'Sika deer', plan: 'quad', size: 1.4, colors: ['#8a5a36', '#e8dcc4', '#7a4e30', '#5a3a24', '#f0e6d0'], habitats: ['forest', 'temple', 'meadow'], hours: [5, 20], sleeps: true, group: [2, 5], move: 'walk', speed: 1.1, flee: 14, curious: 0.35, pettable: true, bows: true, voice: 'deer', weight: 3, ears: 'round', tail: 0.12, neck: 0.36, legs: 0.7, antlers: true, pattern: 'spots' },
  { id: 'tanuki', name: 'Tanuki', plan: 'quad', size: 0.6, colors: ['#6a5a48', '#4a3e34', '#7a6a56', '#2a2420', '#1e1a18'], habitats: ['forest', 'village', 'farm'], hours: [17, 6], group: [1, 3], move: 'walk', speed: 1.2, flee: 9, curious: 0.5, pettable: true, voice: undefined, weight: 2, ears: 'round', tail: 0.3, neck: 0.1, legs: 0.18, pattern: 'mask' },
  { id: 'fox', name: 'Red fox', plan: 'quad', size: 0.8, colors: ['#c8682a', '#f0e8dc', '#c8682a', '#2a1e18', '#f8f4ec'], habitats: ['meadow', 'forest', 'farm'], hours: [16, 8], group: [1, 2], move: 'walk', speed: 1.5, flee: 16, curious: 0.25, weight: 2, ears: 'point', tail: 0.45, neck: 0.15, legs: 0.28 },
  { id: 'whiteFox', name: 'White fox', plan: 'quad', size: 0.8, colors: ['#f4f0e8', '#ffffff', '#f4f0e8', '#d8d0c8', '#e8a0a0'], habitats: ['temple', 'forest'], hours: [20, 4], group: [1, 1], move: 'walk', speed: 1.3, flee: 0, curious: 0.7, weight: 0.15, ears: 'point', tail: 0.5, neck: 0.15, legs: 0.28 },
  { id: 'macaque', name: 'Japanese macaque', plan: 'quad', size: 0.6, colors: ['#8a7a6a', '#a89888', '#d87a6a', '#6a5a4a', '#d86a5a'], habitats: ['onsen', 'snow', 'forest'], hours: [6, 18], sleeps: true, group: [3, 6], move: 'walk', speed: 1.2, flee: 7, curious: 0.6, voice: 'monkey', weight: 2, ears: 'round', tail: 0.08, neck: 0.1, legs: 0.3 },
  { id: 'serow', name: 'Serow', plan: 'quad', size: 1.2, colors: ['#5a524a', '#8a8278', '#4a443e', '#2a2624', '#d8d0c4'], habitats: ['snow', 'forest'], hours: [5, 19], group: [1, 1], move: 'walk', speed: 0.9, flee: 12, curious: 0.4, weight: 1, ears: 'point', tail: 0.06, neck: 0.3, legs: 0.6, antlers: false },
  { id: 'hare', name: 'Japanese hare', plan: 'quad', size: 0.45, colors: ['#9a7a5a', '#d8c8b0', '#9a7a5a', '#7a5a40', '#ffffff'], habitats: ['meadow', 'farm', 'snow'], hours: [17, 8], group: [1, 2], move: 'hop', speed: 2.2, flee: 11, curious: 0.15, weight: 2, ears: 'long', tail: 0.05, neck: 0.05, legs: 0.16 },
  { id: 'boar', name: 'Wild boar', plan: 'quad', size: 1.2, colors: ['#4a3a30', '#3a2e26', '#4a3a30', '#2a2420', '#d8c8b0'], habitats: ['forest'], hours: [16, 7], group: [1, 1], move: 'walk', speed: 1.0, flee: 18, curious: 0.05, weight: 1, ears: 'point', tail: 0.12, neck: 0.05, legs: 0.35 },
  { id: 'piglet', name: 'Striped piglet', plan: 'quad', size: 0.45, colors: ['#7a5a3a', '#c8a878', '#7a5a3a', '#3a2a20', '#d8b888'], habitats: ['forest'], hours: [16, 7], group: [3, 5], move: 'walk', speed: 1.1, flee: 18, curious: 0.1, weight: 1, ears: 'point', tail: 0.05, neck: 0.02, legs: 0.13, pattern: 'stripes' },
  { id: 'squirrel', name: 'Japanese squirrel', plan: 'quad', size: 0.35, colors: ['#8a5a3a', '#e8dcc8', '#8a5a3a', '#5a3a24', '#6a4a34'], habitats: ['forest'], hours: [6, 17], group: [1, 2], move: 'hop', speed: 2.0, flee: 8, curious: 0.3, weight: 2, ears: 'point', tail: 0.35, neck: 0.05, legs: 0.1 },
  { id: 'tortoise', name: 'Pond tortoise', plan: 'tortoise', size: 0.35, colors: ['#4a5a3a', '#8a7a4a', '#5a6a44', '#4a5a3a', '#c8b060'], habitats: ['shore', 'marsh'], hours: [8, 17], group: [1, 2], move: 'walk', speed: 0.12, flee: 0, curious: 0, weight: 1 },
  { id: 'frog', name: 'Tree frog', plan: 'frog', size: 0.1, colors: ['#6aa84a', '#d8e8b0', '#6aa84a', '#4a8a3a', '#2a2a2a'], habitats: ['shore', 'marsh', 'farm'], hours: [18, 7], group: [2, 5], move: 'hop', speed: 1.0, flee: 3, curious: 0, voice: 'frog', weight: 2 },
  { id: 'cat', name: 'Village cat', plan: 'quad', size: 0.5, colors: ['#e8a050', '#f8f0e0', '#e8a050', '#f8f0e0', '#c87a30'], habitats: ['village'], hours: [0, 24], group: [1, 2], move: 'walk', speed: 0.8, flee: 4, curious: 0.7, pettable: true, voice: 'meow', weight: 4, ears: 'point', tail: 0.32, neck: 0.08, legs: 0.17, pattern: 'stripes' },
  { id: 'calico', name: 'Calico cat', plan: 'quad', size: 0.5, colors: ['#f8f4ec', '#f8f4ec', '#f8f4ec', '#f8f4ec', '#d07a30'], habitats: ['village'], hours: [0, 24], group: [1, 1], move: 'walk', speed: 0.8, flee: 4, curious: 0.7, pettable: true, voice: 'meow', weight: 2, ears: 'point', tail: 0.3, neck: 0.08, legs: 0.17, pattern: 'patches' },
  { id: 'blackCat', name: 'Black cat', plan: 'quad', size: 0.5, colors: ['#2a2628', '#3a3436', '#2a2628', '#2a2628', '#e8c040'], habitats: ['village', 'temple'], hours: [0, 24], group: [1, 1], move: 'walk', speed: 0.8, flee: 5, curious: 0.6, pettable: true, voice: 'meow', weight: 1.5, ears: 'point', tail: 0.32, neck: 0.08, legs: 0.17 },
  { id: 'shiba', name: 'Shiba dog', plan: 'quad', size: 0.65, colors: ['#d0843a', '#f4ece0', '#d0843a', '#f4ece0', '#f4ece0'], habitats: ['village', 'farm'], hours: [6, 21], sleeps: true, group: [1, 1], move: 'walk', speed: 1.4, flee: 0, curious: 0.9, pettable: true, voice: 'bark', weight: 2, ears: 'point', tail: 0.18, neck: 0.12, legs: 0.24 },
  { id: 'akita', name: 'Akita dog', plan: 'quad', size: 0.9, colors: ['#f0e8dc', '#ffffff', '#f0e8dc', '#ffffff', '#e8d8c0'], habitats: ['village', 'snow'], hours: [6, 21], sleeps: true, group: [1, 1], move: 'walk', speed: 1.3, flee: 0, curious: 0.8, pettable: true, voice: 'bark', weight: 1, ears: 'point', tail: 0.22, neck: 0.15, legs: 0.36 },
  { id: 'horse', name: 'Farm horse', plan: 'quad', size: 2.1, colors: ['#6a4430', '#6a4430', '#6a4430', '#3a2a20', '#2a2020'], habitats: ['farm'], hours: [5, 20], sleeps: true, group: [1, 2], move: 'walk', speed: 0.9, flee: 0, curious: 0.5, pettable: true, voice: 'whinny', weight: 1.5, ears: 'point', tail: 0.5, neck: 0.8, legs: 1.0 },
  { id: 'cow', name: 'Cow', plan: 'quad', size: 2.0, colors: ['#2a2626', '#3a3434', '#2a2626', '#2a2626', '#f0ece4'], habitats: ['farm'], hours: [5, 20], sleeps: true, group: [1, 3], move: 'walk', speed: 0.6, flee: 0, curious: 0.3, pettable: true, voice: 'moo', weight: 1.5, ears: 'round', tail: 0.4, neck: 0.3, legs: 0.7 },
  { id: 'chicken', name: 'Chicken', plan: 'bird', size: 0.4, colors: ['#e8dcc8', '#e8dcc8', '#c83a2a', '#e8a040', '#c83a2a'], habitats: ['farm', 'village'], hours: [5, 19], group: [3, 6], move: 'walk', speed: 0.7, flee: 3, curious: 0.3, voice: 'cluck', weight: 2, wing: 0.25, beak: 0.04 },
  { id: 'goat', name: 'Temple goat', plan: 'quad', size: 0.9, colors: ['#f0ece4', '#ffffff', '#f0ece4', '#c8c0b0', '#8a8070'], habitats: ['temple'], hours: [5, 20], sleeps: true, group: [1, 1], move: 'walk', speed: 0.6, flee: 0, curious: 0.8, pettable: true, weight: 1, ears: 'long', tail: 0.08, neck: 0.25, legs: 0.42, antlers: true },
  // ---- birds ----
  { id: 'crane', name: 'Red-crowned crane', plan: 'bird', size: 1.3, colors: ['#f8f8f4', '#f8f8f4', '#1e1e20', '#2a2a2a', '#d02a2a'], habitats: ['marsh'], hours: [6, 18], sleeps: true, group: [2, 4], move: 'walk', speed: 0.5, flee: 18, curious: 0.1, voice: 'crane', weight: 2, wing: 1.1, beak: 0.16 },
  { id: 'heron', name: 'Grey heron', plan: 'bird', size: 1.0, colors: ['#8a929a', '#d8dce0', '#e8eaec', '#c8a040', '#1e1e20'], habitats: ['shore', 'marsh', 'farm'], hours: [5, 19], group: [1, 1], move: 'still', speed: 0.3, flee: 16, curious: 0, weight: 2, wing: 0.9, beak: 0.14 },
  { id: 'egret', name: 'Little egret', plan: 'bird', size: 0.7, colors: ['#fafaf8', '#fafaf8', '#fafaf8', '#1e1e20', '#e8c040'], habitats: ['farm', 'shore', 'marsh'], hours: [5, 19], group: [1, 3], move: 'walk', speed: 0.4, flee: 12, curious: 0, weight: 2, wing: 0.7, beak: 0.1 },
  { id: 'duck', name: 'Mallard', plan: 'bird', size: 0.5, colors: ['#8a7a64', '#c8b89c', '#2a6a4a', '#e8a040', '#3a4a8a'], habitats: ['water'], hours: [0, 24], group: [2, 5], move: 'swim', speed: 0.5, flee: 8, curious: 0.4, voice: 'quack', weight: 3, wing: 0.4, beak: 0.05 },
  { id: 'mandarin', name: 'Mandarin duck', plan: 'bird', size: 0.42, colors: ['#c87a3a', '#f0e8dc', '#3a6a5a', '#d84a2a', '#f0e8dc'], habitats: ['water'], hours: [0, 24], group: [2, 4], move: 'swim', speed: 0.5, flee: 8, curious: 0.3, voice: 'quack', weight: 1.5, wing: 0.35, beak: 0.04 },
  { id: 'gull', name: 'Black-tailed gull', plan: 'bird', size: 0.5, colors: ['#f4f4f2', '#f4f4f2', '#f4f4f2', '#e8c040', '#5a6068'], habitats: ['coast'], hours: [5, 20], group: [3, 6], move: 'circle', speed: 6, flee: 0, curious: 0, voice: 'gull', weight: 3, wing: 0.7, beak: 0.05 },
  { id: 'kite', name: 'Black kite', plan: 'bird', size: 0.6, colors: ['#5a4a3a', '#7a6a58', '#6a5a48', '#e8c040', '#3a2e24'], habitats: ['sky', 'farm', 'coast', 'meadow'], hours: [7, 17], group: [1, 2], move: 'circle', speed: 7, flee: 0, curious: 0, voice: 'kite', weight: 2, wing: 0.9, beak: 0.04 },
  { id: 'crow', name: 'Jungle crow', plan: 'bird', size: 0.5, colors: ['#1a1a20', '#22222a', '#1a1a20', '#1a1a20', '#3a3a5a'], habitats: ['village', 'farm', 'forest', 'temple'], hours: [5, 19], group: [1, 3], move: 'hop', speed: 1.0, flee: 9, curious: 0.25, voice: 'crow', weight: 3, wing: 0.5, beak: 0.06 },
  { id: 'sparrow', name: 'Tree sparrow', plan: 'bird', size: 0.14, colors: ['#8a6a4a', '#d8ccb8', '#7a4a30', '#3a2e26', '#1e1a18'], habitats: ['village', 'farm'], hours: [5, 18], group: [3, 8], move: 'hop', speed: 1.2, flee: 5, curious: 0.1, weight: 3, wing: 0.12, beak: 0.015 },
  { id: 'swallow', name: 'Barn swallow', plan: 'bird', size: 0.17, colors: ['#1e2a4a', '#f0e8dc', '#c84a2a', '#1e1e20', '#1e2a4a'], habitats: ['village', 'farm', 'water'], hours: [6, 19], group: [2, 5], move: 'fly', speed: 9, flee: 0, curious: 0, weight: 2, wing: 0.18, beak: 0.01 },
  { id: 'pigeon', name: 'Shrine pigeon', plan: 'bird', size: 0.32, colors: ['#8a8c98', '#a8aab4', '#5a7a6a', '#c86a5a', '#4a4c58'], habitats: ['temple', 'village'], hours: [6, 18], group: [4, 9], move: 'hop', speed: 0.8, flee: 5, curious: 0.4, voice: 'coo', weight: 2, wing: 0.3, beak: 0.02 },
  { id: 'pheasant', name: 'Green pheasant', plan: 'bird', size: 0.8, colors: ['#2a5a4a', '#3a6a4a', '#c82a2a', '#c8a878', '#8a6a3a'], habitats: ['meadow', 'farm'], hours: [6, 17], group: [1, 1], move: 'walk', speed: 0.9, flee: 12, curious: 0, weight: 1.5, wing: 0.35, beak: 0.03 },
  { id: 'ptarmigan', name: 'Rock ptarmigan', plan: 'bird', size: 0.35, colors: ['#e8e4dc', '#ffffff', '#8a7a6a', '#2a2a2a', '#c82a2a'], habitats: ['snow'], hours: [6, 18], group: [1, 3], move: 'walk', speed: 0.6, flee: 5, curious: 0.3, weight: 2, wing: 0.3, beak: 0.02 },
  { id: 'owl', name: 'Ural owl', plan: 'bird', size: 0.55, colors: ['#a89888', '#d8ccc0', '#c8b8a8', '#3a2a20', '#1e1a18'], habitats: ['forest', 'temple'], hours: [19, 5], group: [1, 1], move: 'perch', speed: 0, flee: 0, curious: 0, voice: 'owl', weight: 1.5, wing: 0.5, beak: 0.02 },
  // ---- water life ----
  { id: 'koi', name: 'Koi', plan: 'fish', size: 0.55, colors: ['#f4f0e8', '#f4f0e8', '#e8582a', '#f4f0e8', '#1e1e20'], habitats: ['water'], hours: [0, 24], group: [3, 6], move: 'swim', speed: 0.4, flee: 3, curious: 0.3, weight: 2, pattern: 'patches' },
  { id: 'crab', name: 'Shore crab', plan: 'crab', size: 0.18, colors: ['#b8503a', '#d87a5a', '#b8503a', '#a8402a', '#1e1e20'], habitats: ['coast'], hours: [0, 24], group: [2, 5], move: 'walk', speed: 0.6, flee: 3, curious: 0, weight: 2 },
  // ---- insects ----
  { id: 'dragonfly', name: 'Red dragonfly', plan: 'insect', size: 0.08, colors: ['#d83a2a', '#d83a2a', '#c83020', '#e8e4dc', '#d83a2a'], habitats: ['farm', 'water', 'meadow', 'marsh'], hours: [8, 18], group: [3, 7], move: 'flutter', speed: 2.5, flee: 0, curious: 0, weight: 3, wing: 0.1 },
  { id: 'swallowtail', name: 'Swallowtail', plan: 'insect', size: 0.06, colors: ['#e8d040', '#e8d040', '#1e1e20', '#1e1e20', '#2a4a8a'], habitats: ['flowers', 'meadow'], hours: [8, 17], group: [1, 3], move: 'flutter', speed: 1.2, flee: 0, curious: 0, weight: 2, wing: 0.1 },
  { id: 'smallWhite', name: 'Small white', plan: 'insect', size: 0.04, colors: ['#f8f8f0', '#f8f8f0', '#3a3a3a', '#3a3a3a', '#f8f8f0'], habitats: ['flowers', 'meadow', 'farm'], hours: [8, 17], group: [2, 4], move: 'flutter', speed: 1.0, flee: 0, curious: 0, weight: 3, wing: 0.06 },
  { id: 'bee', name: 'Honeybee', plan: 'insect', size: 0.02, colors: ['#e8b030', '#1e1e20', '#1e1e20', '#1e1e20', '#e8e8e0'], habitats: ['flowers'], hours: [9, 16], group: [3, 6], move: 'flutter', speed: 1.4, flee: 0, curious: 0, weight: 2, wing: 0.02 },
];
