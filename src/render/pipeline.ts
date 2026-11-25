/**
 * The pixel pipeline (SPEC §3): shadow map → planar reflection → low-res HDR scene →
 * bloom → tonemap + grade → outlines + palette quantize + dither → integer upscale.
 */
import * as THREE from 'three';
import { U, MAX_LIGHTS } from './uniforms';
import { FS_VERT, BRIGHT_FRAG, DOWN_FRAG, UP_FRAG, COMPOSITE_FRAG, PIXEL_FRAG, UPSCALE_FRAG } from './shaders/post';
import { LUT_SIZE, PALETTE_SIZE, buildLut, paletteAt, paletteToBytes } from './palette';
import type { Quality } from '../config';
import { chooseInternal } from './resolution';
import type { Water } from '../water/water';
import type { PointLight } from '../buildings/dockScene';
import type { TodState } from '../sky/timeOfDay';

export const MARGIN = 2;

export type PassToggles = {
  shadows: boolean; reflections: boolean; bloom: boolean; grade: boolean;
  quantize: boolean; outlines: boolean; vignette: boolean;
};

export type PixelSettings = {
  /** 0..1 */
  dither: number;
  outline: number;
  bloom: number;
  vignette: number;
};

function rt(w: number, h: number, type: THREE.TextureDataType, opts: Partial<THREE.RenderTargetOptions> = {}): THREE.WebGLRenderTarget {
  const t = new THREE.WebGLRenderTarget(w, h, { type, depthBuffer: false, ...opts });
  t.texture.generateMipmaps = false;
  t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter;
  return t;
}

export class PixelPipeline {
  readonly toggles: PassToggles = { shadows: true, reflections: true, bloom: true, grade: true, quantize: true, outlines: true, vignette: true };
  readonly settings: PixelSettings = { dither: 0.85, outline: 0.75, bloom: 0.45, vignette: 0.07 };
  /** Integer scale factor (device pixels per world pixel). */
  scale = 1;
  /** Visible internal resolution (without margin). */
  width = 1;
  height = 1;
  /** Image shift in internal pixels (smooth pixel camera remainder). */
  readonly shift = new THREE.Vector2();
  /** Dither pattern offset so the pattern moves with snapped rotation. */
  readonly ditherOffset = new THREE.Vector2();

  private hdrType: THREE.TextureDataType;
  private sceneRT!: THREE.WebGLRenderTarget;
  private ldrRT!: THREE.WebGLRenderTarget;
  readonly pixelRT: THREE.WebGLRenderTarget;
  private bloomRT: THREE.WebGLRenderTarget[] = [];
  private bloomUpRT: THREE.WebGLRenderTarget[] = [];
  private shadowRT: THREE.WebGLRenderTarget;
  readonly shadowCam = new THREE.OrthographicCamera(-60, 60, 60, -60, 1, 600);
  private fsScene = new THREE.Scene();
  private fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fsQuad: THREE.Mesh;
  private mats: Record<string, THREE.ShaderMaterial> = {};
  private lutTex: THREE.Data3DTexture;
  private paletteTex: THREE.DataTexture;
  private paletteBytes = new Uint8Array(PALETTE_SIZE * 4);
  private lutWorker: Worker | null = null;
  private lutHour = -100;
  private lutPending = false;
  private lutId = 0;
  private hidden: THREE.Object3D[] = [];
  readonly renderCam = new THREE.PerspectiveCamera();
  /** Draw calls per pass in the last frame (debug panel / benchmark). */
  passDraws = { shadow: 0, reflection: 0, main: 0, post: 0 };
  /** triangles per pass (perf breakdown) */
  readonly passTris = { shadow: 0, reflection: 0, main: 0 };
  /** Reflection camera angles, snapped to whole reflection texels (set by the game). */
  readonly reflectAngles = { yaw: 0, pitch: 0, use: false };
  private reflSrc = new THREE.PerspectiveCamera();

  constructor(readonly renderer: THREE.WebGLRenderer, quality: Quality) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const canHalf = !!gl.getExtension('EXT_color_buffer_half_float') || !!gl.getExtension('EXT_color_buffer_float');
    this.hdrType = canHalf ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.pixelRT = rt(4, 4, THREE.UnsignedByteType);
    this.pixelRT.texture.minFilter = this.pixelRT.texture.magFilter = THREE.NearestFilter;
    this.shadowRT = new THREE.WebGLRenderTarget(quality.shadowMapSize, quality.shadowMapSize, {
      depthBuffer: true, depthTexture: new THREE.DepthTexture(quality.shadowMapSize, quality.shadowMapSize, THREE.UnsignedIntType),
    });
    this.shadowRT.depthTexture!.minFilter = this.shadowRT.depthTexture!.magFilter = THREE.NearestFilter;
    U.uShadowMap.value = this.shadowRT.depthTexture;

    this.fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.fsQuad.frustumCulled = false;
    this.fsScene.add(this.fsQuad);
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.mats.bright = mk(BRIGHT_FRAG, { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.4 } });
    this.mats.down = mk(DOWN_FRAG, { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mats.up = mk(UP_FRAG, { uSrc: { value: null }, uAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mats.composite = mk(COMPOSITE_FRAG, {
      uScene: { value: null }, uBloom: { value: null }, uBloomI: { value: 0.75 }, uExposure: { value: 1 },
      uLift: { value: new THREE.Color() }, uGain: { value: new THREE.Color(1, 1, 1) }, uSat: { value: 1 }, uGrade: { value: 1 },
    });

    // Palette + LUT. The first LUT is built synchronously (behind the loading screen).
    this.lutTex = new THREE.Data3DTexture(new Uint8Array(LUT_SIZE ** 3 * 4), LUT_SIZE, LUT_SIZE, LUT_SIZE);
    this.lutTex.format = THREE.RGBAFormat;
    this.lutTex.type = THREE.UnsignedByteType;
    this.lutTex.minFilter = this.lutTex.magFilter = THREE.NearestFilter;
    this.lutTex.unpackAlignment = 1;
    this.lutTex.needsUpdate = true;
    this.paletteTex = new THREE.DataTexture(this.paletteBytes, PALETTE_SIZE, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.paletteTex.minFilter = this.paletteTex.magFilter = THREE.NearestFilter;
    this.paletteTex.needsUpdate = true;
    this.mats.pixel = mk(PIXEL_FRAG, {
      uSrc: { value: null }, uDepth: { value: null }, uLut: { value: this.lutTex }, uPalette: { value: this.paletteTex },
      uTexel: { value: new THREE.Vector2() }, uLutSize: { value: LUT_SIZE }, uPaletteSize: { value: PALETTE_SIZE },
      uQuantize: { value: 1 }, uDither: { value: 0.85 }, uOutline: { value: 0.75 }, uVignette: { value: 0.2 },
      uFilter: { value: 0 }, uDitherOffset: { value: this.ditherOffset }, uNearFar: { value: new THREE.Vector2(0.1, 1000) }, uSize: { value: new THREE.Vector2() },
    });
    this.mats.pixel.glslVersion = null;
    this.mats.upscale = mk(UPSCALE_FRAG, {
      uSrc: { value: this.pixelRT.texture }, uSrcSize: { value: new THREE.Vector2() }, uScale: { value: 1 },
      uShift: { value: this.shift }, uBase: { value: new THREE.Vector2() },
    });

    try {
      this.lutWorker = new Worker(new URL('./lutWorker.ts', import.meta.url), { type: 'module' });
      this.lutWorker.onmessage = (e: MessageEvent<{ id: number; hour: number; lut: Uint8Array<ArrayBuffer> }>) => {
        if (e.data.id !== this.lutId) return;
        this.lutPending = false;
        (this.lutTex.image.data as Uint8Array).set(e.data.lut as Uint8Array<ArrayBuffer>);
        this.lutTex.needsUpdate = true;
        this.lutHour = e.data.hour;
      };
    } catch {
      this.lutWorker = null;
    }
  }

  get isHdr(): boolean { return this.hdrType !== THREE.UnsignedByteType; }

  /** Build the LUT for an hour synchronously (boot / tests). */
  buildLutNow(hour: number): void {
    // invalidate any worker result still in flight: it belongs to an older hour
    this.lutId++;
    this.lutPending = false;
    buildLut(paletteAt(hour), LUT_SIZE, this.lutTex.image.data as Uint8Array);
    this.lutTex.needsUpdate = true;
    this.lutHour = hour;
  }

  /** Palette colours blend every frame; the LUT is rebuilt in a worker when the hour drifts. */
  updatePalette(hour: number): void {
    paletteToBytes(paletteAt(hour), this.paletteBytes);
    this.paletteTex.needsUpdate = true;
    const diff = Math.min(Math.abs(hour - this.lutHour), 24 - Math.abs(hour - this.lutHour));
    if (diff > 0.2 && !this.lutPending) {
      if (this.lutWorker) {
        this.lutPending = true;
        this.lutWorker.postMessage({ id: ++this.lutId, hour });
      } else {
        this.buildLutNow(hour);
      }
    }
  }

  /** Choose internal resolution for an integer scale and (re)allocate targets. */
  resize(deviceW: number, deviceH: number, quality: Quality, water: Water | null): void {
    const r = chooseInternal(deviceW, deviceH, quality.internalHeight);
    const k = r.scale;
    this.scale = k;
    this.width = r.width;
    this.height = r.height;
    const W = this.width + MARGIN * 2, H = this.height + MARGIN * 2;
    this.sceneRT?.dispose();
    this.ldrRT?.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(W, H, {
      type: this.hdrType, depthBuffer: true, depthTexture: new THREE.DepthTexture(W, H, THREE.UnsignedIntType),
    });
    this.sceneRT.texture.minFilter = this.sceneRT.texture.magFilter = THREE.NearestFilter;
    this.sceneRT.texture.generateMipmaps = false;
    this.ldrRT = rt(W, H, THREE.UnsignedByteType);
    this.ldrRT.texture.minFilter = this.ldrRT.texture.magFilter = THREE.NearestFilter;
    this.pixelRT.setSize(W, H);
    this.bloomRT.forEach((r) => r.dispose());
    this.bloomUpRT.forEach((r) => r.dispose());
    this.bloomRT = [2, 4, 8, 16].map((d) => rt(Math.max(1, Math.ceil(W / d)), Math.max(1, Math.ceil(H / d)), this.hdrType));
    this.bloomUpRT = [2, 4, 8].map((d) => rt(Math.max(1, Math.ceil(W / d)), Math.max(1, Math.ceil(H / d)), this.hdrType));
    if (this.shadowRT.width !== quality.shadowMapSize) this.shadowRT.setSize(quality.shadowMapSize, quality.shadowMapSize);
    water?.setSize(Math.ceil(W * quality.reflectionScale), Math.ceil(H * quality.reflectionScale));
    const up = this.mats.upscale!.uniforms;
    up.uSrcSize!.value.set(W, H);
    up.uScale!.value = k;
    // centre the crop when W*k exceeds the screen
    up.uBase!.value.set(MARGIN + (this.width * k - deviceW) / 2 / k, MARGIN + (this.height * k - deviceH) / 2 / k);
  }

  /** Copy the logical camera into the render camera, widened by the margin. */
  setupRenderCamera(cam: THREE.PerspectiveCamera): THREE.PerspectiveCamera {
    const rc = this.renderCam;
    rc.position.copy(cam.position);
    rc.quaternion.copy(cam.quaternion);
    rc.near = cam.near; rc.far = cam.far;
    const H = this.height, W = this.width;
    const t = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * (H + MARGIN * 2) / H;
    rc.fov = THREE.MathUtils.radToDeg(Math.atan(t) * 2);
    rc.aspect = (W + MARGIN * 2) / (H + MARGIN * 2);
    rc.updateProjectionMatrix();
    rc.updateMatrixWorld();
    return rc;
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.fsQuad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fsScene, this.fsCam);
  }

  /** Feed the nearest lights into the shared uniform arrays. */
  uploadLights(lights: PointLight[], camPos: THREE.Vector3, max: number, lamps: number): void {
    const sorted = [...lights].sort((a, b) => a.pos.distanceToSquared(camPos) - b.pos.distanceToSquared(camPos));
    const n = Math.min(max, MAX_LIGHTS, sorted.length);
    for (let i = 0; i < n; i++) {
      const l = sorted[i]!;
      U.uLightPos.value[i]!.set(l.pos.x, l.pos.y, l.pos.z, l.radius);
      U.uLightCol.value[i]!.set(l.color.r, l.color.g, l.color.b, l.intensity);
    }
    // by day lights only matter inside houses (hearths, lamps): skip them when no room is near
    U.uLightCount.value = lamps > 0.01 || U.uRoomCount.value > 0 ? n : 0;
  }

  private renderShadows(scene: THREE.Scene, cam: THREE.PerspectiveCamera, tod: TodState): void {
    const sc = this.shadowCam;
    const size = 55;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() > 1e-6) fwd.normalize();
    const center = cam.position.clone().addScaledVector(fwd, size * 0.6);
    const L = tod.keyDir.clone().normalize();
    // stabilise: snap the centre to shadow texels in light space
    sc.position.copy(center).addScaledVector(L, 300);
    sc.up.set(0, 1, 0);
    if (Math.abs(L.y) > 0.99) sc.up.set(0, 0, 1);
    sc.lookAt(center);
    sc.updateMatrixWorld();
    const texel = (size * 2) / this.shadowRT.width;
    const inv = sc.matrixWorld.clone().invert();
    const lc = center.clone().applyMatrix4(inv);
    lc.x = Math.round(lc.x / texel) * texel;
    lc.y = Math.round(lc.y / texel) * texel;
    const snapped = lc.applyMatrix4(sc.matrixWorld);
    sc.position.copy(snapped).addScaledVector(L, 300);
    sc.lookAt(snapped);
    sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size;
    sc.near = 1; sc.far = 700;
    sc.updateProjectionMatrix();
    sc.updateMatrixWorld();
    U.uShadowMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(sc.projectionMatrix).multiply(sc.matrixWorldInverse);

    // swap in depth materials
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    this.hidden.length = 0;
    scene.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Line).isLine && !(o as THREE.Points).isPoints) return;
      const mat = m.material as THREE.Material;
      if (o.userData.castShadow && mat?.userData?.depth) {
        swapped.push([m, m.material]);
        m.material = mat.userData.depth;
      } else {
        this.hidden.push(o);
        o.visible = false;
      }
    });
    this.renderer.setRenderTarget(this.shadowRT);
    this.renderer.clear();
    this.renderer.render(scene, sc);
    for (const [m, mat] of swapped) m.material = mat;
    for (const o of this.hidden) o.visible = true;
  }

  render(scene: THREE.Scene, cam: THREE.PerspectiveCamera, tod: TodState, water: Water | null, sky: THREE.Object3D): void {
    const r = this.renderer;
    const rc = this.setupRenderCamera(cam);
    U.uCamPos.value.copy(rc.position);
    sky.position.copy(rc.position);

    const calls = () => r.info.render.calls, tris = () => r.info.render.triangles;
    let c0 = calls(), t0 = tris();
    U.uShadowOn.value = this.toggles.shadows ? 1 : 0;
    if (this.toggles.shadows) this.renderShadows(scene, rc, tod);
    this.passDraws.shadow = calls() - c0; c0 = calls();
    this.passTris.shadow = tris() - t0; t0 = tris();

    if (water) {
      water.update(rc);
      const reflOn = this.toggles.reflections && water.visibleFrom(rc.position);
      water.material.uniforms.uReflOn!.value = reflOn ? 1 : 0;
      if (reflOn) {
        let src = rc;
        if (this.reflectAngles.use) {
          src = this.reflSrc;
          src.copy(rc, false);
          src.projectionMatrix.copy(rc.projectionMatrix);
          src.projectionMatrixInverse.copy(rc.projectionMatrixInverse);
          src.rotation.set(this.reflectAngles.pitch, this.reflectAngles.yaw, 0, 'YXZ');
          src.updateMatrixWorld();
        }
        water.renderReflection(r, scene, src, sky);
      }
    }

    this.passDraws.reflection = calls() - c0; c0 = calls();
    this.passTris.reflection = tris() - t0; t0 = tris();
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, rc);
    this.passDraws.main = calls() - c0; c0 = calls();
    this.passTris.main = tris() - t0; t0 = tris();

    // bloom
    const sceneTex = this.sceneRT.texture;
    let bloomTex: THREE.Texture = this.bloomRT[0]!.texture;
    if (this.toggles.bloom && this.isHdr) {
      const b = this.mats.bright!;
      b.uniforms.uSrc!.value = sceneTex;
      b.uniforms.uTexel!.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
      this.pass(b, this.bloomRT[0]!);
      for (let i = 1; i < this.bloomRT.length; i++) {
        const d = this.mats.down!;
        d.uniforms.uSrc!.value = this.bloomRT[i - 1]!.texture;
        d.uniforms.uTexel!.value.set(1 / this.bloomRT[i - 1]!.width, 1 / this.bloomRT[i - 1]!.height);
        this.pass(d, this.bloomRT[i]!);
      }
      let src = this.bloomRT[this.bloomRT.length - 1]!;
      for (let i = this.bloomUpRT.length - 1; i >= 0; i--) {
        const u = this.mats.up!;
        u.uniforms.uSrc!.value = src.texture;
        u.uniforms.uAdd!.value = this.bloomRT[i]!.texture;
        u.uniforms.uTexel!.value.set(1 / src.width, 1 / src.height);
        this.pass(u, this.bloomUpRT[i]!);
        src = this.bloomUpRT[i]!;
      }
      bloomTex = this.bloomUpRT[0]!.texture;
    }

    const c = this.mats.composite!.uniforms;
    c.uScene!.value = sceneTex;
    c.uBloom!.value = bloomTex;
    c.uBloomI!.value = this.toggles.bloom && this.isHdr ? this.settings.bloom : 0;
    c.uExposure!.value = tod.exposure;
    c.uLift!.value.copy(tod.lift);
    c.uGain!.value.copy(tod.gain);
    c.uSat!.value = tod.sat;
    c.uGrade!.value = this.toggles.grade ? 1 : 0;
    this.pass(this.mats.composite!, this.ldrRT);

    const p = this.mats.pixel!.uniforms;
    p.uSrc!.value = this.ldrRT.texture;
    p.uDepth!.value = this.sceneRT.depthTexture;
    p.uTexel!.value.set(1 / this.ldrRT.width, 1 / this.ldrRT.height);
    p.uQuantize!.value = this.toggles.quantize ? 1 : 0;
    p.uDither!.value = this.settings.dither;
    p.uOutline!.value = this.toggles.outlines ? this.settings.outline : 0;
    p.uVignette!.value = this.toggles.vignette ? this.settings.vignette : 0;
    p.uNearFar!.value.set(rc.near, rc.far);
    this.pass(this.mats.pixel!, this.pixelRT);

    this.pass(this.mats.upscale!, null);
    this.passDraws.post = calls() - c0;
  }

  /** Read the internal-resolution final image (for tests). */
  /** Photo filter: 0 none, 1 sepia, 2 ukiyo-e, 3 ink, 4 night blue. */
  set filter(f: number) { this.mats.pixel!.uniforms.uFilter!.value = f; }
  get filter(): number { return this.mats.pixel!.uniforms.uFilter!.value as number; }
  get pixelSize(): [number, number] { return [this.pixelRT.width, this.pixelRT.height]; }

  readPixels(): Uint8Array {
    const out = new Uint8Array(this.pixelRT.width * this.pixelRT.height * 4);
    this.renderer.readRenderTargetPixels(this.pixelRT, 0, 0, this.pixelRT.width, this.pixelRT.height, out);
    return out;
  }
}
