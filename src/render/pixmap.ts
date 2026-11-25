/** A tiny RGBA pixel buffer for generating pixel-art textures and UI art in code. */
import { createRng, type Rng } from '../core/rng';

export class Pixmap {
  readonly data: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: number, a = 255): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = (c >> 16) & 255; this.data[i + 1] = (c >> 8) & 255; this.data[i + 2] = c & 255; this.data[i + 3] = a;
  }
  /** Set with wrap-around (for tileable textures). */
  setW(x: number, y: number, c: number, a = 255): void {
    this.set(((x % this.w) + this.w) % this.w, ((y % this.h) + this.h) % this.h, c, a);
  }
  get(x: number, y: number): number {
    const i = (y * this.w + x) * 4;
    return (this.data[i]! << 16) | (this.data[i + 1]! << 8) | this.data[i + 2]!;
  }
  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3]!;
  }
  fill(c: number, a = 255): this { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c, a); return this; }
  rect(x: number, y: number, w: number, h: number, c: number, a = 255): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a);
  }
  hline(x0: number, x1: number, y: number, c: number): void { for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  vline(x: number, y0: number, y1: number, c: number): void { for (let y = y0; y <= y1; y++) this.set(x, y, c); }
  disc(cx: number, cy: number, r: number, c: number, a = 255): void {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c, a);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Draw another pixmap (alpha > 0 pixels only). */
  blit(src: Pixmap, dx: number, dy: number): void {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const a = src.alpha(x, y);
      if (a > 0) this.set(dx + x, dy + y, src.get(x, y), a);
    }
  }
}

export const rngFor = (name: string): Rng => createRng(0x51ed ^ name.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));

/** Shade a 0xRRGGBB colour by factor (multiplicative, clamped). */
export function shadeHex(c: number, f: number): number {
  const r = Math.min(255, ((c >> 16) & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export function mixHex(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
