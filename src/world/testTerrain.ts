/**
 * M1 test landscape around Lantern Lake: a lake basin, rolling shore hills and a big
 * mountain across the water (reference 2). Replaced by the streamed world in M2, but the
 * height/colour rules here are the first draft of the real terrain rules.
 */
import * as THREE from 'three';
import { createNoise, type Noise } from '../core/noise';
import { smoothstep, lerp } from '../core/math';
import { U } from '../render/uniforms';
import { COMMON_PARS, FOG_FN, LIGHTING, NOISE, SKY_FN } from '../render/shaders/common';

export const WATER_Y = 0;

export type Terrain = {
  height(x: number, z: number): number;
  normal(x: number, z: number, out?: THREE.Vector3): THREE.Vector3;
  mesh: THREE.Mesh;
  heightTex: THREE.DataTexture;
  /** world rect covered by heightTex: [x0, z0, size] */
  heightRect: [number, number, number];
};

function mountain(x: number, z: number, cx: number, cz: number, r: number, h: number, n: Noise): number {
  const d = Math.hypot(x - cx, z - cz) / r;
  if (d > 3) return 0;
  const base = Math.exp(-d * d * 1.4);
  // broad massif with soft ridges and gullies (not spiky)
  const ridge = n.ridged2(x / 820 + cx * 0.001, z / 820, 4);
  const gully = n.fbm2(x / 260, z / 260, 3);
  return h * base * (0.62 + 0.45 * ridge + 0.08 * gully);
}

export function createHeightFn(seed: number): (x: number, z: number) => number {
  const n = createNoise(seed);
  return (x: number, z: number) => {
    const wx = x + 70 * n.fbm2(x / 520, z / 520, 3);
    const wz = z + 50 * n.fbm2(x / 520 + 9.1, z / 520 - 3.7, 3);
    const ld = Math.hypot(wx / 440, (wz + 10) / 300);
    const hills = 3 + 26 * (n.fbm2(x / 360, z / 360, 4) * 0.5 + 0.5) * smoothstep(1.05, 2.4, ld);
    const mtn =
      mountain(x, z, -150, -1250, 560, 620, n) +
      mountain(x, z, 1050, -1850, 900, 820, n) +
      mountain(x, z, -1250, -750, 480, 300, n) +
      mountain(x, z, 1400, -350, 420, 240, n) +
      mountain(x, z, -1500, 900, 700, 260, n) +
      mountain(x, z, 1200, 1300, 600, 220, n);
    let land = hills + mtn;
    // islands (SPEC §6.1): a wooded one to the west, a tiny one with a lone pine
    const isl = (cx: number, cz: number, r: number, h: number) => -4 + (h + 4) * smoothstep(1, 0.3, Math.hypot(x - cx, z - cz) / r);
    const islands = Math.max(isl(-150, 40, 70, 9), isl(140, -30, 22, 4), isl(-10, -150, 30, 5));
    // The south shore at the dock stays low and gentle.
    const dock = Math.exp(-(((x + 10) / 140) ** 2) - (((z - 300) / 70) ** 2));
    land = lerp(land, 1.0 + 0.5 * (n.noise2(x / 30, z / 30) * 0.5 + 0.5) + Math.max(0, ld - 1) * 40, dock * 0.9);
    const shore = smoothstep(0.975, 1.03, ld);
    const bottom = -1.6 - 11 * smoothstep(0.97, 0.55, ld) + 0.6 * n.noise2(x / 60, z / 60);
    const lake = lerp(bottom, Math.max(land, 0.5), shore);
    return Math.max(lake, islands + 1.2 * n.noise2(x / 25, z / 25) * smoothstep(-1, 2, islands));
  };
}

const TERRAIN_VERT = /* glsl */ `
${COMMON_PARS}
varying vec3 vWorldPos;
varying vec3 vNormal;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normal;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const TERRAIN_FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
${LIGHTING}
varying vec3 vWorldPos;
varying vec3 vNormal;

// sRGB-ish authoring colours converted to linear
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }

void main(){
  clipCheck(vWorldPos);
  vec3 P = vWorldPos;
  vec3 N = normalize(vNormal);
  float slope = 1.0 - N.y;
  float dist = length(P - uCamPos);
  // world-space dither texel (8 per metre) for crisp material boundaries
  float td = hash12(floor(P.xz * 8.0));
  float near = 1.0 - smoothstep(25.0, 80.0, dist);
  float patchN = fbm(P.xz * 0.018);
  float big = fbm(P.xz * 0.004 + 3.0);

  // meadow: golden-olive autumn grass with patches
  vec3 grassA = lin(vec3(0.44, 0.42, 0.2));
  vec3 grassB = lin(vec3(0.58, 0.50, 0.24));
  vec3 grassC = lin(vec3(0.30, 0.34, 0.20));
  vec3 col = mix(grassA, grassB, step(0.52 + 0.08 * (td - 0.5), patchN));
  col = mix(col, grassC, step(0.6, big + 0.1 * (td - 0.5)));

  // forest canopy on hills and mountain flanks (reference 2): a dark blue-green forest
  // base with broad patches of autumn colour; crown-sized cells only near the camera.
  float forestAmt = smoothstep(8.0, 30.0, P.y) * (1.0 - smoothstep(520.0, 660.0, P.y)) * (1.0 - smoothstep(0.55, 0.8, slope));
  vec3 cRed = lin(vec3(0.66, 0.24, 0.17));
  vec3 cOra = lin(vec3(0.74, 0.4, 0.18));
  vec3 cGold = lin(vec3(0.74, 0.57, 0.25));
  vec3 cPine = lin(vec3(0.17, 0.25, 0.24));
  vec3 cPine2 = lin(vec3(0.22, 0.31, 0.27));
  float pa = fbm(P.xz * 0.006 + 11.0);
  float pb = fbm(P.xz * 0.013 - 4.0);
  float cellSize = 7.0 * exp2(floor(log2(max(1.0, dist / 180.0))));
  vec2 cell = floor(P.xz / cellSize);
  // crown cells near the camera, smooth clusters far away (no visible squares)
  float ch = mix(hash12(cell), vnoise(P.xz * 0.045), smoothstep(90.0, 220.0, dist));
  vec3 crown = mix(cPine, cPine2, step(0.5, ch));
  float autumn = pa + 0.18 * (ch - 0.5) - smoothstep(120.0, 420.0, P.y) * 0.22;
  crown = autumn > 0.56 ? (pb > 0.55 ? cRed : cOra) : (autumn > 0.5 ? cGold : crown);
  vec2 inCell = fract(P.xz / cellSize) - 0.5;
  crown *= 0.9 + 0.25 * dot(inCell, normalize(uKeyDir.xz + 1e-4)) * (1.0 - smoothstep(150.0, 400.0, dist));
  float forestMask = step(0.3 + 0.1 * (td - 0.5), fbm(P.xz * 0.008 + 5.0) * forestAmt * 1.7);
  col = mix(col, crown, forestMask);

  // rock on steep slopes
  vec3 rockA = lin(vec3(0.36, 0.36, 0.42));
  vec3 rockB = lin(vec3(0.46, 0.45, 0.50));
  vec3 rock = mix(rockA, rockB, step(0.5, vnoise(P.xz * 0.15 + P.y * 0.1)));
  col = mix(col, rock, step(0.5 + 0.1 * (td - 0.5), smoothstep(0.42, 0.62, slope)));

  // snow high up
  float snow = step(0.5 + 0.2 * (td - 0.5), smoothstep(640.0, 760.0, P.y + 60.0 * (patchN - 0.5)) * (1.0 - smoothstep(0.75, 0.9, slope)));
  col = mix(col, lin(vec3(0.86, 0.86, 0.94)), snow);

  // shore: sand and pebbles, wet darkening just above the water
  float shore = 1.0 - step(1.1 + 0.6 * (td - 0.5) + 0.8 * (patchN - 0.5), P.y);
  vec3 sand = mix(lin(vec3(0.50, 0.44, 0.34)), lin(vec3(0.40, 0.36, 0.30)), step(0.55, vnoise(P.xz * 1.5)));
  col = mix(col, sand, shore);
  col = mix(col, col * 0.62, 1.0 - step(0.25 + 0.1 * td, P.y));
  // lake bed
  col = mix(col, lin(vec3(0.24, 0.24, 0.22)), 1.0 - step(-0.6, P.y));

  // fine pixel texture near the camera: short grass strokes (vertical 1×3 texel dashes)
  vec2 sg = floor(P.xz * vec2(8.0, 8.0 / 3.0));
  float stroke = hash12(sg + floor(hash12(vec2(sg.y, 3.0)) * 3.0));
  float meadow = (1.0 - forestMask) * (1.0 - shore) * step(1.2, P.y);
  col *= 1.0 + near * (0.12 * (td - 0.5) + meadow * (step(0.82, stroke) * 0.22 - step(stroke, 0.12) * 0.18));

  vec3 c = shade(col, N, P, 0.0, 1.0, 0.0);
  c = applyFog(c, P);
  gl_FragColor = vec4(c, 0.5);
}
`;

const DEPTH_FRAG = /* glsl */ `void main(){ gl_FragColor = vec4(1.0); }`;

export function createTerrain(seed: number): Terrain {
  const height = createHeightFn(seed);
  const normal = (x: number, z: number, out = new THREE.Vector3()) => {
    const e = 1.5;
    return out.set(height(x - e, z) - height(x + e, z), 2 * e, height(x, z - e) - height(x, z + e)).normalize();
  };

  // Warped grid: dense near the dock, coarse at the horizon.
  const N = 320, R = 2800, A = 0.11, cx = 0, cz = 230;
  const warp = (u: number) => R * (A * u + (1 - A) * u * u * u);
  const verts = (N + 1) * (N + 1);
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3);
  const nv = new THREE.Vector3();
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = cx + warp((i / N) * 2 - 1), z = cz + warp((j / N) * 2 - 1);
    const k = j * (N + 1) + i;
    pos[k * 3] = x; pos[k * 3 + 1] = height(x, z); pos[k * 3 + 2] = z;
    normal(x, z, nv);
    nor[k * 3] = nv.x; nor[k * 3 + 1] = nv.y; nor[k * 3 + 2] = nv.z;
  }
  const idx = new Uint32Array(N * N * 6);
  let o = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();

  const mat = new THREE.ShaderMaterial({ uniforms: { ...U, uSmoothLight: { value: 0.75 } }, vertexShader: TERRAIN_VERT, fragmentShader: TERRAIN_FRAG });
  mat.userData.depth = new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: TERRAIN_VERT, fragmentShader: DEPTH_FRAG });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'terrain';
  mesh.userData.castShadow = true;

  // Height texture of the lake area for the water shader (depth tint, shore foam).
  const HS = 256, hx0 = -640, hz0 = -480, hsize = 1280;
  const hd = new Uint16Array(HS * HS);
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
    hd[j * HS + i] = THREE.DataUtils.toHalfFloat(height(hx0 + ((i + 0.5) / HS) * hsize, hz0 + ((j + 0.5) / HS) * hsize));
  }
  const heightTex = new THREE.DataTexture(hd, HS, HS, THREE.RedFormat, THREE.HalfFloatType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;

  return { height, normal, mesh, heightTex, heightRect: [hx0, hz0, hsize] };
}
