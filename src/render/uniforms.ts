/** Uniforms shared by every world material (one object, referenced everywhere). */
import * as THREE from 'three';

export const MAX_LIGHTS = 32;

const v3 = () => new THREE.Vector3();
const col = () => new THREE.Color();

export const U = {
  uTime: { value: 0 },
  uCamPos: { value: v3() },
  uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
  uKeyColor: { value: col() },
  uAmbSky: { value: col() },
  uAmbGround: { value: col() },
  uShadowTint: { value: col() },
  uRim: { value: col() },
  uZenith: { value: col() },
  uHorizon: { value: col() },
  uSunGlow: { value: col() },
  uSunDir: { value: v3() },
  uMoonDir: { value: v3() },
  uFog: { value: 0.001 },
  uHeightFog: { value: 0.3 },
  /** local ground mist (deep forests, misty mornings): amount, ground height */
  uMist: { value: 0 },
  /** seasons & weather: snow lying on up-facing surfaces, rain wetness, grass/terrain tint */
  uSnowCover: { value: 0 },
  uWet: { value: 0 },
  uSeasonTint: { value: new THREE.Vector3(1, 1, 1) },
  /** season weights: spring, summer, autumn, winter */
  uSeasonW: { value: new THREE.Vector4(0, 0, 1, 0) },
  uMistY: { value: 0 },
  uShadowMap: { value: null as THREE.Texture | null },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowOn: { value: 1 },
  uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
  uLightCol: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
  uLightCount: { value: 0 },
  /** nearby interiors (x0, z0, x1, z1) and their floor/ceiling heights */
  uRooms: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
  uRoomY: { value: Array.from({ length: 8 }, () => new THREE.Vector2()) },
  uRoomCount: { value: 0 },
  uClipPlane: { value: new THREE.Vector4(0, 0, 0, 1) },
  /** xy: wind direction, z: strength, w: gustiness */
  uWind: { value: new THREE.Vector4(1, 0.3, 0.5, 0.5) },
  uBands: { value: 4 },
  /** 0 = fully banded light, 1 = smooth Lambert (terrain uses a blend to avoid triangle patterns). */
  uSmoothLight: { value: 0 },
  /** 0..1 cloud cover (cloud shadows on the ground; weather drives it from M6). */
  uCloudCover: { value: 0.5 },
  uLamps: { value: 1 },
  uStars: { value: 1 },
  uClouds: { value: col() },
  uCloudLit: { value: col() },
  /** 1 while rendering the planar reflection. */
  uReflectPass: { value: 0 },
  /** Angle of one internal pixel (radians) — used for size LOD of tiny things. */
  uPixelAngle: { value: 0.0036 },
};

export type SharedUniforms = typeof U;
