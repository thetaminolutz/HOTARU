/**
 * Grass everywhere (SPEC §3.10, §14): ground plants stream in 16 m tiles around the player
 * (built in workers), merged into ONE instanced draw. Camera-position-facing cards, wind
 * gusts, bending away from the player, distance fade so the edge of the field never shows.
 */
import * as THREE from 'three';
import { U } from '../render/uniforms';
import { COMMON_PARS, FOG_FN, LIGHTING, NOISE, SKY_FN, WIND } from '../render/shaders/common';
import type { WorkerPool } from '../world/workerPool';
import { STRIDE, type Rect } from './groundPlacement';
import type { Clearings } from '../world/clearings';

const VERT = /* glsl */ `
${COMMON_PARS}
${WIND}
attribute vec2 aCorner;
attribute vec4 iPos;   // xyz, height
attribute vec4 iColor; // rgb tint, variant
uniform vec3 uPlayer;
uniform float uRadius;
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec3 vColor;
varying float vH;
varying float vFade;
void main(){
  vec3 camWorld = (inverse(viewMatrix) * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float d = length(iPos.xz - camWorld.xz);
  // shrink plants towards the field's edge (no visible border)
  float fade = (1.0 - smoothstep(uRadius * 0.7, uRadius, d)) * smoothstep(0.6, 2.2, length(iPos.xyz - camWorld));
  float h = iPos.w * fade * (1.0 - uSnowCover * 0.85);
  vec2 tc = normalize(camWorld.xz - iPos.xz + 1e-4);
  vec3 camRight = vec3(-tc.y, 0.0, tc.x);
  float w = max(iPos.w, 0.5) * 0.75;
  vec3 wp = iPos.xyz + camRight * aCorner.x * w * 0.5 + vec3(0.0, aCorner.y * h, 0.0);
  float top = aCorner.y;
  float g = gust(iPos.xz);
  float bend = (sin(uTime * 2.3 + iPos.x * 0.7 + iPos.z * 0.4) * 0.35 + 0.65) * g * top * top;
  wp.xz += normalize(uWind.xy) * bend * h * 0.35;
  // the player pushes plants aside
  vec2 away = iPos.xz - uPlayer.xz;
  float pd = length(away);
  float push = (1.0 - smoothstep(0.0, 1.1, pd)) * step(abs(iPos.y - uPlayer.y), 2.5);
  wp.xz += normalize(away + 1e-4) * push * top * h * 0.6;
  wp.y -= push * top * h * 0.25;
  vWorldPos = wp;
  float v = iColor.w;
  vec2 cell = vec2(mod(v, 8.0), floor(v / 8.0));
  vUv = vec2((cell.x + aCorner.x * 0.5 + 0.5) / 8.0, (cell.y + 1.0 - aCorner.y) / 2.0);
  vColor = iColor.rgb;
  vH = top;
  vFade = fade;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
${LIGHTING}
uniform sampler2D uAtlas;
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec3 vColor;
varying float vH;
varying float vFade;
void main(){
  clipCheck(vWorldPos);
  vec4 t = texture2D(uAtlas, vUv);
  if (t.a < 0.5 || vFade < 0.02) discard;
  // greyscale pixels take the region's grass colour; coloured pixels (flowers) keep theirs
  float sat = abs(t.r - t.g) + abs(t.g - t.b);
  vec3 albedo = sat < 0.03 ? vColor * uSeasonTint * (0.3 + 0.95 * t.r) : t.rgb * 1.1;
  albedo *= 1.0 - uWet * 0.25;
  // shaded with an upward normal so fields read as soft painted strokes
  vec3 col = shade(albedo, vec3(0.0, 1.0, 0.0), vWorldPos, 0.5, 0.55 + 0.45 * vH, 0.25);
  col = min(col, vec3(1.2));
  col = applyFog(col, vWorldPos);
  gl_FragColor = vec4(col, 0.5);
}
`;

const TILE = 16;

type Tile = { key: string; data: Float32Array | null; loading: boolean };

export class GrassField {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private tiles = new Map<string, Tile>();
  private dirty = false;
  private capacity = 0;
  radius = 55;
  density = 0.7;
  /** Areas with no plants (decks, buildings). */
  exclude: Rect[] = [];
  /** Villages and roads (set by the world). */
  clearings: Clearings | null = null;
  stats = { tiles: 0, plants: 0 };
  private material: THREE.ShaderMaterial;

  constructor(private pool: WorkerPool, private seed: number, atlas: THREE.Texture) {
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
    this.geo.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, 0, 1, 0, 1, 1, -1, 1], 2));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.allocate(20000);
    this.material = new THREE.ShaderMaterial({
      uniforms: { ...U, uAtlas: { value: atlas }, uPlayer: { value: new THREE.Vector3() }, uRadius: { value: this.radius } },
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'grass';
    this.mesh.userData.noReflect = true;
  }

  private allocate(n: number): void {
    this.capacity = n;
    this.geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage));
  }

  update(cam: THREE.Vector3, player: THREE.Vector3): void {
    (this.material.uniforms.uPlayer!.value as THREE.Vector3).copy(player);
    this.material.uniforms.uRadius!.value = this.radius;
    const R = this.radius;
    const want = new Set<string>();
    const i0 = Math.floor((cam.x - R) / TILE), i1 = Math.floor((cam.x + R) / TILE);
    const j0 = Math.floor((cam.z - R) / TILE), j1 = Math.floor((cam.z + R) / TILE);
    // no grass while flying high
    if (cam.y - player.y < 60) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x0 = i * TILE, z0 = j * TILE;
      const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + TILE)), dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + TILE));
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      const key = i + ',' + j;
      want.add(key);
      if (!this.tiles.has(key)) {
        const t: Tile = { key, data: null, loading: true };
        this.tiles.set(key, t);
        void this.pool.request<{ data: Float32Array }>({ kind: 'ground', seed: this.seed, x0, z0, size: TILE, density: this.density, exclude: this.exclude, clear: this.clearings?.forTile(x0, z0, TILE, 1) }, 0.5 + d / 40).then((res) => {
          t.loading = false;
          if (this.tiles.get(key) !== t) return;
          t.data = res.data;
          this.dirty = true;
        });
      }
    }
    for (const k of [...this.tiles.keys()]) if (!want.has(k)) { this.tiles.delete(k); this.dirty = true; }
    if (this.dirty) this.rebuild();
  }

  /** Copy all loaded tiles into the single instance buffer. */
  private rebuild(): void {
    this.dirty = false;
    let total = 0;
    for (const t of this.tiles.values()) if (t.data) total += t.data.length / STRIDE;
    if (total > this.capacity) this.allocate(Math.ceil(total * 1.3));
    const ip = this.geo.getAttribute('iPos') as THREE.InstancedBufferAttribute;
    const ic = this.geo.getAttribute('iColor') as THREE.InstancedBufferAttribute;
    const P = ip.array as Float32Array, C = ic.array as Float32Array;
    let k = 0;
    for (const t of this.tiles.values()) {
      if (!t.data) continue;
      const d = t.data;
      for (let o = 0; o < d.length; o += STRIDE, k++) {
        P[k * 4] = d[o]!; P[k * 4 + 1] = d[o + 1]!; P[k * 4 + 2] = d[o + 2]!; P[k * 4 + 3] = d[o + 3]!;
        C[k * 4] = d[o + 4]!; C[k * 4 + 1] = d[o + 5]!; C[k * 4 + 2] = d[o + 6]!; C[k * 4 + 3] = d[o + 7]!;
      }
    }
    ip.needsUpdate = true; ic.needsUpdate = true;
    ip.clearUpdateRanges(); ic.clearUpdateRanges();
    ip.addUpdateRange(0, k * 4); ic.addUpdateRange(0, k * 4);
    this.geo.instanceCount = k;
    this.stats = { tiles: this.tiles.size, plants: k };
  }

  /** Re-request everything (density changed). */
  reset(): void { this.tiles.clear(); this.dirty = true; }
}
