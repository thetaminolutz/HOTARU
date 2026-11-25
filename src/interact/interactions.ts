/**
 * Interaction system (SPEC §9): things you can look at and use. Look at one within reach and
 * a small pixel icon appears; press E / tap the interact token. M3 registers sit spots;
 * later milestones add examine, ring, light, pray, knock, feed, pet, read, fish, row…
 */
import * as THREE from 'three';

export type InteractKind = 'sit' | 'examine' | 'open' | 'ring' | 'light' | 'pray' | 'talk' | 'read';

export type Interactable = {
  id: string;
  kind: InteractKind;
  label: string;
  pos: THREE.Vector3;
  /** reach in metres */
  reach: number;
  /** facing for sit spots (yaw, radians) */
  yaw?: number;
  use: () => void;
};

export class Interactions {
  readonly items: Interactable[] = [];
  /** What the player is looking at right now (or null). */
  target: Interactable | null = null;

  add(i: Interactable): void { this.items.push(i); }

  /** Pick the best target in front of the camera. */
  update(eye: THREE.Vector3, dir: THREE.Vector3): void {
    let best: Interactable | null = null, bestScore = -Infinity;
    const to = new THREE.Vector3();
    for (const it of this.items) {
      to.subVectors(it.pos, eye);
      const d = to.length();
      if (d > it.reach) continue;
      const facing = to.normalize().dot(dir);
      if (facing < 0.75) continue;
      const score = facing * 2 - d / it.reach;
      if (score > bestScore) { bestScore = score; best = it; }
    }
    this.target = best;
  }

  /** Nearest item of a kind to a point (tests / debug). */
  nearest(kind: InteractKind, p: THREE.Vector3): Interactable | null {
    let best: Interactable | null = null, bd = Infinity;
    for (const it of this.items) if (it.kind === kind) { const d = it.pos.distanceTo(p); if (d < bd) { bd = d; best = it; } }
    return best;
  }
}
