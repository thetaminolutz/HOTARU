/**
 * Scripted 60-second flythrough benchmark (SPEC §29). Shows avg and 1%-low frame time and a
 * copyable result line — run it on the iPad and paste the line back.
 */
import * as THREE from 'three';
import type { Game } from '../app/game';
import type { QualityName } from '../config';
import { clock } from '../core/clock';

export type BenchResult = { preset: QualityName; avgMs: number; lowMs: number; frames: number; draws: number; tris: number; res: string };

export class Benchmark {
  running = false;
  private t = 0;
  private samples: number[] = [];
  private drawSum = 0;
  private triMax = 0;
  private queue: QualityName[] = [];
  private results: BenchResult[] = [];
  private prevMode: Game['controller']['mode'] = 'walk';
  private prevQuality: QualityName = 'medium';
  private path: THREE.CatmullRomCurve3 | null = null;
  onDone: ((line: string, results: BenchResult[]) => void) | null = null;
  onProgress: ((text: string) => void) | null = null;
  duration = 60;

  constructor(private game: Game) {}

  start(presets: QualityName[]): void {
    const g = this.game;
    this.prevMode = g.controller.mode;
    this.prevQuality = g.quality.name;
    this.queue = [...presets];
    this.results = [];
    const S = g.world.dock.anchors.shore!;
    const p = (x: number, y: number, z: number) => S.clone().add(new THREE.Vector3(x, y, z));
    this.path = new THREE.CatmullRomCurve3([
      p(14, 3, 10), p(6, 2.8, -8), p(-4, 3, -30), p(-25, 5, -40), p(-40, 8, -10), p(-30, 4, 14), p(-8, 2.5, 6), p(14, 3, 10),
    ], true);
    clock.setHour(21.5);
    this.next();
  }

  private next(): void {
    const q = this.queue.shift();
    if (!q) return this.finish();
    this.game.setQuality(q);
    this.t = -1; // 1 s warm-up
    this.samples = [];
    this.drawSum = 0;
    this.triMax = 0;
    this.running = true;
    this.game.controller.mode = 'fixed';
  }

  /** Called every frame with the real frame time (ms). */
  update(dt: number, frameMs: number): void {
    if (!this.running || !this.path) return;
    this.t += dt;
    const u = Math.max(0, this.t) / this.duration;
    const pos = this.path.getPointAt(u % 1), look = this.path.getPointAt((u + 0.02) % 1);
    const c = this.game.controller;
    c.position.copy(pos);
    c.lookAt(look.setY(look.y - 0.4));
    if (this.t > 0) {
      this.samples.push(frameMs);
      this.drawSum += this.game.stats.drawCalls;
      this.triMax = Math.max(this.triMax, this.game.stats.triangles);
    }
    this.onProgress?.(`Benchmark ${this.game.quality.name}: ${Math.max(0, Math.round(this.t))}/${this.duration}s`);
    if (this.t >= this.duration) {
      const s = [...this.samples].sort((a, b) => a - b);
      const avg = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
      const low = s[Math.min(s.length - 1, Math.floor(s.length * 0.99))] ?? 0;
      const p = this.game.pipeline;
      this.results.push({ preset: this.game.quality.name, avgMs: avg, lowMs: low, frames: s.length, draws: Math.round(this.drawSum / Math.max(1, s.length)), tris: this.triMax, res: `${p.width}x${p.height}@${p.scale}` });
      this.running = false;
      this.next();
    }
  }

  private finish(): void {
    this.running = false;
    this.game.controller.mode = this.prevMode;
    this.game.setQuality(this.prevQuality);
    const ua = navigator.userAgent.replace(/\s+/g, ' ').slice(0, 90);
    const line = 'HOTARU bench v1 | ' + this.results.map((r) =>
      `${r.preset}: avg ${r.avgMs.toFixed(1)}ms (${(1000 / r.avgMs).toFixed(0)} fps) 1%low ${r.lowMs.toFixed(1)}ms, ${r.res}, ${r.draws} draws, ${(r.tris / 1000).toFixed(0)}k tris`,
    ).join(' | ') + ` | ${ua}`;
    this.onDone?.(line, this.results);
  }
}
