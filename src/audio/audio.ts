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
import { playVoice, type VoiceId } from './voices';
import { createRng } from '../core/rng';
import { playNote } from './instruments';
import { SCALES, degreeToMidi } from './composer';

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
  private rng = createRng(0xa71);

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
    game.weather.onThunder = (delay, loud) => {
      const a = this.rng.next() * Math.PI * 2;
      const out = this.mix.spatial('ambience', Math.cos(a) * 400, 300, Math.sin(a) * 400, delay + 8, 0.6);
      const g = this.mix.ctx.createGain(); g.gain.value = 0.6 + loud * 1.4; g.connect(out);
      playVoice('thunder', this.mix.ctx, g, this.mix.now + delay, this.rng, this.mix.noise.brown);
    };
    // soft syllable babble in each person's voice (no real speech)
    game.onBabble = (pitch) => {
      const ctx = this.mix.ctx, t = this.mix.now + 0.01, out = this.mix.direct('ui', 0.3, 0.1);
      const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'triangle';
      const f = 190 * pitch * (0.9 + this.rng.next() * 0.25);
      o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (0.92 + this.rng.next() * 0.16), t + 0.08);
      bp.type = 'bandpass'; bp.frequency.value = 700 + this.rng.next() * 900; bp.Q.value = 2;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.01); g.gain.setTargetAtTime(0, t + 0.05, 0.02);
      o.connect(bp); bp.connect(g); g.connect(out);
      o.start(t); o.stop(t + 0.15);
    };
    game.onEvent = (kind, pos) => {
      const p = game.controller.position;
      if (kind === 'found') { this.music.sting(); return; }
      const out = this.mix.spatial(kind === 'bell' ? 'ambience' : 'sfx', pos.x - p.x, pos.y - p.y, pos.z - p.z, kind === 'bell' ? 14 : 3, 0.5);
      if (kind === 'bell') playVoice('templeBell', this.mix.ctx, out, this.mix.now + 0.02, this.rng, this.mix.noise.white);
      else if (kind === 'offer') { playVoice('furin', this.mix.ctx, out, this.mix.now + 0.02, this.rng, this.mix.noise.white); this.music.sting(); }
      else playVoice('bambooKnock', this.mix.ctx, out, this.mix.now + 0.02, this.rng, this.mix.noise.white);
    };
    // items, fishing, rowing, photos, pages (M11)
    game.adv.onSound = (kind, pos) => {
      const p = game.controller.position, ctx = this.mix.ctx, t = this.mix.now + 0.02;
      const at = (bus: 'sfx' | 'nature', ref = 2) => this.mix.spatial(bus, pos.x - p.x, pos.y - p.y, pos.z - p.z, ref, 0.4);
      switch (kind) {
        case 'pick': playVoice('twig', ctx, at('sfx'), t, this.rng, this.mix.noise.white); this.sfx.ui('tick'); break;
        case 'plop': playVoice('drip', ctx, at('nature', 3), t, this.rng, this.mix.noise.white); break;
        case 'bite': playVoice('splash', ctx, at('nature', 3), t, this.rng, this.mix.noise.white); break;
        case 'catch': playVoice('splash', ctx, at('nature', 3), t, this.rng, this.mix.noise.white); this.music.sting(); break;
        case 'row': this.sfx.stroke(); break;
        case 'gift': playVoice('furin', ctx, this.mix.direct('sfx', 1, 0.1), t, this.rng, this.mix.noise.white); break;
        case 'chest': playVoice('creak', ctx, at('sfx'), t, this.rng, this.mix.noise.white); break;
        case 'shutter': this.sfx.ui('tick'); this.sfx.ui('tick'); break;
        case 'page': this.sfx.ui('open'); break;
        case 'flute': {
          // a short phrase on the shakuhachi, different each time
          const out = this.mix.direct('sfx', 1, 0.25), sc = SCALES.miyako ?? SCALES.yo;
          let d = 2 + Math.floor(this.rng.next() * 3);
          for (let i = 0; i < 5; i++) { playNote(ctx, out, 'shakuhachi', t + i * 0.55, degreeToMidi(sc, 67, d), 0.7, 0.55); d += Math.floor(this.rng.next() * 5) - 2; }
          break;
        }
      }
    };
    // festivals, spirits, the ending (M12)
    game.mystic.onSound = (kind, pos) => {
      const p = game.controller.position, ctx = this.mix.ctx, t = this.mix.now + 0.02;
      const at = (bus: 'sfx' | 'ambience' | 'nature', ref: number) => this.mix.spatial(bus, pos.x - p.x, pos.y - p.y, pos.z - p.z, ref, 0.3);
      switch (kind) {
        case 'taiko': playNote(ctx, at('ambience', 12), 'taiko', t, 41 + (this.rng.next() < 0.3 ? 5 : 0), 0.4, 0.7); break;
        case 'boom': {
          // the light comes first, the boom later (distance / speed of sound)
          const delay = Math.min(1.5, pos.distanceTo(p) / 340);
          playNote(ctx, at('ambience', 60), 'taiko', t + delay, 31, 1.2, 0.9);
          playVoice('twig', ctx, at('ambience', 40), t + delay + 0.25, this.rng, this.mix.noise.white);
          break;
        }
        case 'click': playVoice('bambooKnock', ctx, at('nature', 1), t, this.rng, this.mix.noise.white); break;
        case 'bell': playVoice('templeBell', ctx, at('ambience', 14), t, this.rng, this.mix.noise.white); break;
        case 'chime': this.music.sting(); playVoice('furin', ctx, this.mix.direct('sfx', 1, 0.2), t, this.rng, this.mix.noise.white); break;
      }
    };
    game.photo.onShutter = () => game.adv.onSound?.('shutter', game.controller.position);
    game.onSplash = (pos) => {
      const p = game.controller.position;
      const out = this.mix.spatial('nature', pos.x - p.x, pos.y - p.y, pos.z - p.z, 2, 0.4);
      playVoice('splash', this.mix.ctx, out, this.mix.now + 0.02, this.rng, this.mix.noise.white);
    };
    // animals call from where they are
    game.world.fauna.onCall = (voice, pos) => {
      const id: VoiceId = voice === 'coo' ? 'dove' : voice;
      const p = game.controller.position;
      const dx = pos.x - p.x, dy = pos.y - p.y, dz = pos.z - p.z;
      if (dx * dx + dz * dz > 120 * 120) return;
      const out = this.mix.spatial('nature', dx, dy, dz, 4, 0.35);
      playVoice(id, this.mix.ctx, out, this.mix.now + 0.02, this.rng, this.mix.noise.white);
    };
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
