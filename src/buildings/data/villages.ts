/** Village sites (SPEC §6, §7.3): where they are and what they're made of. */
import type { HouseType, Profession, RoofType } from '../house';

export type VillageDef = {
  id: string;
  name: string;
  x: number; z: number;
  /** radius of the village (m) */
  r: number;
  /** number of houses to try for */
  n: number;
  /** building types with weights */
  types: [HouseType, number][];
  roofs: [RoofType, number][];
  walls: 'plank' | 'plaster' | 'mixed';
  professions: Profession[];
  /** a side street across the main road */
  cross: boolean;
  /** a small shrine with a torii at the edge */
  shrine: boolean;
};

export const VILLAGES: VillageDef[] = [
  { id: 'ichiba', name: 'Ichiba', x: 1500, z: 1500, r: 170, n: 34, types: [['machiya', 5], ['shop', 4], ['workshop', 3], ['inn', 1], ['teahouse', 1], ['kura', 1]], roofs: [['tile', 6], ['shingle', 2]], walls: 'mixed', professions: ['merchant', 'potter', 'lanternMaker', 'weaver', 'carpenter', 'innkeeper', 'tea'], cross: true, shrine: true },
  { id: 'inaho', name: 'Inaho', x: -200, z: 3050, r: 170, n: 14, types: [['minka', 8], ['kura', 1], ['workshop', 1]], roofs: [['thatch', 8], ['shingle', 1]], walls: 'plank', professions: ['farmer', 'farmer', 'weaver', 'carpenter'], cross: false, shrine: true },
  { id: 'chabatake', name: 'Chabatake', x: 1450, z: 3850, r: 120, n: 8, types: [['minka', 5], ['teahouse', 2]], roofs: [['thatch', 3], ['shingle', 2]], walls: 'plank', professions: ['tea', 'farmer'], cross: false, shrine: false },
  { id: 'shiomachi', name: 'Shiomachi', x: 4150, z: -800, r: 150, n: 14, types: [['fisher', 6], ['machiya', 2], ['shop', 1], ['kura', 1], ['inn', 1]], roofs: [['shingle', 4], ['tile', 2]], walls: 'mixed', professions: ['fisher', 'merchant', 'carpenter'], cross: false, shrine: true },
  { id: 'sakuraoka', name: 'Sakuraoka', x: 2250, z: -420, r: 120, n: 9, types: [['minka', 4], ['teahouse', 2], ['machiya', 2]], roofs: [['tile', 3], ['thatch', 2]], walls: 'mixed', professions: ['tea', 'farmer', 'potter'], cross: false, shrine: true },
  { id: 'yukemuri', name: 'Yukemuri', x: -380, z: -4050, r: 120, n: 9, types: [['inn', 3], ['onsen', 2], ['minka', 3]], roofs: [['shingle', 3], ['tile', 2]], walls: 'plank', professions: ['innkeeper', 'carpenter'], cross: false, shrine: true },
  { id: 'kumoji', name: 'Kumoji', x: 2800, z: -2700, r: 90, n: 5, types: [['shrine', 2], ['minka', 2], ['kura', 1]], roofs: [['copper', 3], ['shingle', 1]], walls: 'plaster', professions: ['none'], cross: false, shrine: true },
];

/** Roads between villages (and the Tomoshibi dock) — laid with A* over slope cost. */
export const ROAD_LINKS: [string, string][] = [
  ['dock', 'inaho'], ['dock', 'ichiba'], ['ichiba', 'chabatake'], ['inaho', 'chabatake'],
  ['ichiba', 'sakuraoka'], ['sakuraoka', 'shiomachi'], ['sakuraoka', 'kumoji'], ['dock', 'castle'],
];
