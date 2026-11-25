/** M1 test world: the dock at Lantern Lake with terrain, sky, water, trees, grass and particles. */
import * as THREE from 'three';
import { createTerrain, type Terrain } from '../world/testTerrain';
import { Water } from '../water/water';
import { createSky, createBackdrop } from '../sky/sky';
import { createTrees, type TreeInstance } from '../flora/trees';
import { createGrass, type GrassInstance } from '../flora/grass';
import { TREE_SPECIES } from '../flora/data/trees';
import { DockScene } from '../buildings/dockScene';
import { createFireflies, createLeaves } from '../particles/particles';
import { toTexture, leafAtlas, grassAtlas, glowSprite } from '../render/textures';
import { createNoise } from '../core/noise';
import { createRng } from '../core/rng';
import { srgbToLinear } from '../render/color';
import type { Quality } from '../config';

export class TestWorld {
  readonly scene = new THREE.Scene();
  terrain!: Terrain;
  water!: Water;
  sky!: ReturnType<typeof createSky>;
  dock!: DockScene;
  private steps: (() => void)[] = [];

  constructor(readonly seed: number, private quality: Quality) {
    this.scene.matrixWorldAutoUpdate = true;
    const n = createNoise(seed ^ 0x7ee5);
    const atlas = toTexture(leafAtlas());
    const gAtlas = toTexture(grassAtlas());
    const glow = toTexture(glowSprite(), { repeat: false, mips: false });

    this.steps.push(() => {
      this.terrain = createTerrain(seed);
      this.scene.add(this.terrain.mesh);
    });
    this.steps.push(() => {
      this.sky = createSky();
      this.scene.add(this.sky.mesh);
      this.scene.add(createBackdrop(seed));
      this.water = new Water(this.terrain.heightTex, this.terrain.heightRect, 0);
      this.scene.add(this.water.mesh);
    });
    this.steps.push(() => {
      this.dock = new DockScene(this.terrain.height, glow);
      this.scene.add(this.dock.group);
      this.water.boats = this.dock.boats;
    });
    this.steps.push(() => {
      const H = this.terrain.height;
      const S = this.dock.anchors.shore!;
      const r = createRng(seed ^ 0x7733);
      const list: Record<string, TreeInstance[]> = Object.fromEntries(TREE_SPECIES.map((s) => [s.id, []]));
      const nv = new THREE.Vector3();
      const cell = 9;
      for (let z = -1150; z < 950; z += cell) for (let x = -1500; x < 1500; x += cell) {
        const px = x + r.next() * cell, pz = z + r.next() * cell;
        const h = H(px, pz);
        if (h < 0.9 || h > 420) continue;
        this.terrain.normal(px, pz, nv);
        if (nv.y < 0.72) continue;
        const dx = px - S.x, dz = pz - S.z;
        const dDock = Math.hypot(dx, dz);
        if (dDock > 950) continue;
        // keep the dock, the pier view and the meadow open
        if (dDock < 60 && !(dx < -22 && dz > 4)) continue;
        if (Math.abs(dx) < 40 && dz > -10 && dz < 140 && r.next() < 0.85) continue;
        const grove = n.fbm2(px / 170, pz / 170, 3);
        const dens = 0.12 + 0.55 * Math.max(0, grove + 0.15) + (h > 30 ? 0.15 : 0);
        if (r.next() > dens) continue;
        let id: string;
        const u = r.next();
        if (h < 8) id = u < 0.3 ? 'maple' : u < 0.55 ? 'shrub' : u < 0.85 ? 'larch' : 'pine';
        else if (h < 60) id = u < 0.45 ? 'larch' : u < 0.7 ? 'fir' : u < 0.9 ? 'maple' : 'pine';
        else id = u < 0.5 ? 'fir' : u < 0.85 ? 'larch' : 'maple';
        list[id]!.push({ x: px, y: h, z: pz, scale: 0.75 + r.next() * 0.55, rot: r.next() * Math.PI * 2 });
      }
      // hand-placed framing trees (reference 1: the maple over the boathouse)
      const m = this.dock.anchors.maple!;
      list.maple!.push({ x: m.x, y: H(m.x, m.z), z: m.z, scale: 1.35, rot: 0.4, color: '#c2452f' });
      list.maple!.push({ x: S.x + 24, y: H(S.x + 24, S.z + 14), z: S.z + 14, scale: 1.1, rot: 2.0, color: '#d4582a' });
      list.pine!.push({ x: S.x + 34, y: H(S.x + 34, S.z + 2), z: S.z + 2, scale: 1.1, rot: 1.2 });
      list.shrub!.push(
        { x: m.x + 5, y: H(m.x + 5, m.z - 3), z: m.z - 3, scale: 1.2, rot: 0.2 },
        { x: S.x + 15, y: H(S.x + 15, S.z + 6), z: S.z + 6, scale: 1.0, rot: 1.0 },
        { x: S.x - 30, y: H(S.x - 30, S.z + 8), z: S.z + 8, scale: 1.3, rot: 2.2 },
      );
      const NEAR = 260;
      TREE_SPECIES.forEach((sp, i) => {
        const inst = list[sp.id]!;
        const isNear = (t: TreeInstance) => Math.hypot(t.x - S.x, t.z - S.z) < NEAR;
        this.scene.add(createTrees(sp, inst.filter(isNear), atlas, seed + i * 101, true));
        this.scene.add(createTrees(sp, inst.filter((t) => !isNear(t)), atlas, seed + i * 101, false));
      });
    });
    this.steps.push(() => {
      const H = this.terrain.height;
      const S = this.dock.anchors.shore!;
      const r = createRng(seed ^ 0x6a55);
      const lin = (r0: number, g0: number, b0: number): [number, number, number] => [srgbToLinear(r0), srgbToLinear(g0), srgbToLinear(b0)];
      const grassCols = [lin(0.46, 0.45, 0.22), lin(0.58, 0.5, 0.25), lin(0.36, 0.38, 0.2), lin(0.62, 0.42, 0.2)];
      const reedCols = [lin(0.36, 0.34, 0.2), lin(0.44, 0.38, 0.22), lin(0.3, 0.3, 0.2)];
      const inst: GrassInstance[] = [];
      const density = this.quality.grassDensity;
      const R = 75;
      for (let z = -R; z < R; z += 0.8) for (let x = -R * 1.4; x < R * 1.4; x += 0.8) {
        if (r.next() > density) continue;
        const px = S.x + x + r.next() * 0.8, pz = S.z + z + r.next() * 0.8;
        const h = H(px, pz);
        if (this.dock.deckHeight(px, pz) > -Infinity) continue;
        const patch = n.fbm2(px / 14, pz / 14, 3);
        if (h > -0.7 && h < 0.5) {
          if (patch < -0.05 || r.next() < 0.35) continue;
          inst.push({ x: px, y: h, z: pz, h: 1.2 + r.next() * 1.0, variant: r.next() < 0.3 ? 3 : 2, color: r.pick(reedCols) });
        } else if (h >= 0.5 && h < 10) {
          if (patch < 0.0 && r.next() < 0.75) continue;
          inst.push({ x: px, y: h - 0.05, z: pz, h: 0.45 + r.next() * 0.5, variant: r.next() < 0.6 ? 0 : 1, color: r.pick(grassCols) });
        }
      }
      this.scene.add(createGrass(inst, gAtlas));
    });
    this.steps.push(() => {
      const S = this.dock.anchors.shore!;
      const H = this.terrain.height;
      this.scene.add(createFireflies(new THREE.Vector3(S.x + 10, 0, S.z - 2), 28, Math.round(180 * this.quality.particles), H));
      const m = this.dock.anchors.maple!;
      this.scene.add(createLeaves(new THREE.Vector3(m.x + 3, m.y + 9, m.z - 3), new THREE.Vector3(12, 9, 12), Math.round(90 * this.quality.particles), 0.1));
    });
  }

  /** Build step by step so the loading screen can show progress. */
  get stepCount(): number { return this.steps.length; }
  runStep(i: number): void { this.steps[i]!(); }

  groundHeight(x: number, z: number): number {
    return Math.max(this.terrain.height(x, z), this.dock.deckHeight(x, z));
  }
}
