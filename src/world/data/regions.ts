/**
 * Authored region map (SPEC §6, §6.15). Lantern Lake at the centre (0,0); north is −z,
 * east is +x (the sea). Each region shapes the terrain and the biome (forest, moisture,
 * autumn colour, special features). Weights blend between regions over ~100–300 m.
 */
export type RegionDef = {
  id: string;
  name: string;
  /** English subtitle */
  sub: string;
  x: number;
  z: number;
  /** influence radius (m) */
  r: number;
  /** terrain shape */
  base: number;
  hill: number;
  ridge: number;
  /** biome */
  forest: number;
  moisture: number;
  autumn: number;
  /** 0 none, 1 rice terraces, 2 sand/coast, 3 snow, 4 volcanic, 5 bamboo, 6 tea rows, 7 marsh */
  special: number;
  /** grass tint (sRGB) */
  grass: string;
};

export const REGIONS: RegionDef[] = [
  { id: 'lake', name: 'Tomoshibi-ko', sub: 'Lantern Lake', x: 0, z: 0, r: 900, base: 4, hill: 18, ridge: 0, forest: 0.45, moisture: 0.6, autumn: 0.75, special: 0, grass: '#7a8a3e' },
  { id: 'castle', name: 'Kagejō', sub: 'The Old Castle', x: -150, z: -1250, r: 650, base: 160, hill: 60, ridge: 420, forest: 0.6, moisture: 0.55, autumn: 0.7, special: 0, grass: '#6e7c3c' },
  { id: 'maple', name: 'Momijiyama', sub: 'Autumn Maple Mountains', x: -2600, z: -2300, r: 1400, base: 140, hill: 120, ridge: 420, forest: 0.85, moisture: 0.6, autumn: 1, special: 0, grass: '#7a7a36' },
  { id: 'snow', name: 'Yukemuri', sub: 'Snowy High Pass', x: -400, z: -4100, r: 1300, base: 520, hill: 140, ridge: 700, forest: 0.45, moisture: 0.5, autumn: 0.2, special: 3, grass: '#5e6e4a' },
  { id: 'volcano', name: 'Hinoyama', sub: 'The Quiet Volcano', x: 1900, z: -4200, r: 1200, base: 120, hill: 40, ridge: 80, forest: 0.15, moisture: 0.2, autumn: 0.1, special: 4, grass: '#5a5a3a' },
  { id: 'cedar', name: 'Kirisugi', sub: 'Misty Cedar Forest', x: -3500, z: -200, r: 1300, base: 90, hill: 90, ridge: 160, forest: 1, moisture: 0.95, autumn: 0.05, special: 0, grass: '#3e6a3a' },
  { id: 'bamboo', name: 'Sasayabu', sub: 'Bamboo Forest', x: -2700, z: 1700, r: 1000, base: 40, hill: 50, ridge: 40, forest: 0.95, moisture: 0.9, autumn: 0.05, special: 5, grass: '#5a8a3a' },
  { id: 'rice', name: 'Inaho', sub: 'Rice-Terrace Valley', x: -200, z: 3100, r: 1300, base: 30, hill: 90, ridge: 60, forest: 0.25, moisture: 0.8, autumn: 0.5, special: 1, grass: '#8a8a3a' },
  { id: 'tea', name: 'Chabatake', sub: 'Tea Slopes', x: 1500, z: 3900, r: 1000, base: 60, hill: 70, ridge: 40, forest: 0.2, moisture: 0.85, autumn: 0.1, special: 6, grass: '#4e8a3e' },
  { id: 'cherry', name: 'Sakuraoka', sub: 'Cherry-Blossom Hills', x: 2300, z: -400, r: 1100, base: 30, hill: 70, ridge: 30, forest: 0.4, moisture: 0.75, autumn: 0.6, special: 0, grass: '#6a8e42' },
  { id: 'market', name: 'Ichiba', sub: 'Market Town', x: 1500, z: 1500, r: 700, base: 10, hill: 10, ridge: 0, forest: 0.15, moisture: 0.6, autumn: 0.4, special: 0, grass: '#7a863e' },
  { id: 'coast', name: 'Shiomachi', sub: 'Coastal Cliffs & Harbour', x: 4200, z: -800, r: 1500, base: 25, hill: 35, ridge: 50, forest: 0.3, moisture: 0.6, autumn: 0.2, special: 2, grass: '#6a8040' },
  { id: 'marsh', name: 'Ashihara', sub: 'Reed Marsh', x: 3700, z: 1700, r: 900, base: 1.5, hill: 2, ridge: 0, forest: 0.05, moisture: 1, autumn: 0.3, special: 7, grass: '#7a8a3a' },
  { id: 'temple', name: 'Kumoji', sub: 'Mountain Temple', x: 2800, z: -2700, r: 900, base: 260, hill: 120, ridge: 380, forest: 0.8, moisture: 0.75, autumn: 0.55, special: 0, grass: '#5e7a3e' },
  { id: 'ginkgo', name: 'Ichōdai', sub: 'Ginkgo Plateau', x: -1500, z: -3000, r: 900, base: 300, hill: 30, ridge: 40, forest: 0.35, moisture: 0.45, autumn: 0.9, special: 0, grass: '#8a8a40' },
  { id: 'mirror', name: 'Kagami-ike', sub: 'Mirror Lakes', x: -3800, z: -3700, r: 900, base: 300, hill: 90, ridge: 200, forest: 0.6, moisture: 0.8, autumn: 0.7, special: 0, grass: '#5e7e44' },
  { id: 'hydrangea', name: 'Ajisaiyama', sub: 'Hydrangea Hills', x: -1300, z: 2300, r: 800, base: 50, hill: 80, ridge: 50, forest: 0.45, moisture: 0.95, autumn: 0.2, special: 0, grass: '#4e8a46' },
  { id: 'sunflower', name: 'Hanano', sub: 'Sunflower & Cosmos Fields', x: 2900, z: 3000, r: 800, base: 15, hill: 18, ridge: 0, forest: 0.08, moisture: 0.55, autumn: 0.3, special: 0, grass: '#8a9a3e' },
  { id: 'pampas', name: 'Susukihara', sub: 'The Pampas Moor', x: 600, z: -2600, r: 900, base: 140, hill: 40, ridge: 30, forest: 0.08, moisture: 0.3, autumn: 0.8, special: 0, grass: '#a09a5a' },
  { id: 'wisteria', name: 'Fujikawa', sub: 'Wisteria Gorge', x: -1700, z: -1300, r: 700, base: 120, hill: 90, ridge: 300, forest: 0.7, moisture: 0.85, autumn: 0.35, special: 0, grass: '#5a7e40' },
];

/** Playable half-size (WORLD_SIZE / 2) and the full generated extent including border ranges. */
export const HALF = 5000;
export const EXTENT = 8192;
