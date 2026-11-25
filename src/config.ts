/** Global configuration constants. */

/** The curated default seed for "New Journey" (see DECISIONS.md). */
export const DEFAULT_SEED = 0x484f5441; // "HOTA"

/**
 * Playable world size in metres (SPEC §5). Single constant so it can shrink if the iPad
 * can't hold 60 fps on Medium (agreed trade-off: look beats size). Used from M2 on.
 */
export const WORLD_SIZE = 10_000;

export type QualityName = 'low' | 'medium' | 'high';

export type Quality = {
  name: QualityName;
  /** Target internal render height in pixels (the actual height is chosen for an integer scale). */
  internalHeight: number;
  shadowMapSize: number;
  /** Reflection resolution relative to internal resolution. */
  reflectionScale: number;
  grassDensity: number;
  particles: number;
  maxPointLights: number;
  drawDistance: number;
};

export const QUALITY: Record<QualityName, Quality> = {
  low: { name: 'low', internalHeight: 270, shadowMapSize: 1024, reflectionScale: 0.5, grassDensity: 0.35, particles: 0.4, maxPointLights: 8, drawDistance: 600 },
  medium: { name: 'medium', internalHeight: 360, shadowMapSize: 1536, reflectionScale: 0.5, grassDensity: 0.7, particles: 0.75, maxPointLights: 16, drawDistance: 1200 },
  high: { name: 'high', internalHeight: 450, shadowMapSize: 2048, reflectionScale: 1, grassDensity: 1, particles: 1, maxPointLights: 32, drawDistance: 2000 },
};
