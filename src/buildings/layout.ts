/**
 * Organic village layout (SPEC §7.3): a gently winding main road (and sometimes a cross
 * street) through the village centre; houses line it on lots that fit the slope, facing the
 * road (in 90° steps), on stone plinths. A plaza with a well in the middle, lantern posts
 * along the road, a shrine with a torii at one end. Pure and deterministic.
 */
import { createRng, hashString } from '../core/rng';
import type { HouseSpec, HouseType, RoofType } from './house';
import type { VillageDef } from './data/villages';

export type Lantern = { x: number; z: number; y: number };
export type VillageLayout = {
  def: VillageDef;
  houses: HouseSpec[];
  /** village streets as polylines (x, z) */
  streets: [number, number][][];
  lanterns: Lantern[];
  well: { x: number; z: number; y: number };
  torii: { x: number; z: number; y: number; rot: number } | null;
};

function pickW<T>(list: [T, number][], u: number): T {
  const tot = list.reduce((a, [, w]) => a + w, 0);
  let acc = 0;
  for (const [v, w] of list) { acc += w / tot; if (u <= acc) return v; }
  return list[list.length - 1]![0];
}

export function layoutVillage(def: VillageDef, height: (x: number, z: number) => number, seed: number, riverDist: (x: number, z: number) => number = () => Infinity): VillageLayout {
  /** keep houses, lanterns and the well off the stream's banks */
  const wet = (x0: number, z0: number, x1: number, z1: number, pad: number) => {
    for (let x = x0 - pad; x <= x1 + pad + 0.01; x += Math.max(1, (x1 - x0 + 2 * pad) / 4)) for (let z = z0 - pad; z <= z1 + pad + 0.01; z += Math.max(1, (z1 - z0 + 2 * pad) / 4)) if (riverDist(x, z) < 0) return true;
    return false;
  };
  const r = createRng(hashString(def.id) ^ seed);
  // main road direction: follow the contour (least slope) through the centre
  let best = 0, bestCost = Infinity;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI;
    const c = Math.abs(height(def.x + Math.cos(a) * 60, def.z + Math.sin(a) * 60) - height(def.x - Math.cos(a) * 60, def.z - Math.sin(a) * 60));
    if (c < bestCost) { bestCost = c; best = a; }
  }
  const streets: [number, number][][] = [];
  const mkStreet = (ang: number, len: number) => {
    const pts: [number, number][] = [];
    const wig = r.range(0.002, 0.006), ph = r.next() * 6;
    for (let s = -len; s <= len; s += 6) {
      const off = Math.sin(s * wig * 6 + ph) * len * 0.08;
      pts.push([def.x + Math.cos(ang) * s - Math.sin(ang) * off, def.z + Math.sin(ang) * s + Math.cos(ang) * off]);
    }
    streets.push(pts);
    return pts;
  };
  mkStreet(best, def.r);
  if (def.cross) mkStreet(best + Math.PI / 2, def.r * 0.6);

  const houses: HouseSpec[] = [];
  const taken: [number, number, number, number][] = [];
  const free = (a: number, b: number, c: number, d: number) => !taken.some(([x0, z0, x1, z1]) => a < x1 && c > x0 && b < z1 && d > z0);
  const onStreet = (x0: number, z0: number, x1: number, z1: number) =>
    streets.some((st) => st.some(([x, z]) => x > x0 - 2.2 && x < x1 + 2.2 && z > z0 - 2.2 && z < z1 + 2.2));
  const plaza = 12;
  taken.push([def.x - plaza, def.z - plaza, def.x + plaza, def.z + plaza]);

  // walk along every street, both sides, placing lots
  let attempts = 0;
  for (const st of streets) {
    for (let i = 2; i < st.length - 1 && houses.length < def.n && attempts < 800; i++) {
      const [ax, az] = st[i - 1]!, [bx, bz] = st[i + 1]!;
      const tx = bx - ax, tz = bz - az, tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl, nz = tx / tl;
      for (const side of [1, -1]) {
        attempts++;
        if (r.next() < (def.n > 20 ? 0.1 : 0.3)) continue;
        const type: HouseType = pickW(def.types, r.next());
        const roof: RoofType = type === 'kura' ? 'tile' : type === 'shrine' ? 'copper' : pickW(def.roofs, r.next());
        const big = type === 'inn' || type === 'onsen' ? 1.4 : type === 'kura' || type === 'shrine' ? 0.7 : 1;
        const w = Math.round((r.range(5, 8) * big) * 2) / 2, d = Math.round((r.range(4.5, 6) * big) * 2) / 2;
        const dist = 3 + d / 2 + r.range(0, 1.5);
        const cx = st[i]![0] + nx * dist * side, cz = st[i]![1] + nz * dist * side;
        // face the road: the front (+z local) points back along -n·side; snap to 90°
        const fx = -nx * side, fz = -nz * side;
        const ang = Math.atan2(fx, fz);
        const rot = ((Math.round(ang / (Math.PI / 2)) % 4) + 4) % 4;
        const odd = rot % 2 === 1;
        const hw = (odd ? d : w) / 2 + 0.6, hd = (odd ? w : d) / 2 + 0.6;
        const x0 = cx - hw, x1 = cx + hw, z0 = cz - hd, z1 = cz + hd;
        if (!free(x0 - 1.2, z0 - 1.2, x1 + 1.2, z1 + 1.2) || onStreet(x0, z0, x1, z1) || wet(x0, z0, x1, z1, 3)) continue;
        let lo = Infinity, hi = -Infinity;
        for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx, cz]]) { const h = height(px!, pz!); lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (lo < 1.2 || hi - lo > 5) continue;
        taken.push([x0, z0, x1, z1]);
        const wall = def.walls === 'mixed' ? (r.next() < 0.5 ? 'plaster' : 'plank') : def.walls;
        houses.push({
          type, roof, profession: type === 'workshop' || type === 'shop' || type === 'inn' || type === 'fisher' || type === 'teahouse' ? r.pick(def.professions) : type === 'minka' ? 'farmer' : 'none',
          x: cx, z: cz, w, d, rot, floorY: hi + 0.45, groundMin: lo, seed: hashString(def.id) + houses.length * 977, wall,
        });
      }
    }
  }

  // lantern posts along the streets, a well on the plaza, a torii at the street's end
  const lanterns: Lantern[] = [];
  for (const st of streets) for (let i = 1; i < st.length - 1; i += 3) {
    const [ax, az] = st[i - 1]!, [bx, bz] = st[i + 1]!, tl = Math.hypot(bx - ax, bz - az) || 1;
    const side = i % 2 ? 1 : -1;
    const x = st[i]![0] + (-(bz - az) / tl) * 2.6 * side, z = st[i]![1] + ((bx - ax) / tl) * 2.6 * side;
    if (!free(x - 0.3, z - 0.3, x + 0.3, z + 0.3) || riverDist(x, z) < 1.2) continue;
    const y = height(x, z);
    if (y > 0.8) lanterns.push({ x, z, y });
  }
  let wx = def.x + 4, wz = def.z + 4;
  for (let k = 0; k < 8 && riverDist(wx, wz) < 3; k++) { wx = def.x + Math.cos(k) * 8; wz = def.z + Math.sin(k) * 8; }
  const well = { x: wx, z: wz, y: height(wx, wz) };
  let torii: VillageLayout['torii'] = null;
  if (def.shrine) {
    const st = streets[0]!, [ex, ez] = st[st.length - 1]!, [px, pz] = st[st.length - 3]!;
    torii = { x: ex, z: ez, y: height(ex, ez), rot: Math.atan2(ex - px, ez - pz) };
  }
  return { def, houses, streets, lanterns, well, torii };
}
