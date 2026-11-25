/**
 * Procedural pixel art for the UI (SPEC §9.4): washi paper, lacquered wood, indigo cloth,
 * wooden plaques, paper lanterns, hanko seal, firefly, koi stick. All generated in code.
 */
import { Pixmap, rngFor, shadeHex, mixHex } from '../render/pixmap';

export const C = {
  ink: 0x2a1e24, inkSoft: 0x4a3a3e, paper: 0xf1e4c6, paperDark: 0xdcc8a2, paperLight: 0xfbf3df,
  lacquer: 0x2a1418, lacquerHi: 0x4a2228, gold: 0xd8a84a, goldHi: 0xffe08a, goldDark: 0x8a5a24,
  indigo: 0x1c2550, indigoHi: 0x33406b, indigoDark: 0x0e1430, moon: 0x7d8fc2,
  amber: 0xffb347, amberCore: 0xffe6a3, ember: 0xe2622b, vermilion: 0xc2452f, seal: 0xb8322a,
  wood: 0x8a4f2a, woodDark: 0x4e2e22, woodLight: 0xb0703a, string: 0x5a3a2a, night: 0x0e1430,
};

/** Washi paper 9-slice source (corner 6): fibre texture, deckled edge, soft shadow. */
export function washi(seed = 'washi'): Pixmap {
  const S = 30, p = new Pixmap(S, S), r = rngFor(seed);
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    let c = r.chance(0.12) ? C.paperDark : r.chance(0.06) ? C.paperLight : C.paper;
    const edge = Math.min(x - 1, y - 1, S - 2 - x, S - 2 - y);
    if (edge === 0 && r.chance(0.35)) continue; // deckle
    if (edge === 0) c = C.paperDark;
    p.set(x, y, c);
  }
  // fibres
  for (let i = 0; i < 18; i++) {
    const x = r.int(3, S - 6), y = r.int(3, S - 4), len = r.int(2, 4);
    for (let k = 0; k < len; k++) p.set(x + k, y + (k > 1 ? 1 : 0), C.paperDark);
  }
  // shadow on bottom/right
  for (let x = 2; x < S; x++) if (!p.alpha(x, S - 1)) p.set(x, S - 1, 0x000000, 60);
  for (let y = 2; y < S; y++) if (!p.alpha(S - 1, y)) p.set(S - 1, y, 0x000000, 60);
  return p;
}

/** Dark lacquered wood frame with gold pixel highlights (corner 7). */
export function lacquer(): Pixmap {
  const S = 22, p = new Pixmap(S, S);
  p.rect(0, 0, S, S, C.lacquer);
  for (let i = 0; i < S; i++) { p.set(i, 0, C.ink); p.set(i, S - 1, C.ink); p.set(0, i, C.ink); p.set(S - 1, i, C.ink); }
  for (let i = 2; i < S - 2; i++) { p.set(i, 2, C.goldDark); p.set(i, S - 3, C.goldDark); p.set(2, i, C.goldDark); p.set(S - 3, i, C.goldDark); }
  for (let i = 3; i < S - 3; i++) p.set(i, 1, C.lacquerHi);
  // gold corner studs with highlight
  for (const [x, y] of [[2, 2], [S - 3, 2], [2, S - 3], [S - 3, S - 3]] as const) {
    p.set(x, y, C.gold); p.set(x + (x < 5 ? 1 : -1), y, C.goldDark); p.set(x, y + (y < 5 ? 1 : -1), C.goldDark);
  }
  p.set(2, 2, C.goldHi);
  // inner lacquer sheen
  for (let y = 4; y < S - 4; y++) for (let x = 4; x < S - 4; x++) p.set(x, y, (x + y) % 9 === 0 ? C.lacquerHi : C.lacquer);
  return p;
}

/** Indigo cloth (furoshiki) panel for night menus, with woven texture and stitched border (corner 6). */
export function indigoCloth(): Pixmap {
  const S = 24, p = new Pixmap(S, S), r = rngFor('indigo');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const weave = (x + y) % 2 === 0 ? C.indigo : shadeHex(C.indigo, 0.9);
    p.set(x, y, r.chance(0.04) ? C.indigoHi : weave);
  }
  for (let i = 0; i < S; i++) { p.set(i, 0, C.indigoDark); p.set(i, S - 1, C.indigoDark); p.set(0, i, C.indigoDark); p.set(S - 1, i, C.indigoDark); }
  for (let i = 3; i < S - 3; i += 2) { p.set(i, 2, C.moon); p.set(i, S - 3, C.moon); p.set(2, i, C.moon); p.set(S - 3, i, C.moon); }
  return p;
}

/** Wooden plaque (menu button) 9-slice source (corner 5). state: 0 normal, 1 hover/selected. */
export function plaque(state = 0): Pixmap {
  const W = 24, H = 16, p = new Pixmap(W, H), r = rngFor('plaque');
  const base = state ? 0x9a5a30 : C.wood;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue; // rounded corners
    let c = base;
    if (y % 4 === 1 && r.chance(0.5)) c = shadeHex(base, 0.88); // grain
    if (y === 1) c = shadeHex(base, 1.25);
    if (y >= H - 3) c = shadeHex(base, 0.78);
    if (edge) c = C.woodDark;
    p.set(x, y, c);
  }
  if (state) for (let x = 1; x < W - 1; x++) { p.set(x, 0, C.amber); p.set(x, H - 1, C.ember); }
  return p;
}

/** Paper lantern toggle icon 9×12. */
export function lanternIcon(on: boolean, flicker = 1): Pixmap {
  const p = new Pixmap(13, 16);
  const body = on ? mixHex(C.amber, C.amberCore, 0.3 * flicker) : 0x9a8a78;
  const rib = on ? C.ember : 0x6a5a50;
  if (on) for (let y = 0; y < 16; y++) for (let x = 0; x < 13; x++) {
    const d = Math.hypot(x - 6, y - 8);
    if (d < 6.5 && d > 4.2 && (x + y) % 2 === 0) p.set(x, y, C.amber, 140);
  }
  p.rect(5, 1, 3, 1, C.ink);
  p.rect(4, 2, 5, 1, C.ink);
  const rows = [3, 5, 6, 7, 7, 7, 6, 5];
  rows.forEach((hw, i) => {
    const y = 3 + i;
    for (let x = 6 - Math.floor(hw / 2); x <= 6 + Math.floor(hw / 2); x++) p.set(x, y, i % 3 === 0 ? rib : body);
  });
  p.rect(4, 11, 5, 1, C.ink);
  p.rect(5, 12, 3, 1, C.ink);
  if (on) { p.set(6, 6, C.amberCore); p.set(6, 7, 0xffffff); }
  return p;
}

/** Bead for sliders, 7×7. */
export function bead(color: number): Pixmap {
  const p = new Pixmap(7, 7);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const d = Math.hypot(x - 3, y - 3);
    if (d > 3.2) continue;
    let c = color;
    if (d > 2.4) c = shadeHex(color, 0.55);
    else if (x + y < 5) c = shadeHex(color, 1.35);
    p.set(x, y, c);
  }
  p.set(2, 2, 0xffffff);
  return p;
}

/** Original kanji-like emblem: a firefly over water inside a red hanko seal (19×19). */
export function seal(): Pixmap {
  const S = 19, p = new Pixmap(S, S), r = rngFor('seal');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
    if (edge && r.chance(0.25)) continue; // stamped, uneven ink
    p.set(x, y, r.chance(0.06) ? shadeHex(C.seal, 1.2) : C.seal);
  }
  const W = C.paperLight;
  const g = [
    '.................',
    '........#........',
    '.......###.......',
    '...##...#...##...',
    '....###.#.###....',
    '......#####......',
    '.....#######.....',
    '......#####......',
    '.......###.......',
    '........#........',
    '.................',
    '..#############..',
    '.................',
    '...##.##.##.##...',
    '.................',
    '....##.###.##....',
    '.................',
  ];
  g.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') p.set(x + 1, y + 1, W); });
  for (let i = 0; i < 6; i++) p.set(r.int(1, S - 1), r.int(1, S - 1), shadeHex(C.seal, 0.85)); // ink speckle
  return p;
}

/** Firefly sprite 5×5: bright core with a soft pixel halo. */
export function firefly(bright = 1): Pixmap {
  const p = new Pixmap(5, 5);
  p.set(2, 2, 0xf6ffb0);
  for (const [x, y] of [[1, 2], [3, 2], [2, 1], [2, 3]] as const) p.set(x, y, 0xc8e86a, Math.round(170 * bright));
  for (const [x, y] of [[0, 2], [4, 2], [2, 0], [2, 4]] as const) p.set(x, y, 0x8ab84a, Math.round(70 * bright));
  return p;
}

/** Touch stick: stone disc with a koi emblem (33×33). */
export function koiStick(): Pixmap {
  const S = 33, p = new Pixmap(S, S), r = rngFor('koi');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - 16, y - 16);
    if (d > 16) continue;
    let c = 0x6a6470;
    if (d > 14.6) c = 0x2e2a34;
    else if (d > 13.2) c = 0x8a8494;
    else if (r.chance(0.08)) c = 0x5a5462;
    if (x + y < 20 && d < 13) c = shadeHex(c, 1.12);
    p.set(x, y, c);
  }
  // koi: curved body, tail, red patches
  const koi = [
    '.....##......',
    '...######....',
    '..##########.',
    '.###########.',
    '..#########..',
    '....#####....',
    '.....###.....',
    '....#.#.#....',
    '...#.....#...',
  ];
  koi.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') p.set(10 + x, 11 + y, (x + y) % 4 === 0 ? C.vermilion : 0xf4ecdc); });
  p.set(19, 13, C.ink);
  return p;
}

/** Small lacquer token button (19×19) with a pixel icon drawn by the caller. */
export function token(pressed = false): Pixmap {
  const S = 19, p = new Pixmap(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - 9, y - 9);
    if (d > 9.2) continue;
    let c = pressed ? C.lacquerHi : C.lacquer;
    if (d > 8.2) c = C.ink;
    else if (d > 7.2) c = C.goldDark;
    else if (y < 6 && d < 6) c = shadeHex(c, 1.3);
    p.set(x, y, c);
  }
  return p;
}

/** Pixel lantern for the loading screen (24×34), lit amount 0..1. */
export function bigLantern(lit: number, flicker: number): Pixmap {
  const p = new Pixmap(24, 34);
  const glow = mixHex(0x8a7a6a, mixHex(C.amber, C.amberCore, flicker * 0.5), lit);
  const rib = mixHex(0x5a4a40, C.ember, lit);
  p.rect(9, 0, 6, 2, C.ink);
  p.rect(7, 2, 10, 2, C.ink);
  const widths = [12, 16, 18, 20, 20, 20, 20, 20, 20, 18, 16, 12];
  widths.forEach((w, i) => {
    for (let k = 0; k < 2; k++) {
      const y = 4 + i * 2 + k;
      const x0 = 12 - w / 2;
      for (let x = x0; x < x0 + w; x++) {
        let c = i % 3 === 0 && k === 0 ? rib : glow;
        if (x === x0 || x === x0 + w - 1) c = rib;
        if (lit > 0.3 && Math.abs(x - 11.5) < 2 && i > 3 && i < 9) c = mixHex(c, 0xffffff, lit * 0.6);
        p.set(x, y, c);
      }
    }
  });
  p.rect(7, 28, 10, 2, C.ink);
  p.rect(9, 30, 6, 2, C.ink);
  p.rect(11, 32, 2, 2, C.vermilion);
  return p;
}
