/** Tree species (SPEC §14). Seasons arrive in M6. */
export type TreeShape = 'dome' | 'cone' | 'pads' | 'bush' | 'weep';

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
    clusters: 22, clusterSize: [1.8, 2.8], colors: ['#e8b84a', '#d9a03a', '#f0c860', '#d08a32'], trunkColor: '#3a2c24', sway: 0.08,
  },
  {
    id: 'fir', name: 'Fir', shape: 'cone', height: 13, radius: 2.6, trunkHeight: 1.4, trunkRadius: 0.24,
    clusters: 24, clusterSize: [2.0, 3.0], colors: ['#2f5a4a', '#2a4e40', '#355e48', '#264638'], trunkColor: '#2a2024', sway: 0.06,
  },
  {
    id: 'pine', name: 'Black pine (kuromatsu)', shape: 'pads', height: 9, radius: 3.4, trunkHeight: 4.5, trunkRadius: 0.26,
    clusters: 14, clusterSize: [1.8, 2.6], colors: ['#2a4a3a', '#30503c', '#264232'], trunkColor: '#3a2a2a', sway: 0.07,
  },
  {
    id: 'shrub', name: 'Autumn shrub', shape: 'bush', height: 1.6, radius: 1.3, trunkHeight: 0.2, trunkRadius: 0.06,
    clusters: 6, clusterSize: [1.0, 1.4], colors: ['#b8402a', '#d06a2a', '#9a3a2a', '#c8902e'], trunkColor: '#2a2020', sway: 0.15,
  },
  {
    id: 'cedar', name: 'Japanese cedar (sugi)', shape: 'cone', height: 26, radius: 3.4, trunkHeight: 5, trunkRadius: 0.55,
    clusters: 36, clusterSize: [3.0, 4.4], colors: ['#34584a', '#2e5244', '#3a6050', '#2a4a3e'], trunkColor: '#5a3a2e', sway: 0.03,
  },
  {
    id: 'cherry', name: 'Cherry (sakura), autumn leaves', shape: 'dome', height: 7.5, radius: 4.2, trunkHeight: 2.6, trunkRadius: 0.24,
    clusters: 22, clusterSize: [1.7, 2.6], colors: ['#d06a3a', '#c8503a', '#e08a4a', '#b84a40'], trunkColor: '#3a2626', sway: 0.12,
  },
  {
    id: 'ginkgo', name: 'Ginkgo (ichō)', shape: 'dome', height: 14, radius: 4.6, trunkHeight: 4, trunkRadius: 0.4,
    clusters: 24, clusterSize: [2.0, 3.0], colors: ['#e8c040', '#f0cc50', '#dcb038'], trunkColor: '#4a3a30', sway: 0.07,
  },
  {
    id: 'bamboo', name: 'Bamboo (take)', shape: 'cone', height: 15, radius: 1.3, trunkHeight: 6, trunkRadius: 0.09,
    clusters: 12, clusterSize: [1.4, 2.2], colors: ['#7aa84a', '#8ab456', '#6a9a42'], trunkColor: '#7a9a4a', sway: 0.16,
  },
  {
    id: 'birch', name: 'Birch', shape: 'dome', height: 11, radius: 2.4, trunkHeight: 4.5, trunkRadius: 0.16,
    clusters: 14, clusterSize: [1.4, 2.0], colors: ['#d8b048', '#c8a040', '#b89a3e'], trunkColor: '#d8d4c8', sway: 0.1,
  },
  {
    id: 'willow', name: 'Weeping willow (yanagi)', shape: 'weep', height: 9, radius: 4, trunkHeight: 3, trunkRadius: 0.3,
    clusters: 26, clusterSize: [1.4, 2.0], colors: ['#9ab45a', '#a8bc60', '#8aa850'], trunkColor: '#3a3028', sway: 0.2,
  },
  {
    id: 'persimmon', name: 'Persimmon (kaki) with fruit', shape: 'dome', height: 7, radius: 3.2, trunkHeight: 2.4, trunkRadius: 0.2,
    clusters: 18, clusterSize: [1.5, 2.2], colors: ['#e0782a', '#c86a2e', '#d89040', '#b85a2a'], trunkColor: '#2e2422', sway: 0.1,
  },
  {
    id: 'camphor', name: 'Camphor (kusunoki)', shape: 'dome', height: 16, radius: 7, trunkHeight: 4, trunkRadius: 0.6,
    clusters: 34, clusterSize: [2.6, 3.8], colors: ['#4a7a3e', '#56864a', '#426e38', '#5e8c48'], trunkColor: '#3e3028', sway: 0.05,
  },
  {
    id: 'hinoki', name: 'Hinoki cypress', shape: 'cone', height: 20, radius: 3, trunkHeight: 4, trunkRadius: 0.4,
    clusters: 30, clusterSize: [2.6, 3.8], colors: ['#2a4e3c', '#264834', '#30563e'], trunkColor: '#6a4030', sway: 0.03,
  },
  {
    id: 'plum', name: 'Plum (ume)', shape: 'pads', height: 5, radius: 2.8, trunkHeight: 2.4, trunkRadius: 0.18,
    clusters: 12, clusterSize: [1.2, 1.8], colors: ['#c8904a', '#b87a44', '#d6a058'], trunkColor: '#2a2022', sway: 0.1,
  },
  {
    id: 'zelkova', name: 'Zelkova (keyaki)', shape: 'dome', height: 15, radius: 5.5, trunkHeight: 4.5, trunkRadius: 0.45,
    clusters: 28, clusterSize: [2.2, 3.2], colors: ['#c8783a', '#b8602e', '#d89048', '#a85a30'], trunkColor: '#5a4a40', sway: 0.07,
  },
  {
    id: 'azalea', name: 'Azalea (tsutsuji)', shape: 'bush', height: 1.2, radius: 1.2, trunkHeight: 0.15, trunkRadius: 0.05,
    clusters: 6, clusterSize: [0.9, 1.3], colors: ['#a8382e', '#c04a36', '#8e3428'], trunkColor: '#2a2020', sway: 0.1,
  },
  {
    id: 'hydrangea', name: 'Hydrangea (ajisai)', shape: 'bush', height: 1.4, radius: 1.3, trunkHeight: 0.15, trunkRadius: 0.05,
    clusters: 7, clusterSize: [0.9, 1.3], colors: ['#6a7ab8', '#8a78b8', '#5a8ab0', '#4a6a48'], trunkColor: '#2a2420', sway: 0.1,
  },
  {
    id: 'camellia', name: 'Camellia (tsubaki)', shape: 'bush', height: 2.6, radius: 1.4, trunkHeight: 0.3, trunkRadius: 0.08,
    clusters: 8, clusterSize: [1.0, 1.5], colors: ['#2e5a3a', '#34603e', '#284e34'], trunkColor: '#2a2020', sway: 0.06,
  },
];

