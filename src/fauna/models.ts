/**
 * Animal bodies built from small boxes (SPEC §15: drawn in the pixel style, animated in code).
 * Every vertex carries its part (body, head, four legs, tail, two wings) and that part's pivot,
 * so the vertex shader can swing legs, lower the head to graze, wag tails and flap wings.
 * Local frame: +z forward, y up, origin on the ground under the body.
 */
import * as THREE from 'three';
import type { Species } from './data/species';
import { hexToLinear } from '../render/color';

export const PART = { body: 0, head: 1, fl: 2, fr: 3, bl: 4, br: 5, tail: 6, wingL: 7, wingR: 8 } as const;

type V3 = [number, number, number];

class Builder {
  pos: number[] = []; nor: number[] = []; col: number[] = []; part: number[] = []; piv: number[] = [];
  box(c: V3, s: V3, rgb: V3, part: number, pivot: V3 = [0, 0, 0], rot?: { x?: number; y?: number; z?: number }): void {
    const g = new THREE.BoxGeometry(Math.max(s[0], 0.004), Math.max(s[1], 0.004), Math.max(s[2], 0.004)).toNonIndexed();
    if (rot?.x) g.rotateX(rot.x);
    if (rot?.z) g.rotateZ(rot.z);
    if (rot?.y) g.rotateY(rot.y);
    g.translate(c[0], c[1], c[2]);
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      // a touch of top light baked in: tops a bit brighter, undersides darker
      const k = (n.getY(i) > 0.5 ? 1.08 : n.getY(i) < -0.5 ? 0.7 : 1) * 1.65;
      this.col.push(rgb[0] * k, rgb[1] * k, rgb[2] * k, 0);
      this.part.push(part);
      this.piv.push(...pivot);
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 4));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.piv, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Returns the geometry and the leg height (for lying down). */
export function buildAnimal(sp: Species): { geo: THREE.BufferGeometry; legH: number; height: number } {
  const B = new Builder();
  const C = sp.colors.map((h) => hexToLinear(h) as V3) as [V3, V3, V3, V3, V3];
  const [body, belly, head, legs, accent] = C;
  const S = sp.size;
  switch (sp.plan) {
    case 'quad': {
      const L = S * 0.62, H = S * 0.27, W = S * 0.22, lh = sp.legs ?? S * 0.4;
      const y = lh + H / 2;
      B.box([0, y, 0], [W, H, L], body, PART.body);
      B.box([0, y - H * 0.38, 0], [W * 0.9, H * 0.25, L * 0.8], belly, PART.body);
      // legs (pivot at the hip / shoulder)
      const lw = Math.max(0.025, S * 0.055);
      const legPos: [number, number, number][] = [[-1, 1, PART.fl], [1, 1, PART.fr], [-1, -1, PART.bl], [1, -1, PART.br]];
      for (const [sx, sz, part] of legPos) {
        const px = sx * (W / 2 - lw * 0.6), pz = sz * (L / 2 - lw);
        B.box([px, lh / 2, pz], [lw, lh + 0.02, lw * 1.1], legs, part, [px, lh, pz]);
        B.box([px, 0.012, pz + 0.01], [lw * 1.1, 0.025, lw * 1.4], legs, part, [px, lh, pz]);
      }
      // neck + head (pivot at the shoulders)
      const nk = sp.neck ?? S * 0.15, hs = S * 0.17;
      const pivot: V3 = [0, y + H * 0.2, L / 2 - 0.02];
      const ang = 0.75; // neck raised forward
      const nx = Math.sin(ang) * nk, ny = Math.cos(ang) * nk;
      if (nk > 0.04) B.box([0, pivot[1] + ny / 2, pivot[2] + nx / 2], [W * 0.55, nk + H * 0.3, W * 0.55], body, PART.head, pivot, { x: ang });
      const hy = pivot[1] + ny + hs * 0.2, hz = pivot[2] + nx + hs * 0.25;
      B.box([0, hy, hz], [hs * 0.9, hs * 0.85, hs], head, PART.head, pivot);
      B.box([0, hy - hs * 0.15, hz + hs * 0.6], [hs * 0.55, hs * 0.45, hs * 0.5], sp.pattern === 'mask' ? belly : head, PART.head, pivot); // snout
      B.box([0, hy - hs * 0.1, hz + hs * 0.86], [hs * 0.2, hs * 0.18, 0.02], [0.05, 0.04, 0.04], PART.head, pivot); // nose
      for (const sx of [-1, 1]) B.box([sx * hs * 0.32, hy + hs * 0.1, hz + hs * 0.45], [0.02, 0.02, 0.02], [0.03, 0.03, 0.03], PART.head, pivot); // eyes
      if (sp.pattern === 'mask') for (const sx of [-1, 1]) B.box([sx * hs * 0.3, hy + hs * 0.05, hz + hs * 0.35], [hs * 0.3, hs * 0.25, hs * 0.3], accent, PART.head, pivot);
      const ear = sp.ears ?? 'point';
      if (ear !== 'none') for (const sx of [-1, 1]) {
        const eh = ear === 'long' ? hs * 1.1 : ear === 'point' ? hs * 0.5 : hs * 0.35;
        B.box([sx * hs * 0.3, hy + hs * 0.4 + eh / 2, hz - hs * 0.2], [hs * (ear === 'round' ? 0.35 : 0.22), eh, hs * 0.12], head, PART.head, pivot, { z: sx * (ear === 'round' ? 0.6 : 0.15) });
      }
      if (sp.antlers) for (const sx of [-1, 1]) {
        B.box([sx * hs * 0.25, hy + hs * 0.8, hz - hs * 0.2], [0.025, hs * 1.2, 0.025], [0.5, 0.4, 0.3], PART.head, pivot, { z: -sx * 0.35 });
        B.box([sx * hs * 0.45, hy + hs * 1.2, hz - hs * 0.05], [0.02, hs * 0.6, 0.02], [0.5, 0.4, 0.3], PART.head, pivot, { x: 0.5 });
      }
      // tail (pivot at the rump)
      const tl = sp.tail ?? 0.1;
      const tp: V3 = [0, y + H * 0.3, -L / 2];
      const bushy = tl > 0.25 ? 0.6 : 0.3;
      B.box([0, tp[1] - tl * 0.3, tp[2] - tl * 0.45], [S * 0.06 * (1 + bushy), S * 0.06 * (1 + bushy), tl], body, PART.tail, tp, { x: -0.6 });
      if (sp.id === 'fox' || sp.id === 'cat') B.box([0, tp[1] - tl * 0.62, tp[2] - tl * 0.86], [S * 0.07, S * 0.07, tl * 0.2], sp.id === 'fox' ? accent : body, PART.tail, tp, { x: -0.6 });
      // patterns
      if (sp.pattern === 'spots') for (let i = 0; i < 10; i++) {
        const sx = i % 2 ? 1 : -1, z = -L * 0.35 + ((i >> 1) / 4) * L * 0.6;
        B.box([sx * (W / 2 + 0.002), y + H * (0.1 + (i % 3) * 0.08), z], [0.004, S * 0.03, S * 0.03], accent, PART.body);
      }
      if (sp.pattern === 'stripes') for (let i = 0; i < 4; i++) B.box([0, y + 0.002, -L * 0.3 + i * L * 0.2], [W * 1.02, H * 1.02, S * 0.03], accent, PART.body);
      if (sp.pattern === 'patches') {
        B.box([W * 0.2, y + H * 0.3, L * 0.1], [W * 0.75, H * 0.5, L * 0.3], accent, PART.body);
        B.box([-W * 0.25, y + H * 0.25, -L * 0.25], [W * 0.6, H * 0.55, L * 0.25], [0.12, 0.1, 0.1], PART.body);
        B.box([0, hy + hs * 0.3, hz - hs * 0.1], [hs * 0.95, hs * 0.4, hs * 0.6], accent, PART.head, pivot);
      }
      return { geo: B.build(), legH: lh, height: y + H };
    }
    case 'bird': {
      const tall = (sp.beak ?? 0) > 0.09;
      const L = S * 0.42, H = S * 0.24, W = S * 0.2;
      const lh = tall ? S * 0.5 : S * 0.12;
      const y = lh + H / 2;
      B.box([0, y, 0], [W, H, L], body, PART.body);
      B.box([0, y - H * 0.3, L * 0.05], [W * 0.85, H * 0.4, L * 0.75], belly, PART.body);
      for (const [sx, part] of [[-1, PART.fl], [1, PART.fr]] as const) {
        const px = sx * W * 0.22;
        B.box([px, lh / 2, 0], [0.012 + S * 0.015, lh, 0.012 + S * 0.015], legs, part, [px, lh, 0]);
      }
      const nk = tall ? S * 0.38 : S * 0.06, hs = S * 0.13;
      const pivot: V3 = [0, y + H * 0.25, L * 0.4];
      if (nk > 0.05) B.box([0, pivot[1] + nk / 2, pivot[2] + nk * 0.1], [W * 0.3, nk, W * 0.3], tall ? head : body, PART.head, pivot);
      const hy = pivot[1] + nk + hs * 0.3, hz = pivot[2] + nk * 0.2 + hs * 0.2;
      B.box([0, hy, hz], [hs * 0.85, hs * 0.85, hs], head, PART.head, pivot);
      B.box([0, hy - hs * 0.05, hz + hs / 2 + (sp.beak ?? 0.03) / 2], [hs * 0.25, hs * 0.2, sp.beak ?? 0.03], legs, PART.head, pivot);
      for (const sx of [-1, 1]) B.box([sx * hs * 0.43, hy + hs * 0.12, hz + hs * 0.15], [0.01, 0.015, 0.015], [0.02, 0.02, 0.02], PART.head, pivot);
      if (sp.id === 'crane') B.box([0, hy + hs * 0.45, hz], [hs * 0.5, 0.02, hs * 0.5], accent, PART.head, pivot);
      if (sp.id === 'chicken') B.box([0, hy + hs * 0.55, hz], [0.02, hs * 0.4, hs * 0.6], accent, PART.head, pivot);
      // tail
      const tp: V3 = [0, y + H * 0.1, -L / 2];
      B.box([0, tp[1], tp[2] - S * 0.12], [W * 0.6, 0.02, S * 0.25], sp.id === 'crane' ? head : accent, PART.tail, tp, { x: -0.2 });
      // wings, modelled spread; the shader folds them along the body
      const span = sp.wing ?? S * 0.5;
      for (const [sx, part] of [[-1, PART.wingL], [1, PART.wingR]] as const) {
        const pv: V3 = [sx * W / 2, y + H * 0.3, 0];
        B.box([sx * (W / 2 + span / 2), pv[1], 0], [span, 0.02, L * 0.7], body, part, pv);
        B.box([sx * (W / 2 + span * 0.85), pv[1] - 0.003, -L * 0.05], [span * 0.3, 0.022, L * 0.6], accent, part, pv);
      }
      return { geo: B.build(), legH: lh, height: y + H + nk };
    }
    case 'fish': {
      const L = S, H = S * 0.22, W = S * 0.16;
      B.box([0, 0, 0], [W, H, L * 0.8], body, PART.body);
      B.box([0, H * 0.3, L * 0.1], [W * 0.9, H * 0.45, L * 0.3], head, PART.body);
      B.box([0, H * 0.25, -L * 0.2], [W * 0.8, H * 0.5, L * 0.18], head, PART.body);
      const tp: V3 = [0, 0, -L * 0.4];
      B.box([0, 0, tp[2] - L * 0.12], [0.01, H * 1.1, L * 0.25], belly, PART.tail, tp);
      return { geo: B.build(), legH: 0, height: H };
    }
    case 'insect': {
      const L = S;
      B.box([0, 0, 0], [L * 0.15, L * 0.15, L], body, PART.body);
      B.box([0, 0, L * 0.55], [L * 0.22, L * 0.2, L * 0.18], head, PART.body);
      const span = sp.wing ?? L;
      for (const [sx, part] of [[-1, PART.wingL], [1, PART.wingR]] as const) {
        const pv: V3 = [0, L * 0.08, 0];
        const wide = sp.id === 'dragonfly' ? 0.2 : 0.9;
        B.box([sx * span / 2, pv[1], L * 0.1], [span, 0.004, span * wide], sp.id === 'dragonfly' ? [0.85, 0.85, 0.8] : legs === accent ? body : body, part, pv);
        if (sp.id !== 'dragonfly') B.box([sx * span * 0.7, pv[1] + 0.001, L * 0.1], [span * 0.35, 0.005, span * wide * 0.5], legs, part, pv);
      }
      return { geo: B.build(), legH: 0, height: L * 0.2 };
    }
    case 'crab': {
      B.box([0, S * 0.12, 0], [S, S * 0.12, S * 0.7], body, PART.body);
      for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
        const part = sx < 0 ? (i % 2 ? PART.fl : PART.bl) : (i % 2 ? PART.fr : PART.br);
        const z = (i - 1) * S * 0.22, px = sx * S * 0.55;
        B.box([px, S * 0.06, z], [S * 0.35, S * 0.04, S * 0.05], legs, part, [sx * S * 0.4, S * 0.1, z], { z: sx * 0.4 });
      }
      for (const sx of [-1, 1]) B.box([sx * S * 0.3, S * 0.14, S * 0.5], [S * 0.2, S * 0.12, S * 0.18], accent, PART.head, [0, S * 0.12, S * 0.3]);
      return { geo: B.build(), legH: S * 0.1, height: S * 0.2 };
    }
    case 'tortoise': {
      B.box([0, S * 0.15, 0], [S * 0.7, S * 0.22, S * 0.85], body, PART.body);
      B.box([0, S * 0.29, 0], [S * 0.5, S * 0.1, S * 0.65], accent, PART.body);
      B.box([0, S * 0.12, S * 0.5], [S * 0.18, S * 0.14, S * 0.22], head, PART.head, [0, S * 0.12, S * 0.4]);
      for (const [sx, sz, part] of [[-1, 1, PART.fl], [1, 1, PART.fr], [-1, -1, PART.bl], [1, -1, PART.br]] as const) B.box([sx * S * 0.33, S * 0.05, sz * S * 0.3], [S * 0.15, S * 0.1, S * 0.15], legs, part, [sx * S * 0.33, S * 0.1, sz * S * 0.3]);
      return { geo: B.build(), legH: 0, height: S * 0.35 };
    }
    case 'frog': {
      B.box([0, S * 0.3, 0], [S * 0.7, S * 0.5, S], body, PART.body);
      B.box([0, S * 0.2, S * 0.05], [S * 0.6, S * 0.3, S * 0.8], belly, PART.body);
      for (const sx of [-1, 1]) B.box([sx * S * 0.25, S * 0.6, S * 0.35], [S * 0.18, S * 0.18, S * 0.18], accent, PART.body);
      for (const [sx, part] of [[-1, PART.bl], [1, PART.br]] as const) B.box([sx * S * 0.45, S * 0.15, -S * 0.3], [S * 0.25, S * 0.25, S * 0.6], legs, part, [sx * S * 0.4, S * 0.3, -S * 0.1]);
      return { geo: B.build(), legH: 0, height: S * 0.6 };
    }
  }
}
