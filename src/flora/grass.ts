/** Grass tufts and reeds as instanced, camera-facing (cylindrical) cards with wind. */
import * as THREE from 'three';
import { U } from '../render/uniforms';
import { COMMON_PARS, FOG_FN, LIGHTING, NOISE, SKY_FN, WIND } from '../render/shaders/common';

export type GrassInstance = { x: number; y: number; z: number; h: number; variant: number; color: [number, number, number] };

const VERT = /* glsl */ `
${COMMON_PARS}
${WIND}
attribute vec2 aCorner;
attribute vec4 iPos;   // xyz, height
attribute vec4 iColor; // rgb, variant
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec3 vColor;
varying float vH;
void main(){
  float h = iPos.w;
  vec3 camWorld = (inverse(viewMatrix) * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec2 tc = normalize(camWorld.xz - iPos.xz + 1e-4);
  vec3 camRight = vec3(-tc.y, 0.0, tc.x);
  float w = h * 0.55;
  vec3 wp = iPos.xyz + camRight * aCorner.x * w * 0.5 + vec3(0.0, aCorner.y * h, 0.0);
  float top = aCorner.y;
  float g = gust(iPos.xz);
  float bend = (sin(uTime * 2.3 + iPos.x * 0.7 + iPos.z * 0.4) * 0.35 + 0.65) * g * top * top;
  wp.xz += normalize(uWind.xy) * bend * h * 0.35;
  vWorldPos = wp;
  float v = iColor.w;
  vUv = vec2((v + aCorner.x * 0.5 + 0.5) * 0.25, 1.0 - aCorner.y);
  vColor = iColor.rgb;
  vH = top;
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
void main(){
  clipCheck(vWorldPos);
  vec4 t = texture2D(uAtlas, vUv);
  if (t.a < 0.5) discard;
  vec3 albedo = vColor * (0.5 + 0.7 * t.r);
  // shaded with an upward terrain-like normal so fields read as soft painted strokes
  vec3 col = shade(albedo, vec3(0.0, 1.0, 0.0), vWorldPos, 0.5, 0.55 + 0.45 * vH, 0.25);
  col = applyFog(col, vWorldPos);
  gl_FragColor = vec4(col, 0.5);
}
`;

export function createGrass(instances: GrassInstance[], atlas: THREE.Texture): THREE.Mesh {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, 0, 1, 0, 1, 1, -1, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const iPos = new Float32Array(instances.length * 4), iCol = new Float32Array(instances.length * 4);
  instances.forEach((t, i) => {
    iPos.set([t.x, t.y, t.z, t.h], i * 4);
    iCol.set([...t.color, t.variant], i * 4);
  });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 4));
  g.setAttribute('iColor', new THREE.InstancedBufferAttribute(iCol, 4));
  g.instanceCount = instances.length;
  const mat = new THREE.ShaderMaterial({ uniforms: { ...U, uAtlas: { value: atlas } }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.name = 'grass';
  mesh.userData.noReflect = true;
  return mesh;
}
