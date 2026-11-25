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
import { GrassField } from '../flora/grass';
import { groundAtlas } from '../flora/groundAtlas';
import { TREE_SPECIES } from '../flora/data/trees';
import { DockScene } from '../buildings/dockScene';
import { createLeaves } from '../particles/particles';
import { AmbientFx } from '../particles/ambient';
import { Villages, deckAt } from '../buildings/villages';
import { Landmarks } from '../buildings/landmarks';
import { Secrets } from '../secrets/secrets';
import { Fauna } from '../fauna/fauna';
import { People } from '../people/people';
import { Rivers } from '../water/rivers';
import { SkyRainbow } from '../sky/rainbow';
import { toTexture, leafAtlas, glowSprite } from '../render/textures';
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
  grass!: GrassField;
  fx!: AmbientFx;
  villages!: Villages;
  fauna!: Fauna;
  people!: People;
  landmarks!: Landmarks;
  secrets!: Secrets;
  rivers!: Rivers;
  kits = new Map<string, TreeKit>();
  readonly rainbow = new SkyRainbow();
  private steps: (() => void | Promise<void>)[] = [];

  constructor(readonly seed: number, private quality: Quality) {
    this.world = createWorld(seed);
    const workers = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
    this.pool = new WorkerPool(workers);
    const atlas = toTexture(leafAtlas());
    const gAtlas = toTexture(groundAtlas(), { repeat: false, mips: false });
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
      this.scene.add(this.rainbow.mesh);
      this.scene.add(createBackdrop(seed));
      // water depth texture around Lantern Lake (the sea outside it counts as deep)
      const HS = 256, hx0 = -640, hz0 = -480, hsize = 1280;
      const hd = new Uint16Array(HS * HS);
      for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) hd[j * HS + i] = THREE.DataUtils.toHalfFloat(this.world.height(hx0 + ((i + 0.5) / HS) * hsize, hz0 + ((j + 0.5) / HS) * hsize));
      const heightTex = new THREE.DataTexture(hd, HS, HS, THREE.RedFormat, THREE.HalfFloatType);
      heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
      heightTex.needsUpdate = true;
      this.water = new Water(heightTex, [hx0, hz0, hsize], 0);
      // the coast's depth (surf breaking as the sea gets shallow)
      const CW = 96, CH = 512, cx0 = 3600, cz0 = -5200, csx = 1800, csz = 10400;
      const cd = new Uint16Array(CW * CH);
      for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) cd[j * CW + i] = THREE.DataUtils.toHalfFloat(this.world.height(cx0 + ((i + 0.5) / CW) * csx, cz0 + ((j + 0.5) / CH) * csz));
      const coastTex = new THREE.DataTexture(cd, CW, CH, THREE.RedFormat, THREE.HalfFloatType);
      coastTex.magFilter = coastTex.minFilter = THREE.LinearFilter;
      coastTex.needsUpdate = true;
      this.water.setCoast(coastTex, [cx0, cz0, csx, csz]);
      this.scene.add(this.water.mesh);
      // rivers, ponds and waterfalls (hydrology) above lake level
      this.rivers = new Rivers(this.world.hydro, this.water.material.uniforms);
      this.scene.add(this.rivers.group);
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
      // villages and the roads between them (before the forest, which keeps their ground clear)
      this.villages = new Villages(this.world, seed, this.dock.anchors.shore!);
      this.scene.add(this.villages.group);
      const kumoji = this.villages.villages.find((v) => v.layout.def.id === 'kumoji')?.layout.torii;
      this.landmarks = new Landmarks(this.world, kumoji ? { x: kumoji.x, z: kumoji.z, rot: kumoji.rot } : null);
      this.scene.add(this.landmarks.group);
      this.villages.clearings.rects.push(...this.landmarks.clear.rects);
      this.villages.clearings.segs.push(...this.landmarks.clear.segs);
      const C = this.world.sites.castle;
      this.villages.clearings.rects.push([C.x - 40, C.z - 55, C.x + 40, C.z + 40]);
      registerPoi({ x: C.x, z: C.z, kind: 'landmark', name: 'Kagejō castle' });
      for (const g of this.world.sites.grottos) { this.villages.clearings.rects.push([g.x - g.r - 3, g.z - g.r - 3, g.x + g.r + 3, g.z + g.r + 3]); registerPoi({ x: g.x, z: g.z, kind: 'cave', name: g.id + ' cave' }); }
      for (const v of this.villages.villages) registerPoi({ x: v.layout.def.x, z: v.layout.def.z, kind: 'village', name: v.layout.def.name });
      this.fauna = new Fauna(this, seed);
      this.scene.add(this.fauna.group);
      this.people = new People(this, seed);
      this.scene.add(this.people.mesh);
      this.secrets = new Secrets(this);
      this.scene.add(this.secrets.group);
      for (const sc of this.secrets.list) registerPoi({ x: sc.pos.x, z: sc.pos.z, kind: 'secret-' + sc.kind, name: sc.label });
    });
    this.steps.push(() => {
      const kits = new Map(TREE_SPECIES.map((sp, i) => [sp.id, new TreeKit(sp, atlas, seed + i * 101)]));
      this.kits = kits;
      this.forest = new ForestStreamer(this.pool, seed, kits);
      this.setQuality(this.quality);
      this.forest.clearings = this.villages.clearings;
      this.forest.radius = quality.name === 'low' ? 450 : quality.name === 'high' ? 1000 : 700;
      this.terrainMaterial.uniforms.uTreeRadius!.value = this.forest.radius;
      this.scene.add(this.forest.group);
    });
    this.steps.push(() => {
      const H = this.world.height;
      this.grass = new GrassField(this.pool, seed, gAtlas);
      this.grass.clearings = this.villages.clearings;
      this.grass.exclude = this.dock.decks.map(([x0, z0, x1, z1]) => [x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2]);
      this.applyGrassQuality(this.quality);
      this.scene.add(this.grass.mesh);
      this.fx = new AmbientFx(this.world, seed);
      this.fx.scale = this.quality.particles;
      // hot-spring steam at Yukemuri and fumaroles on the volcano
      for (const [x, z, a] of [[-380, -4050, 1], [-260, -4180, 0.7], [1900, -4200, 0.8], [2050, -4120, 0.5]] as const) {
        this.fx.addEmitter({ effect: 'steam', pos: new THREE.Vector3(x, H(x, z), z), amount: a });
      }
      for (const e of this.villages.emitters) this.fx.addEmitter({ effect: 'steam', pos: e, amount: 0.8 });
      // mist at the foot of the waterfalls
      for (const f of this.rivers.feet) if (f.height > 5) this.fx.addEmitter({ effect: 'steam', pos: f.pos, amount: Math.min(1, f.height / 20) });
      this.scene.add(this.fx.group);
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
      this.grass.update(pos, pos);
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
    this.applyGrassQuality(q);
    if (this.fx) this.fx.scale = q.particles;
  }

  private applyGrassQuality(q: Quality): void {
    const g = this.grass;
    if (!g) return;
    const r = q.name === 'low' ? 35 : q.name === 'high' ? 80 : 55;
    if (g.density !== q.grassDensity) { g.density = q.grassDensity; g.reset(); }
    g.radius = r;
  }

  /** Per-frame streaming around the camera. */
  update(cam: THREE.Vector3, player: THREE.Vector3 = cam): void {
    this.terrain.update(cam);
    this.forest.update(cam);
    this.grass.update(cam, player);
  }

  height(x: number, z: number): number { return this.world.height(x, z); }

  /** Walkable height at (x, z); with `feet`, upper storeys out of reach are ignored. */
  groundHeight(x: number, z: number, feet?: number): number {
    return Math.max(this.world.height(x, z), this.dock.deckHeight(x, z), this.villages.floorHeight(x, z, feet), this.landmarks ? deckAt(this.landmarks.decks, x, z, feet) : -Infinity);
  }

  normal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = 1.5, h = this.world.height;
    return out.set(h(x - e, z) - h(x + e, z), 2 * e, h(x, z - e) - h(x, z + e)).normalize();
  }
}
