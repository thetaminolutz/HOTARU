/**
 * Hydrology (SPEC §5 step 4, §6.15): the main river runs from the snowy pass through the Great
 * Waterfall into Lantern Lake and out through the marsh to the sea along authored valley points;
 * tributaries flow from mountain sources by steepest descent until they meet the river, the
 * lake or the sea — or end in a hollow, which becomes a pond. Water levels only ever fall
 * downstream (running minimum of the land), steep drops become waterfalls. The result carves
 * the heightfield (riverbeds, low banks, levees where the land is lower than the water) and
 * drives the river, pond and waterfall meshes. Deterministic: every worker computes the same.
 */
export type RiverPoint = { x: number; z: number; level: number; width: number; s: number };
export type River = { id: string; main: boolean; pts: RiverPoint[] };
export type Pond = { x: number; z: number; r: number; level: number };
export type Fall = { x: number; z: number; top: number; bottom: number; dx: number; dz: number; width: number; river: string };
export type Hydro = { rivers: River[]; ponds: Pond[]; falls: Fall[]; carve: (x: number, z: number, h: number) => number; waterAt: (x: number, z: number) => number };

/** The main river, through valleys (x, z), source to sea. */
const MAIN: [number, number][] = [
  [-520, -3560], [-900, -3150], [-1350, -2700], [-1700, -2250], [-1850, -1850], [-1650, -1450],
  [-1250, -1050], [-850, -700], [-480, -330], [-200, -120],
  // the lake (no river mesh here), then out to the east
  [380, 60], [700, 300], [1150, 700], [1700, 1050], [2300, 1350], [2900, 1550], [3500, 1700], [4100, 1800], [4700, 1850],
];
const LAKE_IN = 9, LAKE_OUT = 10; // indices around the lake

/** Tributary sources (mountain springs). */
const SOURCES: [string, number, number][] = [
  ['kirisugi', -3300, -900], ['sasayabu', -2900, 1100], ['ajisai', -1500, 2700], ['inaho', -600, 3800],
  ['chabatake', 1900, 4300], ['sakura', 2600, -1100], ['kumoji', 2700, -2300], ['kagejo', -300, -1500],
  ['momiji', -2900, -2800], ['ichodai', -1300, -3300],
];

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function chaikin(p: [number, number][], rounds: number): [number, number][] {
  let q = p;
  for (let k = 0; k < rounds; k++) {
    const o: [number, number][] = [q[0]!];
    for (let i = 0; i < q.length - 1; i++) {
      const [ax, az] = q[i]!, [bx, bz] = q[i + 1]!;
      o.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    o.push(q[q.length - 1]!);
    q = o;
  }
  return q;
}

function densify(p: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [p[0]!];
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i]!, [bx, bz] = p[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}

/** Give a polyline its levels (running minimum of the land) and widths. */
function profile(id: string, main: boolean, path: [number, number][], H: (x: number, z: number) => number, w0: number, w1: number, endLevel?: number): River {
  const pts: RiverPoint[] = [];
  let level = Infinity, s = 0;
  for (let i = 0; i < path.length; i++) {
    const [x, z] = path[i]!;
    if (i) s += Math.hypot(x - path[i - 1]![0], z - path[i - 1]![1]);
    // the water surface sits a little under the lowest land seen so far
    level = Math.min(level, H(x, z) - (main ? 0.9 : 0.5));
    pts.push({ x, z, level, width: 0, s });
  }
  const L = s || 1;
  for (const p of pts) {
    p.width = w0 + (w1 - w0) * Math.pow(p.s / L, 0.8);
    if (endLevel !== undefined) p.level = Math.max(p.level, endLevel);
  }
  return { id, main, pts };
}

export function computeHydrology(H: (x: number, z: number) => number): Hydro {
  const rivers: River[] = [];
  const ponds: Pond[] = [];
  // ---- main river: upper course into the lake, lower course out to the sea ----
  const upper = densify(chaikin(MAIN.slice(0, LAKE_IN + 1), 3), 10);
  const lower = densify(chaikin(MAIN.slice(LAKE_OUT), 3), 10);
  rivers.push(profile('upper', true, upper, H, 5, 16, 0));
  const low = profile('lower', true, lower, H, 14, 26, 0);
  // the outflow sits at lake level, falling gently to the sea
  low.pts.forEach((p, i) => { p.level = Math.max(-0.2, Math.min(p.level, 0.05 - (i / low.pts.length) * 0.25)); });
  rivers.push(low);

  // ---- tributaries by steepest descent ----
  const nearMain = (x: number, z: number) => {
    let best = Infinity, lv = 0;
    for (const r of rivers) for (let i = 0; i < r.pts.length; i += 3) {
      const p = r.pts[i]!;
      const d = Math.hypot(p.x - x, p.z - z) - p.width;
      if (d < best) { best = d; lv = p.level; }
    }
    return { d: best, level: lv };
  };
  const DIRS = 16, STEP = 30;
  for (const [id, sx, sz] of SOURCES) {
    const path: [number, number][] = [[sx, sz]];
    let x = sx, z = sz, h = H(x, z), hdg = Math.atan2(-sz, -sx); // first guess: towards the middle
    let end: 'river' | 'sea' | 'pond' | 'none' = 'none';
    let climb = 0;
    for (let k = 0; k < 400; k++) {
      let bx = 0, bz = 0, bh = Infinity, ba = hdg;
      for (let d = 0; d < DIRS; d++) {
        const a = (d / DIRS) * Math.PI * 2;
        const turn = Math.abs(Math.atan2(Math.sin(a - hdg), Math.cos(a - hdg)));
        if (turn > 1.9) continue; // rivers don't double back
        const nx = x + Math.cos(a) * STEP, nz = z + Math.sin(a) * STEP;
        const nh = H(nx, nz) + turn * 0.6; // slight inertia
        if (nh < bh) { bh = nh; bx = nx; bz = nz; ba = a; }
      }
      const realH = H(bx, bz);
      // small bumps are cut through (the water level keeps falling); a real basin makes a pond
      if (realH > h + 0.5) { climb += realH - h; if (climb > 6) { end = 'pond'; break; } } else climb = Math.max(0, climb - 1);
      x = bx; z = bz; h = Math.min(h, realH); hdg = ba;
      path.push([x, z]);
      if (h < 0.4) { end = 'sea'; break; }
      const m = nearMain(x, z);
      if (m.d < 4) { end = 'river'; break; }
    }
    if (path.length < 6) continue;
    const r = profile(id, false, densify(chaikin(path, 2), 10), H, 1.6, 6);
    rivers.push(r);
    if (end === 'pond') {
      const last = r.pts[r.pts.length - 1]!;
      // the pond's surface: just under the lowest point of its rim
      const R = 14 + (id.length % 3) * 5;
      let rim = Infinity;
      for (let a = 0; a < 12; a++) rim = Math.min(rim, H(last.x + Math.cos(a / 12 * Math.PI * 2) * R, last.z + Math.sin(a / 12 * Math.PI * 2) * R));
      ponds.push({ x: last.x, z: last.z, r: R, level: Math.min(rim - 0.3, last.level) });
    }
  }

  // ---- waterfalls: steep stretches merged; ≥ 6 m of drop is a waterfall, less is rapids ----
  const falls: Fall[] = [];
  for (const r of rivers) {
    let i = 1;
    while (i < r.pts.length) {
      const steep = (k: number) => (r.pts[k - 1]!.level - r.pts[k]!.level) / Math.max(1, r.pts[k]!.s - r.pts[k - 1]!.s) > 0.18;
      if (!steep(i)) { i++; continue; }
      let j = i;
      while (j + 1 < r.pts.length && steep(j + 1)) j++;
      const a = r.pts[i - 1]!, b = r.pts[j]!;
      // a compact drop (≤ 50 m long) is a waterfall; a long steep stretch stays rapids
      if (a.level - b.level >= 6 && b.s - a.s <= 50) {
        // make it a real fall: the level holds until the lip, then drops in one step
        for (let k = i; k < j; k++) r.pts[k]!.level = a.level;
        const dx = b.x - r.pts[j - 1]!.x, dz = b.z - r.pts[j - 1]!.z, l = Math.hypot(dx, dz) || 1;
        const lip = r.pts[j - 1]!;
        falls.push({ x: (lip.x + b.x) / 2, z: (lip.z + b.z) / 2, top: a.level, bottom: b.level, dx: dx / l, dz: dz / l, width: b.width, river: r.id });
      }
      i = j + 1;
    }
  }

  // ---- spatial index of segments for carving ----
  const CELL = 64;
  const grid = new Map<number, [RiverPoint, RiverPoint][]>();
  const key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
  for (const r of rivers) for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1]!, b = r.pts[i]!;
    const pad = Math.max(a.width, b.width) * 1.6 + 90;
    const i0 = Math.floor((Math.min(a.x, b.x) - pad) / CELL), i1 = Math.floor((Math.max(a.x, b.x) + pad) / CELL);
    const j0 = Math.floor((Math.min(a.z, b.z) - pad) / CELL), j1 = Math.floor((Math.max(a.z, b.z) + pad) / CELL);
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
      const k = key(ii, j);
      let l = grid.get(k);
      if (!l) grid.set(k, (l = []));
      l.push([a, b]);
    }
  }
  /** Nearest river centreline: distance, level, half-width (or null). */
  const nearest = (x: number, z: number): { d: number; level: number; w: number } | null => {
    const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return null;
    let best: { d: number; level: number; w: number } | null = null;
    for (const [a, b] of list) {
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
      const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
      if (!best || d < best.d) best = { d, level: a.level + (b.level - a.level) * t, w: (a.width + (b.width - a.width) * t) / 2 };
    }
    return best;
  };

  const carve = (x: number, z: number, h: number): number => {
    const n = nearest(x, z);
    if (n) {
      const { d, level, w } = n;
      // banks widen with the depth of the cut: deep cuts become valleys, not trenches
      const bank = Math.min(90, 6 + w * 0.8 + Math.max(0, h - level) * 2.2);
      if (d < w + bank) {
        if (d < w) h = Math.min(h, level - (w > 5 ? 1.8 : 1.0) * (1 - (d / w) * (d / w)) - 0.15);
        else {
          const k = smooth(w, w + bank, d);
          // lower steep banks towards the water, raise low land into a levee
          if (h > level + 0.4) h = level + 0.4 + (h - level - 0.4) * k;
          else if (d < w + bank * 0.6 && level > 0.5 && h > level - 1.5) h = Math.max(h, level + 0.25);
        }
      }
    }
    for (const p of ponds) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > p.r * 1.8) continue;
      if (d < p.r) h = Math.min(h, p.level - 1.4 * (1 - (d / p.r) * (d / p.r)) - 0.1);
      else if (h < p.level + 0.25) h = Math.max(h, p.level + 0.25);
      else h = p.level + 0.25 + (h - p.level - 0.25) * smooth(p.r, p.r * 1.8, d);
    }
    return h;
  };

  /** The water surface at (x, z): rivers and ponds above sea level, or -Infinity. */
  const waterAt = (x: number, z: number): number => {
    const n = nearest(x, z);
    if (n && n.d < n.w + 0.5 && n.level > 0.3) return n.level;
    for (const p of ponds) if (Math.hypot(x - p.x, z - p.z) < p.r) return p.level;
    return -Infinity;
  };

  return { rivers, ponds, falls, carve, waterAt };
}
