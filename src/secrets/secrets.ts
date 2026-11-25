/**
 * Secrets & discoveries (SPEC §20). Hidden shrines in odd places (offerings restore them over
 * days: a rope, then a candle, then flowers), viewpoints (sit: a slow pan and a haiku in brush
 * text), stone tablets with the castle's story, hidden places (the grottos, the secret garden,
 * the keep balcony) and time/weather secrets (a fox wedding in a sunshower, the temple bell that
 * rings itself in snow, writing that appears on the castle wall by moonlight). Progress shows only
 * as "n of N found".
 */
import * as THREE from 'three';
import { boxUV, mergeGeoms } from '../buildings/kit';
import { litMaterial, ensureColor } from '../render/materials';
import { toTexture, stone } from '../render/textures';
import { createRng, hashString } from '../core/rng';
import { REGIONS } from '../world/data/regions';
import { SHRINE_HAIKU, VIEW_HAIKU, LORE } from './data/texts';
import type { GameWorld } from '../scene/gameWorld';

export type SecretKind = 'shrine' | 'view' | 'tablet' | 'place' | 'moment';
export type Secret = {
  id: string; kind: SecretKind; label: string; pos: THREE.Vector3; yaw: number;
  text: string; region: string;
  /** shrines: restoration level 0..3 and the day of the last offering */
  level: number; lastDay: number;
};

export const KIND_NAMES: Record<SecretKind, string> = { shrine: 'Hidden shrines', view: 'Viewpoints', tablet: 'Stone tablets', place: 'Hidden places', moment: 'Rare moments' };

export class Secrets {
  readonly list: Secret[] = [];
  readonly group = new THREE.Group();
  found = new Set<string>();
  /** shrine state (saved) */
  shrineState: Record<string, { level: number; lastDay: number }> = {};
  onFound: ((s: Secret, n: number, of: number) => void) | null = null;
  private candles = new Map<string, THREE.Mesh>();
  private ropes = new Map<string, THREE.Mesh>();
  private flowers = new Map<string, THREE.Mesh>();
  private M: Record<string, THREE.ShaderMaterial>;

  constructor(private w: GameWorld) {
    this.group.name = 'secrets';
    this.M = {
      stone: litMaterial({ map: toTexture(stone('secret-stone', 0x7a7a70)), outline: true }),
      wood: litMaterial({ tint: 0x6a4a34, outline: true }),
      rope: litMaterial({ tint: 0xe8dcb0, outline: true }),
      candle: litMaterial({ emissive: new THREE.Color(1, 0.6, 0.25), emissiveIntensity: 3, flicker: true, tint: 0xffe0b0 }),
      flower: litMaterial({ tint: 0xe05a4a, outline: true }),
      red: litMaterial({ tint: 0xc0402a }),
    };
    this.place();
    this.build();
  }

  private ground(x: number, z: number): THREE.Vector3 { return new THREE.Vector3(x, this.w.groundHeight(x, z), z); }
  private regionOf(x: number, z: number): string { const r = this.w.world.regionAt(x, z); return r >= 0 ? REGIONS[r]!.id : 'none'; }
  private add(kind: SecretKind, id: string, label: string, pos: THREE.Vector3, text: string, yaw = 0): void {
    this.list.push({ id, kind, label, pos, yaw, text, region: this.regionOf(pos.x, pos.z), level: 0, lastDay: -1 });
  }

  /** The highest point within `r` of (x, z) (coarse search). */
  private peak(x: number, z: number, r: number): THREE.Vector3 {
    let best = this.ground(x, z);
    for (let a = 0; a < 16; a++) for (let d = r / 4; d <= r; d += r / 4) {
      const px = x + Math.cos((a / 16) * Math.PI * 2) * d, pz = z + Math.sin((a / 16) * Math.PI * 2) * d;
      const h = this.w.height(px, pz);
      if (h > best.y && h < 1150) best = new THREE.Vector3(px, h, pz);
    }
    return best;
  }

  private place(): void {
    const W = this.w, S = W.world.sites, L = W.landmarks, dock = W.dock.anchors;
    const grotto = (id: string) => S.grottos.find((g) => g.id === id);
    // ---- hidden shrines (23) ----
    const shrines: [string, string, () => THREE.Vector3][] = [
      ['waterfall', 'Shrine behind the waterfall', () => { const g = grotto('waterfall')!; return new THREE.Vector3(g.x - Math.sin(g.dir) * (g.r - 2), g.floor + 0.2, g.z - Math.cos(g.dir) * (g.r - 2)); }],
      ['ice', 'Shrine in the ice cave', () => { const g = grotto('ice')!; return new THREE.Vector3(g.x - Math.sin(g.dir) * (g.r - 2), g.floor + 0.2, g.z - Math.cos(g.dir) * (g.r - 2)); }],
      ['sea', 'Shrine in the sea cave', () => { const g = grotto('sea')!; return new THREE.Vector3(g.x - Math.sin(g.dir) * (g.r - 2), g.floor + 0.2, g.z - Math.cos(g.dir) * (g.r - 2)); }],
      ['garden', 'Shrine in the secret garden', () => this.ground(S.castle.x - 22, S.castle.z - 34 - 13)],
      ['keep', 'Shrine on the keep’s balcony', () => L.keepTop.clone().add(new THREE.Vector3(2.5, 0, 0.3))],
      ['island', 'Shrine on the wooded island', () => this.ground(-150, 40)],
      ['pine', 'Shrine of the lone pine', () => this.ground(146, -26)],
      ['well', 'Shrine by the market well', () => { const v = W.villages.villages.find((v) => v.layout.def.id === 'ichiba')!.layout.well; return this.ground(v.x + 1.6, v.z - 1.2); }],
      ['peak', 'Shrine on the highest peak', () => this.peak(-400, -4100, 900)],
      ['bamboo', 'Shrine in the bamboo circle', () => this.ground(-2640, 1760)],
      ['cedar', 'Shrine in the giant cedar', () => this.ground(-3400, -260)],
      ['maple', 'Shrine in a maple hollow', () => this.ground(-2500, -2200)],
      ['moor', 'Shrine on the pampas moor', () => this.peak(600, -2600, 200)],
      ['marsh', 'Shrine among the reeds', () => this.ground(3640, 1660)],
      ['tea', 'Shrine above the tea rows', () => this.peak(1500, 3900, 250)],
      ['cherry', 'Shrine of the oldest cherry', () => this.peak(2300, -400, 200)],
      ['hydrangea', 'Shrine on hydrangea hill', () => this.peak(-1300, 2300, 250)],
      ['mirror', 'Shrine of the mirror lakes', () => this.ground(-3700, -3650)],
      ['crater', 'Shrine on the crater rim', () => { let p = this.ground(1900 + 230, -4200); for (let a = 0; a < 12; a++) { const q = this.ground(1900 + Math.cos(a) * 250, -4200 + Math.sin(a) * 250); if (q.y > p.y) p = q; } return p; }],
      ['gull', 'Shrine on gull island', () => this.peak(5350, -1900, 150)],
      ['cliff', 'Shrine on the sea cliffs', () => this.peak(4300, -500, 200)],
      ['ginkgo', 'Shrine of the ginkgo plateau', () => this.ground(-1450, -2950)],
      ['wisteria', 'Shrine in wisteria gorge', () => this.ground(-1700, -1300)],
    ];
    shrines.forEach(([id, label, at], i) => this.add('shrine', 'shrine-' + id, label, at(), SHRINE_HAIKU[i % SHRINE_HAIKU.length]!));

    // ---- viewpoints (26): the keep balcony, the pier, and the best view in every region ----
    this.add('view', 'view-keep', 'The keep’s balcony', L.keepTop.clone(), VIEW_HAIKU[1]!, 0);
    this.add('view', 'view-pier', 'The end of the pier', dock.pierEnd!.clone(), VIEW_HAIKU[25]!, Math.PI);
    REGIONS.forEach((r, i) => {
      if (this.list.filter((s) => s.kind === 'view').length >= 26) return;
      const p = this.peak(r.x, r.z, r.r * 0.55);
      // face the lake from wherever you are (it's always worth seeing)
      const yaw = Math.atan2(-(0 - p.x), -(0 - p.z));
      this.add('view', 'view-' + r.id, r.sub + ' viewpoint', p, VIEW_HAIKU[i % (VIEW_HAIKU.length - 1)]!, yaw);
    });
    // a few more along the main river and the coast
    const up = W.world.hydro.rivers.find((r) => r.id === 'upper');
    if (up) for (const f of [0.35, 0.75]) { const q = up.pts[Math.floor(up.pts.length * f)]!; this.add('view', 'view-river-' + f, 'River bend', this.ground(q.x + q.width + 4, q.z + 3), VIEW_HAIKU[(f * 10) | 0]!, 0); }

    // ---- stone tablets (30): the story, mostly near the castle, shrines and roads ----
    const C = S.castle, r = createRng(0x7ab1e7);
    const tabletAt: (() => THREE.Vector3)[] = [
      () => this.ground(C.x - 3, C.z + 36), () => this.ground(C.x + 10, C.z + 20), () => this.ground(C.x - 26, C.z + 8),
      () => this.ground(C.x + 24, C.z - 20), () => this.ground(dock.pierStart!.x + 3, dock.pierStart!.z + 2), () => this.ground(dock.shore!.x - 6, dock.shore!.z + 9),
      () => this.ground(-200, 20), () => this.ground(-120, -200), () => this.ground(C.x + 16, C.z + 26), () => this.ground(dock.shore!.x + 12, dock.shore!.z + 14),
      () => L.keepTop.clone().add(new THREE.Vector3(-3, 0, 0.2)), () => this.ground(C.x + 28, C.z + 2), () => this.ground(2820, -2660), () => this.ground(C.x - 30, C.z - 20),
      () => this.ground(C.x - 30, C.z + 28),
      () => this.ground(dock.shore!.x + 20, dock.shore!.z + 4), () => this.ground(C.x - 14, C.z - 34 - 6), () => this.ground(C.x - 24, C.z - 34 - 10),
      () => this.ground(-400, 300), () => this.ground(200, 260), () => this.ground(C.x + 2, C.z - 30), () => this.ground(C.x + 30, C.z + 30),
      () => this.ground(2780, -2720), () => this.ground(dock.pierEnd!.x + 2, dock.pierEnd!.z + 1), () => this.ground(2840, -2740), () => this.ground(-500, -3900),
      () => this.ground(-420, 640), () => { const g = grotto('waterfall')!; return new THREE.Vector3(g.x + 2, g.floor + 0.2, g.z + 2); }, () => this.ground(-2900, -2700), () => this.ground(C.x - 33, C.z),
    ];
    LORE.forEach((text, i) => this.add('tablet', 'tablet-' + i, i === LORE.length - 1 ? 'Moss-covered wall' : 'Stone tablet', tabletAt[i]!(), text, r.next() * 6.28));

    // ---- hidden places ----
    for (const g of S.grottos) this.add('place', 'place-' + g.id, g.id === 'waterfall' ? 'The cave behind the waterfall' : g.id === 'ice' ? 'The ice cave' : 'The sea cave', new THREE.Vector3(g.x, g.floor, g.z), '');
    this.add('place', 'place-garden', 'The secret garden', this.ground(C.x - 18, C.z - 34 - 7), '');
    this.add('place', 'place-keep-top', 'The top of the keep', L.keepTop.clone(), '');
    // ---- rare moments ----
    this.add('moment', 'moment-fox-wedding', 'A fox wedding in a sunshower', this.ground(2800, -2700), '');
    this.add('moment', 'moment-snow-bell', 'The bell that rings in the snow', L.bellPos.clone(), '');
    this.add('moment', 'moment-moon-writing', 'Writing in the moonlight', this.ground(C.x - 33, C.z), '');
  }

  private build(): void {
    const parts = new Map<string, THREE.BufferGeometry[]>();
    const add = (k: string, g: THREE.BufferGeometry) => (parts.get(k) ?? parts.set(k, []).get(k)!).push(g);
    for (const s of this.list) {
      const { x, y, z } = s.pos, rot = s.yaw;
      if (s.kind === 'shrine') {
        // hokora: stone base, a small wooden house with a roof, an offering box
        add('stone', boxUV(0.9, 0.5, 0.7, 1).translate(x, y + 0.25, z));
        add('wood', boxUV(0.6, 0.55, 0.5, 1).translate(x, y + 0.78, z));
        const roof = boxUV(0.95, 0.08, 0.8, 1); roof.rotateZ(0.3); add('wood', roof.translate(x - 0.2, y + 1.12, z));
        const roof2 = boxUV(0.95, 0.08, 0.8, 1); roof2.rotateZ(-0.3); add('wood', roof2.translate(x + 0.2, y + 1.12, z));
        add('stone', boxUV(0.4, 0.25, 0.25, 1).translate(x, y + 0.12, z + 0.55));
        // restoration pieces, shown as offerings accumulate
        const mk = (g: THREE.BufferGeometry, m: THREE.ShaderMaterial) => { const me = new THREE.Mesh(ensureColor(g), m); me.visible = false; this.group.add(me); return me; };
        this.ropes.set(s.id, mk(boxUV(0.7, 0.06, 0.06, 1).translate(x, y + 1.02, z + 0.27), this.M.rope));
        this.candles.set(s.id, mk(boxUV(0.06, 0.16, 0.06, 1).translate(x + 0.32, y + 0.58, z + 0.3), this.M.candle));
        this.flowers.set(s.id, mk(new THREE.SphereGeometry(0.1, 5, 4).toNonIndexed().translate(x - 0.3, y + 0.6, z + 0.3), this.M.flower));
      } else if (s.kind === 'view') {
        // a flat stone bench to sit on
        const g = boxUV(1.6, 0.42, 0.55, 1); g.rotateY(rot);
        add('stone', g.translate(x, y + 0.21, z));
      } else if (s.kind === 'tablet') {
        const g = boxUV(0.7, 1.1, 0.18, 1); g.rotateY(rot);
        add('stone', g.translate(x, y + 0.5, z));
      }
    }
    for (const [k, list] of parts) {
      const m = new THREE.Mesh(mergeGeoms(list), this.M[k]!);
      m.userData.castShadow = true;
      m.name = 'secrets-' + k;
      this.group.add(m);
    }
  }

  /** Shrine looks follow their restoration level. */
  refresh(): void {
    for (const s of this.list) if (s.kind === 'shrine') {
      const st = this.shrineState[s.id];
      const lv = st?.level ?? 0;
      this.ropes.get(s.id)!.visible = lv >= 1;
      this.candles.get(s.id)!.visible = lv >= 2;
      this.flowers.get(s.id)!.visible = lv >= 3;
    }
  }

  /** Record a discovery (once). */
  discover(s: Secret): boolean {
    if (this.found.has(s.id)) return false;
    this.found.add(s.id);
    const same = this.list.filter((o) => o.kind === s.kind);
    this.onFound?.(s, same.filter((o) => this.found.has(o.id)).length, same.length);
    return true;
  }

  /** An offering at a shrine: once a day it restores the shrine a little. */
  offer(s: Secret, day: number): boolean {
    const st = (this.shrineState[s.id] ??= { level: 0, lastDay: -1 });
    const fresh = st.lastDay !== day;
    if (fresh) { st.level = Math.min(3, st.level + 1); st.lastDay = day; }
    this.discover(s);
    this.refresh();
    return fresh;
  }

  /** Places discovered just by getting there; moments by being there at the right time. */
  update(player: THREE.Vector3, hour: number, weather: { rain: number; snow: number; cloud: number }, sunshower: boolean): Secret[] {
    const out: Secret[] = [];
    for (const s of this.list) {
      if (this.found.has(s.id)) continue;
      const d = s.pos.distanceTo(player);
      if (s.kind === 'place' && d < (s.id === 'place-keep-top' ? 4 : 8)) { if (this.discover(s)) out.push(s); }
      if (s.kind === 'moment' && d < 40) {
        const ok = s.id === 'moment-fox-wedding' ? sunshower
          : s.id === 'moment-snow-bell' ? weather.snow > 0.3
          : (hour > 20 || hour < 4) && weather.cloud < 0.6;
        if (ok && this.discover(s)) out.push(s);
      }
    }
    return out;
  }

  counts(): Record<SecretKind, [number, number]> {
    const c = {} as Record<SecretKind, [number, number]>;
    for (const k of Object.keys(KIND_NAMES) as SecretKind[]) {
      const all = this.list.filter((s) => s.kind === k);
      c[k] = [all.filter((s) => this.found.has(s.id)).length, all.length];
    }
    return c;
  }

  near(p: THREE.Vector3, r: number): Secret[] { return this.list.filter((s) => s.kind !== 'place' && s.kind !== 'moment' && s.pos.distanceTo(p) < r); }

  static seedOf(id: string): number { return hashString(id); }
}
