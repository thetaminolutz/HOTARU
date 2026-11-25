/**
 * Tomoshibi dock (SPEC §6.1, reference 1): boathouse on stilts, a pier with a T-head,
 * strings of paper lanterns, standing lanterns, moored and rowing boats.
 */
import * as THREE from 'three';
import { litMaterial } from '../render/materials';
import { toTexture, woodPlanks, verticalPlanks, shingles, shoji, lanternPaper, stone } from '../render/textures';
import { boxUV, place, gableRoof, gableEnd, chochin, andon, mergeGeoms } from './kit';
import { rowboatGeometry, rowerGeometry, oarGeometry } from './boats';
import { U } from '../render/uniforms';
import { COMMON_PARS, FOG_FN, NOISE, SKY_FN } from '../render/shaders/common';
import type { Boat } from '../water/water';

export type PointLight = { pos: THREE.Vector3; color: THREE.Color; radius: number; intensity: number; halo: number; phase: number };

type HangingLantern = { anchor: THREE.Vector3; obj: THREE.Object3D; light: PointLight; phase: number; drop: number };
type LanternString = { a: THREE.Vector3; b: THREE.Vector3; sag: number; line: THREE.Line; lanterns: HangingLantern[] };

const AMBER = new THREE.Color().setRGB(1.0, 0.52, 0.18);
const WARM = new THREE.Color().setRGB(1.0, 0.62, 0.3);

const LINE_VERT = /* glsl */ `
varying vec3 vWorldPos;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
`;
const LINE_FRAG = /* glsl */ `
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
uniform vec3 uColor;
varying vec3 vWorldPos;
void main(){
  if (dot(vec4(vWorldPos, 1.0), uClipPlane) < 0.0) discard;
  vec3 c = uColor * (uAmbSky * 0.6 + uKeyColor * 0.3) + uColor * 0.05;
  gl_FragColor = vec4(applyFog(c, vWorldPos), 1.0);
}
`;

const HALO_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 iPos; // xyz, size
attribute vec4 iCol; // rgb, phase
uniform float uTime;
varying vec2 vUv;
varying vec3 vCol;
void main(){
  float fl = 0.9 + 0.1 * sin(uTime * 7.0 + iCol.w * 13.0) * sin(uTime * 3.1 + iCol.w * 5.0);
  vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
  mv.xy += aCorner * iPos.w * 0.5 * fl;
  vUv = aCorner * 0.5 + 0.5;
  vCol = iCol.rgb * fl;
  gl_Position = projectionMatrix * mv;
}
`;
const HALO_FRAG = /* glsl */ `
uniform sampler2D uGlow;
uniform float uLamps;
uniform vec4 uClipPlane;
varying vec2 vUv;
varying vec3 vCol;
void main(){
  float a = texture2D(uGlow, vUv).a;
  gl_FragColor = vec4(vCol * a * uLamps, 1.0);
}
`;

export class DockScene {
  readonly group = new THREE.Group();
  readonly lights: PointLight[] = [];
  readonly boats: Boat[] = [];
  /** Walkable deck rectangles: [x0, z0, x1, z1, y]. */
  readonly decks: [number, number, number, number, number][] = [];
  /** Solid volumes the player can't walk through (houses become enterable in M7). */
  readonly colliders: { x0: number; z0: number; x1: number; z1: number; top: number }[] = [];
  /** Places to sit (edge of the pier, the engawa). */
  readonly sitSpots: { x: number; y: number; z: number; yaw: number; label: string }[] = [];
  /** Where key features are, for camera shots. */
  readonly anchors: Record<string, THREE.Vector3> = {};
  private strings: LanternString[] = [];
  private haloGeo!: THREE.InstancedBufferGeometry;
  private haloSources: { light: PointLight; size: number }[] = [];
  private moored!: THREE.Object3D;
  private rowing!: THREE.Group;
  private oars: THREE.Object3D[] = [];
  private mooredBase = new THREE.Vector3();
  /** Pin the rowing boat to a spot (camera shots): x, z, heading. */
  rowOverride: { x: number; z: number; heading: number } | null = null;

  constructor(height: (x: number, z: number) => number, glowTex: THREE.Texture) {
    this.group.name = 'dock';
    // Find the shoreline straight south of the lake centre.
    let sz = 360;
    while (sz > 150 && height(0, sz) > 0.15) sz -= 0.5;
    const S = new THREE.Vector3(0, 0, sz);
    this.anchors.shore = S.clone();

    const tex = {
      deck: toTexture(woodPlanks('deck', 0x9a6a46)),
      wall: toTexture(verticalPlanks('wall', 0x7e5638)),
      roof: toTexture(shingles('roof', 0x7a6e74)),
      shoji: toTexture(shoji()),
      paper: toTexture(lanternPaper()),
      stone: toTexture(stone('stone', 0x8a8a94)),
      boat: toTexture(woodPlanks('boat', 0x8a5e40)),
    };
    const M = {
      deck: litMaterial({ map: tex.deck, outline: true }),
      wall: litMaterial({ map: tex.wall, outline: true }),
      roof: litMaterial({ map: tex.roof, outline: true }),
      window: litMaterial({ map: tex.shoji, emissive: WARM, emissiveIntensity: 1.3, lampDriven: true, outline: true }),
      lantern: litMaterial({ map: tex.paper, emissive: AMBER, emissiveIntensity: 4.0, flicker: true, lampDriven: true, sss: 0.6, outline: false }),
      stone: litMaterial({ map: tex.stone, outline: true }),
      boat: litMaterial({ map: tex.boat, outline: true, side: THREE.DoubleSide }),
      dark: litMaterial({ tint: 0x3a2a26, outline: true }),
    };
    const add = (geoms: THREE.BufferGeometry[], mat: THREE.ShaderMaterial, name: string) => {
      const m = new THREE.Mesh(mergeGeoms(geoms), mat);
      m.name = name;
      m.userData.castShadow = true;
      this.group.add(m);
      return m;
    };

    // ---------- Pier ----------
    const deckY = 1.15, z0 = S.z + 6, z1 = S.z - 30, px = S.x + 1;
    const deck: THREE.BufferGeometry[] = [], posts: THREE.BufferGeometry[] = [];
    deck.push(boxUV(2.4, 0.18, z0 - z1, 2).translate(px, deckY - 0.09, (z0 + z1) / 2));
    deck.push(boxUV(10, 0.18, 3.6, 2).translate(px + 1.5, deckY - 0.09, z1 - 1.6));
    this.decks.push([px - 1.2, z1, px + 1.2, z0, deckY], [px - 3.5, z1 - 3.4, px + 6.5, z1 + 0.2, deckY]);
    const post = (x: number, z: number, top: number) => {
      const bottom = Math.min(-0.3, height(x, z)) - 0.5;
      posts.push(boxUV(0.2, top - bottom, 0.2, 2).translate(x, (top + bottom) / 2, z));
    };
    for (let z = z0 - 1; z > z1; z -= 3) { post(px - 1.25, z, deckY + 0.45); post(px + 1.25, z, deckY + 0.45); }
    for (let x = px - 3.4; x <= px + 6.5; x += 2.5) { post(x, z1 - 3.35, deckY + 0.45); post(x, z1 + 0.1, deckY); }
    // low rail along the east side
    deck.push(boxUV(0.1, 0.1, z0 - z1 - 1, 2).translate(px + 1.25, deckY + 0.42, (z0 + z1) / 2));
    // cross beams under the deck
    for (let z = z0 - 1; z > z1; z -= 3) deck.push(boxUV(2.6, 0.14, 0.14, 2).translate(px, deckY - 0.3, z));
    add(deck, M.deck, 'pier-deck');
    add(posts, M.wall, 'pier-posts');

    // tall pole for lantern strings at the T-head
    const poleA = new THREE.Vector3(px + 6.2, 7.2, z1 - 3.2);
    add([boxUV(0.22, 9, 0.22, 2).translate(poleA.x, poleA.y - 4.5 + 0.3, poleA.z)], M.wall, 'pole-a');
    // a second pole on the eastern shore
    const shoreX = px + 14, shoreZ = S.z + 4;
    const poleB = new THREE.Vector3(shoreX, height(shoreX, shoreZ) + 6.4, shoreZ);
    add([boxUV(0.22, 6.8, 0.22, 2).translate(poleB.x, poleB.y - 3.4 + 0.3, poleB.z)], M.wall, 'pole-b');

    // standing lanterns (andon on posts)
    const andonGeo = andon();
    const standing = [
      new THREE.Vector3(px - 3.2, deckY, z1 - 3.1), new THREE.Vector3(px + 4.2, deckY, z1 - 3.1),
      new THREE.Vector3(px - 1.0, deckY, z0 - 2.5), new THREE.Vector3(px + 1.0, deckY, z1 + 4),
    ];
    const andonParts: THREE.BufferGeometry[] = [], andonPosts: THREE.BufferGeometry[] = [];
    standing.forEach((p, i) => {
      andonPosts.push(boxUV(0.14, 0.9, 0.14, 2).translate(p.x, p.y + 0.45, p.z));
      andonParts.push(place(andonGeo, p.x, p.y + 0.9, p.z, 0.3 * i));
      this.addLight(new THREE.Vector3(p.x, p.y + 1.25, p.z), AMBER, 8, 2.2, 1.5);
    });
    add(andonPosts, M.wall, 'andon-posts');
    add(andonParts, M.lantern, 'andons');

    // ---------- Boathouse ----------
    const bx = px - 10.5, bz = S.z - 2, by = 1.3; // floor height
    const W = 7, D = 10, H = 2.7;
    const bh: THREE.BufferGeometry[] = [], walls: THREE.BufferGeometry[] = [], wins: THREE.BufferGeometry[] = [], roofs: THREE.BufferGeometry[] = [];
    bh.push(boxUV(W + 3, 0.2, D + 1, 2).translate(bx + 1, by - 0.1, bz)); // floor incl. east engawa
    this.decks.push([bx - W / 2, bz - D / 2 - 0.5, bx + W / 2 + 2.5, bz + D / 2 + 0.5, by]);
    this.colliders.push({ x0: bx - W / 2, z0: bz - D / 2, x1: bx + W / 2, z1: bz + D / 2, top: by + H + 2 });
    this.sitSpots.push(
      { x: px + 1.5, y: deckY - 0.45, z: z1 - 3.2, yaw: 0, label: 'Sit at the end of the pier' },
      { x: px - 2.0, y: deckY - 0.45, z: z1 - 3.2, yaw: 0, label: 'Sit at the end of the pier' },
      { x: bx + W / 2 + 1.0, y: by, z: bz - 2, yaw: -Math.PI / 2, label: 'Sit on the engawa' },
    );
    for (const [sx, sz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [1, 0], [-1, 0]] as const) {
      const x = bx + sx * (W / 2) + (sx > 0 ? 2.4 : 0), z = bz + sz2 * (D / 2);
      const bottom = Math.min(-0.3, height(x, z)) - 0.6;
      bh.push(boxUV(0.24, by - bottom, 0.24, 2).translate(x, (by + bottom) / 2, z));
    }
    // walls
    walls.push(boxUV(0.14, H, D, 2).translate(bx - W / 2, by + H / 2, bz)); // west
    walls.push(boxUV(W, H, 0.14, 2).translate(bx, by + H / 2, bz + D / 2)); // south
    // north wall (lake side) with a big lattice window
    walls.push(boxUV(W, 0.9, 0.14, 2).translate(bx, by + 0.45, bz - D / 2));
    walls.push(boxUV(W, 0.5, 0.14, 2).translate(bx, by + H - 0.25, bz - D / 2));
    walls.push(boxUV(1.0, 1.3, 0.14, 2).translate(bx - W / 2 + 0.5, by + 1.55, bz - D / 2));
    walls.push(boxUV(1.0, 1.3, 0.14, 2).translate(bx + W / 2 - 0.5, by + 1.55, bz - D / 2));
    wins.push(boxUV(W - 2, 1.3, 0.06, 1, [1, 1, 1], 1).translate(bx, by + 1.55, bz - D / 2));
    // east wall with door + small window
    const doorZ = bz + 1.2;
    walls.push(boxUV(0.14, H, doorZ - 0.75 - (bz - D / 2), 2).translate(bx + W / 2, by + H / 2, (bz - D / 2 + doorZ - 0.75) / 2));
    walls.push(boxUV(0.14, H, bz + D / 2 - (doorZ + 0.75), 2).translate(bx + W / 2, by + H / 2, (doorZ + 0.75 + bz + D / 2) / 2));
    walls.push(boxUV(0.14, H - 2.0, 1.5, 2).translate(bx + W / 2, by + 2.0 + (H - 2.0) / 2, doorZ));
    wins.push(boxUV(0.05, 2.0, 1.5, 1, [1, 1, 1], 1).translate(bx + W / 2 - 0.05, by + 1.0, doorZ));
    // roof (ridge along z), rise 1.9, deep overhang
    const roofParts = gableRoof(W, D, 1.9, 1.1, 0.16, 2);
    roofParts.forEach((g) => roofs.push(g.translate(bx, by + H, bz)));
    walls.push(gableEnd(W, 1.9, 2).translate(bx, by + H, bz - D / 2));
    walls.push(gableEnd(W, 1.9, 2).rotateY(Math.PI).translate(bx, by + H, bz + D / 2));
    roofs.push(boxUV(0.3, 0.3, D + 2.6, 2).translate(bx, by + H + 1.95, bz)); // ridge beam
    // eaves beam over the engawa
    walls.push(boxUV(0.16, 0.16, D + 1, 2).translate(bx + W / 2 + 2.3, by + H - 0.1, bz));
    walls.push(boxUV(0.16, H, 0.16, 2).translate(bx + W / 2 + 2.3, by + H / 2, bz - D / 2));
    walls.push(boxUV(0.16, H, 0.16, 2).translate(bx + W / 2 + 2.3, by + H / 2, bz + D / 2));
    // engawa roof
    const eng = boxUV(2.8, 0.12, D + 1.2, 2);
    eng.rotateZ(-0.32);
    roofs.push(eng.translate(bx + W / 2 + 1.25, by + H + 0.25, bz));
    add(bh, M.deck, 'boathouse-floor');
    add(walls, M.wall, 'boathouse-walls');
    add(wins, M.window, 'boathouse-windows');
    add(roofs, M.roof, 'boathouse-roof');
    this.addLight(new THREE.Vector3(bx + W / 2 + 0.8, by + 1.2, doorZ), WARM, 7, 1.4, 0);
    this.addLight(new THREE.Vector3(bx, by + 1.5, bz - D / 2 - 1.0), WARM, 9, 1.1, 0);
    this.anchors.boathouse = new THREE.Vector3(bx, by, bz);

    // a door lantern under the eave
    const lanternGeo = chochin();
    const doorLantern = new THREE.Mesh(lanternGeo, M.lantern);
    doorLantern.position.set(bx + W / 2 + 1.6, by + H - 0.25, doorZ + 1.4);
    doorLantern.userData.castShadow = false;
    this.group.add(doorLantern);
    this.addLight(doorLantern.position.clone().add(new THREE.Vector3(0, -0.25, 0)), AMBER, 8, 2.0, 1.7);

    // ---------- Lantern strings ----------
    const eave = new THREE.Vector3(bx + W / 2 + 2.3, by + H + 0.1, bz - D / 2);
    const tree = new THREE.Vector3(bx - 5.5, 7.6, bz + 7.5);
    this.anchors.maple = new THREE.Vector3(bx - 6.5, height(bx - 6.5, bz + 8), bz + 8);
    this.addString(poleA, eave, 1.1, 6, lanternGeo, M.lantern);
    this.addString(poleA, poleB, 1.0, 6, lanternGeo, M.lantern);
    this.addString(new THREE.Vector3(bx, by + H + 1.9, bz - D / 2 - 1.0), tree, 0.7, 3, lanternGeo, M.lantern);

    // ---------- Boats ----------
    const hull = rowboatGeometry();
    this.moored = new THREE.Mesh(hull, M.boat);
    this.mooredBase.set(px + 3.6, 0.05, z1 + 4.5);
    this.moored.position.copy(this.mooredBase);
    this.moored.rotation.y = 0.12;
    this.moored.userData.castShadow = true;
    this.group.add(this.moored);
    this.boats.push({ x: this.mooredBase.x, z: this.mooredBase.z, heading: 0.12, speed: 0 });

    this.rowing = new THREE.Group();
    const rhull = new THREE.Mesh(hull, M.boat);
    rhull.userData.castShadow = true;
    const rower = new THREE.Mesh(rowerGeometry(), litMaterial({ outline: true }));
    rower.position.set(0, -0.2, 0.2);
    rower.rotation.y = Math.PI;
    rower.userData.castShadow = true;
    this.rowing.add(rhull, rower);
    const oarGeo = oarGeometry();
    for (const side of [-1, 1]) {
      const oar = new THREE.Mesh(oarGeo, litMaterial({ outline: true }));
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.62, 0.15, 0.3);
      oar.rotation.y = side * Math.PI / 2;
      oar.position.set(side * 0.9, 0, 0);
      pivot.add(oar);
      this.rowing.add(pivot);
      this.oars.push(pivot);
    }
    this.group.add(this.rowing);
    this.boats.push({ x: 0, z: 0, heading: 0, speed: 1 });

    // halos
    this.haloGeo = new THREE.InstancedBufferGeometry();
    this.haloGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
    this.haloGeo.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    this.haloGeo.setIndex([0, 1, 2, 0, 2, 3]);
    this.haloSources = this.lights.filter((l) => l.halo > 0).map((l) => ({ light: l, size: l.halo }));
    const n = this.haloSources.length;
    this.haloGeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
    this.haloGeo.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
    this.haloGeo.instanceCount = n;
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uLamps: U.uLamps, uClipPlane: U.uClipPlane, uGlow: { value: glowTex } },
      vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    const halos = new THREE.Mesh(this.haloGeo, haloMat);
    halos.frustumCulled = false;
    halos.renderOrder = 10;
    halos.name = 'halos';
    this.group.add(halos);

    this.anchors.pierEnd = new THREE.Vector3(px, deckY, z1);
    this.anchors.pierStart = new THREE.Vector3(px, deckY, z0);
  }

  private addLight(pos: THREE.Vector3, color: THREE.Color, radius: number, intensity: number, halo: number): PointLight {
    const l: PointLight = { pos, color: color.clone(), radius, intensity, halo, phase: this.lights.length * 1.37 };
    this.lights.push(l);
    return l;
  }

  private addString(a: THREE.Vector3, b: THREE.Vector3, sag: number, count: number, geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial): void {
    const SEG = 24;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
    const lmat = new THREE.ShaderMaterial({
      uniforms: { ...U, uColor: { value: new THREE.Color(0.1, 0.07, 0.06) } },
      vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
    });
    const line = new THREE.Line(lg, lmat);
    line.frustumCulled = false;
    this.group.add(line);
    const s: LanternString = { a: a.clone(), b: b.clone(), sag, line, lanterns: [] };
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const anchor = this.catenary(s, t, new THREE.Vector3());
      const obj = new THREE.Mesh(geo, mat);
      this.group.add(obj);
      const light = this.addLight(anchor.clone(), AMBER, 7.5, 2.0, 1.3);
      s.lanterns.push({ anchor, obj, light, phase: i * 1.9 + this.strings.length, drop: 0.25 + (i % 2) * 0.15 });
    }
    this.strings.push(s);
  }

  private catenary(s: LanternString, t: number, out: THREE.Vector3): THREE.Vector3 {
    out.lerpVectors(s.a, s.b, t);
    out.y -= s.sag * 4 * t * (1 - t);
    return out;
  }

  /** Per-frame animation: wind sway of strings & lanterns, boats bobbing and rowing. */
  update(time: number, wind: THREE.Vector4): void {
    const wd = new THREE.Vector2(wind.x, wind.y).normalize();
    const gust = (x: number, z: number) => {
      const along = x * wd.x + z * wd.y;
      const g = Math.sin(along * 0.045 - time * 1.3) * 0.5 + 0.5;
      return wind.z * (0.55 + wind.w * g);
    };
    const p = new THREE.Vector3();
    for (const s of this.strings) {
      const pos = s.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      const n = pos.count;
      const mid = this.catenary(s, 0.5, new THREE.Vector3());
      const g = gust(mid.x, mid.z);
      const swing = Math.sin(time * 1.4 + s.a.x) * 0.25 * g;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        this.catenary(s, t, p);
        const k = 4 * t * (1 - t);
        p.x += wd.x * swing * k; p.z += wd.y * swing * k;
        p.y += Math.abs(swing) * 0.15 * k;
        pos.setXYZ(i, p.x, p.y, p.z);
      }
      pos.needsUpdate = true;
      for (const L of s.lanterns) {
        const t = s.lanterns.indexOf(L);
        const tt = (t + 0.5) / s.lanterns.length;
        this.catenary(s, tt, p);
        const k = 4 * tt * (1 - tt);
        p.x += wd.x * swing * k; p.z += wd.y * swing * k;
        const pend = Math.sin(time * 2.2 + L.phase) * 0.12 * g;
        L.obj.position.set(p.x + wd.x * pend, p.y - L.drop, p.z + wd.y * pend);
        L.obj.rotation.set(-wd.y * pend * 0.6, time * 0.1 + L.phase, wd.x * pend * 0.6);
        L.light.pos.set(L.obj.position.x, L.obj.position.y - 0.25, L.obj.position.z);
      }
    }
    // halos follow their lights
    const ip = this.haloGeo.getAttribute('iPos') as THREE.InstancedBufferAttribute;
    const ic = this.haloGeo.getAttribute('iCol') as THREE.InstancedBufferAttribute;
    this.haloSources.forEach((h, i) => {
      ip.setXYZW(i, h.light.pos.x, h.light.pos.y, h.light.pos.z, h.size);
      ic.setXYZW(i, h.light.color.r * 0.3, h.light.color.g * 0.3, h.light.color.b * 0.3, h.light.phase);
    });
    ip.needsUpdate = true; ic.needsUpdate = true;

    // moored boat bobs and knocks gently against its post
    const bob = Math.sin(time * 1.1) * 0.04 + Math.sin(time * 2.3) * 0.015;
    this.moored.position.set(this.mooredBase.x + Math.sin(time * 0.5) * 0.08, this.mooredBase.y + bob, this.mooredBase.z);
    this.moored.rotation.set(Math.sin(time * 1.3) * 0.03, 0.12 + Math.sin(time * 0.37) * 0.05, Math.sin(time * 0.9) * 0.04);

    // the rowing boat crosses the lake on a long loop
    const ang = time * 0.006 + 2.2;
    const cx = 10, cz = -60, rx = 190, rz = 120;
    let x = cx + Math.cos(ang) * rx, z = cz + Math.sin(ang) * rz;
    const dx = -Math.sin(ang) * rx, dz = Math.cos(ang) * rz;
    let heading = Math.atan2(dx, dz);
    if (this.rowOverride) ({ x, z, heading } = this.rowOverride);
    const stroke = Math.sin(time * 1.6);
    this.rowing.position.set(x, 0.05 + Math.abs(stroke) * 0.02, z);
    this.rowing.rotation.set(0, heading, Math.sin(time * 0.8) * 0.02);
    this.oars.forEach((o, i) => {
      const side = i === 0 ? -1 : 1;
      o.rotation.set(0, side * stroke * 0.5, side * (0.15 + 0.12 * Math.cos(time * 1.6)));
    });
    const rb = this.boats[1]!;
    rb.x = x; rb.z = z; rb.heading = heading; rb.speed = 0.8 + 0.2 * Math.max(0, stroke);
    const mb = this.boats[0]!;
    mb.x = this.moored.position.x; mb.z = this.moored.position.z;
    this.anchors.rowboat = this.rowing.position.clone();
  }

  /** Height of walkable decks at (x, z), or -Infinity. */
  deckHeight(x: number, z: number): number {
    let h = -Infinity;
    for (const [x0, z0, x1, z1, y] of this.decks) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) h = Math.max(h, y);
    return h;
  }
}
