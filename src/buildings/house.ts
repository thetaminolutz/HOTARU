/**
 * House generator (SPEC §7): one building = walls with door and window openings, a roof
 * (thatch, kawara tiles, shingles, copper), a stone plinth to the ground, and a furnished
 * interior you can walk into (tatami, irori hearth, cushions, chests, lamps, a tokonoma,
 * profession props, futons at night). Built in local space (front = +z) and turned to face
 * its road in 90° steps so colliders stay axis-aligned.
 */
import * as THREE from 'three';
import { boxUV, gableEnd, chochin, andon } from './kit';
import { ensureColor } from '../render/materials';
import { createRng, type Rng } from '../core/rng';
import { props, type MatKey } from './props';

export type HouseType = 'minka' | 'machiya' | 'workshop' | 'inn' | 'shop' | 'kura' | 'fisher' | 'onsen' | 'shrine' | 'teahouse';
export type RoofType = 'thatch' | 'tile' | 'shingle' | 'copper';
export type Profession = 'farmer' | 'potter' | 'lanternMaker' | 'weaver' | 'carpenter' | 'fisher' | 'merchant' | 'innkeeper' | 'tea' | 'none';

export type HouseSpec = {
  type: HouseType; roof: RoofType; profession: Profession;
  x: number; z: number; w: number; d: number;
  /** 0..3: quarter turns; the front faces +z rotated by rot·90° */
  rot: number;
  floorY: number;
  groundMin: number;
  seed: number;
  wall: 'plank' | 'plaster';
};

export type Rect = [number, number, number, number];
export type Light = { pos: THREE.Vector3; color: THREE.Color; radius: number; intensity: number; halo: number; phase: number };
export type Door = { pos: THREE.Vector3; slide: THREE.Vector3; w: number; h: number; rot: number };
export type Sit = { x: number; y: number; z: number; yaw: number; label: string };

export type HouseOut = {
  parts: Partial<Record<MatKey, THREE.BufferGeometry[]>>;
  /** shown at night only */
  night: THREE.BufferGeometry[];
  far: THREE.BufferGeometry[];
  farWin: THREE.BufferGeometry[];
  decks: [number, number, number, number, number][];
  colliders: { x0: number; z0: number; x1: number; z1: number; top: number }[];
  lights: Light[];
  doors: Door[];
  sits: Sit[];
  /** interior rectangles (indoors detection) with floor and ceiling heights */
  rooms: { r: Rect; y0: number; y1: number }[];
  footprint: Rect;
};

const WARM = new THREE.Color(1.0, 0.62, 0.3);
const FIRE = new THREE.Color(1.0, 0.45, 0.16);
export const WALL_H = 2.6;

export function buildHouse(s: HouseSpec, ground?: (x: number, z: number) => number): HouseOut {
  const r = createRng(s.seed);
  const out: HouseOut = { parts: {}, night: [], far: [], farWin: [], decks: [], colliders: [], lights: [], doors: [], sits: [], rooms: [], footprint: [0, 0, 0, 0] };
  const L: Partial<Record<MatKey, THREE.BufferGeometry[]>> = {};
  const add = (k: MatKey, g: THREE.BufferGeometry) => (L[k] ??= []).push(g);
  const { w, d } = s;
  const H = s.type === 'kura' ? 3.4 : s.type === 'shrine' ? 2.2 : WALL_H;
  const F = s.floorY; // floor height (world)
  const t = 0.14; // wall thickness
  const wallKey: MatKey = s.wall === 'plaster' || s.type === 'kura' ? 'plaster' : 'wood';

  // ---------- plinth and floor ----------
  const plinthH = F - s.groundMin + 0.3;
  add('stone', boxUV(w + 0.3, plinthH, d + 0.3, 2).translate(0, F - plinthH / 2 - 0.12, 0));
  add('floor', boxUV(w, 0.12, d, 2).translate(0, F - 0.06, 0));
  out.decks.push([-w / 2, -d / 2, w / 2, d / 2, F] as never);

  // ---------- walls with openings ----------
  const doorW = s.type === 'shop' || s.type === 'machiya' ? 1.8 : 1.3, doorH = 1.95;
  const doorX = s.type === 'kura' || s.type === 'shrine' ? 0 : r.range(-w / 2 + 1.4, w / 2 - 1.4) * 0.5;
  // stone steps from the door down to the ground (each ≤ 0.3 m, walkable)
  {
    const ang = (s.rot * Math.PI) / 2, c = Math.round(Math.cos(ang)), sn = Math.round(Math.sin(ang));
    const gAt = (lx: number, lz: number) => (ground ? ground(s.x + lx * c + lz * sn, s.z - lx * sn + lz * c) : s.groundMin);
    const g = Math.min(gAt(doorX, d / 2 + 1.2), F - 0.15);
    const n = Math.max(1, Math.ceil((F - g) / 0.28));
    const rise = (F - g) / n, depth = 0.42;
    for (let i = 1; i <= n; i++) {
      const top = F - i * rise, z0 = d / 2 + (i - 1) * depth;
      const bottom = Math.min(top - 0.2, gAt(doorX, z0 + depth) - 0.3);
      add('stone', boxUV(1.5, top - bottom, depth, 1).translate(doorX, (top + bottom) / 2, z0 + depth / 2));
      out.decks.push([doorX - 0.75, z0, doorX + 0.75, z0 + depth, top] as never);
    }
  }
  type Opening = { a: number; b: number; y0: number; y1: number; door?: boolean };
  const winOpenings = (len: number, n: number, avoid?: [number, number]): Opening[] => {
    const o: Opening[] = [];
    for (let i = 0; i < n; i++) {
      const c = -len / 2 + ((i + 1) / (n + 1)) * len, hw = s.type === 'kura' ? 0.35 : 0.55;
      if (avoid && c + hw > avoid[0] - 0.3 && c - hw < avoid[1] + 0.3) continue;
      o.push({ a: c - hw, b: c + hw, y0: s.type === 'kura' ? 2.2 : 0.9, y1: s.type === 'kura' ? 2.8 : 1.9 });
    }
    return o;
  };
  // each wall: along local x at z = ±d/2 (front/back) or along z at x = ±w/2 (sides)
  const walls: { len: number; at: (u: number, y: number) => [number, number]; along: 'x' | 'z'; normalSign: number; open: Opening[] }[] = [
    { len: w, along: 'x', normalSign: 1, at: (u) => [u, d / 2], open: [{ a: doorX - doorW / 2, b: doorX + doorW / 2, y0: 0, y1: doorH, door: true }, ...winOpenings(w, Math.floor(w / 2.6), [doorX - doorW / 2, doorX + doorW / 2])] },
    { len: w, along: 'x', normalSign: -1, at: (u) => [u, -d / 2], open: winOpenings(w, Math.max(1, Math.floor(w / 3))) },
    { len: d, along: 'z', normalSign: 1, at: (u) => [w / 2, u], open: winOpenings(d, Math.max(1, Math.floor(d / 3.5))) },
    { len: d, along: 'z', normalSign: -1, at: (u) => [-w / 2, u], open: s.type === 'kura' ? [] : winOpenings(d, 1) },
  ];
  for (const wl of walls) {
    const piece = (u0: number, u1: number, y0: number, y1: number, key: MatKey = wallKey) => {
      if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return;
      const [cx, cz] = wl.at((u0 + u1) / 2, 0);
      const g = wl.along === 'x' ? boxUV(u1 - u0, y1 - y0, t, 2) : boxUV(t, y1 - y0, u1 - u0, 2);
      add(key, g.translate(cx, F + (y0 + y1) / 2, cz));
    };
    const ops = [...wl.open].sort((a, b) => a.a - b.a);
    let u = -wl.len / 2;
    for (const o of ops) {
      piece(u, o.a, 0, H);
      piece(o.a, o.b, o.y1, H);
      piece(o.a, o.b, 0, o.y0);
      if (!o.door) {
        // lit shōji in the window, a sill and a little roof of its own
        const [cx, cz] = wl.at((o.a + o.b) / 2, 0);
        const pane = wl.along === 'x' ? boxUV(o.b - o.a, o.y1 - o.y0, 0.04, 1) : boxUV(0.04, o.y1 - o.y0, o.b - o.a, 1);
        add('shoji', pane.translate(cx, F + (o.y0 + o.y1) / 2, cz));
        const sill = wl.along === 'x' ? boxUV(o.b - o.a + 0.2, 0.06, 0.3, 1) : boxUV(0.3, 0.06, o.b - o.a + 0.2, 1);
        add('darkwood', sill.translate(cx, F + o.y0 - 0.03, cz));
        const fw = wl.along === 'x' ? boxUV(o.b - o.a, o.y1 - o.y0, 0.02, 1, [1, 1, 1], 1) : boxUV(0.02, o.y1 - o.y0, o.b - o.a, 1, [1, 1, 1], 1);
        const off = 0.12 * wl.normalSign;
        out.farWin.push(fw.translate(cx + (wl.along === 'z' ? off : 0), F + (o.y0 + o.y1) / 2, cz + (wl.along === 'x' ? off : 0)));
      }
      u = o.b;
    }
    piece(u, wl.len / 2, 0, H);
    // colliders: solid spans between doors (windows block)
    let cu = -wl.len / 2;
    const solid = (u0: number, u1: number) => {
      if (u1 - u0 < 0.05) return;
      const [ax, az] = wl.at(u0, 0), [bx, bz] = wl.at(u1, 0);
      out.colliders.push({ x0: Math.min(ax, bx) - t / 2, z0: Math.min(az, bz) - t / 2, x1: Math.max(ax, bx) + t / 2, z1: Math.max(az, bz) + t / 2, top: F + H + 1 });
    };
    for (const o of ops.filter((o) => o.door)) { solid(cu, o.a); cu = o.b; }
    solid(cu, wl.len / 2);
  }
  // corner posts and a timber band (the frame reads well in pixels)
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) add('darkwood', boxUV(0.2, H + 0.1, 0.2, 2).translate((px * w) / 2, F + H / 2, (pz * d) / 2));
  add('darkwood', boxUV(w + 0.25, 0.14, 0.08, 2).translate(0, F + H - 0.05, d / 2 + 0.05));
  add('darkwood', boxUV(w + 0.25, 0.14, 0.08, 2).translate(0, F + H - 0.05, -d / 2 - 0.05));
  // ceiling (interior), dark boards
  add('darkwood', boxUV(w - 0.1, 0.06, d - 0.1, 2).translate(0, F + H + 0.03, 0));

  // the sliding door (animated by the village)
  out.doors.push({ pos: new THREE.Vector3(doorX, F + doorH / 2, d / 2), slide: new THREE.Vector3(doorW * 0.95, 0, 0), w: doorW, h: doorH, rot: 0 });

  // ---------- roof ----------
  const ov = s.roof === 'thatch' ? 0.9 : 1.0;
  const rise = s.roof === 'thatch' ? d * 0.62 : s.roof === 'tile' || s.roof === 'copper' ? d * 0.38 : d * 0.34;
  const roofKey: MatKey = s.roof === 'thatch' ? 'thatch' : s.roof === 'tile' ? 'tile' : s.roof === 'copper' ? 'copper' : 'shingle';
  const thick = s.roof === 'thatch' ? 0.45 : 0.14;
  const half = d / 2 + ov;
  const segs = s.roof === 'tile' || s.roof === 'copper' ? 3 : 1;
  // a curved (kawara) roof: steeper near the ridge, flatter at the eaves
  // profile from the ridge out to the eave; kawara roofs sag (concave) and lift at the eaves
  const prof: [number, number][] = [];
  const bow = segs > 1 ? 0.3 : 0;
  for (let i = 0; i <= segs; i++) {
    const z = (i / segs) * half, q = z / (d / 2);
    prof.push([z, rise * (1 - q) - bow * rise * q * (1 - q)]);
  }
  const roofY = F + H;
  for (const side of [1, -1]) {
    for (let i = 0; i < segs; i++) {
      const [z0, y0] = prof[i]!, [z1, y1] = prof[i + 1]!;
      const len = Math.hypot(z1 - z0, y1 - y0) + 0.06;
      const g = boxUV(w + ov * 2, thick, len, 2);
      g.rotateX(side * Math.atan2(y0 - y1, z1 - z0));
      add(roofKey, g.translate(0, roofY + (y0 + y1) / 2 + thick / 2, side * (z0 + z1) / 2));
    }
  }
  // gable ends (the triangles under the roof)
  add(wallKey, gableEnd(d, rise, 2).rotateY(Math.PI / 2).translate(w / 2, roofY, 0));
  add(wallKey, gableEnd(d, rise, 2).rotateY(-Math.PI / 2).translate(-w / 2, roofY, 0));
  // ridge
  const ridgeH = s.roof === 'thatch' ? 0.5 : 0.28;
  add(s.roof === 'thatch' ? 'darkwood' : roofKey, boxUV(w + ov * 2 + 0.2, ridgeH, s.roof === 'thatch' ? 0.8 : 0.35, 2).translate(0, roofY + rise + ridgeH / 2, 0));
  if (s.roof === 'thatch') for (let x = -w / 2 - ov; x <= w / 2 + ov; x += 1.2) add('darkwood', boxUV(0.12, 0.3, 1.0, 1).translate(x, roofY + rise + 0.5, 0));

  // ---------- interior & props ----------
  out.rooms.push({ r: [-w / 2, -d / 2, w / 2, d / 2], y0: F - 0.5, y1: F + H });
  props(s, r, { w, d, F, H, doorX }, add, out, WARM, FIRE);

  // door lantern / noren outside
  if (s.type === 'shop' || s.type === 'machiya' || s.type === 'inn' || s.type === 'teahouse') {
    add('cloth', ensureColor(boxUV(doorW, 0.7, 0.03, 0.7).deleteAttribute('aColor'), [0.18, 0.26, 0.5]).translate(doorX, F + doorH - 0.35, d / 2 + 0.2));
  }
  if (r.chance(0.6) || s.type === 'inn' || s.type === 'shop') {
    const lx = doorX + (doorW / 2 + 0.5) * (r.chance(0.5) ? 1 : -1);
    add('paper', chochin(0.22, 0.42).translate(lx, F + H - 0.15, d / 2 + 0.55));
    out.lights.push({ pos: new THREE.Vector3(lx, F + H - 0.4, d / 2 + 0.6), color: new THREE.Color(1, 0.55, 0.2), radius: 7, intensity: 1.8, halo: 1.2, phase: r.next() * 6 });
  }

  // ---------- far LOD: a coloured box with a roof prism ----------
  const wallRGB: [number, number, number] = wallKey === 'plaster' ? [0.8, 0.75, 0.65] : [0.36, 0.24, 0.17];
  const roofRGB: [number, number, number] = roofKey === 'thatch' ? [0.45, 0.38, 0.24] : roofKey === 'tile' ? [0.22, 0.25, 0.3] : roofKey === 'copper' ? [0.25, 0.45, 0.38] : [0.3, 0.27, 0.28];
  out.far.push(ensureColor(new THREE.BoxGeometry(w, H + plinthH, d).toNonIndexed(), wallRGB).translate(0, F - plinthH + (H + plinthH) / 2, 0));
  const prism = new THREE.CylinderGeometry(0.01, half * 1.0, w + ov * 2, 3, 1).toNonIndexed();
  prism.rotateZ(Math.PI / 2); prism.rotateX(Math.PI / 6 + Math.PI);
  prism.scale(1, rise / (half * 0.5), 1);
  out.far.push(ensureColor(prism, roofRGB).translate(0, roofY + rise * 0.33, 0));

  out.parts = L;
  return transform(out, s);
}

/** Turn and move everything from local to world space. */
function transform(o: HouseOut, s: HouseSpec): HouseOut {
  const ang = (s.rot * Math.PI) / 2;
  const c = Math.round(Math.cos(ang)), sn = Math.round(Math.sin(ang));
  const pt = (x: number, z: number): [number, number] => [s.x + x * c + z * sn, s.z - x * sn + z * c];
  const rect = (x0: number, z0: number, x1: number, z1: number): Rect => {
    const [ax, az] = pt(x0, z0), [bx, bz] = pt(x1, z1);
    return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
  };
  const m = new THREE.Matrix4().makeRotationY(ang).setPosition(s.x, 0, s.z);
  for (const list of [...Object.values(o.parts), o.night, o.far, o.farWin]) for (const g of list!) g.applyMatrix4(m);
  o.decks = o.decks.map(([a, b, c2, d, y]) => [...rect(a, b, c2, d), y] as [number, number, number, number, number]);
  o.colliders = o.colliders.map((k) => { const [x0, z0, x1, z1] = rect(k.x0, k.z0, k.x1, k.z1); return { x0, z0, x1, z1, top: k.top }; });
  for (const l of o.lights) { const [x, z] = pt(l.pos.x, l.pos.z); l.pos.set(x, l.pos.y, z); }
  for (const dr of o.doors) { const [x, z] = pt(dr.pos.x, dr.pos.z); dr.pos.set(x, dr.pos.y, z); dr.slide.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang); dr.rot = ang; }
  for (const st of o.sits) { const [x, z] = pt(st.x, st.z); st.x = x; st.z = z; st.yaw += ang; }
  o.rooms = o.rooms.map((rm) => ({ r: rect(...rm.r), y0: rm.y0, y1: rm.y1 }));
  o.footprint = rect(-s.w / 2 - 0.2, -s.d / 2 - 0.2, s.w / 2 + 0.2, s.d / 2 + 2.5);
  return o;
}

export type { MatKey, Rng };
export { andon };
