/**
 * M12 glue (SPEC §19–23): festivals from the calendar (scenery, crowds, the 108 bells,
 * fireworks), spirits, rare world events, the story's ending and the brighter world after it,
 * dreams when you sleep at home, and flute melodies that some places answer. Everything new
 * that can be found is registered as a secret, so the journal counts it ("n of N").
 */
import * as THREE from 'three';
import type { Game } from './game';
import { clock } from '../core/clock';
import { Festivals } from '../events/festivals';
import { FESTIVALS, festivalNow, festivalSoon, type SeasonClock } from '../events/calendar';
import { WorldEvents, EVENTS } from '../events/worldEvents';
import { Spirits, SPIRIT_SECRETS, ghostMat, figure } from '../spirits/spirits';
import { Ending, LORE_NEEDED } from '../story/ending';
import { SEASONS } from '../flora/data/seasons';
import type { Person } from '../people/people';
import { DREAMS } from '../story/dreams';

export type MysticSound = 'boom' | 'click' | 'chime' | 'taiko' | 'bell';

/** places that answer the flute */
const MELODIES: { id: string; label: string; at: (g: Game) => THREE.Vector3; r: number; text: string }[] = [
  { id: 'melody-waterfall', label: 'The waterfall’s melody', at: (g) => { const c = g.world.world.sites.grottos.find((x) => x.id === 'waterfall')!; return new THREE.Vector3(c.x, c.floor, c.z); }, r: 60, text: 'The falling water seems to hum the tune back to you.' },
  { id: 'melody-garden', label: 'A song for the garden', at: (g) => { const c = g.world.world.sites.castle; return new THREE.Vector3(c.x - 18, c.level, c.z - 43); }, r: 25, text: 'Fireflies rise from the grass of the secret garden, as if they knew the song.' },
  { id: 'melody-island', label: 'A song across the water', at: (g) => g.world.secrets.list.find((s) => s.id === 'shrine-island')!.pos, r: 80, text: 'On the island, the little shrine’s bell answers once.' },
];

export class Mystic {
  festivals!: Festivals;
  spirits!: Spirits;
  events!: WorldEvents;
  ending!: Ending;
  lanternGiven = false;
  /** HUD brush text (ending lines, dreams) */
  line: { text: string; t: number } | null = null;
  onSound: ((kind: MysticSound, pos: THREE.Vector3) => void) | null = null;
  private festDiscovered = new Set<string>();
  private taikoT = 0;
  private sleeping = 0;

  constructor(private g: Game) {}

  init(): void {
    const g = this.g, w = g.world, S = w.secrets;
    this.festivals = new Festivals(w);
    this.spirits = new Spirits(w);
    this.events = new WorldEvents(w, w.seed);
    this.ending = new Ending(g, ghostMat, (h) => figure(h));
    w.scene.add(this.festivals.group, this.spirits.group, this.events.group);
    // new secrets: spirits, the festivals, the world events, the melodies, and the ending
    for (const [id, label] of SPIRIT_SECRETS) S.register('spirit', id, label, g.adv.chestPos.clone());
    S.register('spirit', 'spirit-sister', 'The girl who walked home on the light', w.dock.anchors.pierEnd!.clone());
    for (const f of FESTIVALS) S.register('moment', 'fest-' + f.id, f.name, this.festivals.spotOf(f.id));
    for (const e of EVENTS) S.register('moment', 'event-' + e.id, e.label, new THREE.Vector3());
    for (const m of MELODIES) S.register('moment', m.id, m.label, m.at(g));
    this.spirits.onSeen = (id) => S.discoverId(id);
    this.events.onSeen = (id) => S.discoverId('event-' + id);
    this.spirits.onClick = (p) => this.onSound?.('click', p);
    this.spirits.placeUmbrella(g.adv.chestPos.clone().add(new THREE.Vector3(0.9, 0, -0.6)));
    this.festivals.onBell = () => this.onSound?.('bell', w.landmarks.bellPos);
    this.festivals.onBoom = (p) => this.onSound?.('boom', p);
    this.ending.onChime = () => this.onSound?.('chime', g.controller.position);
    // floating the thousandth lantern, at the end of the pier
    const pe = w.dock.anchors.pierEnd!;
    g.interactions.add({ id: 'float-lantern', kind: 'light', label: 'Float the thousandth lantern', pos: pe.clone().add(new THREE.Vector3(0.5, 0.4, -2)), reach: 2.6, use: () => this.tryFloat() });
    // sleeping at home: dreams
    g.interactions.add({ id: 'home-sleep', kind: 'sit', label: 'Sleep until morning', pos: g.adv.chestPos.clone().add(new THREE.Vector3(-1.2, 0.5, -1.5)), reach: 2.2, use: () => this.sleep() });
  }

  get clock(): SeasonClock {
    const W = this.g.weather;
    return { seasonDays: W.seasonDays, startSeason: W.startSeason, lock: W.seasonLock ? SEASONS.indexOf(W.seasonLock) : null };
  }

  private tryFloat(): void {
    const f = festivalNow(clock.day, clock.hour, this.clock);
    if (this.ending.done) { this.g.onToast?.('The lake is full of lanterns now. Yours is somewhere among them.'); return; }
    if (!this.g.adv.inv.slots.includes('lantern1000')) { this.g.onToast?.('Lanterns float from here on festival night.'); return; }
    if (!this.ending.ready(f?.id)) { this.g.onToast?.('Not yet. On the night of the Lantern Festival.'); return; }
    this.ending.start();
  }

  /** The masked stranger, once you know enough of the story. */
  afterTalk(p: Person, lines: string[]): void {
    if (p.wanderer?.id !== 'masked' || this.lanternGiven || this.ending.done) return;
    const lore = this.g.world.secrets.list.filter((s) => s.kind === 'tablet' && this.g.world.secrets.found.has(s.id)).length;
    if (lore < LORE_NEEDED) return;
    if (!this.g.adv.inv.add('lantern1000')) { lines.push('...(The stranger holds something out, then sees your full hands, and waits.)'); return; }
    this.lanternGiven = true;
    lines.push('...(The stranger holds out a paper lantern, painted with a single firefly.)', '...(They point to the lake, then to the sky, where summer stars will be.)');
    this.g.onToast?.('Received: The thousandth lantern');
  }

  /** What villagers might mention: a festival soon. */
  rumour(): string | null {
    const s = festivalSoon(clock.day, this.clock, 3);
    if (!s) return null;
    return s.f.announce[(clock.day + s.in) % s.f.announce.length]!;
  }

  private sleep(): void {
    const h = clock.hour;
    if (h > 6 && h < 19.5) { this.g.onToast?.('It is too bright to sleep. Perhaps tonight.'); return; }
    this.sleeping = 4;
    this.g.fade = 2.5;
    const dream = DREAMS[(clock.day * 7 + this.g.world.secrets.found.size) % DREAMS.length]!;
    this.line = { text: dream, t: 0 };
    if (h > 12) clock.day += 1;
    clock.setHour(6.4);
  }

  /** The flute in a place that listens. */
  onFlute(pos: THREE.Vector3): void {
    for (const m of MELODIES) if (m.at(this.g).distanceTo(pos) < m.r && this.g.world.secrets.discoverId(m.id)) this.g.onToast?.(m.text);
    if (MELODIES[1]!.at(this.g).distanceTo(pos) < 25) this.g.world.fx.fireflyBoost = 3;
  }

  update(dt: number): void {
    const g = this.g, w = g.world, c = g.controller.position, hour = clock.hour, day = clock.day;
    const look = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(g.controller.pitch, g.controller.yaw, 0, 'YXZ'));
    const elapsed = clock.elapsed;
    // festivals
    const f = festivalNow(day, hour, this.clock);
    this.festivals.brighter = this.ending.done;
    this.festivals.update(f, hour, c, dt, elapsed);
    const spot = this.festivals.spot;
    w.people.festival = f && spot ? { id: f.id, spot, village: f.place } : null;
    if (f && spot && spot.distanceTo(c) < 70 && !this.festDiscovered.has(f.id)) {
      this.festDiscovered.add(f.id);
      if (w.secrets.discoverId('fest-' + f.id)) g.onToast?.(f.name + '  -  ' + f.sub);
    }
    // a taiko beat at the summer festival and the harvest moon
    if (f && spot && spot.distanceTo(c) < 200 && (f.id === 'tanabata' || f.id === 'tsukimi')) {
      this.taikoT -= dt;
      if (this.taikoT < 0) { this.taikoT = f.id === 'tanabata' ? 0.55 : 1.6; this.onSound?.('taiko', spot); }
    }
    // spirits & events
    const W = g.weather.out;
    this.spirits.update(dt, elapsed, c, look, hour, day, W, W.weights[3]!, this.ending.done);
    this.events.update(dt, elapsed, day, hour, c, look, W.cloud < 0.5);
    const sky = w.sky.uniforms;
    sky.uMeteors.value = this.events.meteors;
    sky.uEclipse.value = this.events.eclipse;
    sky.uMoonScale.value = f?.id === 'tsukimi' ? 1.6 : 1;
    w.fx.extraMist = this.events.mist * (c.y > 220 ? 0.6 : 0);
    const flute = w.fx.fireflyBoost > 1.5 && !f ? w.fx.fireflyBoost - dt * 0.05 : 1;
    w.fx.fireflyBoost = Math.max(this.ending.done ? 1.6 : 1, f?.id === 'tanabata' ? 2.2 : 1, flute);
    // the story: the castle garden blooms as tablets are found; the ending
    const lore = w.secrets.list.filter((s) => s.kind === 'tablet' && w.secrets.found.has(s.id)).length;
    w.landmarks.setBloom(this.ending.done ? 1 : (lore / 30) * 0.7);
    this.ending.update(dt);
    if (this.ending.line) this.line = this.ending.line;
    if (this.line && (this.line.t += dt) > 12) this.line = null;
    if (this.sleeping > 0) this.sleeping -= dt;
  }

  toJSON() { return { done: this.ending.done, given: this.lanternGiven }; }
  load(o: { done?: boolean; given?: boolean }): void {
    this.ending.done = !!o.done; this.lanternGiven = !!o.given;
    const m = this.g.world.people.people.find((p) => p.wanderer?.id === 'masked');
    if (m && this.ending.done) m.unmasked = true;
  }
}
