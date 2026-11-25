/**
 * Ruins of an older Japan (owner request: "old castles and ruins with secrets, I wanna feel like a
 * wanderer in the medieval times"). Seven sites, each settled onto the flattest ground near its
 * anchor, away from villages and water:
 *   - three forts and castles (Takamine in the maple mountains, Kitayama on the hydrangea hills,
 *     the sea fort Umi-toride on the cliffs): broken battered walls, a ruined keep base you can
 *     climb, a collapsed gate;
 *   - a watchtower fort on the pampas moor with a wooden yagura you can climb;
 *   - Kirinoya, an abandoned hamlet in the cedar forest (roofless houses, a dry well, a toppled
 *     torii, and lanterns that light themselves at night);
 *   - a forgotten shrine in the bamboo (fallen torii, broken stair, komainu, a collapsed hall);
 *   - an old temple gate on the ginkgo plateau with a row of weathered jizo.
 * Each hides relics (found by looking closer) and is itself a hidden place.
 * Along the travel roads: jizo statues, milestones, wayside shrines, travellers' teahouses with a
 * bench to rest on, and a sekisho (checkpoint gate) on the road to the castle.
 */
import * as THREE from 'three';
import { boxUV, mergeGeoms, andon } from './kit';
import { litMaterial, ensureColor } from '../render/materials';
import { toTexture, stone, verticalPlanks, woodPlanks } from '../render/textures';
import { thatch, kawara } from './buildingTextures';
import { createRng, type Rng } from '../core/rng';
import { VILLAGES } from './data/villages';
import type { World } from '../world/heightfield';
import type { Light, Sit } from './house';

type Deck = [number, number, number, number, number];
type Col = { x0: number; z0: number; x1: number; z1: number; top: number };
type Circle = { x: number; z: number; r: number; top: number };
export type Relic = { id: string; label: string; text: string; pos: THREE.Vector3 };
export type RuinSite = { id: string; name: string; x: number; z: number; y: number; r: number; relics: Relic[] };

type SiteDef = { id: string; name: string; kind: 'fort' | 'tower' | 'hamlet' | 'shrine' | 'gate'; ax: number; az: number; search: number; r: number; relics: { label: string; text: string }[] };

const SITES: SiteDef[] = [
  { id: 'takamine', name: 'Takamine Fort', kind: 'fort', ax: -2250, az: -1850, search: 420, r: 30, relics: [
    { label: 'A rusted helmet', text: 'A kabuto, rusted to the colour of maple leaves, left on the keep stones facing west as if it were still keeping watch. Scratched small inside the brow: "for my brother, who did not come home."' },
    { label: 'Words on the gate stone', text: 'Takamine. Held for nine winters. Given up in the tenth without a sword drawn, when the lord decided the valley had bled enough. Below, in a newer hand: "He was right."' },
  ] },
  { id: 'kitayama', name: 'Kitayama Castle', kind: 'fort', ax: -1150, az: 2150, search: 380, r: 30, relics: [
    { label: 'A cracked war fan', text: 'A gunbai war fan, its lacquer cracked: a sun painted on one side, a moon on the other. Folded inside, a note: "Today we hold. Tomorrow too. Let them grow bored and go home."' },
    { label: 'Words on the lowest terrace', text: 'Kitayama-jō was never taken. It was simply forgotten, which is a better fate for a castle.' },
  ] },
  { id: 'umi', name: 'Umi-toride, the Sea Fort', kind: 'fort', ax: 4200, az: -450, search: 300, r: 26, relics: [
    { label: 'A salt-white box', text: 'A lacquered box, white with salt, holding a sea chart drawn on silk. Every island is there, and one more that no one has ever found, marked with a single word: "home".' },
    { label: 'Words on the seaward wall', text: 'We watched for ships for thirty years. The ships that came brought rice, and cloth, and once a lost child from the south. We gave her a name and a house. Watch the sea kindly.' },
  ] },
  { id: 'susuki', name: 'The Moor Watchtower', kind: 'tower', ax: 750, az: -2350, search: 350, r: 18, relics: [
    { label: 'A green bronze mirror', text: 'A signal mirror wedged under the tower’s floorboards. From up here a flash could reach Kagejō in a heartbeat. The keeper’s last message, they say, was only: "All quiet. The pampas is beautiful today."' },
  ] },
  { id: 'kirinoya', name: 'Kirinoya, the empty hamlet', kind: 'hamlet', ax: -3050, az: -650, search: 380, r: 26, relics: [
    { label: 'A child’s spinning top', text: 'A wooden top at the bottom of the dry well, painted red once. Kirinoya moved down to the lake the winter the cedar road washed away. The children, they say, still come back in dreams to play.' },
    { label: 'A rice bowl on the hearth', text: 'One bowl left upside down on a cold hearth stone — the old way of saying "we will be back". Nobody came back. The moss has been keeping the place for them.' },
  ] },
  { id: 'takemori', name: 'The forgotten shrine', kind: 'shrine', ax: -2450, az: 1500, search: 320, r: 18, relics: [
    { label: 'A round bronze mirror', text: 'Behind the fallen hall’s altar, a bronze mirror with its face still bright. The kami of this shrine moved to Kumoji long ago, but the mirror stayed. It shows you a little kinder than you are.' },
  ] },
  { id: 'ichomon', name: 'The old temple gate', kind: 'gate', ax: -1350, az: -2800, search: 350, r: 18, relics: [
    { label: 'Prayer beads on the pillar', text: 'Dark wooden beads hang from the broken pillar, their cord renewed by many hands. Every traveller who passes ties one knot. You tie yours.' },
  ] },
];

const GHOST = new THREE.Color(0.55, 0.85, 1.0);
const AMBER = new THREE.Color(1, 0.6, 0.24);

export class Ruins {
  readonly group = new THREE.Group();
  readonly decks: Deck[] = [];
  readonly colliders: Col[] = [];
  readonly circles: Circle[] = [];
  readonly lights: Light[] = [];
  readonly sits: Sit[] = [];
  readonly sites: RuinSite[] = [];
  /** wayside things (jizo, milestones, teahouses, the checkpoint) for the map/POIs */
  readonly wayside: { x: number; z: number; kind: string }[] = [];
  readonly clear: { rects: [number, number, number, number][] } = { rects: [] };
  private parts = new Map<string, THREE.BufferGeometry[]>();
  private M: Record<string, THREE.ShaderMaterial>;
  private meshes: { m: THREE.Mesh; x: number; z: number }[] = [];

  constructor(private w: World, roads: [number, number][][] = []) {
    const D = THREE.DoubleSide;
    this.M = {
      stone: litMaterial({ map: toTexture(stone('ruin-stone', 0x7e7a70)), outline: true }),
      mossy: litMaterial({ map: toTexture(stone('ruin-moss', 0x5e7048)), outline: true }),
      wood: litMaterial({ map: toTexture(verticalPlanks('ruin-wood', 0x5e5246)), outline: true, side: D }),
      dark: litMaterial({ map: toTexture(verticalPlanks('ruin-dark', 0x3a2e28)), outline: true, side: D }),
      floor: litMaterial({ map: toTexture(woodPlanks('ruin-floor', 0x6a5440)), outline: true, side: D }),
      thatch: litMaterial({ map: toTexture(thatch('ruin-thatch', 0x7a6a48)), outline: true, side: D }),
      tile: litMaterial({ map: toTexture(kawara('ruin-tile', 0x4a5058)), outline: true, side: D }),
      faded: litMaterial({ tint: 0x9a4a36, outline: true }),
      vermilion: litMaterial({ tint: 0xc0442c, outline: true }),
      cloth: litMaterial({ tint: 0xc03a2a, outline: true }),
      bronze: litMaterial({ tint: 0x6a7a52, outline: true }),
      iron: litMaterial({ tint: 0x7a4a30, outline: true }),
      ghost: litMaterial({ emissive: GHOST, emissiveIntensity: 2.6, lampDriven: true, flicker: true }),
      paper: litMaterial({ emissive: AMBER, emissiveIntensity: 2.6, lampDriven: true, flicker: true }),
    };
    for (const d of SITES) {
      const p = this.findSite(d.ax, d.az, d.search, d.r);
      const site: RuinSite = { id: d.id, name: d.name, x: p.x, z: p.z, y: p.y, r: d.r, relics: [] };
      const rng = createRng(0x5e1e + d.id.length * 131 + d.id.charCodeAt(0));
      const cr = d.r * (d.kind === 'fort' || d.kind === 'tower' ? 0.8 : 1.15);
      this.clear.rects.push([p.x - cr, p.z - cr, p.x + cr, p.z + cr]);
      const spots = d.kind === 'fort' ? this.fort(p.x, p.z, d.r, rng)
        : d.kind === 'tower' ? this.tower(p.x, p.z, d.r, rng)
        : d.kind === 'hamlet' ? this.hamlet(p.x, p.z, d.r, rng)
        : d.kind === 'shrine' ? this.shrine(p.x, p.z, rng)
        : this.gate(p.x, p.z, rng);
      d.relics.forEach((rl, i) => site.relics.push({ id: 'relic-' + d.id + '-' + i, label: rl.label, text: rl.text, pos: spots[i] ?? spots[0]! }));
      this.sites.push(site);
      this.flush(p.x, p.z);
    }
    this.waysides(roads);
  }

  /** Show only what's near enough to matter. */
  update(p: THREE.Vector3): void {
    for (const o of this.meshes) o.m.visible = Math.hypot(o.x - p.x, o.z - p.z) < 1400;
  }

  // ---------- site finding ----------
  private findSite(ax: number, az: number, search: number, r: number): { x: number; z: number; y: number } {
    const H = this.w.height, hy = this.w.hydro;
    let best = { x: ax, z: az, y: H(ax, az) }, bestScore = Infinity;
    const step = search / 7;
    for (let gz = -search; gz <= search; gz += step) for (let gx = -search; gx <= search; gx += step) {
      const x = ax + gx, z = az + gz;
      if (hy.riverDist(x, z) < r + 10) continue;
      if (VILLAGES.some((v) => Math.hypot(v.x - x, v.z - z) < 260)) continue;
      const c = H(x, z);
      if (c < 4 || c > 1100) continue;
      let lo = c, hi = c;
      for (let a = 0; a < 8; a++) for (const f of [0.5, 1]) {
        const h = H(x + Math.cos(a * 0.785) * r * f, z + Math.sin(a * 0.785) * r * f);
        if (h < 2) { lo = -1e9; break; }
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      const score = hi - lo + Math.hypot(gx, gz) * 0.004;
      if (score < bestScore) { bestScore = score; best = { x, z, y: c }; }
    }
    return best;
  }

  // ---------- building blocks ----------
  private add(k: string, g: THREE.BufferGeometry): void { (this.parts.get(k) ?? this.parts.set(k, []).get(k)!).push(g); }
  private box(k: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0): void {
    const g = boxUV(sx, sy, sz, 2);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    this.add(k, g.translate(x, y, z));
  }
  private col(x: number, z: number, hx: number, hz: number, top: number): void { this.colliders.push({ x0: x - hx, z0: z - hz, x1: x + hx, z1: z + hz, top }); }
  /** local (along x, along z) offset rotated by `rot` around (x, z) */
  private at(x: number, z: number, rot: number, lx: number, lz: number): [number, number] {
    const c = Math.cos(rot), s = Math.sin(rot);
    return [x + lx * c + lz * s, z - lx * s + lz * c];
  }
  private flush(cx: number, cz: number): void {
    for (const [k, list] of this.parts) {
      if (!list.length) continue;
      const m = new THREE.Mesh(mergeGeoms(list), this.M[k]!);
      m.name = 'ruin-' + k;
      m.userData.castShadow = k !== 'ghost' && k !== 'paper';
      this.group.add(m);
      this.meshes.push({ m, x: cx, z: cz });
    }
    this.parts.clear();
  }

  /** A broken battered wall: jagged tops, gaps with rubble, moss on the caps. */
  private ruinWall(ax: number, az: number, bx: number, bz: number, h: number, thick: number, rng: Rng, keep = 0.8, skip: number[] = []): void {
    const H = this.w.height, len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 2.4)), seg = len / n, ang = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, g = H(x, z);
      if (skip.includes(i)) continue;
      if (rng.next() > keep) { this.rubble(x, z, 3, 1.6, rng); continue; }
      const hh = h * (0.4 + 0.6 * rng.next());
      this.box('stone', x, g - 1.2 + (hh + 1.2) / 2, z, thick, hh + 1.2, seg + 0.04, ang);
      this.box('stone', x, g + hh + 0.15, z, thick * 0.82, 0.3, seg * (0.6 + rng.next() * 0.4), ang);
      if (rng.next() < 0.45) this.box('mossy', x, g + hh + 0.33, z, thick * 0.7, 0.1, seg * 0.7, ang);
      const ca = Math.abs(Math.cos(ang)), sa = Math.abs(Math.sin(ang));
      this.col(x, z, ca * thick / 2 + sa * seg / 2, sa * thick / 2 + ca * seg / 2, g + hh + 0.3);
    }
  }
  /** Fallen stones. */
  private rubble(x: number, z: number, n: number, spread: number, rng: Rng, k = 'stone'): void {
    for (let i = 0; i < n; i++) {
      const px = x + (rng.next() - 0.5) * spread * 2, pz = z + (rng.next() - 0.5) * spread * 2, s = 0.35 + rng.next() * 0.6;
      this.box(rng.next() < 0.3 ? 'mossy' : k, px, this.w.height(px, pz) + s * 0.25, pz, s, s * 0.7, s * 0.9, rng.next() * 6, (rng.next() - 0.5) * 0.6, (rng.next() - 0.5) * 0.6);
    }
  }
  /** A stone lantern (tōrō), standing or fallen over in pieces. */
  private toro(x: number, z: number, fallen: boolean, rng: Rng, lit = false): void {
    const g = this.w.height(x, z);
    if (!fallen) {
      this.box('stone', x, g + 0.15, z, 0.7, 0.4, 0.7);
      this.box('stone', x, g + 0.8, z, 0.28, 1, 0.28);
      this.box('stone', x, g + 1.45, z, 0.55, 0.4, 0.55);
      this.box('mossy', x, g + 1.75, z, 0.85, 0.2, 0.85);
      this.box('stone', x, g + 1.95, z, 0.25, 0.2, 0.25);
      this.circles.push({ x, z, r: 0.4, top: g + 2 });
      if (lit) {
        this.add('paper', andon(0.3, 0.3).translate(x, g + 1.45, z));
        this.lights.push({ pos: new THREE.Vector3(x, g + 1.45, z), color: AMBER.clone(), radius: 6, intensity: 1.2, halo: 0.6, phase: x });
      }
    } else {
      const a = rng.next() * 6.28;
      this.box('stone', x, g + 0.15, z, 0.7, 0.4, 0.7, a);
      this.box('stone', x + Math.sin(a) * 0.9, g + 0.14, z + Math.cos(a) * 0.9, 0.28, 0.28, 1, a);
      this.box('mossy', x + Math.sin(a) * 1.7, g + 0.25, z + Math.cos(a) * 1.7, 0.55, 0.45, 0.55, a + 0.4, 0.3);
      this.box('mossy', x + Math.sin(a + 0.5) * 2.2, g + 0.1, z + Math.cos(a + 0.5) * 2.2, 0.85, 0.2, 0.85, a + 1, 0.2);
      this.circles.push({ x, z, r: 0.4, top: g + 0.4 });
    }
  }
  /** A torii, standing or toppled. `rot`: the way through it. */
  private torii(x: number, z: number, rot: number, fallen: boolean, k = 'faded', span = 1.7): void {
    const H = this.w.height;
    const [lx, lz] = this.at(x, z, rot, -span, 0), [rx, rz] = this.at(x, z, rot, span, 0);
    if (!fallen) {
      for (const [px, pz] of [[lx, lz], [rx, rz]] as const) {
        const g = H(px, pz);
        this.box(k, px, g + 1.6, pz, 0.34, 4, 0.34, rot);
        this.box('stone', px, g + 0.1, pz, 0.6, 0.4, 0.6, rot);
        this.circles.push({ x: px, z: pz, r: 0.3, top: g + 4 });
      }
      const g = H(x, z);
      this.box(k, x, g + 3.1, z, span * 2 + 0.9, 0.24, 0.26, rot);
      this.box('dark', x, g + 3.62, z, span * 2 + 1.8, 0.3, 0.45, rot);
      this.box('dark', x, g + 3.36, z, 0.25, 0.3, 0.2, rot);
    } else {
      // one pillar snapped, the other and the crossbeams fallen forward
      const gl = H(lx, lz);
      this.box(k, lx, gl + 0.7, lz, 0.34, 1.6, 0.34, rot, 0, 0.08);
      this.box('stone', lx, gl + 0.1, lz, 0.6, 0.4, 0.6, rot);
      this.circles.push({ x: lx, z: lz, r: 0.3, top: gl + 1.5 });
      const [fx, fz] = this.at(x, z, rot, span, 1.9), gf = H(fx, fz);
      this.box(k, fx, gf + 0.17, fz, 0.34, 0.34, 3.6, rot + 0.1);
      const [kx, kz] = this.at(x, z, rot, 0.3, 3.4), gk = H(kx, kz);
      this.box('dark', kx, gk + 0.2, kz, span * 2 + 1.8, 0.3, 0.45, rot + 0.22);
      const [nx, nz] = this.at(x, z, rot, -0.8, 2.6);
      this.box(k, nx, H(nx, nz) + 0.13, nz, span * 2 + 0.4, 0.24, 0.26, rot - 0.3);
      const [ox, oz] = this.at(x, z, rot, 0.3, 3.4);
      this.col(ox, oz, 1.6, 1.6, gk + 0.35);
    }
  }
  private komainu(x: number, z: number, rot: number, broken: boolean): void {
    const g = this.w.height(x, z);
    this.box('stone', x, g + 0.3, z, 0.9, 0.7, 0.9, rot);
    this.box('mossy', x, g + 0.95, z, 0.5, 0.6, 0.7, rot);
    if (!broken) {
      const [hx, hz] = this.at(x, z, rot, 0, 0.25);
      this.box('mossy', hx, g + 1.45, hz, 0.45, 0.45, 0.45, rot);
      this.box('stone', hx, g + 1.72, hz, 0.5, 0.14, 0.3, rot);
    } else {
      const [hx, hz] = this.at(x, z, rot, 0.6, 0.9);
      this.box('mossy', hx, this.w.height(hx, hz) + 0.2, hz, 0.45, 0.45, 0.45, rot + 0.7, 0.5);
    }
    this.circles.push({ x, z, r: 0.55, top: g + 1.2 });
  }
  /** A small stone jizo with a red bib and cap. */
  private jizo(x: number, z: number, rot: number, worn = false): void {
    const g = this.w.height(x, z);
    this.box('stone', x, g + 0.08, z, 0.42, 0.3, 0.38, rot);
    this.box('stone', x, g + 0.5, z, 0.3, 0.6, 0.24, rot);
    this.add('stone', ensureColor(new THREE.SphereGeometry(0.15, 6, 4).toNonIndexed()).translate(x, g + 0.94, z));
    if (!worn) {
      const [bx, bz] = this.at(x, z, rot, 0, 0.1);
      this.box('cloth', bx, g + 0.66, bz, 0.32, 0.24, 0.08, rot, 0.15);
      this.box('cloth', x, g + 1.06, z, 0.26, 0.08, 0.26, rot);
    } else this.box('mossy', x, g + 1.08, z, 0.2, 0.06, 0.2, rot);
    this.circles.push({ x, z, r: 0.28, top: g + 1.1 });
  }

  // ---------- forts and castles ----------
  private fort(cx: number, cz: number, r: number, rng: Rng): THREE.Vector3[] {
    const H = this.w.height, half = r * 0.75;
    // which way does the land fall? the gate faces downhill
    const dir = Math.atan2(H(cx - 10, cz) - H(cx + 10, cz), H(cx, cz - 10) - H(cx, cz + 10));
    const rot = Math.round(dir / (Math.PI / 2)) * (Math.PI / 2);
    // outer walls (local square), the gate gap in the +z side
    const P = (lx: number, lz: number) => this.at(cx, cz, rot, lx, lz);
    const sides: [number, number, number, number][] = [[-half, -half, half, -half], [half, -half, half, half], [-half, half, -half, -half]];
    for (const [a, b, c, d] of sides) { const [ax, az] = P(a, b), [bx, bz] = P(c, d); this.ruinWall(ax, az, bx, bz, 2.8, 2.4, rng, 0.78); }
    { const [ax, az] = P(-half, half), [bx, bz] = P(-3.2, half); this.ruinWall(ax, az, bx, bz, 2.8, 2.4, rng, 0.85); }
    { const [ax, az] = P(3.2, half), [bx, bz] = P(half, half); this.ruinWall(ax, az, bx, bz, 2.8, 2.4, rng, 0.85); }
    // the gate: two great stone blocks, a fallen lintel beam
    for (const s of [-1, 1]) { const [gx, gz] = P(s * 4.2, half), g = H(gx, gz); this.box('stone', gx, g + 1.2, gz, 2, 3.6, 2.6, rot); this.col(gx, gz, 1.3, 1.3, g + 3); }
    const [lx, lz] = P(0.6, half + 2.6);
    this.box('dark', lx, H(lx, lz) + 0.2, lz, 7.5, 0.4, 0.5, rot + 0.18);
    const [sx, sz] = P(-4.2, half + 1.6);
    const gateStone = new THREE.Vector3(sx, H(sx, sz) + 0.9, sz);
    // a corner turret base, half collapsed
    { const [tx, tz] = P(half - 1, -half + 1), g = H(tx, tz); for (let c = 0; c < 3; c++) this.box('stone', tx, g - 0.6 + c * 1.1 + 0.55, tz, 7 - c * 0.8, 1.12, 7 - c * 0.8, rot); this.col(tx, tz, 3.5, 3.5, g + 2.8); this.rubble(tx - 3, tz + 4, 7, 2.5, rng); }
    // the keep base: battered stone with a stair, a few charred posts and tiles on top
    const [kx, kz] = P(-2, -half * 0.35), bw = 13, base = 4;
    let g0 = -Infinity; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) g0 = Math.max(g0, H(kx + a! * bw / 2, kz + b! * bw / 2));
    const top = g0 + base;
    for (let c = 0; c < 4; c++) this.box(c === 3 ? 'mossy' : 'stone', kx, g0 - 2 + (c + 0.5) * ((base + 2) / 4), kz, bw - c * 0.9, (base + 2) / 4 + 0.02, bw - c * 0.9, rot);
    const tw = bw - 2.7;
    this.decks.push([kx - tw / 2, kz - tw / 2, kx + tw / 2, kz + tw / 2, top]);
    this.colliders.push({ x0: kx - bw / 2, z0: kz - bw / 2, x1: kx + bw / 2, z1: kz + bw / 2, top: top - 0.2 });
    // stair up the front (local +z), solid stone steps
    const steps = Math.ceil(base / 0.3);
    for (let i = 0; i < steps; i++) {
      const y = g0 + (i + 1) * (base / steps), [sx2, sz2] = P(-2, -half * 0.35 + bw / 2 + steps * 0.32 - i * 0.32 - 0.16);
      const gg = H(sx2, sz2);
      this.box('stone', sx2, (y + gg - 1) / 2, sz2, 2.6, y - gg + 1, 0.34, rot);
      this.decks.push([sx2 - 1.3, sz2 - 1.3, sx2 + 1.3, sz2 + 1.3, y]);
    }
    for (let i = 0; i < 6; i++) {
      const [px, pz] = this.at(kx, kz, rot, (i % 3 - 1) * 3.6, (i < 3 ? -1 : 1) * 3.4), h = 0.6 + rng.next() * 2.4;
      if (i === 4) continue; // the stair arrives here
      this.box('dark', px, top + h / 2, pz, 0.36, h, 0.36, rot);
      this.circles.push({ x: px, z: pz, r: 0.28, top: top + h });
    }
    for (let i = 0; i < 9; i++) { const px = kx + (rng.next() - 0.5) * 8, pz = kz + (rng.next() - 0.5) * 8; this.box('tile', px, top + 0.08, pz, 0.9, 0.08, 0.7, rng.next() * 6, (rng.next() - 0.5) * 0.3); }
    const [hx, hz] = this.at(kx, kz, rot, -3.4, -2.6);
    const helmet = new THREE.Vector3(hx, top, hz);
    this.add('iron', ensureColor(new THREE.SphereGeometry(0.22, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed()).translate(hx, top + 0.02, hz));
    this.box('iron', hx, top + 0.04, hz, 0.56, 0.05, 0.46, rot + 0.4);
    // an inner garden gone wild: a dry pond edge, a lantern, scattered stones
    const [gx, gz] = P(half * 0.45, half * 0.4);
    for (let a = 0; a < 10; a++) { const px = gx + Math.cos(a * 0.63) * 3.2, pz = gz + Math.sin(a * 0.63) * 2.4; this.box('mossy', px, H(px, pz) + 0.05, pz, 0.9, 0.35, 0.7, a); }
    { const [tx, tz] = P(half * 0.45 + 4.5, half * 0.4 - 2); this.toro(tx, tz, rng.next() < 0.5, rng); }
    { const [tx, tz] = P(-half * 0.5, half * 0.55); this.toro(tx, tz, true, rng); }
    this.rubble(cx, cz + 2, 10, half * 0.8, rng);
    return [helmet, gateStone];
  }

  // ---------- the moor watchtower ----------
  private tower(cx: number, cz: number, r: number, rng: Rng): THREE.Vector3[] {
    const H = this.w.height, half = r * 0.7;
    // a low ring of stones (an old palisade's footing)
    this.ruinWall(cx - half, cz - half, cx + half, cz - half, 1.3, 1.4, rng, 0.7);
    this.ruinWall(cx + half, cz - half, cx + half, cz + half, 1.3, 1.4, rng, 0.7);
    this.ruinWall(cx - half, cz + half, cx - half, cz - half, 1.3, 1.4, rng, 0.7);
    this.ruinWall(cx - half, cz + half, cx - 2.5, cz + half, 1.3, 1.4, rng, 0.8);
    this.ruinWall(cx + 2.5, cz + half, cx + half, cz + half, 1.3, 1.4, rng, 0.8);
    const top = this.yagura(cx, cz - 2, 7);
    // a fallen second tower, timbers in the grass
    for (let i = 0; i < 5; i++) { const px = cx + 7 + rng.next() * 3, pz = cz + 3 + i * 0.9; this.box('wood', px, H(px, pz) + 0.15, pz, 0.3, 0.3, 4 + rng.next() * 2, 0.5 + rng.next() * 0.3); }
    this.rubble(cx - 6, cz + 4, 5, 2, rng);
    return [new THREE.Vector3(cx + 1.4, top, cz - 3.2)];
  }
  /** A wooden watchtower you can climb: four posts, a platform with a rail, a small roof. Returns the platform height. */
  private yagura(x: number, z: number, hgt: number): number {
    const H = this.w.height, hw = 2.2;
    let g = -Infinity; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g = Math.max(g, H(x + a! * hw, z + b! * hw));
    const top = g + hgt;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const px = x + a * (hw - 0.2), pz = z + b * (hw - 0.2), gg = H(px, pz);
      this.box('wood', px, (gg - 1 + top + 3.2) / 2, pz, 0.32, top + 3.2 - gg + 1, 0.32);
      this.circles.push({ x: px, z: pz, r: 0.25, top: top + 3 });
    }
    for (const y of [g + hgt * 0.35, g + hgt * 0.7]) { this.box('wood', x, y, z - hw + 0.2, hw * 2, 0.2, 0.2); this.box('wood', x, y, z + hw - 0.2, hw * 2, 0.2, 0.2); this.box('wood', x - hw + 0.2, y, z, 0.2, 0.2, hw * 2); this.box('wood', x + hw - 0.2, y, z, 0.2, 0.2, hw * 2); }
    // the platform, a rail (open where the stair arrives), a roof of old boards
    this.box('floor', x, top - 0.1, z, hw * 2 + 0.6, 0.2, hw * 2 + 0.6);
    this.decks.push([x - hw - 0.3, z - hw - 0.3, x + hw + 0.3, z + hw + 0.3, top]);
    const R = hw + 0.25;
    this.box('wood', x, top + 1, z - R, R * 2, 0.12, 0.12); this.col(x, z - R, R, 0.15, top + 1.1);
    this.box('wood', x - R, top + 1, z, 0.12, 0.12, R * 2); this.col(x - R, z, 0.15, R, top + 1.1);
    this.box('wood', x + R, top + 1, z, 0.12, 0.12, R * 2); this.col(x + R, z, 0.15, R, top + 1.1);
    this.box('wood', x + R * 0.6, top + 1, z + R, R * 0.8, 0.12, 0.12); this.col(x + R * 0.6, z + R, R * 0.4, 0.15, top + 1.1);
    this.box('thatch', x, top + 3.3, z, hw * 2 + 1.6, 0.3, hw * 2 + 1.6);
    this.box('thatch', x, top + 3.7, z, hw * 1.2, 0.5, hw * 1.2);
    // a timber stair down the front (+z), from the open corner of the rail
    const n = Math.ceil(hgt / 0.3), sx = x - R * 0.55;
    for (let i = 0; i < n; i++) {
      const y = g + (i + 1) * (hgt / n), sz = z + R + 0.3 + (n - 1 - i) * 0.34;
      const gg = H(sx, sz);
      if (y - gg < 1.4) this.box('wood', sx, (y + gg - 0.6) / 2, sz, 1.2, y - gg + 0.6, 0.36);
      else { this.box('floor', sx, y - 0.08, sz, 1.2, 0.16, 0.36); }
      this.decks.push([sx - 0.6, sz - 0.18, sx + 0.6, sz + 0.18, y]);
    }
    // stringers
    const len = Math.hypot(n * 0.34, hgt), ang = Math.atan2(hgt, n * 0.34);
    for (const s of [-1, 1]) this.box('wood', sx + s * 0.62, g + hgt / 2, z + R + 0.3 + n * 0.17, 0.1, 0.3, len, 0, ang);
    return top;
  }

  // ---------- the empty hamlet ----------
  private hamlet(cx: number, cz: number, r: number, rng: Rng): THREE.Vector3[] {
    const H = this.w.height;
    const lots: [number, number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rng.next() * 0.4, d = r * (0.5 + rng.next() * 0.25);
      lots.push([cx + Math.cos(a) * d, cz + Math.sin(a) * d, -a + Math.PI / 2]);
    }
    let hearth = new THREE.Vector3(cx, H(cx, cz), cz);
    lots.forEach(([x, z, rot], i) => { const h = this.ruinHouse(x, z, rot, rng, i % 2 === 0); if (i === 1) hearth = h; });
    // the dry well in the middle
    const wg = H(cx, cz);
    for (let a = 0; a < 8; a++) this.box(a % 3 === 0 ? 'mossy' : 'stone', cx + Math.cos(a * 0.785) * 0.85, wg + 0.3, cz + Math.sin(a * 0.785) * 0.85, 0.55, 0.85 - (a % 3) * 0.12, 0.45, -a * 0.785);
    this.box('dark', cx - 0.9, wg + 1.1, cz, 0.14, 1.7, 0.14); this.box('dark', cx + 0.9, wg + 0.6, cz, 0.14, 0.9, 0.14, 0, 0, 0.3);
    this.circles.push({ x: cx, z: cz, r: 1.05, top: wg + 0.75 });
    const top = new THREE.Vector3(cx + 0.3, wg + 0.75, cz);
    // the way in: a toppled torii, a leaning jizo, the hamlet shrine with its roof caved in
    const [tx, tz] = this.at(cx, cz, 0, 0, r * 1.05);
    this.torii(tx, tz, 0, true, 'faded', 1.4);
    this.jizo(tx + 2.6, tz + 1, 0, true);
    this.jizo(tx + 3.2, tz + 1.1, 0.2, true);
    const [hx, hz] = this.at(cx, cz, 0, -r * 0.2, -r * 0.95), hg = H(hx, hz);
    this.box('stone', hx, hg + 0.2, hz, 1.6, 0.7, 1.3);
    this.box('dark', hx, hg + 0.9, hz, 1, 0.8, 0.8, 0, 0, 0.15);
    this.box('thatch', hx + 0.3, hg + 1.25, hz, 1.6, 0.12, 1.2, 0, 0, -0.5);
    this.col(hx, hz, 0.9, 0.75, hg + 1.3);
    this.rubble(cx, cz, 8, r * 0.6, rng);
    return [top, hearth];
  }
  /** A roofless house frame: stone footing, broken posts, a caved-in roof, a ghost lantern. */
  private ruinHouse(x: number, z: number, rot: number, rng: Rng, lantern: boolean): THREE.Vector3 {
    const H = this.w.height, W = 3.2, D = 2.6;
    let g = -Infinity; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [px, pz] = this.at(x, z, rot, a! * W, b! * D); g = Math.max(g, H(px, pz)); }
    // footing stones along the edges (low enough to step over)
    for (const [a, b, c, d] of [[-W, -D, W, -D], [W, -D, W, D], [-W, D, -1, D], [1, D, W, D], [-W, -D, -W, D]] as const) {
      const n = Math.ceil(Math.hypot(c - a, d - b) / 1.1);
      for (let i = 0; i < n; i++) {
        if (rng.next() < 0.2) continue;
        const t = (i + 0.5) / n, [px, pz] = this.at(x, z, rot, a + (c - a) * t, b + (d - b) * t);
        this.box(rng.next() < 0.4 ? 'mossy' : 'stone', px, H(px, pz) + 0.05, pz, 1, 0.42, 0.5, rot + (a === c ? Math.PI / 2 : 0) + (rng.next() - 0.5) * 0.2);
      }
    }
    // the raised floor (half its boards gone)
    for (let i = 0; i < 7; i++) {
      if (rng.next() < 0.4) continue;
      const [px, pz] = this.at(x, z, rot, -W + 0.6 + i * ((2 * W - 1.2) / 6), 0);
      this.box('floor', px, g + 0.42, pz, 0.85, 0.08, D * 1.8, rot);
    }
    this.decks.push([...this.aabb(x, z, rot, W - 0.4, D - 0.4), g + 0.46] as Deck);
    // posts: corners and middles, snapped at different heights
    for (const [a, b] of [[-W, -D], [0, -D], [W, -D], [-W, D], [W, D], [-W, 0], [W, 0]] as const) {
      const [px, pz] = this.at(x, z, rot, a * 0.95, b * 0.95), h = rng.next() < 0.3 ? 0.6 + rng.next() * 0.8 : 1.8 + rng.next() * 1.4;
      this.box('dark', px, g + h / 2, pz, 0.26, h, 0.26, rot);
      this.circles.push({ x: px, z: pz, r: 0.22, top: g + h });
      if (h > 2.5 && rng.next() < 0.6) { const [bx, bz] = this.at(x, z, rot, a * 0.95 + (a < 0 ? 1.3 : -1.3), b * 0.95); this.box('dark', bx, g + h - 0.1, bz, 2.6, 0.2, 0.2, rot, 0, (rng.next() - 0.5) * 0.25); }
    }
    // the roof slid off the back and lies against the frame
    const [rx, rz] = this.at(x, z, rot, 0.4, -D - 0.6);
    this.box('thatch', rx, g + 1, rz, W * 1.8, 0.32, 2.8, rot, 0.75);
    this.col(rx, rz, 1.6, 1.6, g + 1.6);
    // a cold hearth, a lantern that lights itself at night
    const [hx, hz] = this.at(x, z, rot, 1.2, -0.6);
    this.box('stone', hx, g + 0.55, hz, 0.9, 0.18, 0.9, rot);
    this.add('dark', ensureColor(new THREE.SphereGeometry(0.13, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed()).rotateX(Math.PI).translate(hx, g + 0.77, hz));
    if (lantern) {
      const [lx, lz] = this.at(x, z, rot, -1.6, 0.8);
      this.add('ghost', andon(0.36, 0.52).translate(lx, g + 0.76, lz));
      this.lights.push({ pos: new THREE.Vector3(lx, g + 0.8, lz), color: GHOST.clone(), radius: 8, intensity: 2, halo: 0.9, phase: lx });
    }
    return new THREE.Vector3(hx, g + 0.6, hz);
  }
  private aabb(x: number, z: number, rot: number, hx: number, hz: number): [number, number, number, number] {
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    const ex = c * hx + s * hz, ez = s * hx + c * hz;
    // keep the inner box (a rotated rectangle's inscribed AABB, roughly)
    const k = c > 0.9 || s > 0.9 ? 1 : 0.7;
    return [x - ex * k, z - ez * k, x + ex * k, z + ez * k];
  }

  // ---------- the forgotten shrine ----------
  private shrine(cx: number, cz: number, rng: Rng): THREE.Vector3[] {
    const H = this.w.height;
    const dir = Math.atan2(H(cx - 10, cz) - H(cx + 10, cz), H(cx, cz - 10) - H(cx, cz + 10));
    // a broken stair up to the hall platform, the approach downhill
    const [px, pz] = this.at(cx, cz, dir, 0, -4), pg = H(px, pz) + 0.9;
    this.box('stone', px, pg - 1, pz, 9, 2, 7, dir);
    this.colliders.push({ ...this.box2(px, pz, dir, 4.5, 3.5), top: pg - 0.1 });
    this.decks.push([...this.aabb(px, pz, dir, 4.3, 3.3), pg] as Deck);
    for (let i = 0; i < 6; i++) {
      const [sx, sz] = this.at(cx, cz, dir, (rng.next() - 0.5) * 0.4, -0.3 + i * 0.5), y = pg - (i + 1) * (0.9 / 6) - 0.05;
      if (i === 3) { this.rubble(sx + 1.6, sz, 2, 0.6, rng); continue; }
      this.box(i % 2 ? 'mossy' : 'stone', sx, (y + H(sx, sz) - 0.6) / 2, sz, 2.4, y - H(sx, sz) + 0.6, 0.52, dir + (rng.next() - 0.5) * 0.12);
      this.decks.push([sx - 1.1, sz - 1.1, sx + 1.1, sz + 1.1, y]);
    }
    // the collapsed hall: posts, a roof fallen to one side, the altar
    for (const [a, b] of [[-2.6, -6.4], [2.6, -6.4], [-2.6, -2], [2.6, -2]] as const) {
      const [qx, qz] = this.at(cx, cz, dir, a, b), h = a > 0 ? 3 : 1 + rng.next();
      this.box('faded', qx, pg + h / 2, qz, 0.3, h, 0.3, dir);
      this.circles.push({ x: qx, z: qz, r: 0.24, top: pg + h });
    }
    const [rx, rz] = this.at(cx, cz, dir, -1.2, -4.2);
    this.box('tile', rx, pg + 1.5, rz, 6.4, 0.3, 5.4, dir, 0, 0.45);
    this.colliders.push({ ...this.box2(rx - 0, rz, dir, 2.2, 2.4), top: pg + 2.4 });
    const [ax, az] = this.at(cx, cz, dir, 1.4, -5.6);
    this.box('dark', ax, pg + 0.4, az, 1.4, 0.8, 0.7, dir);
    const mirror = new THREE.Vector3(ax, pg + 0.85, az);
    this.add('bronze', ensureColor(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 10).toNonIndexed()).rotateX(Math.PI / 2 - 0.4).rotateY(dir).translate(ax, pg + 0.98, az));
    this.circles.push({ x: ax, z: az, r: 0.6, top: pg + 0.9 });
    // the approach: a fallen torii, the guardian dogs (one headless), lanterns down
    const [tx, tz] = this.at(cx, cz, dir, 0, 7);
    this.torii(tx, tz, dir, true, 'faded');
    for (const s of [-1, 1]) { const [kx, kz] = this.at(cx, cz, dir, s * 2.4, 2.4); this.komainu(kx, kz, dir + Math.PI, s > 0); }
    for (const s of [-1, 1]) { const [lx, lz] = this.at(cx, cz, dir, s * 2.6, 5.2); this.toro(lx, lz, s > 0, rng); }
    return [mirror];
  }
  /** Approximate AABB of a rotated rect (as a collider). */
  private box2(x: number, z: number, rot: number, hx: number, hz: number): { x0: number; z0: number; x1: number; z1: number } {
    const [x0, z0, x1, z1] = this.aabb(x, z, rot, hx, hz);
    return { x0, z0, x1, z1 };
  }

  // ---------- the old temple gate ----------
  private gate(cx: number, cz: number, rng: Rng): THREE.Vector3[] {
    const H = this.w.height, rot = rng.next() * Math.PI;
    // two great pillar bases, one pillar still standing, the beam broken across the path
    const pil: THREE.Vector3[] = [];
    for (const s of [-1, 1]) {
      const [px, pz] = this.at(cx, cz, rot, s * 3.2, 0), g = H(px, pz);
      this.box('stone', px, g + 0.25, pz, 1.4, 0.9, 1.4, rot);
      const h = s < 0 ? 5.5 : 1.6;
      this.box('faded', px, g + 0.7 + h / 2, pz, 0.6, h, 0.6, rot);
      this.circles.push({ x: px, z: pz, r: 0.75, top: g + h });
      pil.push(new THREE.Vector3(px, g + 1.2, pz));
    }
    const [bx, bz] = this.at(cx, cz, rot, 0.6, 1.8);
    this.box('dark', bx, H(bx, bz) + 0.3, bz, 7.5, 0.5, 0.6, rot + 0.15, 0, 0.06);
    this.col(bx, bz, 2.6, 0.8, H(bx, bz) + 0.55);
    // fallen roof tiles in drifts, an old stone path through
    for (let i = 0; i < 16; i++) { const px = cx + (rng.next() - 0.5) * 9, pz = cz + (rng.next() - 0.5) * 5; this.box('tile', px, H(px, pz) + 0.06, pz, 0.8, 0.08, 0.6, rng.next() * 6, (rng.next() - 0.5) * 0.4); }
    for (let i = -6; i <= 6; i++) { const [px, pz] = this.at(cx, cz, rot, (rng.next() - 0.5) * 0.3, i * 1.3); this.box('mossy', px, H(px, pz) + 0.03, pz, 1.3, 0.1, 1, rot + rng.next() * 0.3); }
    // a row of weathered jizo beside the path
    for (let i = 0; i < 7; i++) { const [jx, jz] = this.at(cx, cz, rot, 3.2 + 1.6, -2 - i * 0.75); this.jizo(jx, jz, rot - Math.PI / 2, i % 3 === 1); }
    this.toro(...this.at(cx, cz, rot, -2.4, -4), false, rng);
    this.toro(...this.at(cx, cz, rot, 2.4, -4.5), true, rng);
    return [pil[0]!];
  }

  // ---------- along the roads ----------
  private waysides(roads: [number, number][][]): void {
    const H = this.w.height, rng = createRng(0x70ad);
    let teahouses = 0, sekisho = false;
    // longest first, so the teahouses and the checkpoint go on the real journeys
    const sorted = [...roads].sort((a, b) => b.length - a.length);
    for (const path of sorted) {
      if (path.length < 4) continue;
      let walked = 0, next = 140 + rng.next() * 80, k = 0;
      const total = path.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - path[i - 1]![0], p[1] - path[i - 1]![1]) : 0), 0);
      let teaAt = teahouses < 3 && total > 500 ? total * 0.5 : Infinity;
      let gateAt = !sekisho && total > 700 ? total * 0.3 : Infinity;
      for (let i = 1; i < path.length; i++) {
        const [ax, az] = path[i - 1]!, [bx, bz] = path[i]!, seg = Math.hypot(bx - ax, bz - az);
        if (seg < 1e-3) continue;
        const dx = (bx - ax) / seg, dz = (bz - az) / seg, rot = Math.atan2(dx, dz);
        const nx = dz, nz = -dx; // to the right of the road
        const here = (t: number): [number, number] => [ax + dx * t, az + dz * t];
        const wet = (x: number, z: number) => this.w.hydro.riverDist(x, z) < 4 || H(x, z) < 1.5;
        if (walked + seg >= gateAt) {
          const [x, z] = here(gateAt - walked);
          if (!wet(x, z) && Math.abs(H(x + nx * 6, z + nz * 6) - H(x - nx * 6, z - nz * 6)) < 2.5) { this.sekisho(x, z, rot); sekisho = true; gateAt = Infinity; }
          else gateAt += 40;
        }
        if (walked + seg >= teaAt) {
          const [x, z] = here(teaAt - walked), ox = x + nx * 6.5, oz = z + nz * 6.5;
          if (!wet(ox, oz) && Math.abs(H(ox, oz) - H(x, z)) < 1.5) { this.teahouse(ox, oz, rot + Math.PI / 2); teahouses++; teaAt = Infinity; }
          else teaAt += 30;
        }
        while (walked + seg >= next) {
          const [x, z] = here(next - walked), side = k % 2 ? 1 : -1, ox = x + nx * 2.6 * side, oz = z + nz * 2.6 * side;
          next += 220 + rng.next() * 160;
          if (wet(ox, oz)) continue;
          const face = rot + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
          const kind = k % 3;
          if (kind === 0) { this.jizo(ox, oz, face); if (rng.next() < 0.5) this.jizo(ox + dx * 0.6, oz + dz * 0.6, face); this.wayside.push({ x: ox, z: oz, kind: 'jizo' }); }
          else if (kind === 1) { this.milestone(ox, oz, face); this.wayside.push({ x: ox, z: oz, kind: 'milestone' }); }
          else { this.hokora(ox + nx * side * 0.6, oz + nz * side * 0.6, face); this.wayside.push({ x: ox, z: oz, kind: 'wayside shrine' }); }
          k++;
          this.flush(ox, oz);
        }
        walked += seg;
      }
    }
  }
  /** An ichirizuka-style milestone: a squared stone post with carved lines, a pine sapling mound. */
  private milestone(x: number, z: number, rot: number): void {
    const g = this.w.height(x, z);
    this.box('stone', x, g + 0.55, z, 0.32, 1.3, 0.32, rot);
    this.box('stone', x, g + 1.25, z, 0.26, 0.12, 0.26, rot);
    for (let k = 0; k < 3; k++) { const [cx, cz] = this.at(x, z, rot, 0, 0.165); this.box('dark', cx, g + 0.5 + k * 0.22, cz, 0.12, 0.12, 0.02, rot); }
    this.box('mossy', x, g, z, 1.1, 0.25, 1.1, rot);
    this.circles.push({ x, z, r: 0.25, top: g + 1.3 });
  }
  /** A little wayside shrine on a post with a red paper offering. */
  private hokora(x: number, z: number, rot: number): void {
    const g = this.w.height(x, z);
    this.box('stone', x, g + 0.3, z, 0.6, 0.6, 0.5, rot);
    this.box('wood', x, g + 0.85, z, 0.45, 0.5, 0.38, rot);
    this.box('dark', x, g + 1.16, z, 0.7, 0.08, 0.6, rot, 0, 0.32);
    this.box('dark', x, g + 1.16, z, 0.7, 0.08, 0.6, rot, 0, -0.32);
    const [fx, fz] = this.at(x, z, rot, 0, 0.2);
    this.box('cloth', fx, g + 0.8, fz, 0.18, 0.22, 0.04, rot);
    this.circles.push({ x, z, r: 0.35, top: g + 1.2 });
  }
  /** A travellers' teahouse: an open-fronted hut, a bench with a red cloth, a big parasol, a banner. */
  private teahouse(x: number, z: number, rot: number): void {
    const H = this.w.height;
    this.wayside.push({ x, z, kind: 'teahouse' });
    this.clear.rects.push([x - 8, z - 8, x + 8, z + 8]);
    // the hut behind (back wall and sides, open to the road)
    const [hx, hz] = this.at(x, z, rot, 0, 2.6);
    let hg = -Infinity; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [px, pz] = this.at(hx, hz, rot, a! * 2.2, b! * 1.6); hg = Math.max(hg, H(px, pz)); }
    this.box('stone', hx, hg - 0.3, hz, 4.6, 0.9, 3.4, rot);
    this.box('floor', hx, hg + 0.2, hz, 4.4, 0.1, 3.2, rot);
    this.decks.push([...this.aabb(hx, hz, rot, 2.2, 1.6), hg + 0.25] as Deck);
    { const [bx, bz] = this.at(hx, hz, rot, 0, 1.55); this.box('wood', bx, hg + 1.5, bz, 4.4, 2.6, 0.12, rot); this.colliders.push({ ...this.box2(bx, bz, rot, 2.2, 0.15), top: hg + 2.8 }); }
    for (const s of [-1, 1]) { const [sx, sz] = this.at(hx, hz, rot, s * 2.15, 0.4); this.box('wood', sx, hg + 1.5, sz, 0.12, 2.6, 2.3, rot); this.colliders.push({ ...this.box2(sx, sz, rot, 0.15, 1.15), top: hg + 2.8 }); }
    for (const s of [-1, 1]) { const [px, pz] = this.at(hx, hz, rot, s * 2.15, -1.55); this.box('dark', px, hg + 1.4, pz, 0.18, 2.6, 0.18, rot); this.circles.push({ x: px, z: pz, r: 0.15, top: hg + 2.8 }); }
    const [rx, rz] = this.at(hx, hz, rot, 0, 0.2);
    this.box('thatch', rx, hg + 3.0, rz, 5.4, 0.3, 4.4, rot, -0.32);
    // the kettle on a brazier inside, a shelf of cups
    const [kx, kz] = this.at(hx, hz, rot, 1.2, 0.6);
    this.box('stone', kx, hg + 0.45, kz, 0.6, 0.4, 0.6, rot);
    this.add('iron', ensureColor(new THREE.SphereGeometry(0.2, 7, 4).toNonIndexed()).translate(kx, hg + 0.8, kz));
    this.add('paper', andon(0.12, 0.08).translate(kx, hg + 0.6, kz));
    this.lights.push({ pos: new THREE.Vector3(kx, hg + 0.8, kz), color: AMBER.clone(), radius: 5, intensity: 0.9, halo: 0, phase: kx });
    // the bench by the road with a red cloth, and the parasol
    const [bx, bz] = this.at(x, z, rot, -0.8, -0.4), bg = H(bx, bz);
    this.box('wood', bx, bg + 0.2, bz, 2.2, 0.4, 0.8, rot);
    this.box('cloth', bx, bg + 0.43, bz, 2.1, 0.05, 0.78, rot);
    this.colliders.push({ ...this.box2(bx, bz, rot, 1.1, 0.4), top: bg + 0.45 });
    this.sits.push({ x: bx, y: bg + 0.45, z: bz, yaw: rot, label: 'Rest at the teahouse' });
    const [ux, uz] = this.at(x, z, rot, 1.4, -0.2), ug = H(ux, uz);
    this.box('dark', ux, ug + 1.2, uz, 0.08, 2.4, 0.08);
    this.add('vermilion', ensureColor(new THREE.ConeGeometry(1.5, 0.6, 12, 1, true).toNonIndexed()).translate(ux, ug + 2.5, uz));
    this.circles.push({ x: ux, z: uz, r: 0.12, top: ug + 2.4 });
    // the banner on a bamboo pole: 茶
    const [nx, nz] = this.at(x, z, rot, -2.6, -1);
    const ng = H(nx, nz);
    this.box('wood', nx, ng + 1.6, nz, 0.08, 3.2, 0.08);
    const [fx, fz] = this.at(nx, nz, rot, 0.32, 0);
    this.box('paper', fx, ng + 2.3, fz, 0.5, 1.4, 0.03, rot);
    this.circles.push({ x: nx, z: nz, r: 0.1, top: ng + 3.2 });
    this.flush(x, z);
  }
  /** A sekisho: a checkpoint gate across the road with fence wings; open now, no one asks for papers. */
  private sekisho(x: number, z: number, rot: number): void {
    const H = this.w.height;
    this.wayside.push({ x, z, kind: 'checkpoint' });
    this.clear.rects.push([x - 14, z - 14, x + 14, z + 14]);
    for (const s of [-1, 1]) {
      const qx = x + Math.cos(rot) * s * 2.2, qz = z - Math.sin(rot) * s * 2.2, g = H(qx, qz);
      this.box('dark', qx, g + 1.9, qz, 0.4, 4.2, 0.4);
      this.box('stone', qx, g + 0.1, qz, 0.7, 0.4, 0.7);
      this.circles.push({ x: qx, z: qz, r: 0.3, top: g + 4 });
      // fence wings of vertical boards running out from the posts
      for (let i = 1; i <= 7; i++) {
        const fx = x + Math.cos(rot) * s * (2.2 + i * 1.1), fz = z - Math.sin(rot) * s * (2.2 + i * 1.1), fg = H(fx, fz);
        this.box('wood', fx, fg + 1.1, fz, 1.12, 2.4, 0.1, rot);
        this.box('dark', fx, fg + 2.2, fz, 1.12, 0.14, 0.18, rot);
        this.col(fx, fz, 0.62, 0.62, fg + 2.3);
      }
      // the door leaves, swung open against the fence
      const dx = x + Math.cos(rot) * s * 2.6, dz = z - Math.sin(rot) * s * 2.6, dg = H(dx, dz);
      this.box('wood', dx + Math.sin(rot) * 0.9, dg + 1.5, dz + Math.cos(rot) * 0.9, 0.1, 2.8, 1.8, rot);
    }
    const g = H(x, z);
    this.box('dark', x, g + 4.0, z, 6.4, 0.3, 0.4, rot);
    this.box('tile', x, g + 4.45, z, 7.2, 0.3, 1.8, rot);
    this.box('tile', x, g + 4.75, z, 6, 0.3, 1, rot);
    // a guard hut beside the gate, empty
    const hx = x + Math.cos(rot) * 7 - Math.sin(rot) * 4, hz = z - Math.sin(rot) * 7 - Math.cos(rot) * 4, hg = H(hx, hz);
    this.box('wood', hx, hg + 1.2, hz, 3, 2.4, 2.4, rot);
    this.box('thatch', hx, hg + 2.6, hz, 3.6, 0.4, 3, rot);
    this.colliders.push({ ...this.box2(hx, hz, rot, 1.6, 1.3), top: hg + 2.8 });
    this.toro(x - Math.cos(rot) * 3.4 + Math.sin(rot) * 3, z + Math.sin(rot) * 3.4 + Math.cos(rot) * 3, false, createRng(1), true);
    this.flush(x, z);
  }
}
