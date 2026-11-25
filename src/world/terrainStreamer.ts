/**
 * Quadtree terrain streaming (SPEC §5 streaming, §28): every node is a 64×64 grid built in a
 * worker. Nodes split by distance (screen-space-error style) so the ground near the camera
 * has 2 m cells and the horizon a few large nodes. A node is drawn only when all four
 * children are ready — no holes, no overlaps. Every node is frustum-culled (draw only what
 * is visible) and old nodes are evicted from a bounded cache.
 */
import * as THREE from 'three';
import { RES, nodeIndex } from './terrainWorker';
import type { WorkerPool } from './workerPool';
import { EXTENT } from './data/regions';

type NodeData = { pos: Float32Array; nor: Float32Array; bio: Float32Array; grass: Float32Array; spec: Float32Array; minY: number; maxY: number };
type Node = { key: string; x0: number; z0: number; size: number; level: number; mesh: THREE.Mesh | null; loading: boolean; lastUsed: number };

const MIN_SIZE = 128;

export class TerrainStreamer {
  readonly group = new THREE.Group();
  private nodes = new Map<string, Node>();
  private index: THREE.BufferAttribute;
  private frame = 0;
  /** Split when distance < size × splitFactor (higher = more detail). */
  splitFactor = 1.7;
  maxCache = 700;
  stats = { drawn: 0, cached: 0, loading: 0 };

  constructor(private pool: WorkerPool, private seed: number, private material: THREE.ShaderMaterial) {
    this.group.name = 'terrain';
    this.index = new THREE.BufferAttribute(nodeIndex(), 1);
  }

  private key(x0: number, z0: number, size: number): string { return `${x0},${z0},${size}`; }

  private get(x0: number, z0: number, size: number, level: number): Node {
    const k = this.key(x0, z0, size);
    let n = this.nodes.get(k);
    if (!n) { n = { key: k, x0, z0, size, level, mesh: null, loading: false, lastUsed: 0 }; this.nodes.set(k, n); }
    n.lastUsed = this.frame;
    return n;
  }

  private ensure(n: Node, cam: THREE.Vector3): void {
    if (n.mesh || n.loading) return;
    n.loading = true;
    const cx = n.x0 + n.size / 2, cz = n.z0 + n.size / 2;
    const prio = Math.hypot(cx - cam.x, cz - cam.z) / n.size;
    void this.pool.request<NodeData>({ kind: 'node', seed: this.seed, x0: n.x0, z0: n.z0, size: n.size }, prio).then((d) => {
      n.loading = false;
      if (this.nodes.get(n.key) !== n) return;
      n.mesh = this.makeMesh(n, d);
    });
  }

  private makeMesh(n: Node, d: NodeData): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3));
    g.setAttribute('aBiome', new THREE.BufferAttribute(d.bio, 4));
    g.setAttribute('aGrass', new THREE.BufferAttribute(d.grass, 3));
    g.setAttribute('aSpecial', new THREE.BufferAttribute(d.spec, 2));
    g.setIndex(this.index);
    const half = n.size / 2;
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, d.minY, 0), new THREE.Vector3(n.size, d.maxY, n.size));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(half, (d.minY + d.maxY) / 2, half), Math.hypot(half, half, (d.maxY - d.minY) / 2));
    const m = new THREE.Mesh(g, this.material);
    m.position.set(n.x0, 0, n.z0);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.userData.castShadow = false;
    m.name = 'terrain-node';
    m.userData.maxY = d.maxY;
    m.visible = false;
    this.group.add(m);
    return m;
  }

  private shouldSplit(n: Node, cam: THREE.Vector3): boolean {
    if (n.size <= MIN_SIZE) return false;
    const dx = Math.max(n.x0 - cam.x, 0, cam.x - (n.x0 + n.size));
    const dz = Math.max(n.z0 - cam.z, 0, cam.z - (n.z0 + n.size));
    const dy = Math.max(0, cam.y - 400) * 0.6; // fly-overs need less detail
    return Math.hypot(dx, dz, dy) < n.size * this.splitFactor;
  }

  /** Select & request nodes for this camera position; returns true when the view is complete. */
  update(cam: THREE.Vector3): boolean {
    this.frame++;
    for (const n of this.nodes.values()) if (n.mesh) n.mesh.visible = false;
    let drawn = 0, complete = true;
    const visit = (n: Node) => {
      this.ensure(n, cam);
      if (this.shouldSplit(n, cam)) {
        const h = n.size / 2;
        const kids = [
          this.get(n.x0, n.z0, h, n.level + 1), this.get(n.x0 + h, n.z0, h, n.level + 1),
          this.get(n.x0, n.z0 + h, h, n.level + 1), this.get(n.x0 + h, n.z0 + h, h, n.level + 1),
        ];
        kids.forEach((k) => this.ensure(k, cam));
        if (kids.every((k) => k.mesh)) { kids.forEach(visit); return; }
        complete = false;
      }
      if (n.mesh) { n.mesh.visible = true; drawn++; } else complete = false;
    };
    // four roots so the world centre (Lantern Lake) never sits on a root seam
    const S = EXTENT;
    for (const [x, z] of [[-S, -S], [0, -S], [-S, 0], [0, 0]] as const) visit(this.get(x, z, S, 0));
    this.evict();
    this.stats = { drawn, cached: this.nodes.size, loading: this.pool.queued };
    return complete;
  }

  private evict(): void {
    if (this.nodes.size <= this.maxCache) return;
    const old = [...this.nodes.values()].filter((n) => n.level > 0 && n.lastUsed < this.frame - 2).sort((a, b) => a.lastUsed - b.lastUsed);
    for (const n of old.slice(0, this.nodes.size - this.maxCache)) {
      if (n.mesh) { this.group.remove(n.mesh); n.mesh.geometry.dispose(); }
      this.nodes.delete(n.key);
    }
  }

  /** Cells per node edge (for docs/tests). */
  static get resolution(): number { return RES; }
}
