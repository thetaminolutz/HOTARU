/**
 * Photos and sketches (SPEC §11): frames around the captured pixel image, the ink-wash
 * "sketchbook" conversion (edges + washes + paper + ink pooling), album encoding and download,
 * and the simple faceless traveller for self-portraits (straw hat, indigo haori).
 */
import * as THREE from 'three';
import { boxUV, mergeGeoms } from '../buildings/kit';
import { litMaterial, ensureColor } from '../render/materials';
import { createRng } from '../core/rng';

export type Img = { w: number; h: number; px: Uint8ClampedArray };
export const FRAMES = ['none', 'washi', 'polaroid', 'scroll'] as const;
export const FILTERS = ['none', 'sepia', 'ukiyo-e', 'ink', 'night blue'] as const;

/** GL pixels (bottom-up) → top-down image. */
export function fromGL(gl: Uint8Array, w: number, h: number): Img {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) px.set(gl.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  return { w, h, px };
}

const paperAt = (x: number, y: number) => {
  const n = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  return 236 + ((n >> 5) % 12) - ((x + y * 3) % 7 === 0 ? 6 : 0);
};

/** Shrink by a whole factor so the longest side fits `max` (keeps crisp pixels). */
export function shrink(img: Img, max = 300): Img {
  const k = Math.ceil(Math.max(img.w, img.h) / max);
  if (k <= 1) return img;
  const w = Math.floor(img.w / k), h = Math.floor(img.h / k), px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(img.px.subarray(((y * k) * img.w + x * k) * 4, ((y * k) * img.w + x * k) * 4 + 4), (y * w + x) * 4);
  return { w, h, px };
}

/** Put a frame around an image (returns a new, larger image). */
export function frame(img: Img, kind: (typeof FRAMES)[number]): Img {
  if (kind === 'none') return img;
  const b = kind === 'polaroid' ? { l: 8, r: 8, t: 8, btm: 26 } : kind === 'scroll' ? { l: 14, r: 14, t: 6, btm: 6 } : { l: 10, r: 10, t: 10, btm: 10 };
  const w = img.w + b.l + b.r, h = img.h + b.t + b.btm, px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, ix = x - b.l, iy = y - b.t;
    if (ix >= 0 && iy >= 0 && ix < img.w && iy < img.h) { px.set(img.px.subarray((iy * img.w + ix) * 4, (iy * img.w + ix) * 4 + 4), i); continue; }
    let c: [number, number, number];
    if (kind === 'polaroid') c = [246, 244, 238];
    else if (kind === 'scroll') {
      const rod = x < 5 || x >= w - 5;
      c = rod ? [92 + (y % 6 === 0 ? -20 : 0), 52, 36] : [196, 160, 98];
    } else { const p = paperAt(x, y); c = [p, p - 10, p - 34]; }
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  // washi: a deckled inner edge; polaroid: a small hanko in the corner
  if (kind === 'washi') for (let x = b.l - 1; x < w - b.r + 1; x++) for (const y of [b.t - 1, h - b.btm]) { const i = (y * w + x) * 4; px[i] = px[i + 1] = px[i + 2] = 190 - (x % 3) * 8; }
  if (kind === 'polaroid') for (let y = h - 18; y < h - 10; y++) for (let x = w - 18; x < w - 10; x++) { const i = (y * w + x) * 4; const edge = y === h - 18 || y === h - 11 || x === w - 18 || x === w - 11; px[i] = 184; px[i + 1] = edge ? 50 : 70; px[i + 2] = edge ? 42 : 60; }
  return { w, h, px };
}

/** The sketchbook: the view as an ink-wash drawing on paper. */
export function inkWash(img: Img, seed = 1): Img {
  const { w, h, px } = img, L = new Float32Array(w * h), out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) L[i] = (px[i * 4]! * 0.3 + px[i * 4 + 1]! * 0.55 + px[i * 4 + 2]! * 0.15) / 255;
  // soften first: the dither pattern isn't something an ink brush would draw
  const tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let d = -2; d <= 2; d++) { const xx = x + d; if (xx >= 0 && xx < w) { s += L[y * w + xx]!; n++; } } tmp[y * w + x] = s / n; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let d = -2; d <= 2; d++) { const yy = y + d; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]!; n++; } } L[y * w + x] = s / n; }
  }
  const at = (x: number, y: number) => L[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  const r = createRng(seed);
  const drift = Array.from({ length: 8 }, () => r.range(-1, 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
    const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
    const edge = Math.hypot(gx, gy);
    // washes: three tones of grey ink, edges of a wash pool darker
    const l = at(x, y), tone = l < 0.16 ? 3 : l < 0.33 ? 2 : l < 0.55 ? 1 : 0;
    const nb = Math.max(...[at(x + 2, y), at(x - 2, y), at(x, y + 2), at(x, y - 2)].map((v) => (v < 0.16 ? 3 : v < 0.33 ? 2 : v < 0.55 ? 1 : 0)));
    const pool = nb > tone ? 0.08 : 0;
    const wobble = drift[(x >> 4) & 7]! * 0.02 + drift[(y >> 4) & 7]! * 0.02;
    let ink = [0, 0.22, 0.42, 0.7][tone]! + pool + wobble;
    if (edge > 0.22) ink = Math.max(ink, 0.9);
    else if (edge > 0.12) ink = Math.max(ink, 0.55);
    const p = paperAt(x, y);
    const i = (y * w + x) * 4;
    out[i] = p - ink * (p - 34); out[i + 1] = p - 6 - ink * (p - 6 - 30); out[i + 2] = p - 22 - ink * (p - 22 - 36); out[i + 3] = 255;
  }
  // a red seal in the corner
  for (let y = h - 14; y < h - 5; y++) for (let x = w - 14; x < w - 5; x++) { const i = (y * w + x) * 4; out[i] = 178; out[i + 1] = 48; out[i + 2] = 40; }
  return { w, h, px: out };
}

/** Draw an ink stroke into an image (Apple Pencil: width from pressure). */
export function inkLine(img: Img, x0: number, y0: number, x1: number, y1: number, width: number, color: [number, number, number] = [36, 30, 36]): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const r = Math.max(0.5, width / 2);
  for (let s = 0; s <= n; s++) {
    const cx = x0 + ((x1 - x0) * s) / n, cy = y0 + ((y1 - y0) * s) / n;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h || Math.hypot(x - cx, y - cy) > r) continue;
      const i = (y * img.w + x) * 4;
      img.px[i] = color[0]; img.px[i + 1] = color[1]; img.px[i + 2] = color[2];
    }
  }
}

/** Encode as a PNG data URL (album) or decode one back. */
export function encode(img: Img, scale = 1): string {
  const c = document.createElement('canvas');
  c.width = img.w * scale; c.height = img.h * scale;
  const ctx = c.getContext('2d')!;
  const tmp = document.createElement('canvas');
  tmp.width = img.w; tmp.height = img.h;
  tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.px), img.w, img.h), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
export function decode(url: string): Promise<Img> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(im, 0, 0);
      res({ w: im.width, h: im.height, px: ctx.getImageData(0, 0, im.width, im.height).data });
    };
    im.onerror = rej;
    im.src = url;
  });
}

/** Save a picture to the device (4× upscaled, crisp pixels). */
export async function download(img: Img, name: string): Promise<void> {
  const url = encode(img, 4);
  const blob = await (await fetch(url)).blob();
  const file = new File([blob], name + '.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Hotaru' }); return; } catch { /* cancelled: fall through */ } }
  const a = document.createElement('a');
  a.href = url; a.download = name + '.png';
  a.click();
}

/** The traveller (you) for self-portraits: faceless, straw hat, indigo haori. */
export function travellerMesh(): THREE.Mesh {
  const parts = [
    boxUV(0.16, 0.8, 0.18, 1, [0.22, 0.2, 0.24]).translate(-0.1, 0.4, 0),
    boxUV(0.16, 0.8, 0.18, 1, [0.22, 0.2, 0.24]).translate(0.1, 0.4, 0),
    boxUV(0.5, 0.66, 0.3, 1, [0.16, 0.2, 0.38]).translate(0, 1.12, 0),
    boxUV(0.52, 0.08, 0.32, 1, [0.62, 0.5, 0.3]).translate(0, 0.86, 0),
    boxUV(0.13, 0.6, 0.15, 1, [0.16, 0.2, 0.38]).translate(-0.32, 1.12, 0),
    boxUV(0.13, 0.6, 0.15, 1, [0.16, 0.2, 0.38]).translate(0.32, 1.12, 0),
    boxUV(0.24, 0.26, 0.24, 1, [0.72, 0.55, 0.42]).translate(0, 1.58, 0),
    ensureColor(new THREE.ConeGeometry(0.42, 0.22, 10).toNonIndexed().translate(0, 1.76, 0), [0.82, 0.7, 0.42]),
  ];
  const m = new THREE.Mesh(mergeGeoms(parts), litMaterial({ outline: true }));
  m.name = 'traveller';
  m.userData.castShadow = true;
  m.visible = false;
  return m;
}
