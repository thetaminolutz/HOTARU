/**
 * The audio system (SPEC §25): mixer, music, ambience and player sounds, driven by the game
 * every frame. Created on the first user gesture (iOS needs one before audio can start).
 */
import * as THREE from 'three';
import { Mixer, type Space } from './mixer';
import { MusicPlayer, type MusicFrequency } from './music';
import { Ambience, type AmbContext } from './ambience';
import { Sfx, type Surface } from './sfx';
import type { Game } from '../app/game';
import { REGIONS } from '../world/data/regions';
import { clock } from '../core/clock';

export type AudioVolumes = { master: number; music: number; ambience: number; sfx: number; musicFrequency: MusicFrequency };

export class AudioSystem {
  readonly mix: Mixer;
  readonly music: MusicPlayer;
  readonly ambience: Ambience;
  readonly sfx: Sfx;
  context: AmbContext | null = null;
  private b = { forest: 0, moisture: 0, autumn: 0, special: 0, specialW: 0, grass: [0, 0, 0] as [number, number, number], region: 0 };
  private lastRegion = '';
  private visited = new Set<string>();

  constructor(ctx: AudioContext, private game: Game, vol: AudioVolumes) {
    this.mix = new Mixer(ctx);
    this.music = new MusicPlayer(this.mix);
    this.ambience = new Ambience(this.mix);
    this.sfx = new Sfx(this.mix);
    this.setVolumes(vol);
    this.mix.fadeIn(3);
    const c = game.controller;
    c.onStep = (speed) => this.sfx.step(this.surface(), speed);
    c.onJump = () => this.sfx.jump();
    c.onLand = (impact) => this.sfx.land(this.surface(), impact);
    c.onStroke = () => this.sfx.stroke();
  }

  setVolumes(v: AudioVolumes): void {
    this.mix.setVolume('master', v.master);
    this.mix.setVolume('music', v.music);
    this.mix.setVolume('ambience', v.ambience);
    this.mix.setVolume('nature', v.ambience);
    this.mix.setVolume('sfx', v.sfx);
    this.mix.setVolume('ui', v.sfx);
    if (this.music.frequency !== v.musicFrequency) {
      this.music.frequency = v.musicFrequency;
      if (v.musicFrequency === 'off') this.music.stop(2);
    }
  }

  /** What the player is standing on. */
  surface(): Surface {
    const g = this.game, w = g.world, p = g.controller.position;
    if (g.controller.pose === 'wade' || g.controller.pose === 'swim') return 'water';
    if (w.villages.indoors(p)) return 'tatami';
    if (w.dock.deckHeight(p.x, p.z) > -Infinity || w.villages.floorHeight(p.x, p.z) > -Infinity) return 'wood';
    const h = w.height(p.x, p.z), b = w.world.biome(p.x, p.z, this.b);
    const rid = REGIONS[b.region]?.id ?? '';
    if (h > 980 || (h > 620 && b.special === 3)) return 'snow';
    if (b.special === 4 || h > 900) return 'gravel';
    if ((b.special === 2 && h < 6) || (rid === 'lake' && h < 1.2)) return 'sand';
    if (b.forest > 0.55 && b.autumn > 0.4) return 'leaves';
    return 'grass';
  }

  update(dt: number, mode: string): void {
    const g = this.game, w = g.world, p = g.controller.position;
    const b = w.world.biome(p.x, p.z, this.b);
    const reg = w.world.regionAt(p.x, p.z);
    const region = reg >= 0 ? REGIONS[reg]!.id : 'none';
    const ground = w.height(p.x, p.z);
    // exposure: height above the land a few hundred metres around
    let around = 0;
    for (const [dx, dz] of [[300, 0], [-300, 0], [0, 300], [0, -300]]) around += w.height(p.x + dx!, p.z + dz!);
    const altitude = Math.max(0, ground - around / 4) + Math.max(0, p.y - ground - 2);
    // water: the lake's shore is near height 0; the sea for the coast
    const near = (fn: (h: number) => boolean) => {
      let n = 0;
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if (fn(w.height(p.x + Math.cos(a) * 25, p.z + Math.sin(a) * 25))) n++; }
      return n / 8 + (fn(ground) ? 0.25 : 0);
    };
    const wet = Math.min(1, near((h) => h < 0.05));
    const coast = region === 'coast' ? wet : 0;
    const dockA = w.dock.anchors.shore!;
    const dock = Math.max(0, 1 - Math.hypot(p.x - dockA.x, p.z - dockA.z) / 60);
    const ctx: AmbContext = {
      region, forest: b.forest, moisture: b.moisture, autumn: b.autumn, hour: clock.hour,
      wind: g.windStrength * 1.2, water: coast > 0 ? 0 : wet, coast, altitude,
      rain: w.fx.rain, snow: w.fx.snow, dock, indoors: w.villages.indoors(p),
    };
    this.context = ctx;
    this.ambience.update(dt, ctx);
    // reverb follows the place
    const space: Space = ctx.indoors ? 'room' : b.forest > 0.6 ? 'forest' : altitude < 60 && (region === 'castle' || region === 'maple' || region === 'snow' || region === 'mirror' || region === 'wisteria') ? 'valley' : 'open';
    this.mix.setSpace(space);
    // music follows region and hour; a sting when you first enter a region
    this.music.region = region;
    this.music.hour = clock.hour;
    this.music.title = mode === 'title';
    if (mode === 'play' && region !== this.lastRegion) {
      if (this.lastRegion && !this.visited.has(region) && region !== 'none' && !this.music.playing) this.music.sting();
      this.visited.add(region);
      this.lastRegion = region;
    }
    this.music.update();
    // the listener faces where the camera faces
    const L = this.mix.ctx.listener, cam = g.camera;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    if (L.forwardX) {
      const t = this.mix.now;
      L.forwardX.setTargetAtTime(f.x, t, 0.02); L.forwardY.setTargetAtTime(f.y, t, 0.02); L.forwardZ.setTargetAtTime(f.z, t, 0.02);
      L.upX.setTargetAtTime(u.x, t, 0.02); L.upY.setTargetAtTime(u.y, t, 0.02); L.upZ.setTargetAtTime(u.z, t, 0.02);
    }
  }
}
