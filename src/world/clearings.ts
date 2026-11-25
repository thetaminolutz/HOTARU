/**
 * Places kept free of trees and ground plants: house footprints, plazas (rectangles) and
 * roads (segments with a half-width). Built on the main thread when villages and roads are
 * laid out; each worker request carries only the shapes touching its tile.
 */
export type Rect = [number, number, number, number];
/** ax, az, bx, bz, half-width */
export type Seg = [number, number, number, number, number];
export type Clear = { rects: Rect[]; segs: Seg[] };

export class Clearings {
  rects: Rect[] = [];
  segs: Seg[] = [];

  /** Shapes touching the square tile [x0, x0+size]² grown by `pad`. */
  forTile(x0: number, z0: number, size: number, pad = 0): Clear {
    const x1 = x0 + size + pad, z1 = z0 + size + pad;
    const ax = x0 - pad, az = z0 - pad;
    return {
      rects: this.rects.filter(([a, b, c, d]) => c > ax && a < x1 && d > az && b < z1),
      segs: this.segs.filter(([a, b, c, d, w]) => Math.max(a, c) + w > ax && Math.min(a, c) - w < x1 && Math.max(b, d) + w > az && Math.min(b, d) - w < z1),
    };
  }
}

/** True if (x, z) is inside a clearing (grown by `margin`). */
export function inClearing(c: Clear | undefined, x: number, z: number, margin = 0): boolean {
  if (!c) return false;
  for (const [a, b, cc, d] of c.rects) if (x > a - margin && x < cc + margin && z > b - margin && z < d + margin) return true;
  for (const [ax, az, bx, bz, w] of c.segs) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const px = ax + dx * t - x, pz = az + dz * t - z;
    if (px * px + pz * pz < (w + margin) * (w + margin)) return true;
  }
  return false;
}
