/**
 * Terrain worker: builds one quadtree node (33×33 grid + skirt) — positions relative to the
 * node origin, normals, biome attributes and baked AO — and returns transferable buffers.
 * Also places trees for forest tiles. Pure functions of the seed (deterministic).
 */
import { createWorld, type World } from './heightfield';
import { placeTrees } from '../flora/placement';
import { placeGround, type Rect } from '../flora/groundPlacement';
import type { Clear } from './clearings';

export const RES = 64;

type NodeReq = { kind: 'node'; id: number; seed: number; x0: number; z0: number; size: number };
type TreeReq = { kind: 'trees'; id: number; seed: number; x0: number; z0: number; size: number; clear?: Clear };
type GroundReq = { kind: 'ground'; id: number; seed: number; x0: number; z0: number; size: number; density: number; exclude: Rect[]; clear?: Clear };
type Req = NodeReq | TreeReq | GroundReq;

let world: World | null = null;

export function buildNode(w: World, x0: number, z0: number, size: number) {
  const N = RES + 1, cell = size / RES;
  // heights on an extended grid (+1 border) for normals and AO
  const E = N + 2;
  const H = new Float32Array(E * E);
  for (let j = 0; j < E; j++) for (let i = 0; i < E; i++) H[j * E + i] = w.height(x0 + (i - 1) * cell, z0 + (j - 1) * cell);
  const verts = N * N + 4 * N;
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3);
  const bio = new Float32Array(verts * 4), grass = new Float32Array(verts * 3), spec = new Float32Array(verts * 2);
  let minY = Infinity, maxY = -Infinity;
  const b = { forest: 0, moisture: 0, autumn: 0, special: 0, specialW: 0, grass: [0, 0, 0] as [number, number, number], region: 0 };
  const aoR = Math.max(cell * 2, 12);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    const h = H[(j + 1) * E + i + 1]!;
    const x = x0 + i * cell, z = z0 + j * cell;
    pos[k * 3] = i * cell; pos[k * 3 + 1] = h; pos[k * 3 + 2] = j * cell;
    minY = Math.min(minY, h); maxY = Math.max(maxY, h);
    const hl = H[(j + 1) * E + i]!, hr = H[(j + 1) * E + i + 2]!, hd = H[j * E + i + 1]!, hu = H[(j + 2) * E + i + 1]!;
    const nx = hl - hr, ny = 2 * cell, nz = hd - hu;
    const il = 1 / Math.hypot(nx, ny, nz);
    nor[k * 3] = nx * il; nor[k * 3 + 1] = ny * il; nor[k * 3 + 2] = nz * il;
    w.biome(x, z, b);
    // baked AO: concave spots (valleys, under ridges) get darker
    const avg = (w.height(x + aoR, z) + w.height(x - aoR, z) + w.height(x, z + aoR) + w.height(x, z - aoR)) * 0.25;
    const ao = Math.min(1, Math.max(0.55, 1 - Math.max(0, avg - h) * (0.9 / aoR) * 3));
    bio[k * 4] = b.forest; bio[k * 4 + 1] = b.moisture; bio[k * 4 + 2] = b.autumn; bio[k * 4 + 3] = ao;
    grass[k * 3] = b.grass[0]; grass[k * 3 + 1] = b.grass[1]; grass[k * 3 + 2] = b.grass[2];
    spec[k * 2] = b.special; spec[k * 2 + 1] = b.specialW;
  }
  // skirts: copies of the border vertices pushed down to hide LOD cracks
  const drop = cell * 1.5 + 2;
  const border: number[] = [];
  for (let i = 0; i < N; i++) border.push(i); // top row (j=0)
  for (let i = 0; i < N; i++) border.push((N - 1) * N + i); // bottom row
  for (let j = 0; j < N; j++) border.push(j * N); // left col
  for (let j = 0; j < N; j++) border.push(j * N + N - 1); // right col
  border.forEach((src, s) => {
    const k = N * N + s;
    pos[k * 3] = pos[src * 3]!; pos[k * 3 + 1] = pos[src * 3 + 1]! - drop; pos[k * 3 + 2] = pos[src * 3 + 2]!;
    for (let c = 0; c < 3; c++) { nor[k * 3 + c] = nor[src * 3 + c]!; grass[k * 3 + c] = grass[src * 3 + c]!; }
    for (let c = 0; c < 4; c++) bio[k * 4 + c] = bio[src * 4 + c]!;
    spec[k * 2] = spec[src * 2]!; spec[k * 2 + 1] = spec[src * 2 + 1]!;
  });
  return { pos, nor, bio, grass, spec, minY: minY - drop, maxY };
}

/** Index buffer shared by every node (grid + four skirts). */
export function nodeIndex(): Uint32Array {
  const N = RES + 1, out: number[] = [];
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    out.push(a, c, b, b, c, d);
  }
  const S = N * N;
  const strip = (row: (i: number) => number, skirt: number, flip: boolean) => {
    for (let i = 0; i < RES; i++) {
      const a = row(i), b = row(i + 1), c = S + skirt + i, d = S + skirt + i + 1;
      if (flip) out.push(a, b, c, b, d, c); else out.push(a, c, b, b, c, d);
    }
  };
  // skirts face outwards (front-side rendering; terrain is never seen from below)
  strip((i) => i, 0, true);
  strip((i) => (N - 1) * N + i, N, false);
  strip((j) => j * N, 2 * N, false);
  strip((j) => j * N + N - 1, 3 * N, true);
  return new Uint32Array(out);
}

type Scope = { onmessage: ((e: MessageEvent<Req>) => void) | null; postMessage(m: unknown, t: Transferable[]): void };
const scope = (typeof self !== 'undefined' ? self : undefined) as unknown as Scope | undefined;
if (scope && typeof (globalThis as { document?: unknown }).document === 'undefined') {
  scope.onmessage = (e) => {
    const r = e.data;
    if (!world || world.seed !== r.seed) world = createWorld(r.seed);
    if (r.kind === 'node') {
      const d = buildNode(world, r.x0, r.z0, r.size);
      scope.postMessage({ kind: 'node', id: r.id, ...d }, [d.pos.buffer, d.nor.buffer, d.bio.buffer, d.grass.buffer, d.spec.buffer]);
    } else if (r.kind === 'ground') {
      const g = placeGround(world, r.x0, r.z0, r.size, r.density, r.exclude, r.clear);
      scope.postMessage({ kind: 'ground', id: r.id, data: g }, [g.buffer]);
    } else {
      const t = placeTrees(world, r.x0, r.z0, r.size, r.clear);
      scope.postMessage({ kind: 'trees', id: r.id, trees: t }, Object.values(t).map((a) => a.buffer));
    }
  };
}
