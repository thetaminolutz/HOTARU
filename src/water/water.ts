/**
 * Lake water (SPEC §3.8): planar reflection broken into horizontal pixel streaks,
 * golden glitter paths from lanterns and moon, depth tint, shore foam, boat wakes.
 */
import * as THREE from 'three';
import { U } from '../render/uniforms';
import { COMMON_PARS, FOG_FN, NOISE, SKY_FN } from '../render/shaders/common';

const VERT = /* glsl */ `
varying vec3 vWorldPos;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
#define MAX_BOATS 2
uniform sampler2D uReflection;
uniform mat4 uReflMatrix;
uniform sampler2D uHeightTex;
uniform vec3 uHeightRect;
uniform float uWaves;
uniform float uReflOn;
uniform vec2 uCamFwd;
uniform vec4 uBoats[MAX_BOATS];
uniform int uBoatCount;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uHighlight;
uniform vec4 uLightPos[MAX_LIGHTS];
uniform vec4 uLightCol[MAX_LIGHTS];
uniform int uLightCount;
uniform vec3 uKeyColor2;
varying vec3 vWorldPos;

float foamWake(vec2 xz, float camDist){
  float minW = camDist * uPixelAngle * 0.7;
  float f = 0.0;
  for (int b = 0; b < MAX_BOATS; b++) {
    if (b >= uBoatCount) break;
    vec4 B = uBoats[b];
    vec2 h = vec2(sin(B.z), cos(B.z));
    vec2 rel = xz - B.xy;
    float s = -dot(rel, h);           // distance behind the boat
    float l = dot(rel, vec2(-h.y, h.x)); // lateral offset
    if (s < -2.2 || s > 70.0) continue;
    float spd = B.w;
    float fade = 1.0 - s / 70.0;
    // Kelvin wedge arms (~19.5°)
    float arm = abs(abs(l) - max(s, 0.0) * 0.354 - 0.5);
    float armW = max(0.18 + max(s, 0.0) * 0.012, minW);
    float brk = vnoise(vec2(s * 0.9 - uTime * 2.0, l * 0.5));
    f = max(f, step(arm, armW) * step(0.28, brk) * fade * spd);
    // turbulent white trail right behind the stern
    float trailW = 0.45 + max(s, 0.0) * 0.03;
    float tn = vnoise(vec2(l * 2.0, s * 1.2 - uTime * 3.0));
    f = max(f, step(abs(l), trailW) * step(0.0, s) * step(0.35 + s / 30.0, tn) * (1.0 - smoothstep(10.0, 28.0, s)) * spd * 1.2);
    // bow splash
    f = max(f, step(length(vec2(s + 1.9, l * 1.4)), 0.7) * step(0.5, vnoise(vec2(l * 5.0, uTime * 6.0))) * spd);
  }
  return f;
}

void main(){
  vec3 P = vWorldPos;
  vec3 Vv = uCamPos - P;
  float dist = length(Vv);
  vec3 V = Vv / dist;
  float t = uTime;

  // ripple rows in camera-centred polar coordinates: radial = 'along', arc length = 'across'.
  // Anchored to world angles, so turning the camera only shifts the image (no shimmer),
  // while rows stay perpendicular to every view ray → horizontal streaks on screen.
  vec2 rel = P.xz - uCamPos.xz;
  float along = length(rel);
  float theta = atan(rel.x, rel.y);
  float across = theta * along / (1.0 + dist / 35.0);
  // radial / tangential basis around the camera (rotation-invariant)
  vec2 fwd = rel / max(along, 1e-3);
  vec2 rt = vec2(-fwd.y, fwd.x);
  float n1 = vnoise(vec2(across * 0.06 + t * 0.03, along * 0.55 - t * 0.35));
  float n2 = vnoise(vec2(across * 0.22 - t * 0.07, along * 1.9 + t * 0.55));
  float n3 = vnoise(vec2(across * 0.6, along * 4.5 - t * 0.9));
  float wy = (n1 * 0.55 + n2 * 0.3 + n3 * 0.15 - 0.5) * uWaves;
  float wx = (vnoise(vec2(across * 0.15 + 5.0, along * 0.4 + t * 0.2)) - 0.5) * uWaves;

  // depth below the surface from the baked height texture
  vec2 huv = (P.xz - uHeightRect.xy) / uHeightRect.z;
  float ground = (huv.x < 0.0 || huv.y < 0.0 || huv.x > 1.0 || huv.y > 1.0) ? -30.0 : texture2D(uHeightTex, huv).r;
  float depth = max(-ground, 0.0);

  // reflection lookup with vertical displacement
  vec4 rc = uReflMatrix * vec4(P, 1.0);
  vec2 ruv = rc.xy / rc.w;
  float amp = 0.01 + 0.022 / (1.0 + dist * 0.05);
  ruv.y += wy * amp;
  ruv.x += wx * amp * 0.25;
  vec3 refl = uReflOn > 0.5 ? texture2D(uReflection, clamp(ruv, 0.001, 0.999)).rgb
    : skyColor(normalize(vec3(-V.x, abs(V.y) + 0.02, -V.z))) * 0.9; // far away: reflected sky

  float cosT = max(V.y, 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
  float reflAmt = clamp(0.5 + fres * 0.5 - (n2 - 0.5) * uWaves * 0.3, 0.0, 0.96);

  vec3 body = mix(uShallow, uDeep, smoothstep(0.3, 4.0, depth));
  vec3 col = mix(body, refl, reflAmt);

  // ripple highlight dashes (crest rows catching the sky)
  float crest = step(0.8, vnoise(vec2(across * 0.35 + t * 0.05, along * 3.2 - t * 0.8))) * step(0.45, n1);
  col += uHighlight * crest * 0.22 * min(uWaves, 1.0) * (1.0 - smoothstep(60.0, 250.0, dist));

  // perturbed normal for glints
  vec3 N = normalize(vec3(rt.x * wx * 0.5 + fwd.x * wy * 1.2, 1.0, rt.y * wx * 0.5 + fwd.y * wy * 1.2));
  vec3 R = reflect(-V, N);
  // moon/sun glitter path
  float g = pow(max(dot(R, uKeyDir), 0.0), 220.0);
  float sparkle = step(0.55, hash12(floor(P.xz * 3.0) + floor(t * 4.0)));
  col += uKeyColor2 * step(0.5, g) * sparkle * 1.4;
  // lantern glitter: golden pixels along each light's reflection line
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec3 L = uLightPos[i].xyz - P;
    float d = length(L);
    if (d > 140.0) continue;
    float s = pow(max(dot(R, L / d), 0.0), 160.0);
    float sp = step(0.5, hash12(floor(P.xz * 4.0) + float(i) * 7.0 + floor(t * 3.0 + float(i))));
    col += uLightCol[i].rgb * uLightCol[i].a * step(0.35, s) * sp * 0.55 * uLamps / (1.0 + d * 0.03);
  }

  // shore foam and lapping
  float lap = sin(t * 1.3 + across * 0.2) * 0.08;
  float shoreFoam = step(depth, 0.05 + lap * 0.4) * step(0.01, depth) * step(0.6, vnoise(vec2(across * 0.8, along * 6.0) + t * 0.3)) * (1.0 - smoothstep(40.0, 90.0, dist));
  // wakes
  float wake = foamWake(P.xz, dist);
  vec3 foamCol = (uAmbSky * 1.6 + uKeyColor * 0.5 + uHorizon * 0.5);
  col = mix(col, foamCol, clamp(max(shoreFoam * 0.25, wake), 0.0, 1.0));

  col = applyFog(col, P);
  gl_FragColor = vec4(col, 0.5);
}
`;

export type Boat = { x: number; z: number; heading: number; speed: number };

export class Water {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly target: THREE.WebGLRenderTarget;
  readonly reflCam = new THREE.PerspectiveCamera();
  private readonly bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  boats: Boat[] = [];

  constructor(heightTex: THREE.Texture, heightRect: [number, number, number], readonly level = 0) {
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
    this.target.texture.magFilter = this.target.texture.minFilter = THREE.NearestFilter;
    this.target.texture.generateMipmaps = false;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...U,
        uReflection: { value: this.target.texture },
        uReflMatrix: { value: new THREE.Matrix4() },
        uHeightTex: { value: heightTex },
        uHeightRect: { value: new THREE.Vector3(...heightRect) },
        uWaves: { value: 1 },
        uReflOn: { value: 1 },
        uCamFwd: { value: new THREE.Vector2(0, -1) },
        uBoats: { value: [new THREE.Vector4(), new THREE.Vector4()] },
        uBoatCount: { value: 0 },
        uDeep: { value: new THREE.Color() },
        uShallow: { value: new THREE.Color() },
        uHighlight: { value: new THREE.Color() },
        uKeyColor2: { value: new THREE.Color() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    const g = new THREE.PlaneGeometry(40000, 40000, 1, 1);
    g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.position.set(0, level, 0);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'water';
  }

  /**
   * Is reflective water close enough to matter? Planar reflections re-render the scene, so
   * they only run near Lantern Lake or the eastern sea; farther away water uses the sky.
   */
  visibleFrom(p: THREE.Vector3): boolean {
    const lake = Math.hypot(p.x / 440, (p.z + 10) / 300);
    const nearLake = lake < 1 + 1800 / 300 && p.y < 700 + 0.4 * Math.hypot(p.x, p.z);
    const nearSea = p.x > 3300;
    return nearLake || nearSea;
  }

  /** Reflection field of view for a render-camera fov (degrees). */
  static reflFov(camFov: number): number { return Math.min(150, camFov * 1.35); }

  /** Angle of one reflection texel (radians) for a render-camera fov — used to snap rotation. */
  texelAngle(camFov: number): number {
    return (2 * Math.tan(THREE.MathUtils.degToRad(Water.reflFov(camFov)) / 2)) / Math.max(1, this.target.height);
  }

  setSize(w: number, h: number): void {
    this.target.setSize(Math.max(1, w), Math.max(1, h));
  }

  /** Render the mirrored scene into the reflection target. */
  renderReflection(renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, sky: THREE.Object3D): void {
    const rc = this.reflCam;
    rc.copy(cam, false);
    // a wider frustum than the main camera, so rippled lookups near the screen edges never
    // fall outside the reflection (clamping would smear the edge into vertical bars)
    rc.fov = Water.reflFov(cam.fov);
    rc.updateProjectionMatrix();
    const camPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const target = camPos.clone().add(fwd);
    camPos.y = 2 * this.level - camPos.y;
    target.y = 2 * this.level - target.y;
    up.y = -up.y;
    rc.position.copy(camPos);
    rc.up.copy(up);
    rc.lookAt(target);
    rc.updateMatrixWorld();
    rc.matrixWorldInverse.copy(rc.matrixWorld).invert();

    this.material.uniforms.uReflMatrix!.value.copy(this.bias).multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);

    const prevSky = sky.position.clone();
    sky.position.copy(rc.position);
    this.mesh.visible = false;
    // small near-camera detail (grass, particles) is skipped in the mirror: cheaper, and it
    // never reads well at reflection resolution
    const skipped: THREE.Object3D[] = [];
    scene.traverse((o) => { if (o.userData.noReflect && o.visible) { o.visible = false; skipped.push(o); } });
    U.uClipPlane.value.set(0, 1, 0, -this.level + 0.08);
    U.uReflectPass.value = 1;
    const prevCam = U.uCamPos.value.clone();
    U.uCamPos.value.copy(rc.position);
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, rc);
    U.uCamPos.value.copy(prevCam);
    U.uReflectPass.value = 0;
    U.uClipPlane.value.set(0, 0, 0, 1);
    this.mesh.visible = true;
    for (const o of skipped) o.visible = true;
    sky.position.copy(prevSky);
  }

  update(cam: THREE.Camera): void {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this.material.uniforms.uCamFwd!.value.set(fwd.x, fwd.z);
    const ub = this.material.uniforms.uBoats!.value as THREE.Vector4[];
    this.boats.slice(0, 2).forEach((b, i) => ub[i]!.set(b.x, b.z, b.heading, b.speed));
    this.material.uniforms.uBoatCount!.value = Math.min(2, this.boats.length);
  }
}
