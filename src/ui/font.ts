/**
 * Bitmap font rendering. Glyphs become 1-bit masks; text is drawn into a Pixmap-like 2D
 * context pixel by pixel via an offscreen glyph atlas per colour (cached).
 */
import { BODY_GLYPHS, TINY_GLYPHS } from './data/fontBody';

export type Glyph = { w: number; h: number; bits: Uint8Array; top: number };

export class BitmapFont {
  readonly glyphs = new Map<string, Glyph>();
  constructor(readonly lineHeight: number, readonly spacing: number, readonly spaceWidth: number, readonly baseline: number) {}

  static fromStrings(defs: Record<string, string>, lineHeight: number, spacing: number, spaceWidth: number, baseline: number): BitmapFont {
    const f = new BitmapFont(lineHeight, spacing, spaceWidth, baseline);
    for (const [ch, def] of Object.entries(defs)) {
      const rows = def.split('|');
      const w = Math.max(...rows.map((r) => r.length));
      const h = rows.length;
      const bits = new Uint8Array(w * h);
      rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') bits[y * w + x] = 1; });
      f.glyphs.set(ch, { w, h, bits, top: 0 });
    }
    return f;
  }

  glyph(ch: string): Glyph | undefined {
    return this.glyphs.get(ch) ?? this.glyphs.get(ch.toUpperCase()) ?? this.glyphs.get('?');
  }

  charWidth(ch: string): number {
    if (ch === ' ') return this.spaceWidth;
    return (this.glyph(ch)?.w ?? 3) + this.spacing;
  }

  measure(text: string): number {
    let w = 0;
    for (const ch of text) w += this.charWidth(ch);
    return Math.max(0, w - this.spacing);
  }

  /** Word-wrap into lines no wider than maxW. */
  wrap(text: string, maxW: number): string[] {
    const out: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const tryLine = line ? line + ' ' + word : word;
        if (this.measure(tryLine) > maxW && line) { out.push(line); line = word; } else line = tryLine;
      }
      out.push(line);
    }
    return out;
  }
}

/** Scale2x (EPX) on a 1-bit glyph → smoother 2× shapes. */
function scale2x(g: Glyph): Glyph {
  const W = g.w * 2, H = g.h * 2, bits = new Uint8Array(W * H);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? 0 : g.bits[y * g.w + x]!);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    let e0 = P, e1 = P, e2 = P, e3 = P;
    if (C === A && C !== D && A !== B) e0 = A;
    if (A === B && A !== C && B !== D) e1 = B;
    if (D === C && D !== B && C !== A) e2 = C;
    if (B === D && B !== A && D !== C) e3 = D;
    bits[(y * 2) * W + x * 2] = e0; bits[(y * 2) * W + x * 2 + 1] = e1;
    bits[(y * 2 + 1) * W + x * 2] = e2; bits[(y * 2 + 1) * W + x * 2 + 1] = e3;
  }
  return { w: W, h: H, bits, top: 0 };
}

/**
 * Brush heading font: body glyphs upscaled with Scale2x, then vertical strokes thickened
 * (thick downstrokes, thin horizontals) and stroke ends tapered — an ink-brush feel.
 */
function brushify(g: Glyph): Glyph {
  const s = scale2x(g);
  const W = s.w + 1, H = s.h, bits = new Uint8Array(W * H);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= s.w || y >= s.h ? 0 : s.bits[y * s.w + x]!);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = at(x, y);
    // thicken pixels that belong to a vertical run of ≥3
    const vert = at(x - 1, y) && (at(x - 1, y - 1) + at(x - 1, y + 1) + at(x - 1, y - 2) + at(x - 1, y + 2) >= 3);
    if (!v && vert) v = 1;
    bits[y * W + x] = v;
  }
  // taper: remove the top-right pixel of vertical stroke starts for a brush entry
  for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) {
    if (bits[y * W + x] && bits[y * W + x - 1] && (y === 0 || !bits[(y - 1) * W + x]) && (y === 0 || !bits[(y - 1) * W + x - 1]) && y + 3 < H && bits[(y + 3) * W + x]) {
      bits[y * W + x] = 0;
    }
  }
  return { w: W, h: H, bits, top: 0 };
}

export const bodyFont = BitmapFont.fromStrings(BODY_GLYPHS, 11, 1, 3, 7);
export const tinyFont = BitmapFont.fromStrings(TINY_GLYPHS, 7, 1, 2, 5);
export const headingFont = (() => {
  const f = new BitmapFont(22, 1, 6, 14);
  for (const [ch, g] of bodyFont.glyphs) f.glyphs.set(ch, brushify(g));
  return f;
})();
