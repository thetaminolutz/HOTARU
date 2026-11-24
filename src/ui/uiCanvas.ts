/**
 * The pixel UI layer (SPEC §9.4): a low-resolution 2D canvas, integer-scaled with
 * nearest-neighbour so UI pixels are exactly the size of world pixels.
 */
import { Pixmap } from '../render/pixmap';
import { bodyFont, type BitmapFont } from './font';

export type TextOpts = { shadow?: number; outline?: number; align?: 'left' | 'center' | 'right'; alpha?: number };

export class UICanvas {
  readonly ctx: CanvasRenderingContext2D;
  pix: Pixmap = new Pixmap(1, 1);
  private img: ImageData | null = null;
  scale = 1;
  /** Safe-area insets in UI pixels. */
  safe = { top: 0, right: 0, bottom: 0, left: 0 };

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    this.ctx.imageSmoothingEnabled = false;
  }

  get w(): number { return this.pix.w; }
  get h(): number { return this.pix.h; }

  /** Match the UI pixel grid to the world pixel grid (scale = device pixels per UI pixel). */
  resize(scale: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const dw = Math.floor(window.innerWidth * dpr), dh = Math.floor(window.innerHeight * dpr);
    this.scale = scale;
    const w = Math.ceil(dw / scale), h = Math.ceil(dh / scale);
    if (w !== this.pix.w || h !== this.pix.h) {
      this.pix = new Pixmap(w, h);
      this.canvas.width = w;
      this.canvas.height = h;
      this.img = this.ctx.createImageData(w, h);
    }
    this.canvas.style.width = (w * scale) / dpr + 'px';
    this.canvas.style.height = (h * scale) / dpr + 'px';
    const safeEl = document.getElementById('safe');
    if (safeEl) {
      const r = safeEl.getBoundingClientRect();
      const k = dpr / scale;
      this.safe = { top: Math.ceil(r.top * k), left: Math.ceil(r.left * k), right: Math.ceil((window.innerWidth - r.right) * k), bottom: Math.ceil((window.innerHeight - r.bottom) * k) };
    }
  }

  /** CSS client coordinates → UI pixel coordinates. */
  toUI(clientX: number, clientY: number): [number, number] {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    return [Math.floor((clientX * dpr) / this.scale), Math.floor((clientY * dpr) / this.scale)];
  }

  clear(): void { this.pix.data.fill(0); }

  present(): void {
    if (!this.img) return;
    this.img.data.set(this.pix.data);
    this.ctx.putImageData(this.img, 0, 0);
  }

  // ---------- drawing helpers ----------
  /** Alpha-blend a pixel (a in 0..255). */
  blend(x: number, y: number, c: number, a = 255): void {
    x |= 0; y |= 0;
    const p = this.pix;
    if (x < 0 || y < 0 || x >= p.w || y >= p.h || a <= 0) return;
    const i = (y * p.w + x) * 4, d = p.data;
    if (a >= 255) { d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255; return; }
    const t = a / 255, da = d[i + 3]! / 255, oa = t + da * (1 - t);
    const mix = (s: number, dd: number) => (s * t + dd * da * (1 - t)) / Math.max(oa, 1e-6);
    d[i] = mix((c >> 16) & 255, d[i]!); d[i + 1] = mix((c >> 8) & 255, d[i + 1]!); d[i + 2] = mix(c & 255, d[i + 2]!);
    d[i + 3] = Math.round(oa * 255);
  }

  rect(x: number, y: number, w: number, h: number, c: number, a = 255): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.blend(i, j, c, a);
  }

  /** Ordered-dither fill (pixel-art transparency). */
  ditherRect(x: number, y: number, w: number, h: number, c: number, density: number): void {
    const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if ((B[(j & 3) * 4 + (i & 3)]! + 0.5) / 16 < density) this.blend(i, j, c);
    }
  }

  hline(x0: number, x1: number, y: number, c: number, a = 255): void { for (let x = x0; x <= x1; x++) this.blend(x, y, c, a); }
  vline(x: number, y0: number, y1: number, c: number, a = 255): void { for (let y = y0; y <= y1; y++) this.blend(x, y, c, a); }

  line(x0: number, y0: number, x1: number, y1: number, c: number, a = 255): void {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.blend(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  disc(cx: number, cy: number, r: number, c: number, a = 255): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.blend(x, y, c, a);
  }

  /** Draw a pixmap sprite (optionally scaled by an integer). */
  sprite(src: Pixmap, x: number, y: number, scale = 1, alpha = 1): void {
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) {
      const a = src.alpha(i, j);
      if (!a) continue;
      const c = src.get(i, j);
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) this.blend(x + i * scale + sx, y + j * scale + sy, c, a * alpha);
    }
  }

  /** 9-slice: corners copied, edges and centre tiled (never stretched, keeps pixel texture). */
  nine(src: Pixmap, x: number, y: number, w: number, h: number, c: number): void {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const sw = src.w, sh = src.h, mw = sw - 2 * c, mh = sh - 2 * c;
    for (let j = 0; j < h; j++) {
      const sy = j < c ? j : j >= h - c ? sh - (h - j) : c + ((j - c) % mh);
      for (let i = 0; i < w; i++) {
        const sx = i < c ? i : i >= w - c ? sw - (w - i) : c + ((i - c) % mw);
        const a = src.alpha(sx, sy);
        if (a) this.blend(x + i, y + j, src.get(sx, sy), a);
      }
    }
  }

  text(font: BitmapFont, s: string, x: number, y: number, color: number, o: TextOpts = {}): number {
    const w = font.measure(s);
    let cx = Math.round(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x);
    y = Math.round(y);
    const a = Math.round((o.alpha ?? 1) * 255);
    const drawGlyphs = (ox: number, oy: number, col: number) => {
      let px = cx + ox;
      for (const ch of s) {
        if (ch === ' ') { px += font.spaceWidth; continue; }
        const g = font.glyph(ch);
        if (!g) { px += 4; continue; }
        for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (g.bits[j * g.w + i]) this.blend(px + i, y + oy + j, col, a);
        px += g.w + font.spacing;
      }
    };
    if (o.outline !== undefined) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) drawGlyphs(dx, dy, o.outline);
    if (o.shadow !== undefined) drawGlyphs(1, 1, o.shadow);
    drawGlyphs(0, 0, color);
    cx += 0;
    return w;
  }

  /** Multi-line wrapped text block; returns the height used. */
  textBlock(font: BitmapFont, s: string, x: number, y: number, maxW: number, color: number, o: TextOpts = {}): number {
    const lines = font.wrap(s, maxW);
    lines.forEach((l, i) => this.text(font, l, o.align === 'center' ? x + maxW / 2 : x, y + i * font.lineHeight, color, o));
    return lines.length * font.lineHeight;
  }
}

export { bodyFont };
