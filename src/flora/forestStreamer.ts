/**
 * Streams trees in 256 m tiles around the camera (SPEC §5 scatter, §28 culling). Each tile
 * holds one instanced mesh per species with near/far LOD; tiles are frustum-culled, far
 * tiles drop trunks and shadows, and tiles outside the radius are unloaded. Beyond the
 * radius, forests are painted onto the terrain.
 */
import * as THREE from 'three';
import type { WorkerPool } from '../world/workerPool';
import type { TreeKit } from './trees';
import type { Clearings } from '../world/clearings';
import { hash3 } from '../core/rng';

type Tile = { key: string; x0: number; z0: number; group: THREE.Group | null; loading: boolean; parts: { near: THREE.Mesh; far: THREE.Mesh; trunks: THREE.InstancedMesh }[] };

/** 256 m tiles: fine-grained culling and near/far LOD. */
export const TILE = 256;

export class ForestStreamer {
  readonly group = new THREE.Group();
  private tiles = new Map<string, Tile>();
  /** Trees are loaded within this radius (m); set from the quality preset. */
  radius = 700;
  /** Villages and roads keep their ground clear (set by the world). */
  clearings: Clearings | null = null;
  /** Full-detail crowns (and trunks, shadows) within this distance. */
  nearDist = 220;
  stats = { tiles: 0, trees: 0 };

  constructor(private pool: WorkerPool, private seed: number, private kits: Map<string, TreeKit>) {
    this.group.name = 'forest';
  }

  update(cam: THREE.Vector3): void {
    const R = this.radius;
    const want = new Set<string>();
    const i0 = Math.floor((cam.x - R) / TILE), i1 = Math.floor((cam.x + R) / TILE);
    const j0 = Math.floor((cam.z - R) / TILE), j1 = Math.floor((cam.z + R) / TILE);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x0 = i * TILE, z0 = j * TILE;
      const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + TILE)), dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + TILE));
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      const key = i + ',' + j;
      want.add(key);
      let t = this.tiles.get(key);
      if (!t) {
        t = { key, x0, z0, group: null, loading: true, parts: [] };
        this.tiles.set(key, t);
        const tile = t;
        void this.pool.request<{ trees: Record<string, Float32Array> }>({ kind: 'trees', seed: this.seed, x0, z0, size: TILE, clear: this.clearings?.forTile(x0, z0, TILE, 4) }, 1 + d / 100).then((res) => {
          tile.loading = false;
          if (this.tiles.get(key) !== tile) return;
          this.build(tile, res.trees);
        });
      }
      // LOD by distance to the tile
      const near = d < this.nearDist;
      for (const p of t.parts) { p.near.visible = near; p.far.visible = !near; p.trunks.visible = near; }
    }
    for (const [k, t] of this.tiles) {
      if (want.has(k)) continue;
      if (t.group) {
        this.group.remove(t.group);
        for (const p of t.parts) { p.near.geometry.dispose(); p.far.geometry.dispose(); p.trunks.dispose(); }
      }
      this.tiles.delete(k);
    }
    let trees = 0;
    for (const t of this.tiles.values()) for (const p of t.parts) trees += (p.near.geometry as THREE.InstancedBufferGeometry).instanceCount;
    this.stats = { tiles: this.tiles.size, trees };
  }

  private build(t: Tile, trees: Record<string, Float32Array>): void {
    const g = new THREE.Group();
    g.name = 'forest-tile';
    // the reflection skips far tiles (they're a few pixels in the water) and trunks
    g.userData.reflectCenter = new THREE.Vector3(t.x0 + TILE / 2, 0, t.z0 + TILE / 2);
    for (const [id, packed] of Object.entries(trees)) {
      const kit = this.kits.get(id);
      if (!kit || packed.length === 0) continue;
      const p = kit.makeTile(packed, hash3(t.x0, t.z0, id.length));
      g.add(p.near, p.far, p.trunks);
      p.near.visible = false; p.trunks.visible = false;
      p.trunks.userData.noReflect = true;
      t.parts.push(p);
    }
    t.group = g;
    this.group.add(g);
  }
}
