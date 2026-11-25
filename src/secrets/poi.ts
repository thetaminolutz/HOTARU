/**
 * Points of interest registry (SPEC §6.15: something interesting every 60–120 s of walking).
 * Systems register POIs as they place things; the debug world map shows a density heatmap so
 * empty stretches can be filled. M2 registers landmarks and region hearts; later milestones
 * add buildings, shrines, viewpoints, secrets, animal scenes.
 */
export type Poi = { x: number; z: number; kind: string; name: string };

export const POIS: Poi[] = [];

export function registerPoi(p: Poi): void { POIS.push(p); }

/** Walking ~1.3 m/s for 90 s ≈ 120 m: a spot is "covered" if a POI lies within this radius. */
export const POI_RADIUS = 120;

/** Fraction of sampled land points that have a POI within POI_RADIUS. */
export function poiCoverage(isLand: (x: number, z: number) => boolean, half = 5000, step = 100): number {
  let land = 0, covered = 0;
  for (let z = -half; z < half; z += step) for (let x = -half; x < half; x += step) {
    if (!isLand(x, z)) continue;
    land++;
    if (POIS.some((p) => Math.hypot(p.x - x, p.z - z) < POI_RADIUS)) covered++;
  }
  return land ? covered / land : 0;
}
