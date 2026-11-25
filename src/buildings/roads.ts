/**
 * Roads (SPEC §7.3): A* over a 24 m grid with a slope cost (roads wind along contours and
 * over passes, avoid water), smoothed with Chaikin, sampled every 3 m and draped on the
 * terrain as dirt strips. Plank bridges where a road has to cross water.
 */
import * as THREE from 'three';
import { ensureColor } from '../render/materials';

export type Path = [number, number][];

const CELL = 24;

/** A* from a to b over the heightfield. Returns world-space points. */
export function findRoad(height: (x: number, z: number) => number, ax: number, az: number, bx: number, bz: number, limit = 6000): Path {
  const N = Math.ceil((limit * 2) / CELL);
  const toI = (x: number) => Math.max(0, Math.min(N - 1, Math.round((x + limit) / CELL)));
  const toW = (i: number) => i * CELL - limit;
  const hc = new Map<number, number>();
  const H = (i: number, j: number) => {
    const k = j * N + i;
    let v = hc.get(k);
    if (v === undefined) { v = height(toW(i), toW(j)); hc.set(k, v); }
    return v;
  };
  const si = toI(ax), sj = toI(az), ti = toI(bx), tj = toI(bz);
  const start = sj * N + si, goal = tj * N + ti;
  const g = new Map<number, number>([[start, 0]]);
  const from = new Map<number, number>();
  // binary heap of [f, node]
  const heap: [number, number][] = [];
  const push = (f: number, n: number) => {
    heap.push([f, n]);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p]![0] <= f) break; [heap[p], heap[i]] = [heap[i]!, heap[p]!]; i = p; }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!, last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, rr = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (rr < heap.length && heap[rr]![0] < heap[m]![0]) m = rr;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!]; i = m;
      }
    }
    return top;
  };
  const hdist = (i: number, j: number) => Math.hypot(i - ti, j - tj) * CELL;
  push(hdist(si, sj), start);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let found = false, it = 0;
  while (heap.length && it++ < 200000) {
    const [, n] = pop();
    if (n === goal) { found = true; break; }
    const i = n % N, j = Math.floor(n / N);
    const h0 = H(i, j);
    for (const [di, dj] of DIRS) {
      const ni = i + di!, nj = j + dj!;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const h1 = H(ni, nj);
      const len = Math.hypot(di!, dj!) * CELL;
      const slope = Math.abs(h1 - h0) / len;
      let cost = len * (1 + slope * slope * 60 + (slope > 0.35 ? 40 : 0));
      if (h1 < 0.5) cost += 2500; // water: only if there is no way round (a bridge)
      if (h1 > 1100) cost += 400;
      const m = nj * N + ni, ng = g.get(n)! + cost;
      if (ng < (g.get(m) ?? Infinity)) { g.set(m, ng); from.set(m, n); push(ng + hdist(ni, nj), m); }
    }
  }
  const pts: Path = [[bx, bz]];
  if (found) {
    let n = goal;
    while (n !== start) { n = from.get(n)!; pts.push([toW(n % N), toW(Math.floor(n / N))]); }
  }
  pts.pop();
  pts.push([ax, az]);
  pts.reverse();
  return smooth(pts, 3);
}

/** Chaikin corner cutting. */
export function smooth(p: Path, rounds: number): Path {
  let q = p;
  for (let k = 0; k < rounds; k++) {
    const o: Path = [q[0]!];
    for (let i = 0; i < q.length - 1; i++) {
      const [ax, az] = q[i]!, [bx, bz] = q[i + 1]!;
      o.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    o.push(q[q.length - 1]!);
    q = o;
  }
  return q;
}

/** Resample a polyline every `step` metres. */
export function resample(p: Path, step: number): Path {
  const out: Path = [p[0]!];
  let carry = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i]!, [bx, bz] = p[i + 1]!;
    const l = Math.hypot(bx - ax, bz - az);
    let t = step - carry;
    while (t <= l) { out.push([ax + ((bx - ax) * t) / l, az + ((bz - az) * t) / l]); t += step; }
    carry = l - (t - step);
  }
  out.push(p[p.length - 1]!);
  return out;
}

export type RoadChunk = { geo: THREE.BufferGeometry; bridge: THREE.BufferGeometry | null; center: THREE.Vector3; radius: number; decks: [number, number, number, number, number][] };

/** Strip meshes in chunks of ~120 m (culled by distance). UVs run along the road. */
export function roadMeshes(path: Path, width: number, height: (x: number, z: number) => number, water?: (x: number, z: number) => number): RoadChunk[] {
  const p = resample(path, 3);
  const chunks: RoadChunk[] = [];
  const per = 40;
  let along = 0;
  for (let c0 = 0; c0 < p.length - 1; c0 += per) {
    const c1 = Math.min(p.length - 1, c0 + per);
    const pos: number[] = [], uv: number[] = [], nor: number[] = [];
    const bridge: THREE.BufferGeometry[] = [];
    const decks: [number, number, number, number, number][] = [];
    let cx = 0, cz = 0, cy = 0;
    const row = (i: number) => {
      const [x, z] = p[i]!, [px, pz] = p[Math.max(0, i - 1)]!, [nx, nz] = p[Math.min(p.length - 1, i + 1)]!;
      const tx = nx - px, tz = nz - pz, tl = Math.hypot(tx, tz) || 1;
      const ox = (-tz / tl) * (width / 2), oz = (tx / tl) * (width / 2);
      const hl = height(x + ox, z + oz), hr = height(x - ox, z - oz), hm = height(x, z);
      const wl = water ? water(x, z) : -Infinity;
      const isWater = hm < 0.4 || wl > hm - 0.1;
      const y = isWater ? Math.max(1.0, wl + 1.0) : hm;
      return { a: [x + ox, (isWater ? y : hl) + 0.07, z + oz], b: [x - ox, (isWater ? y : hr) + 0.07, z - oz], y, water: isWater, x, z };
    };
    let prev = row(c0);
    for (let i = c0 + 1; i <= c1; i++) {
      const cur = row(i);
      const u0 = along / 4, u1 = (along + 3) / 4;
      along += 3;
      if (prev.water || cur.water) {
        // a plank bridge segment on posts
        const g = new THREE.BoxGeometry(width, 0.16, 3.1).toNonIndexed();
        g.rotateY(Math.atan2(cur.x - prev.x, cur.z - prev.z));
        const deckY = Math.max(cur.y, prev.y);
        g.translate((cur.x + prev.x) / 2, deckY, (cur.z + prev.z) / 2);
        bridge.push(ensureColor(g, [0.55, 0.38, 0.26]));
        decks.push([Math.min(cur.x, prev.x) - width * 0.4, Math.min(cur.z, prev.z) - width * 0.4, Math.max(cur.x, prev.x) + width * 0.4, Math.max(cur.z, prev.z) + width * 0.4, deckY + 0.08]);
        if (i % 2 === 0) for (const s of [cur.a, cur.b]) bridge.push(ensureColor(new THREE.BoxGeometry(0.18, 3.2, 0.18).toNonIndexed().translate(s[0]!, deckY - 1.5, s[2]!), [0.35, 0.24, 0.18]));
      } else {
        const A = prev.a, B = prev.b, C = cur.a, D = cur.b;
        pos.push(...A, ...C, ...B, ...B, ...C, ...D);
        uv.push(0, u0, 0, u1, 1, u0, 1, u0, 0, u1, 1, u1);
        for (let k = 0; k < 6; k++) nor.push(0, 1, 0);
      }
      cx += cur.x; cz += cur.z; cy += cur.y;
      prev = cur;
    }
    const n = c1 - c0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    ensureColor(geo);
    let bg: THREE.BufferGeometry | null = null;
    if (bridge.length) {
      const merged = new THREE.BufferGeometry();
      const parts = bridge;
      const P: number[] = [], Nn: number[] = [], C: number[] = [], UV: number[] = [];
      for (const g of parts) {
        const pa = g.getAttribute('position'), na = g.getAttribute('normal'), ca = g.getAttribute('aColor'), ua = g.getAttribute('uv');
        for (let i = 0; i < pa.count; i++) { P.push(pa.getX(i), pa.getY(i), pa.getZ(i)); Nn.push(na.getX(i), na.getY(i), na.getZ(i)); C.push(ca.getX(i), ca.getY(i), ca.getZ(i), ca.getW(i)); UV.push(ua.getX(i), ua.getY(i)); }
      }
      merged.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      merged.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
      merged.setAttribute('aColor', new THREE.Float32BufferAttribute(C, 4));
      merged.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
      bg = merged;
    }
    chunks.push({ geo, bridge: bg, center: new THREE.Vector3(cx / n, cy / n, cz / n), radius: n * 3, decks });
  }
  return chunks;
}
