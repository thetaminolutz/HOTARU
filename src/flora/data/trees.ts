/** Tree species for the M1 test scene. More species arrive in M5 (SPEC §14). */
export type TreeShape = 'dome' | 'cone' | 'pads' | 'bush';

export type TreeSpecies = {
  id: string;
  name: string;
  shape: TreeShape;
  /** Reference height (m) and crown radius (m) before per-instance scale. */
  height: number;
  radius: number;
  trunkHeight: number;
  trunkRadius: number;
  clusters: number;
  clusterSize: [number, number];
  /** Per-instance crown colours (sRGB hex), picked at random. */
  colors: string[];
  trunkColor: string;
  sway: number;
};

export const TREE_SPECIES: TreeSpecies[] = [
  {
    id: 'maple', name: 'Japanese maple (momiji)', shape: 'dome', height: 7, radius: 3.6, trunkHeight: 3.2, trunkRadius: 0.22,
    clusters: 22, clusterSize: [1.6, 2.4], colors: ['#c2452f', '#d4582a', '#b03a2a', '#e07a30', '#c94a3a'], trunkColor: '#3a2a26', sway: 0.12,
  },
  {
    id: 'larch', name: 'Golden larch', shape: 'cone', height: 12, radius: 2.4, trunkHeight: 1.6, trunkRadius: 0.2,
    clusters: 16, clusterSize: [1.5, 2.4], colors: ['#e8b84a', '#d9a03a', '#f0c860', '#d08a32'], trunkColor: '#3a2c24', sway: 0.08,
  },
  {
    id: 'fir', name: 'Fir', shape: 'cone', height: 13, radius: 2.6, trunkHeight: 1.4, trunkRadius: 0.24,
    clusters: 16, clusterSize: [1.6, 2.6], colors: ['#2f5a4a', '#2a4e40', '#355e48', '#264638'], trunkColor: '#2a2024', sway: 0.06,
  },
  {
    id: 'pine', name: 'Black pine (kuromatsu)', shape: 'pads', height: 9, radius: 3.4, trunkHeight: 4.5, trunkRadius: 0.26,
    clusters: 14, clusterSize: [1.8, 2.6], colors: ['#2a4a3a', '#30503c', '#264232'], trunkColor: '#3a2a2a', sway: 0.07,
  },
  {
    id: 'shrub', name: 'Autumn shrub', shape: 'bush', height: 1.6, radius: 1.3, trunkHeight: 0.2, trunkRadius: 0.06,
    clusters: 6, clusterSize: [1.0, 1.4], colors: ['#b8402a', '#d06a2a', '#9a3a2a', '#c8902e'], trunkColor: '#2a2020', sway: 0.15,
  },
];
