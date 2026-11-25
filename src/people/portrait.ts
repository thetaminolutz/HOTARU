/**
 * Pixel portraits for the dialogue box (SPEC §16): 28×28, drawn from a person's look — skin,
 * hair (a bun for adults, white for elders), kimono collar and obi colour, a straw hat, the fox
 * mask of the masked stranger. Cached per person.
 */
import { Pixmap, shadeHex } from '../render/pixmap';
import type { Person } from './people';

const cache = new Map<string, Pixmap>();
const toHex = (c: { r: number; g: number; b: number }) => {
  const s = (v: number) => Math.round(Math.pow(Math.max(0, Math.min(1, v * 1.4)), 1 / 2.2) * 255);
  return (s(c.r) << 16) | (s(c.g) << 8) | s(c.b);
};

export function portrait(p: Person): Pixmap {
  const key = p.id + (p.unmasked ? '-u' : '');
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 28, m = new Pixmap(S, S);
  const bg = 0xe8d8b4, kim = toHex(p.clothes[0]), acc = toHex(p.clothes[1]), hair = toHex(p.hair);
  const skin = p.skin < 0.25 ? 0xf0c8a0 : 0xd8a478;
  m.fill(bg);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((x * 7 + y * 13) % 11 === 0) m.set(x, y, shadeHex(bg, 0.94));
  const child = p.age === 'child', elder = p.age === 'elder';
  const cx = 14, top = child ? 10 : 8, fw = child ? 10 : 11, fh = child ? 10 : 12;
  // shoulders and the crossed kimono collar
  for (let y = 21; y < S; y++) for (let x = 3; x < 25; x++) m.set(x, y, kim);
  for (let k = 0; k < 6; k++) {
    m.set(cx - 1 - k, 21 + k, acc); m.set(cx - 2 - k, 21 + k, acc);
    m.set(cx + k, 21 + k, shadeHex(acc, 0.85)); m.set(cx + 1 + k, 21 + k, shadeHex(acc, 0.85));
  }
  for (let y = 19; y < 22; y++) for (let x = cx - 2; x < cx + 2; x++) m.set(x, y, shadeHex(skin, 0.88)); // neck
  // face
  for (let y = top; y < top + fh; y++) for (let x = cx - (fw >> 1); x < cx + (fw >> 1); x++) {
    const corner = y === top + fh - 1 && (x === cx - (fw >> 1) || x === cx + (fw >> 1) - 1);
    if (!corner) m.set(x, y, y > top + fh - 3 ? shadeHex(skin, 0.93) : skin);
  }
  // hair (and a bun for grown-ups)
  for (let y = top - 3; y < top + 3; y++) for (let x = cx - (fw >> 1) - 1; x < cx + (fw >> 1) + 1; x++) {
    if (y < top + 1 || x < cx - (fw >> 1) + 1 || x > cx + (fw >> 1) - 2) m.set(x, y, hair);
  }
  if (!child) for (let y = top - 6; y < top - 2; y++) for (let x = cx - 2; x < cx + 2; x++) m.set(x, y, hair);
  // eyes, brows, cheeks, mouth
  const ey = top + Math.round(fh * 0.45);
  for (const ex of [cx - 3, cx + 2]) { m.set(ex, ey, 0x2a1e1a); if (!child) m.set(ex, ey - 2, shadeHex(hair, 0.8)); }
  if (elder) { m.set(cx - 4, ey + 1, shadeHex(skin, 0.8)); m.set(cx + 3, ey + 1, shadeHex(skin, 0.8)); }
  m.set(cx - 1, ey + 3, 0xb0605a); m.set(cx, ey + 3, 0xb0605a);
  if (child) { m.set(cx - 4, ey + 2, 0xf0a090); m.set(cx + 3, ey + 2, 0xf0a090); }
  // straw hat
  if (p.hat) for (let y = 0; y < 6; y++) for (let x = cx - 3 - y * 2; x < cx + 3 + y * 2; x++) {
    if (x >= 1 && x < S - 1) m.set(x, top - 7 + y, (x + y) % 3 === 0 ? 0xa88a4a : 0xc8a860);
  }
  // the fox mask
  if (p.wanderer?.id === 'masked' && !p.unmasked) {
    for (let y = top; y < top + fh; y++) for (let x = cx - (fw >> 1); x < cx + (fw >> 1); x++) m.set(x, y, 0xf4f0e8);
    for (const ex of [cx - 5, cx + 4]) { m.set(ex, top - 1, 0xf4f0e8); m.set(ex, top - 2, 0xf4f0e8); }
    for (const ex of [cx - 3, cx + 2]) { m.set(ex, ey, 0x1a1418); m.set(ex - 1, ey - 1, 0xc83a2a); m.set(ex + 1, ey - 1, 0xc83a2a); }
    m.set(cx - 1, ey + 3, 0xc83a2a); m.set(cx, ey + 3, 0xc83a2a);
  }
  // frame
  for (let i = 0; i < S; i++) { m.set(i, 0, 0x4e2e22); m.set(i, S - 1, 0x4e2e22); m.set(0, i, 0x4e2e22); m.set(S - 1, i, 0x4e2e22); }
  cache.set(key, m);
  return m;
}
