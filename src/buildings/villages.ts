/**
 * Villages at runtime (SPEC §7): lays out every village and the roads between them, builds
 * near meshes (merged per material, interiors included), far meshes (coloured blocks with
 * window dots that glow at night), sliding doors that open as you approach, futons that
 * appear at night, lights, and the queries the player and audio need (floors, walls, indoors).
 */
import * as THREE from 'three';
import { litMaterial } from '../render/materials';
import { toTexture, woodPlanks, verticalPlanks, shingles, shoji, lanternPaper, stone } from '../render/textures';
import { plaster, thatch, kawara, tatami, dirt, noren, copperRoof } from './buildingTextures';
import { boxUV, andon, mergeGeoms } from './kit';
import { buildHouse, type Light, type Sit, type Door } from './house';
import type { MatKey } from './props';
import { layoutVillage, type VillageLayout } from './layout';
import { VILLAGES, ROAD_LINKS } from './data/villages';
import { findRoad, roadMeshes, type Path } from './roads';
import { Clearings, type Rect } from '../world/clearings';
import { U } from '../render/uniforms';
import type { World } from '../world/heightfield';

const NEAR = 480;

/** The highest deck at (x, z) that someone with feet at `feet` can stand on (≤ a step up). */
export function deckAt(decks: [number, number, number, number, number][], x: number, z: number, feet = Infinity): number {
  let h = -Infinity;
  for (const [x0, z0, x1, z1, y] of decks) if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && y > h && y <= feet + 0.65) h = y;
  return h;
}

export type Lantern = { village: string; pos: THREE.Vector3; lit: boolean; light: Light; start: number; count: number; mesh: THREE.Mesh | null };
const AMBER = new THREE.Color(1.0, 0.6, 0.24);

type VillageRT = {
  layout: VillageLayout;
  center: THREE.Vector3;
  near: THREE.Group;
  far: THREE.Group;
  night: THREE.Mesh | null;
  doors: { mesh: THREE.Mesh; door: Door; open: number }[];
};

export class Villages {
  readonly group = new THREE.Group();
  readonly clearings = new Clearings();
  readonly villages: VillageRT[] = [];
  /** round obstacles: lantern posts, torii posts (for collision) */
  readonly posts: { x: number; z: number; r: number; top: number }[] = [];
  readonly decks: [number, number, number, number, number][] = [];
  readonly colliders: { x0: number; z0: number; x1: number; z1: number; top: number }[] = [];
  readonly lights: Light[] = [];
  readonly sits: Sit[] = [];
  readonly rooms: { r: Rect; y0: number; y1: number }[] = [];
  readonly roads: { path: Path; chunks: THREE.Mesh[] }[] = [];
  readonly emitters: THREE.Vector3[] = [];
  /** street lanterns, each lit or out */
  readonly lanterns: Lantern[] = [];
  private M: Record<MatKey | 'far' | 'farWin' | 'road' | 'door' | 'vermilion', THREE.ShaderMaterial>;

  constructor(private world: World, seed: number, dock: THREE.Vector3) {
    this.group.name = 'villages';
    const T = {
      wood: toTexture(verticalPlanks('house-wall', 0x7a5238)), dark: toTexture(woodPlanks('house-dark', 0x4a3226)),
      plaster: toTexture(plaster()), thatch: toTexture(thatch()), tile: toTexture(kawara()), shingle: toTexture(shingles('house-roof', 0x6e6266)),
      copper: toTexture(copperRoof()), shoji: toTexture(shoji()), tatami: toTexture(tatami()), floor: toTexture(woodPlanks('house-floor', 0x9a6e4a)),
      stone: toTexture(stone('plinth', 0x8a8680)), paper: toTexture(lanternPaper()), road: toTexture(dirt()), noren: toTexture(noren()),
    };
    const D = THREE.DoubleSide;
    this.M = {
      wood: litMaterial({ map: T.wood, outline: true, side: D }), darkwood: litMaterial({ map: T.dark, outline: true, side: D }),
      plaster: litMaterial({ map: T.plaster, outline: true, side: D }), thatch: litMaterial({ map: T.thatch, outline: true, side: D }),
      tile: litMaterial({ map: T.tile, outline: true, side: D }), shingle: litMaterial({ map: T.shingle, outline: true, side: D }),
      copper: litMaterial({ map: T.copper, outline: true, side: D }),
      shoji: litMaterial({ map: T.shoji, emissive: new THREE.Color(1.0, 0.7, 0.42), emissiveIntensity: 1.7, lampDriven: true, dayGlow: 0.3, outline: true, side: D }),
      tatami: litMaterial({ map: T.tatami }), floor: litMaterial({ map: T.floor, side: D }), stone: litMaterial({ map: T.stone, outline: true }),
      paper: litMaterial({ map: T.paper, emissive: AMBER, emissiveIntensity: 3.5, flicker: true, lampDriven: true, sss: 0.6 }),
      cloth: litMaterial({ map: T.noren, sss: 0.3, side: D }), water: litMaterial({ tint: 0x5a7a8a }),
      far: litMaterial({ outline: true }), farWin: litMaterial({ emissive: new THREE.Color(1.0, 0.62, 0.3), emissiveIntensity: 2.4, lampDriven: true, tint: 0x2a2420 }),
      road: litMaterial({ map: T.road }), door: litMaterial({ map: T.shoji, emissive: new THREE.Color(1.0, 0.7, 0.42), emissiveIntensity: 1.0, lampDriven: true, dayGlow: 0.3, outline: true, side: D }),
      vermilion: litMaterial({ tint: 0xc0422a, outline: true }),
    };
    // cloth uses vertex colours (cushions, scrolls); only the noren strip shows the crest
    this.M.cloth.uniforms.uHasMap!.value = 0;
    this.M.road.polygonOffset = true; this.M.road.polygonOffsetFactor = -2; this.M.road.polygonOffsetUnits = -4;

    for (const def of VILLAGES) {
      const layout = layoutVillage(def, world.height, seed, world.hydro.riverDist);
      this.villages.push(this.build(layout));
    }
    this.buildRoads(dock);
  }

  private build(layout: VillageLayout): VillageRT {
    const parts: Partial<Record<MatKey, THREE.BufferGeometry[]>> = {};
    const night: THREE.BufferGeometry[] = [], far: THREE.BufferGeometry[] = [], farWin: THREE.BufferGeometry[] = [];
    const rt: VillageRT = { layout, center: new THREE.Vector3(layout.def.x, this.world.height(layout.def.x, layout.def.z), layout.def.z), near: new THREE.Group(), far: new THREE.Group(), night: null, doors: [] };
    for (const spec of layout.houses) {
      const h = buildHouse(spec, this.world.height);
      for (const [k, list] of Object.entries(h.parts) as [MatKey, THREE.BufferGeometry[]][]) (parts[k] ??= []).push(...list);
      night.push(...h.night); far.push(...h.far); farWin.push(...h.farWin);
      this.decks.push(...h.decks); this.colliders.push(...h.colliders); this.lights.push(...h.lights);
      this.sits.push(...h.sits); this.rooms.push(...h.rooms);
      this.clearings.rects.push(h.footprint);
      for (const d of h.doors) {
        const g = boxUV(d.w * 0.5, d.h, 0.05, 1).translate(-d.w * 0.25, 0, 0.03);
        const m = new THREE.Mesh(g, this.M.door);
        m.position.copy(d.pos); m.rotation.y = d.rot;
        m.userData.castShadow = true;
        rt.near.add(m);
        rt.doors.push({ mesh: m, door: d, open: 0 });
      }
      if (spec.type === 'onsen') this.emitters.push(new THREE.Vector3(spec.x, spec.floorY + 2.4, spec.z));
    }
    // lantern posts, the well and the torii
    const post: THREE.BufferGeometry[] = [], lamp: THREE.BufferGeometry[] = [], verm: THREE.BufferGeometry[] = [];
    const lanternRecs: Lantern[] = [];
    const an = andon(0.32, 0.42);
    for (const l of layout.lanterns) {
      post.push(boxUV(0.14, 1.3, 0.14, 1).translate(l.x, l.y + 0.65, l.z));
      this.posts.push({ x: l.x, z: l.z, r: 0.12, top: l.y + 1.8 });
      lamp.push(an.clone().translate(l.x, l.y + 1.3, l.z));
      const light = { pos: new THREE.Vector3(l.x, l.y + 1.65, l.z), color: AMBER.clone(), radius: 8, intensity: 1.8, halo: 1.2, phase: l.x };
      this.lights.push(light);
      lanternRecs.push({ village: layout.def.id, pos: new THREE.Vector3(l.x, l.y + 1.5, l.z), lit: true, light, start: 0, count: 0, mesh: null });
    }
    const wl = layout.well;
    (parts.stone ??= []).push(new THREE.CylinderGeometry(0.8, 0.85, 0.8, 10, 1, true).toNonIndexed().translate(wl.x, wl.y + 0.4, wl.z));
    for (const sx of [-0.75, 0.75]) post.push(boxUV(0.12, 2.2, 0.12, 1).translate(wl.x + sx, wl.y + 1.1, wl.z));
    post.push(boxUV(1.9, 0.1, 1.2, 1).translate(wl.x, wl.y + 2.25, wl.z));
    this.colliders.push({ x0: wl.x - 0.9, z0: wl.z - 0.9, x1: wl.x + 0.9, z1: wl.z + 0.9, top: wl.y + 0.8 });
    this.clearings.rects.push([layout.def.x - 12, layout.def.z - 12, layout.def.x + 12, layout.def.z + 12]);
    if (layout.torii) {
      const t = layout.torii;
      const g: THREE.BufferGeometry[] = [];
      for (const sx of [-1.6, 1.6]) g.push(new THREE.CylinderGeometry(0.17, 0.2, 3.6, 8).toNonIndexed().translate(sx, 1.8, 0));
      for (const sx of [-1.6, 1.6]) this.posts.push({ x: t.x + Math.cos(t.rot) * sx, z: t.z - Math.sin(t.rot) * sx, r: 0.2, top: t.y + 3.6 });
      g.push(boxUV(4.6, 0.26, 0.4, 1).translate(0, 3.55, 0)); // kasagi
      g.push(boxUV(3.8, 0.2, 0.25, 1).translate(0, 2.9, 0));  // nuki
      for (const p of g) verm.push(p.rotateY(t.rot).translate(t.x, t.y, t.z));
    }
    if (post.length) (parts.darkwood ??= []).push(...post);
    if (lamp.length) {
      // lantern posts get their own mesh so each can be lit or put out (the lantern maker's round)
      let start = 0;
      lamp.forEach((g, i) => { const n = g.index ? g.index.count : g.getAttribute('position').count; lanternRecs[i]!.start = start; lanternRecs[i]!.count = n; start += n; });
      const m = new THREE.Mesh(mergeGeoms(lamp), this.M.paper);
      m.name = 'village-lanterns';
      const col = m.geometry.getAttribute('aColor') as THREE.BufferAttribute;
      m.userData.alpha = Float32Array.from({ length: col.count }, (_, i) => col.getW(i));
      for (const l of lanternRecs) { l.mesh = m; this.lanterns.push(l); }
      rt.near.add(m);
    }
    const nearMeshes: THREE.Mesh[] = [];
    for (const [k, list] of Object.entries(parts) as [MatKey, THREE.BufferGeometry[]][]) {
      if (!list.length) continue;
      const m = new THREE.Mesh(mergeGeoms(list), this.M[k]);
      m.name = 'village-' + k;
      m.userData.castShadow = k !== 'paper' && k !== 'tatami' && k !== 'water';
      nearMeshes.push(m);
    }
    if (verm.length) { const m = new THREE.Mesh(mergeGeoms(verm), this.M.vermilion); m.userData.castShadow = true; nearMeshes.push(m); }
    rt.near.add(...nearMeshes);
    if (night.length) { rt.night = new THREE.Mesh(mergeGeoms(night), this.M.cloth); rt.near.add(rt.night); }
    const farMesh = new THREE.Mesh(mergeGeoms(far), this.M.far);
    const winMesh = new THREE.Mesh(mergeGeoms(farWin), this.M.farWin);
    farMesh.userData.noReflect = winMesh.userData.noReflect = true;
    rt.far.add(farMesh, winMesh);
    rt.near.name = layout.def.id + '-near'; rt.far.name = layout.def.id + '-far';
    this.group.add(rt.near, rt.far);
    return rt;
  }

  private buildRoads(dock: THREE.Vector3): void {
    const center = (id: string): [number, number] => {
      if (id === 'dock') return [dock.x + 10, dock.z + 20];
      if (id === 'castle') return [-150, -1000];
      const v = VILLAGES.find((v) => v.id === id)!;
      return [v.x, v.z];
    };
    /** Where a road leaves a place towards (tx, tz): the nearest end of one of its streets. */
    const at = (id: string, tx: number, tz: number): [number, number] => {
      const v = this.villages.find((v) => v.layout.def.id === id);
      if (!v) return center(id);
      let best = center(id), bd = Infinity;
      for (const st of v.layout.streets) for (const e of [st[0]!, st[st.length - 1]!]) {
        const d = Math.hypot(e[0] - tx, e[1] - tz);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    };
    const H = this.world.height;
    const addPath = (path: Path, width: number) => {
      // remember where the paths run (footsteps on packed earth)
      for (let i = 1; i < path.length; i++) {
        const [ax, az] = path[i - 1]!, [bx, bz] = path[i]!, n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5);
        for (let k = 0; k <= n; k++) this.roadCells.add(Math.floor((ax + ((bx - ax) * k) / n) / 2) * 100003 + Math.floor((az + ((bz - az) * k) / n) / 2));
      }
      const meshes: THREE.Mesh[] = [];
      for (const c of roadMeshes(path, width, H, this.world.hydro.waterAt)) {
        const m = new THREE.Mesh(c.geo, this.M.road);
        m.userData.center = c.center; m.userData.radius = c.radius;
        m.userData.noReflect = true;
        meshes.push(m);
        this.group.add(m);
        if (c.bridge) { const b = new THREE.Mesh(c.bridge, this.M.far); b.userData.castShadow = true; b.userData.center = c.center; b.userData.radius = c.radius; meshes.push(b); this.group.add(b); }
        this.decks.push(...c.decks);
      }
      for (let i = 0; i < path.length - 1; i++) this.clearings.segs.push([path[i]![0], path[i]![1], path[i + 1]![0], path[i + 1]![1], width / 2 + 0.5]);
      this.roads.push({ path, chunks: meshes });
    };
    for (const v of this.villages) for (const st of v.layout.streets) addPath(st, 3.4);
    for (const [a, b] of ROAD_LINKS) {
      const [cbx, cbz] = center(b), [ax, az] = at(a, cbx, cbz), [bx, bz] = at(b, ax, az);
      addPath(findRoad(H, ax, az, bx, bz), 2.6);
    }
  }

  /** Per frame: LOD, doors, futons, road chunks, nearby rooms for the shader. */
  update(cam: THREE.Vector3, player: THREE.Vector3, hour: number, dt: number, openers: THREE.Vector3[] = []): void {
    const night = hour > 21.5 || hour < 6.2;
    for (const v of this.villages) {
      const d = Math.hypot(cam.x - v.center.x, cam.z - v.center.z) - v.layout.def.r;
      v.near.visible = d < NEAR;
      v.far.visible = !v.near.visible && d < 6000;
      if (!v.near.visible) continue;
      if (v.night) v.night.visible = night;
      for (const dr of v.doors) {
        const dist = dr.mesh.position.distanceTo(player);
        let want = dist < 2.6 ? 1 : 0;
        if (!want && dist < 60) for (const o of openers) if (Math.abs(o.x - dr.door.pos.x) < 2.2 && Math.abs(o.z - dr.door.pos.z) < 2.2) { want = 1; break; }
        dr.open += (want - dr.open) * Math.min(1, dt * 6);
        dr.mesh.position.copy(dr.door.pos).addScaledVector(dr.door.slide, dr.open);
        dr.mesh.visible = dist < 120;
      }
    }
    for (const r of this.roads) for (const m of r.chunks) {
      const c = m.userData.center as THREE.Vector3;
      m.visible = Math.hypot(cam.x - c.x, cam.z - c.z) < 650 + (m.userData.radius as number);
    }
    // the 8 interiors nearest the camera darken their insides (see indoorAt in the shader)
    const near = this.rooms
      .map((rm) => ({ rm, d: Math.hypot(cam.x - (rm.r[0] + rm.r[2]) / 2, cam.z - (rm.r[1] + rm.r[3]) / 2) }))
      .filter((o) => o.d < 60).sort((a, b) => a.d - b.d).slice(0, 8);
    near.forEach(({ rm }, i) => {
      (U.uRooms.value[i] as THREE.Vector4).set(rm.r[0], rm.r[1], rm.r[2], rm.r[3]);
      (U.uRoomY.value[i] as THREE.Vector2).set(rm.y0, rm.y1);
    });
    U.uRoomCount.value = near.length;
  }

  /** Light or put out one street lantern. */
  setLantern(l: Lantern, lit: boolean): void {
    if (l.lit === lit || !l.mesh) return;
    l.lit = lit;
    l.light.intensity = lit ? 1.8 : 0;
    const col = l.mesh.geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const base = l.mesh.userData.alpha as Float32Array;
    for (let i = l.start; i < l.start + l.count; i++) col.setW(i, lit ? base[i]! : 0);
    col.needsUpdate = true;
  }

  /** Walkable floor height at (x, z) (house floors, steps, bridges), or -Infinity. */
  private roadCells = new Set<number>();
  /** Is (x, z) on a road or village street (2 m cells)? */
  onRoad(x: number, z: number): boolean { return this.roadCells.has(Math.floor(x / 2) * 100003 + Math.floor(z / 2)); }

  floorHeight(x: number, z: number, feet = Infinity): number {
    return deckAt(this.decks, x, z, feet);
  }

  indoors(p: THREE.Vector3): boolean {
    return this.rooms.some((rm) => p.x > rm.r[0] && p.x < rm.r[2] && p.z > rm.r[1] && p.z < rm.r[3] && p.y > rm.y0 && p.y < rm.y1 + 1.2);
  }

  /** Lights within `radius` of p (the pipeline picks the nearest few). */
  lightsNear(p: THREE.Vector3, radius = 150): Light[] {
    return this.lights.filter((l) => Math.abs(l.pos.x - p.x) < radius && Math.abs(l.pos.z - p.z) < radius);
  }
}
