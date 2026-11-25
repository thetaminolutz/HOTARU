/**
 * Landmarks (SPEC §6.10, §6.14, §20): the ruined castle Kagejō (battered stone walls with
 * gaps, a gatehouse, an overgrown courtyard, a five-storey keep you can climb to its balcony,
 * the inner garden with its pond, and the secret garden behind a hidden gate), the temple
 * stairway at Kumoji with its hall, five-storey pagoda and bell tower, and the rock domes of
 * the three grottos. Everything walkable registers decks; walls register colliders.
 */
import * as THREE from 'three';
import { boxUV, mergeGeoms, andon } from './kit';
import { litMaterial, ensureColor } from '../render/materials';
import { toTexture, stone, woodPlanks, verticalPlanks } from '../render/textures';
import { plaster, kawara, copperRoof } from './buildingTextures';
import { createRng } from '../core/rng';
import type { World } from '../world/heightfield';
import type { Light } from './house';

type Deck = [number, number, number, number, number];
type Col = { x0: number; z0: number; x1: number; z1: number; top: number };
export type Spot = { id: string; pos: THREE.Vector3; label: string };

const AMBER = new THREE.Color(1, 0.6, 0.24);

export class Landmarks {
  readonly group = new THREE.Group();
  readonly decks: Deck[] = [];
  readonly colliders: Col[] = [];
  readonly lights: Light[] = [];
  /** interaction spots: the bell, the hidden gate, the keep's hidden panel */
  readonly spots: Spot[] = [];
  /** the hidden gate (slides when found) */
  gate: THREE.Mesh | null = null;
  gateOpen = 0;
  bellPos = new THREE.Vector3();
  readonly keepTop = new THREE.Vector3();
  readonly keepCenter = new THREE.Vector3();
  /** ground kept free of trees and grass (stairway, temple terrace) */
  readonly clear: { rects: [number, number, number, number][]; segs: [number, number, number, number, number][] } = { rects: [], segs: [] };
  private parts = new Map<string, THREE.BufferGeometry[]>();
  private M: Record<string, THREE.ShaderMaterial>;

  constructor(private w: World, readonly temple: { x: number; z: number; rot: number } | null) {
    const D = THREE.DoubleSide;
    this.M = {
      stone: litMaterial({ map: toTexture(stone('castle-stone', 0x8a8478)), outline: true }),
      mossy: litMaterial({ map: toTexture(stone('moss-stone', 0x6a7a58)), outline: true }),
      plaster: litMaterial({ map: toTexture(plaster('castle-plaster', 0xe4dccc)), outline: true, side: D }),
      tile: litMaterial({ map: toTexture(kawara('castle-tile', 0x4a5260)), outline: true, side: D }),
      copper: litMaterial({ map: toTexture(copperRoof()), outline: true, side: D }),
      wood: litMaterial({ map: toTexture(verticalPlanks('castle-wood', 0x4a3226)), outline: true, side: D }),
      floor: litMaterial({ map: toTexture(woodPlanks('castle-floor', 0x7a5638)), side: D }),
      vermilion: litMaterial({ tint: 0xb8402a, outline: true }),
      paper: litMaterial({ emissive: AMBER, emissiveIntensity: 3, lampDriven: true, flicker: true }),
      rock: litMaterial({ map: toTexture(stone('cave-rock', 0x5a5650)), side: D, outline: true }),
      ice: litMaterial({ map: toTexture(stone('cave-ice', 0x9ab8d0)), side: D, sss: 0.6, outline: true }),
      glow: litMaterial({ emissive: new THREE.Color(0.45, 0.9, 0.8), emissiveIntensity: 2.2, tint: 0x9ae0d0 }),
      water: litMaterial({ tint: 0x2a4a5a }),
      bronze: litMaterial({ tint: 0x5a6a50, outline: true }),
    };
    this.castle();
    if (temple) this.templeGrounds(temple.x, temple.z, temple.rot);
    for (const g of w.sites.grottos) this.grotto(g.id, g.x, g.z, g.r, g.floor, g.dir);
    for (const [k, list] of this.parts) {
      const m = new THREE.Mesh(mergeGeoms(list), this.M[k]!);
      m.name = 'landmark-' + k;
      m.userData.castShadow = k !== 'paper' && k !== 'glow';
      this.group.add(m);
    }
  }

  private add(k: string, g: THREE.BufferGeometry): void { (this.parts.get(k) ?? this.parts.set(k, []).get(k)!).push(g); }
  private box(k: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0): void {
    const g = boxUV(sx, sy, sz, 2);
    if (ry) g.rotateY(ry);
    this.add(k, g.translate(x, y, z));
  }
  /** A battered (outward-sloping) stone wall from (ax,az) to (bx,bz), base on the ground. */
  private wall(ax: number, az: number, bx: number, bz: number, top: number, thick: number, gaps: number[] = []): void {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 4), ang = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i < n; i++) {
      if (gaps.includes(i)) continue;
      const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const g = this.w.height(x, z), h = top - g + 0.4;
      // three courses, each a little narrower (battered ishigaki)
      for (let c = 0; c < 3; c++) {
        const ch = h / 3, k = 1 - c * 0.18;
        const gg = boxUV(thick * k, ch + 0.05, len / n + 0.05, 2);
        gg.rotateY(ang);
        this.add(c === 2 && i % 3 === 0 ? 'mossy' : 'stone', gg.translate(x, g - 0.4 + ch * (c + 0.5), z));
      }
      const hw = (len / n) / 2 + 0.1, ht = thick / 2;
      const ca = Math.abs(Math.cos(ang)), sa = Math.abs(Math.sin(ang));
      this.colliders.push({ x0: x - (ca * ht + sa * hw), z0: z - (sa * ht + ca * hw), x1: x + (ca * ht + sa * hw), z1: z + (sa * ht + ca * hw), top: top + 1 });
    }
  }

  // ---------- the castle ----------
  private castle(): void {
    const S = this.w.sites.castle, L = S.level, cx = S.x, cz = S.z;
    const half = 34;
    // outer walls, broken in places; the gate faces the lake (south, +z)
    const top = L + 3.2;
    this.wall(cx - half, cz - half, cx + half, cz - half, top, 3, [3, 4]);           // north (gap hides the secret gate)
    this.wall(cx + half, cz - half, cx + half, cz + half, top, 3, [6]);              // east (a collapse)
    this.wall(cx - half, cz + half, cx - half, cz - half, top, 3, [1]);              // west
    this.wall(cx - half, cz + half, cx - 5, cz + half, top, 3);                       // south, left of the gate
    this.wall(cx + 5, cz + half, cx + half, cz + half, top, 3, [4]);                  // south, right of the gate
    // gatehouse over the south opening
    this.box('stone', cx - 6.5, L + 1.6, cz + half, 3, 3.6, 4);
    this.box('stone', cx + 6.5, L + 1.6, cz + half, 3, 3.6, 4);
    this.box('plaster', cx, L + 4.8, cz + half, 16, 2.6, 4.6);
    this.box('tile', cx, L + 6.6, cz + half, 17.5, 0.5, 6, 0);
    this.box('tile', cx, L + 7.1, cz + half, 15, 0.4, 3.6, 0);
    this.box('wood', cx, L + 3.4, cz + half + 2.35, 10, 0.3, 0.2);
    // the keep (tenshu) on a battered stone base, five storeys climbing to a balcony
    const kx = cx + 4, kz = cz - 8, base = 6, bw = 18;
    this.keepCenter.set(kx, L + base, kz);
    for (let c = 0; c < 4; c++) this.box('stone', kx, L + (c + 0.5) * (base / 4), kz, bw - c * 1.2, base / 4 + 0.02, bw - c * 1.2);
    this.colliders.push({ x0: kx - bw / 2, z0: kz - bw / 2, x1: kx + bw / 2, z1: kz + bw / 2, top: L + base - 0.2 });
    // a stone stair up the base on the south side
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const y = L + (i + 1) * (base / steps), z0 = kz + bw / 2 + 6 - i * 0.3;
      this.box('stone', kx, y - 0.15, z0 - 0.15, 3, 0.3, 0.32);
      this.decks.push([kx - 1.5, z0 - 0.3, kx + 1.5, z0, y]);
    }
    let fy = L + base, fw = bw - 4;
    for (let f = 0; f < 5; f++) {
      const fh = f === 4 ? 3 : 3.4;
      // floor, walls with windows (open at the stair), a roof skirt with upturned corners
      this.box('floor', kx, fy - 0.08, kz, fw, 0.16, fw);
      this.decks.push([kx - fw / 2, kz - fw / 2, kx + fw / 2, kz + fw / 2, fy]);
      const wl = (x: number, z: number, sx: number, sz: number) => this.box('plaster', x, fy + fh / 2, z, sx, fh, sz);
      const d = fw / 2;
      wl(kx, kz - d, fw, 0.3); wl(kx - d, kz, 0.3, fw); wl(kx + d, kz, 0.3, fw);
      // south wall with a doorway (the way in, and the balcony door above)
      wl(kx - d / 2 - 0.8, kz + d, d - 1.6, 0.3); wl(kx + d / 2 + 0.8, kz + d, d - 1.6, 0.3);
      this.box('plaster', kx, fy + fh - 0.5, kz + d, 3.2, 1, 0.3);
      for (const [x0, z0, x1, z1] of [[kx - d, kz - d - 0.2, kx + d, kz - d + 0.2], [kx - d - 0.2, kz - d, kx - d + 0.2, kz + d], [kx + d - 0.2, kz - d, kx + d + 0.2, kz + d], [kx - d, kz + d - 0.2, kx - 1.6, kz + d + 0.2], [kx + 1.6, kz + d - 0.2, kx + d, kz + d + 0.2]] as const) {
        this.colliders.push({ x0, z0, x1, z1, top: fy + fh });
      }
      // dark window bands
      for (const s of [-1, 1]) this.box('wood', kx + s * d * 0.5, fy + fh * 0.55, kz - d - 0.17, d * 0.5, 0.9, 0.05);
      // roof skirt
      const rw = fw + 3.2;
      this.box('tile', kx, fy + fh + 0.25, kz, rw, 0.4, rw);
      this.box('tile', kx, fy + fh + 0.6, kz, rw - 2, 0.4, rw - 2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box('tile', kx + sx * rw / 2, fy + fh + 0.55, kz + sz * rw / 2, 0.8, 0.5, 0.8);
      // stairs inside, along the west wall, to the next floor
      if (f < 4) {
        const n = 12;
        for (let i = 0; i < n; i++) {
          const y = fy + ((i + 1) / n) * (fh + 0.5), z = kz + d - 1.5 - i * ((fw - 3) / n);
          this.box('floor', kx - d + 1.2, y - 0.1, z, 1.8, 0.2, (fw - 3) / n + 0.05);
          this.decks.push([kx - d + 0.3, z - (fw - 3) / n / 2, kx - d + 2.1, z + (fw - 3) / n / 2, y]);
        }
      }
      fy += fh + 0.5;
      fw -= 1.6;
    }
    // the top roof and a ridge with shachi ornaments
    this.box('tile', kx, fy + 0.6, kz, fw + 2.4, 1.2, fw + 2.4);
    this.box('tile', kx, fy + 1.4, kz, fw * 0.6, 0.6, fw + 1);
    for (const s of [-1, 1]) this.box('bronze', kx, fy + 1.9, kz + s * (fw / 2 + 0.2), 0.4, 0.8, 0.3);
    // the balcony (top floor's south side) — the view over the lake
    const bal = fy - 3.5;
    this.box('floor', kx, bal - 0.08, kz + (fw + 2.6) / 2 + 1.1, fw + 2.6, 0.16, 2.2);
    this.decks.push([kx - (fw + 2.6) / 2, kz + (fw + 2.6) / 2, kx + (fw + 2.6) / 2, kz + (fw + 2.6) / 2 + 2.2, bal]);
    this.box('wood', kx, bal + 0.5, kz + (fw + 2.6) / 2 + 2.15, fw + 2.6, 0.1, 0.1);
    this.colliders.push({ x0: kx - (fw + 2.6) / 2, z0: kz + (fw + 2.6) / 2 + 2.1, x1: kx + (fw + 2.6) / 2, z1: kz + (fw + 2.6) / 2 + 2.3, top: bal + 1 });
    this.keepTop.set(kx, bal, kz + (fw + 2.6) / 2 + 1.1);
    // the inner garden: a stone-edged pond, a stone lantern, flat stepping stones
    const gx = cx - 16, gz = cz + 12;
    this.box('mossy', gx, L - 0.25, gz, 11, 0.5, 8);
    this.box('water', gx, L + 0.08, gz, 10, 0.06, 7);
    this.colliders.push({ x0: gx - 5, z0: gz - 3.5, x1: gx + 5, z1: gz + 3.5, top: L + 0.6 });
    this.lantern(gx + 7, gz - 3, L);
    for (let i = 0; i < 5; i++) this.box('mossy', gx - 6 + i * 2.6, L + 0.05, gz + 6 + (i % 2) * 0.6, 1.4, 0.12, 1.1);
    // the secret garden beyond the north wall, through a hidden gate (closed until found)
    const sgx = cx - 18, sgz = cz - half - 9;
    this.wall(sgx - 9, sgz - 8, sgx + 9, sgz - 8, L + 2.4, 1.6);
    this.wall(sgx - 9, sgz + 6, sgx - 9, sgz - 8, L + 2.4, 1.6);
    this.wall(sgx + 9, sgz - 8, sgx + 9, sgz + 6, L + 2.4, 1.6);
    this.lantern(sgx, sgz - 4, L);
    this.box('mossy', sgx + 4, L + 0.4, sgz - 2, 1.6, 0.8, 1.1);
    const gate = new THREE.Mesh(ensureColor(boxUV(8, 3.6, 0.5, 2)), this.M.wood);
    gate.position.set(cx - 18, L + 1.8, cz - half);
    gate.userData.castShadow = true;
    this.group.add(gate);
    this.gate = gate;
    this.colliders.push(this.gateCollider = { x0: cx - 22, z0: cz - half - 0.6, x1: cx - 14, z1: cz - half + 0.6, top: L + 4 });
    this.spots.push({ id: 'hidden-gate', pos: new THREE.Vector3(cx - 18, L + 1.5, cz - half + 1), label: 'Push the ivy-covered panel' });
  }
  private gateCollider: Col | null = null;

  /** Open the hidden gate (once found). */
  openGate(): void {
    if (this.gateCollider) { this.gateCollider.top = -1e9; this.gateCollider = null; }
    this.gateOpen = 1;
  }

  update(dt: number): void {
    if (this.gate && this.gateOpen > 0) {
      const target = this.gate.userData.baseX ??= this.gate.position.x;
      this.gate.position.x += (target - 7.5 - this.gate.position.x) * Math.min(1, dt * 1.5);
    }
  }

  private lantern(x: number, z: number, y: number): void {
    this.box('stone', x, y + 0.5, z, 0.5, 1, 0.5);
    this.add('paper', andon(0.4, 0.4).translate(x, y + 1, z));
    this.box('stone', x, y + 1.6, z, 0.9, 0.2, 0.9);
    this.lights.push({ pos: new THREE.Vector3(x, y + 1.3, z), color: AMBER.clone(), radius: 7, intensity: 1.5, halo: 0.8, phase: x });
  }

  // ---------- the temple at Kumoji ----------
  private templeGrounds(tx: number, tz: number, rot: number): void {
    // the stairway leaves the torii away from the village, up the slope
    const ax = Math.sin(rot), az = Math.cos(rot);
    let y = this.w.height(tx, tz), x = tx, z = tz;
    const steps: THREE.Vector3[] = [];
    for (let i = 0; i < 70; i++) {
      x += ax * 0.6; z += az * 0.6;
      const g = this.w.height(x, z);
      y = Math.max(y, Math.min(g + 0.2, y + 0.3));
      steps.push(new THREE.Vector3(x, y, z));
    }
    this.clear.segs.push([tx, tz, steps[steps.length - 1]!.x, steps[steps.length - 1]!.z, 4]);
    for (const s of steps) {
      this.box('stone', s.x, s.y - 0.8, s.z, 3.2, 1.6, 0.66, rot);
      this.decks.push([s.x - 1.6, s.z - 1.6, s.x + 1.6, s.z + 1.6, s.y]);
    }
    for (let i = 8; i < steps.length; i += 14) for (const sd of [-1, 1]) {
      const s = steps[i]!, lx = s.x + az * 2.4 * sd, lz = s.z - ax * 2.4 * sd;
      this.lantern(lx, lz, this.w.height(lx, lz));
    }
    // the hall and pagoda on the terrace at the top
    const top = steps[steps.length - 1]!;
    const hx = top.x + ax * 14, hz = top.z + az * 14, hy = top.y;
    this.box('stone', hx, hy - 1, hz, 26, 2.2, 26);
    this.clear.rects.push([hx - 16, hz - 16, hx + 16, hz + 16]);
    this.decks.push([hx - 13, hz - 13, hx + 13, hz + 13, hy + 0.1]);
    // main hall
    const mx = hx + az * 4, mz = hz - ax * 4;
    this.box('wood', mx, hy + 2.2, mz, 10, 4.2, 8, rot);
    this.box('copper', mx, hy + 4.8, mz, 14, 0.6, 12, rot);
    this.box('copper', mx, hy + 5.6, mz, 10, 1.2, 7, rot);
    this.colliders.push({ x0: mx - 5.5, z0: mz - 5.5, x1: mx + 5.5, z1: mz + 5.5, top: hy + 6 });
    // five-storey pagoda
    const px = hx - az * 7, pz = hz + ax * 7;
    let py = hy, pw = 5.5;
    for (let f = 0; f < 5; f++) {
      this.box('vermilion', px, py + 1.2, pz, pw * 0.6, 2.4, pw * 0.6, rot);
      this.box('copper', px, py + 2.55, pz, pw + 1.6, 0.35, pw + 1.6, rot);
      py += 2.6; pw -= 0.6;
    }
    this.box('bronze', px, py + 1.8, pz, 0.25, 3.6, 0.25);
    this.colliders.push({ x0: px - 2, z0: pz - 2, x1: px + 2, z1: pz + 2, top: py });
    // bell tower
    const bx = hx + ax * 8 - az * 4, bz = hz + az * 8 + ax * 4;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box('vermilion', bx + sx! * 1.6, hy + 1.8, bz + sz! * 1.6, 0.3, 3.6, 0.3);
    this.box('copper', bx, hy + 3.9, bz, 5, 0.4, 5);
    const bell = new THREE.CylinderGeometry(0.75, 0.95, 1.6, 10).toNonIndexed();
    this.add('bronze', ensureColor(bell).translate(bx, hy + 2.6, bz));
    this.bellPos.set(bx, hy + 2.4, bz);
    this.spots.push({ id: 'temple-bell', pos: this.bellPos.clone(), label: 'Ring the bell' });
  }

  // ---------- grottos ----------
  private grotto(id: string, x: number, z: number, r: number, floor: number, dir: number): void {
    const R = r + 1.5, rng = createRng(id.length * 77 + Math.round(x));
    const g = new THREE.SphereGeometry(R, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    // rough rock, squashed, with the mouth cut out towards `dir`
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const k = 1 + (Math.sin(vx * 1.7 + vy * 2.3) * 0.5 + Math.sin(vz * 2.1 - vy) * 0.5) * 0.12;
      pos.setXYZ(i, vx * k, vy * 0.62 * k, vz * k);
    }
    const keep: number[] = [];
    const ax = Math.sin(dir), az = Math.cos(dir);
    for (let t = 0; t < pos.count; t += 3) {
      let mouth = true;
      for (let k = 0; k < 3; k++) {
        const vx = pos.getX(t + k), vy = pos.getY(t + k), vz = pos.getZ(t + k);
        const c = (vx * ax + vz * az) / Math.hypot(vx, vz || 1e-3);
        if (!(c > 0.82 && vy < R * 0.45)) mouth = false;
      }
      if (!mouth) keep.push(t);
    }
    const P: number[] = [];
    for (const t of keep) for (let k = 0; k < 3; k++) P.push(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k));
    const dome = new THREE.BufferGeometry();
    dome.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    dome.setAttribute('uv', new THREE.Float32BufferAttribute(P.map((v, i) => (i % 3 === 1 ? 0 : v / 2)).filter((_, i) => i % 3 !== 1), 2));
    dome.computeVertexNormals();
    ensureColor(dome);
    this.add(id === 'ice' ? 'ice' : 'rock', dome.translate(x, floor - 0.6, z));
    // the dome's thickness: a ring of boulders around its foot (keeps the walls solid to walk against)
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      if (Math.cos(ang - dir) > 0.82) continue;
      this.colliders.push({ x0: x + Math.sin(ang) * R - 1, z0: z + Math.cos(ang) * R - 1, x1: x + Math.sin(ang) * R + 1, z1: z + Math.cos(ang) * R + 1, top: floor + 6 });
    }
    // inside: glowing crystals / mushrooms / icicles and a soft light
    for (let i = 0; i < 14; i++) {
      const a = rng.next() * Math.PI * 2, d = r * (0.5 + rng.next() * 0.45);
      if (Math.cos(a - dir) > 0.7) continue;
      const cx = x + Math.sin(a) * d, cz = z + Math.cos(a) * d;
      const h = 0.4 + rng.next() * 0.9;
      const c = new THREE.ConeGeometry(0.18 + rng.next() * 0.15, h, 5).toNonIndexed();
      if (id === 'ice') { c.rotateX(Math.PI); this.add('ice', ensureColor(c).translate(cx, floor + R * 0.55 - h / 2, cz)); }
      else this.add('glow', ensureColor(c, [1, 1, 1], 1).translate(cx, floor + h / 2, cz));
    }
    this.lights.push({ pos: new THREE.Vector3(x, floor + 1.5, z), color: id === 'ice' ? new THREE.Color(0.6, 0.8, 1) : new THREE.Color(0.4, 1, 0.85), radius: r + 3, intensity: 1.4, halo: 0, phase: 0 });
  }
}
