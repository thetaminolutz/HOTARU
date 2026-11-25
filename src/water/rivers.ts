/**
 * Rivers, ponds and waterfalls above lake level (SPEC §3.8). Strips along the hydrology
 * polylines with a flowing shader: pixel streaks moving downstream (faster on rapids), white
 * water on steep stretches and at the banks, the sky reflected with a fresnel. Waterfalls are
 * falling sheets of streaks with mist at the foot and a rainbow in the sun. Below 0.3 m the
 * lake/sea plane (with planar reflections) takes over.
 */
import * as THREE from 'three';
import { U } from '../render/uniforms';
import { COMMON_PARS, FOG_FN, NOISE, SKY_FN } from '../render/shaders/common';
import type { Hydro, River } from '../world/hydrology';

const VERT = /* glsl */ `
${COMMON_PARS}
attribute vec3 aFlow; // steepness (rapids), 1 = waterfall sheet, width (m)
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec3 vFlow;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vUv = uv;
  vFlow = aFlow;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uHighlight;
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec3 vFlow;
float bayer4(vec2 p){
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
void main(){
  if (dot(vec4(vWorldPos, 1.0), uClipPlane) < 0.0) discard;
  float fall = vFlow.y;
  float steep = clamp(vFlow.x * 4.0, 0.0, 1.0);
  float speed = mix(0.7 + steep * 3.0, 7.0, fall);
  // streaks in metres: across the width, stretched along the flow / the fall
  float wm = max(vFlow.z, 2.0);
  vec2 q = vec2(vUv.x * wm * 0.9, (vUv.y - uTime * speed) * (fall > 0.5 ? 0.35 : 0.22));
  float n1 = vnoise(q);
  float n2 = vnoise(q * vec2(1.7, 2.3) + 7.3);
  float edge = abs(vUv.x - 0.5) * 2.0; // 0 centre … 1 bank
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 N = normalize(vec3((n1 - 0.5) * 0.25, 1.0, (n2 - 0.5) * 0.25));
  if (fall > 0.5) N = normalize(vec3(0.0, 0.3, 1.0));
  float fres = 0.2 + 0.8 * pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 sky = skyColor(reflect(-V, N));
  vec3 base = mix(uDeep, uShallow, smoothstep(0.35, 1.0, edge));
  vec3 col = mix(base * 0.85, sky, fres * 0.55);
  // near the banks the water mirrors the dark woods and grass
  col = mix(col, base * 0.45 + vec3(0.02, 0.035, 0.02), smoothstep(0.55, 1.0, edge) * 0.55 * (1.0 - fall));
  // sunlight glints
  float glint = step(0.86, n2) * max(dot(reflect(-uKeyDir, N), V), 0.0);
  col += uHighlight * glint * 0.6;
  // white water: rapids, banks, the whole fall
  float white = max(max(steep * step(0.55, n1), smoothstep(0.85, 1.0, edge) * step(0.62, n2)), fall * step(0.5, n1 * 0.7 + n2 * 0.5));
  vec3 foam = vec3(0.92, 0.95, 1.0) * (uKeyColor * 0.5 + uAmbSky * 1.1);
  col = mix(col, foam, white);
  if (fall > 0.5) {
    col = mix(base * 1.1 + sky * 0.2, col, 0.6);
    // dithered, ragged edges on the falling sheet
    if (smoothstep(0.75, 1.0, edge) > bayer4(gl_FragCoord.xy)) discard;
  }
  col = applyFog(col, vWorldPos);
  gl_FragColor = vec4(col, 0.5);
}
`;

const RAINBOW_FRAG = /* glsl */ `
${COMMON_PARS}
varying vec2 vUv;
uniform float uShow;
float bayer4(vec2 p){
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
void main(){
  vec2 p = vUv * 2.0 - vec2(1.0, 0.0);
  float r = length(p);
  float band = (r - 0.72) / 0.22;
  if (band < 0.0 || band > 1.0 || p.y < 0.0) discard;
  vec3 c = band < 0.17 ? vec3(0.6, 0.2, 0.8) : band < 0.33 ? vec3(0.2, 0.35, 1.0) : band < 0.5 ? vec3(0.2, 0.9, 0.4) : band < 0.67 ? vec3(1.0, 0.95, 0.2) : band < 0.84 ? vec3(1.0, 0.55, 0.1) : vec3(1.0, 0.2, 0.15);
  float a = uShow * 0.5 * sin(band * 3.14159) * smoothstep(0.0, 0.3, p.y);
  if (a < bayer4(gl_FragCoord.xy)) discard;
  gl_FragColor = vec4(c * 1.3, 0.5);
}
`;

export class Rivers {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  private rainbows: { mesh: THREE.Mesh; pos: THREE.Vector3 }[] = [];
  /** foot of every waterfall (mist emitters) with its height */
  readonly feet: { pos: THREE.Vector3; height: number }[] = [];

  constructor(hydro: Hydro, waterUniforms: Record<string, THREE.IUniform>) {
    this.group.name = 'rivers';
    this.material = new THREE.ShaderMaterial({
      uniforms: { ...U, uDeep: waterUniforms.uDeep!, uShallow: waterUniforms.uShallow!, uHighlight: waterUniforms.uHighlight! },
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    });
    for (const r of hydro.rivers) this.addRiver(r);
    for (const p of hydro.ponds) this.addPond(p.x, p.z, p.r, p.level);
    for (const f of hydro.falls) this.addFall(f.x, f.z, f.top, f.bottom, f.dx, f.dz, f.width);
    this.finish();
    const rbMat = new THREE.ShaderMaterial({ uniforms: { ...U, uShow: { value: 0 } }, vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: RAINBOW_FRAG, depthWrite: false });
    for (const f of hydro.falls) {
      this.feet.push({ pos: new THREE.Vector3(f.x + f.dx * 3, f.bottom + 0.5, f.z + f.dz * 3), height: f.top - f.bottom });
      if (f.top - f.bottom > 12) {
        const size = Math.min(60, (f.top - f.bottom) * 1.6);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 2, size), rbMat);
        m.userData.noReflect = true;
        const pos = new THREE.Vector3(f.x + f.dx * 8, f.bottom - size * 0.05, f.z + f.dz * 8);
        m.position.copy(pos).setY(pos.y + size / 2);
        this.group.add(m);
        this.rainbows.push({ mesh: m, pos });
      }
    }
  }

  private addRiver(r: River): void {
    const pos: number[] = [], uv: number[] = [], flow: number[] = [], idx: number[] = [];
    let open = false, base = 0;
    for (let i = 0; i < r.pts.length; i++) {
      const p = r.pts[i]!;
      const above = p.level > 0.3;
      if (!above) { open = false; continue; }
      const a = r.pts[Math.max(0, i - 1)]!, b = r.pts[Math.min(r.pts.length - 1, i + 1)]!;
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl, nz = tx / tl, hw = p.width / 2 + 1.2;
      const steep = (a.level - b.level) / Math.max(1, b.s - a.s);
      const k = pos.length / 3;
      pos.push(p.x + nx * hw, p.level, p.z + nz * hw, p.x - nx * hw, p.level, p.z - nz * hw);
      uv.push(0, p.s, 1, p.s);
      flow.push(steep, 0, p.width, steep, 0, p.width);
      if (open) idx.push(base, base + 1, k, base + 1, k + 1, k);
      base = k; open = true;
    }
    if (!idx.length) return;
    this.mesh(pos, uv, flow, idx, 'river-' + r.id);
  }

  private addPond(x: number, z: number, r: number, level: number): void {
    const pos: number[] = [x, level, z], uv: number[] = [0.5, 0], flow: number[] = [0, 0, r * 2], idx: number[] = [];
    const N = 20;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      pos.push(x + Math.cos(a) * (r + 0.8), level, z + Math.sin(a) * (r + 0.8));
      uv.push(1, i * 3); flow.push(0, 0, r * 2);
      if (i) idx.push(0, i, i + 1);
    }
    this.mesh(pos, uv, flow, idx, 'pond');
  }

  private addFall(x: number, z: number, top: number, bottom: number, dx: number, dz: number, width: number): void {
    const pos: number[] = [], uv: number[] = [], flow: number[] = [], idx: number[] = [];
    const nx = -dz, nz = dx, hw = width / 2 + 0.6;
    const H = top - bottom;
    const rows = Math.max(2, Math.ceil(H / 2));
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      // the sheet curves out from the lip as it falls
      const out = Math.sqrt(t) * Math.min(4, H * 0.15);
      const y = top - t * H, cx = x + dx * out, cz = z + dz * out;
      const k = pos.length / 3;
      pos.push(cx + nx * hw, y, cz + nz * hw, cx - nx * hw, y, cz - nz * hw);
      uv.push(0, t * H, 1, t * H); flow.push(1, 1, width, 1, 1, width);
      if (j) idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
    this.mesh(pos, uv, flow, idx, 'waterfall');
  }

  // everything goes into one geometry: one draw call for all rivers, ponds and falls
  private P: number[] = []; private UV: number[] = []; private F: number[] = []; private I: number[] = [];
  private mesh(pos: number[], uv: number[], flow: number[], idx: number[], _name: string): void {
    const base = this.P.length / 3;
    this.P.push(...pos); this.UV.push(...uv); this.F.push(...flow);
    for (const i of idx) this.I.push(i + base);
  }

  private finish(): void {
    if (!this.I.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(this.F, 3));
    g.setIndex(this.I);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.material);
    m.name = 'rivers-ponds-falls';
    m.frustumCulled = false;
    m.userData.noReflect = true;
    this.group.add(m);
    this.P = []; this.UV = []; this.F = []; this.I = [];
  }

  /** Rainbows face the camera and show when the sun is behind you. */
  update(cam: THREE.Camera, sunDir: THREE.Vector3, day: number): void {
    for (const r of this.rainbows) {
      const to = r.pos.clone().sub(cam.position);
      const d = to.length();
      r.mesh.visible = d < 900;
      if (!r.mesh.visible) continue;
      r.mesh.lookAt(cam.position.x, r.mesh.position.y, cam.position.z);
      const behind = Math.max(0, -sunDir.clone().setY(0).normalize().dot(to.setY(0).normalize()));
      (r.mesh.material as THREE.ShaderMaterial).uniforms.uShow!.value = behind * day * Math.min(1, sunDir.y * 3 + 0.2);
    }
  }
}
