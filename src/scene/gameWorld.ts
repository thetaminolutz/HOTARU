/**
 * The game world: streamed terrain and forests over the 10 km heightfield, sky, distant
 * ranges, water, the Tomoshibi dock at Lantern Lake, grass and particles.
 */
import * as THREE from 'three';
import { createWorld, type World } from '../world/heightfield';
import { TerrainStreamer } from '../world/terrainStreamer';
import { createTerrainMaterial } from '../world/terrainMaterial';
import { terrainTextureArray } from '../world/terrainTextures';
import { WorkerPool } from '../world/workerPool';
import { Water } from '../water/water';
import { createSky, createBackdrop } from '../sky/sky';
import { TreeKit } from '../flora/trees';
import { ForestStreamer } from '../flora/forestStreamer';
import { createGrass, type GrassInstance } from '../flora/grass';
import { TREE_SPECIES } from '../flora/data/trees';
import { DockScene } from '../buildings/dockScene';
import { createFireflies, createLeaves } from '../particles/particles';
import { toTexture, leafAtlas, grassAtlas, glowSprite } from '../render/textures';
import { createNoise } from '../core/noise';
import { createRng } from '../core/rng';
import { srgbToLinear } from '../render/color';
import type { Quality } from '../config';
import { registerPoi } from '../secrets/poi';
import { REGIONS } from '../world/data/regions';

export class GameWorld {
  readonly scene = new THREE.Scene();
  readonly world: World;
  readonly pool: WorkerPool;
  terrain!: TerrainStreamer;
  forest!: ForestStreamer;
  water!: Water;
  sky!: ReturnType<typeof createSky>;
  dock!: DockScene;
  terrainMaterial!: THREE.ShaderMaterial;
  private steps: (() => void | Promise<void>)[] = [];

  constructor(readonly seed: number, private quality: Quality) {
    this.world = createWorld(seed);
    const workers = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
    this.pool = new WorkerPool(workers);
    const n = createNoise(seed ^ 0x7ee5);
    const atlas = toTexture(leafAtlas());
    const gAtlas = toTexture(grassAtlas());
    const glow = toTexture(glowSprite(), { repeat: false, mips: false });

    this.steps.push(() => {
      this.terrainMaterial = createTerrainMaterial(terrainTextureArray());
      this.terrain = new TerrainStreamer(this.pool, seed, this.terrainMaterial);
      this.terrain.splitFactor = quality.name === 'low' ? 0.8 : quality.name === 'high' ? 1.3 : 1.0;
      this.scene.add(this.terrain.group);
    });
    this.steps.push(() => {
      this.sky = createSky();
      this.scene.add(this.sky.mesh);
      this.scene.add(createBackdrop(seed));
      // water depth texture around Lantern Lake (the sea outside it counts as deep)
      const HS = 256, hx0 = -640, hz0 = -480, hsize = 1280;
      const hd = new Uint16Array(HS * HS);
      for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) hd[j * HS + i] = THREE.DataUtils.toHalfFloat(this.world.height(hx0 + ((i + 0.5) / HS) * hsize, hz0 + ((j + 0.5) / HS) * hsize));
      const heightTex = new THREE.DataTexture(hd, HS, HS, THREE.RedFormat, THREE.HalfFloatType);
      heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
      heightTex.needsUpdate = true;
      this.water = new Water(heightTex, [hx0, hz0, hsize], 0);
      this.scene.add(this.water.mesh);
    });
    this.steps.push(() => {
      this.dock = new DockScene(this.world.height, glow);
      for (const r of REGIONS) registerPoi({ x: r.x, z: r.z, kind: 'region', name: r.sub });
      for (const [k, v] of Object.entries(this.dock.anchors)) registerPoi({ x: v.x, z: v.z, kind: 'dock', name: k });
      registerPoi({ x: -150, z: 40, kind: 'island', name: 'Wooded island' });
      registerPoi({ x: 140, z: -30, kind: 'island', name: 'Island of the lone pine' });
      registerPoi({ x: -10, z: -150, kind: 'island', name: 'Little island' });
      this.scene.add(this.dock.group);
      this.water.boats = this.dock.boats;
    });
    this.steps.push(() => {
      const kits = new Map(TREE_SPECIES.map((sp, i) => [sp.id, new TreeKit(sp, atlas, seed + i * 101)]));
      this.forest = new ForestStreamer(this.pool, seed, kits);
      this.forest.radius = quality.name === 'low' ? 450 : quality.name === 'high' ? 1000 : 700;
      this.terrainMaterial.uniforms.uTreeRadius!.value = this.forest.radius;
      this.scene.add(this.forest.group);
    });
    this.steps.push(() => {
      const H = this.world.height;
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
      this.scene.add(createFireflies(new THREE.Vector3(S.x + 10, 0, S.z - 2), 28, Math.round(180 * this.quality.particles), H));
      const m = this.dock.anchors.maple!;
      this.scene.add(createLeaves(new THREE.Vector3(m.x + 3, m.y + 9, m.z - 3), new THREE.Vector3(12, 9, 12), Math.round(90 * this.quality.particles), 0.1));
    });
  }

  get stepCount(): number { return this.steps.length; }
  async runStep(i: number): Promise<void> { await this.steps[i]!(); }

  /** Stream terrain until the view around `pos` is complete (loading screen). */
  async preload(pos: THREE.Vector3, onProgress?: (f: number) => void, timeoutMs = 20000): Promise<void> {
    const t0 = performance.now();
    for (;;) {
      const done = this.terrain.update(pos);
      this.forest.update(pos);
      onProgress?.(Math.min(1, (performance.now() - t0) / 4000));
      if ((done && this.pool.queued === 0) || performance.now() - t0 > timeoutMs) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  setQuality(q: Quality): void {
    this.quality = q;
    if (!this.forest) return;
    this.forest.radius = q.name === 'low' ? 450 : q.name === 'high' ? 1000 : 700;
    this.terrainMaterial.uniforms.uTreeRadius!.value = this.forest.radius;
    this.terrain.splitFactor = q.name === 'low' ? 0.8 : q.name === 'high' ? 1.3 : 1.0;
  }

  /** Per-frame streaming around the camera. */
  update(cam: THREE.Vector3): void {
    this.terrain.update(cam);
    this.forest.update(cam);
  }

  height(x: number, z: number): number { return this.world.height(x, z); }

  groundHeight(x: number, z: number): number {
    return Math.max(this.world.height(x, z), this.dock.deckHeight(x, z));
  }

  normal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = 1.5, h = this.world.height;
    return out.set(h(x - e, z) - h(x + e, z), 2 * e, h(x, z - e) - h(x, z + e)).normalize();
  }
}
