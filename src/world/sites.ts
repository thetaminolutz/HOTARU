/**
 * Landmark sites sculpted into the land (SPEC §5 "landmarks first", §6.10, §20): the castle
 * plateau on Kagejō's mountain and three grottos — the cave behind the Great Waterfall, the ice
 * cave on the high pass, the sea cave under the coastal cliffs. A grotto is a pit carved into
 * the heightfield with a ramp down to its mouth; the rock dome over it is a mesh.
 */
import type { Hydro } from './hydrology';

export type Grotto = { id: 'waterfall' | 'ice' | 'sea'; x: number; z: number; r: number; floor: number; dir: number; ramp: number };
export type Sites = { castle: { x: number; z: number; r: number; level: number }; grottos: Grotto[]; carve: (x: number, z: number, h: number) => number };

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function computeSites(H: (x: number, z: number) => number, hydro: Hydro): Sites {
  // castle: a plateau on the mountain's shoulder above the lake
  const cx = -110, cz = -1320, cr = 70;
  let lv = 0; for (const [a, b] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) lv += H(cx + a! * cr, cz + b! * cr);
  const castle = { x: cx, z: cz, r: cr, level: lv / 5 };

  const grottos: Grotto[] = [];
  // behind the Great Waterfall: beside the plunge pool, opening towards the water
  const f = [...hydro.falls].sort((a, b) => (b.top - b.bottom) * (b.river === 'upper' ? 3 : 1) - (a.top - a.bottom) * (a.river === 'upper' ? 3 : 1))[0];
  if (f) {
    const px = -f.dz, pz = f.dx; // across the river
    const x = f.x + f.dx * 2 + px * (f.width / 2 + 11), z = f.z + f.dz * 2 + pz * (f.width / 2 + 11);
    grottos.push({ id: 'waterfall', x, z, r: 8, floor: f.bottom + 0.6, dir: Math.atan2(-px, -pz), ramp: 34 });
  }
  grottos.push({ id: 'ice', x: -260, z: -3930, r: 9, floor: H(-260, -3930) - 5, dir: Math.PI * 0.5, ramp: 34 });
  // the sea cave at the foot of the cliffs, opening east to the sea
  let sx = 4000; while (sx < 5200 && H(sx, -1500) > 1.5) sx += 4;
  grottos.push({ id: 'sea', x: sx - 22, z: -1500, r: 9, floor: 0.9, dir: Math.PI * 0.5, ramp: 34 });

  // ramps long enough to walk (a slope of at most ~1:2.4 out to where the land is)
  for (const g of grottos) {
    let need = 30;
    for (let d = 10; d < 160; d += 10) { const hh = H(g.x + Math.sin(g.dir) * (g.r + d), g.z + Math.cos(g.dir) * (g.r + d)); need = Math.max(need, (hh - g.floor) * 2.4); if ((hh - g.floor) * 2.4 < d) break; }
    g.ramp = Math.min(160, need);
  }

  const carve = (x: number, z: number, h: number): number => {
    // castle plateau keeps a tenth of the relief
    const dc = Math.hypot(x - castle.x, z - castle.z);
    if (dc < castle.r * 1.6) h = h + (castle.level + (h - castle.level) * 0.1 - h) * smooth(castle.r * 1.6, castle.r * 0.9, dc);
    for (const g of grottos) {
      const dx = x - g.x, dz = z - g.z, d = Math.hypot(dx, dz);
      if (d > g.r + g.ramp + 6) continue;
      // the chamber floor
      if (d < g.r) h = Math.min(h, g.floor + 0.25 * (d / g.r));
      // the ramp out through the mouth
      const ax = Math.sin(g.dir), az = Math.cos(g.dir);
      const along = dx * ax + dz * az, across = Math.abs(-dx * az + dz * ax);
      if (along > 0 && along < g.r + g.ramp + 2 && across < 2.6) {
        // a cut at a fixed, walkable grade (never above the land)
        h = Math.min(h, g.floor + Math.max(0, along - g.r + 1) / 2.4 + 0.05);
      }
    }
    return h;
  };
  return { castle, grottos, carve };
}
