/**
 * M11 glue (SPEC §10–11, §21, §24): the journey record, keepsakes lying around, gifts and tools
 * from people, the map's fog of war, places and creatures noted in the journal, the lantern in
 * hand, fishing, the rowboat and the ferry, and your house on the shore (a storage chest and a
 * small garden). Kept out of game.ts; the game calls `init` once and `update` every frame.
 */
import * as THREE from 'three';
import type { Game } from './game';
import { Journey } from '../items/journey';
import { Pickups, type Pickup } from '../items/pickups';
import { Fishing, waterKind } from '../items/fishing';
import { Rowboat } from '../items/rowing';
import { keepsakeDef, toolDef, type KeepsakeId, type ToolId } from '../items/items';
import { REGIONS } from '../world/data/regions';
import { clock } from '../core/clock';
import { litMaterial } from '../render/materials';
import { boxUV, mergeGeoms } from '../buildings/kit';
import type { Person } from '../people/people';
import type { FishDef } from '../items/data/fish';

export type AdvSound = 'pick' | 'plop' | 'bite' | 'catch' | 'row' | 'gift' | 'flute' | 'shutter' | 'page' | 'chest';

/** Tools people give you, and what they say. */
const TOOL_GIFTS: Record<string, { tool: ToolId; line: string; after?: number }[]> = {
  akari: [{ tool: 'lantern', line: 'Take this one. I made it with a firefly painted on, so it can find its way back.' }],
  oldFisher: [
    { tool: 'rod', line: 'Here, my old spare rod. Watch the float, not the fish. They come when you stop wanting them.' },
    { tool: 'boat', line: 'The little boat by the pier is yours to use. She rows gently. So should you.', after: 1 },
  ],
  hermit: [{ tool: 'flute', line: 'The waterfall taught me this flute. Now it can teach you.' }],
  peddler: [{ tool: 'umbrella', line: 'A wagasa! The rain here is kind, but kindness can still be wet.', after: 1 }],
  ferryman: [{ tool: 'boat', line: 'You row? Then take a token. Any boat at any pier will carry you.' }],
};

const SEASON = ['spring', 'summer', 'autumn', 'winter'];
const FERRY = { hours: [7, 9, 11, 13, 15, 17], from: 'shiomachi' };

export class Adventure {
  readonly journey = new Journey();
  pickups!: Pickups;
  readonly fishing = new Fishing();
  boat!: Rowboat;
  boating = false;
  /** what the HUD shows about fishing/rowing (short) */
  status = '';
  /** a landed fish card */
  landed: { fish: FishDef; size: number; best: boolean; t: number } | null = null;
  onSound: ((kind: AdvSound, pos: THREE.Vector3) => void) | null = null;
  /** the chest is open (journal Items in storage mode) */
  chestOpen = false;
  readonly chestPos = new THREE.Vector3();
  readonly gardenPos = new THREE.Vector3();
  /** the garden: planted day per plot (−1 empty) */
  garden: number[] = [-1, -1, -1, -1];
  private gardenMesh: THREE.Mesh | null = null;
  private gardenDay = -1;
  private gardenMat = litMaterial({ outline: true });
  private revealT = 0;
  private seenT = 0;
  private region = -2;
  private pickDay = -1;
  private ferryPier = new THREE.Vector3();

  constructor(private g: Game) {}

  init(): void {
    const g = this.g, w = g.world;
    this.pickups = new Pickups(w, w.seed);
    w.scene.add(this.pickups.group, this.fishing.mesh);
    this.boat = new Rowboat({
      terrain: (x, z) => w.world.height(x, z),
      water: (x, z) => Math.max(0, w.world.hydro.waterAt(x, z)),
      ground: (x, z) => w.groundHeight(x, z),
    });
    this.boat.onStroke = () => this.onSound?.('row', g.controller.position);
    this.fishing.onPlop = (p, big) => this.onSound?.(big ? 'bite' : 'plop', p);
    // your house: the boathouse; the chest sits on its engawa, the garden beside it
    const bh = w.dock.anchors.boathouse!;
    this.chestPos.set(bh.x + 5, bh.y, bh.z + 3.6);
    this.gardenPos.set(bh.x + 1, w.groundHeight(bh.x + 1, bh.z + 9), bh.z + 9);
    g.interactions.add({ id: 'home-chest', kind: 'open', label: 'Open your storage chest', pos: this.chestPos.clone().setY(bh.y + 0.5), reach: 2.4, use: () => { this.chestOpen = true; this.onSound?.('chest', this.chestPos); } });
    g.interactions.add({ id: 'home-garden', kind: 'pick', label: 'Tend the garden', pos: this.gardenPos.clone().setY(this.gardenPos.y + 0.4), reach: 3, use: () => this.tendGarden() });
    g.interactions.add({ id: 'rowboat', kind: 'row', label: 'Take the rowboat', pos: w.dock.mooring.clone().setY(0.6), reach: 4.2, use: () => this.boardBoat() });
    const shio = w.villages.villages.find((v) => v.layout.def.id === 'shiomachi')?.layout.def;
    if (shio) {
      // the ferry pier: the shore of Shiomachi nearest the sea
      let fx = shio.x, fz = shio.z;
      for (let x = shio.x; x < shio.x + 600; x += 4) if (w.world.height(x, shio.z) < 0.3) { fx = x - 3; break; }
      this.ferryPier.set(fx, w.groundHeight(fx, fz), fz);
      g.interactions.add({ id: 'ferry-shio', kind: 'row', label: 'Take the ferry to Lantern Lake', pos: this.ferryPier.clone().setY(this.ferryPier.y + 1), reach: 4, use: () => this.ferry(true) });
      const pe = w.dock.anchors.pierEnd!;
      g.interactions.add({ id: 'ferry-dock', kind: 'row', label: 'Wait for the ferry to Shiomachi', pos: pe.clone().add(new THREE.Vector3(-2.5, 0.8, -1)), reach: 2.6, use: () => this.ferry(false) });
    }
    this.refreshPickups();
  }

  get inv() { return this.journey.inv; }

  // ---------- keepsakes ----------
  refreshPickups(): void {
    const g = this.g, j = this.journey;
    for (const p of this.pickups.list) g.interactions.remove('pick-' + p.id);
    for (const p of this.pickups.available(j.picked, clock.day)) {
      g.interactions.add({ id: 'pick-' + p.id, kind: 'pick', label: 'Pick up the ' + keepsakeDef(p.item).name.toLowerCase(), pos: p.pos.clone().setY(p.pos.y + 0.2), reach: 2.6, use: () => this.pick(p) });
    }
    this.pickups.rebuild(j.picked, clock.day);
    this.pickDay = clock.day;
  }

  pick(p: Pickup): void {
    if (!this.inv.add(p.item)) { this.g.onToast?.('Your pockets are full. Store something at home.'); return; }
    this.journey.picked[p.id] = clock.day;
    this.onSound?.('pick', p.pos);
    const d = keepsakeDef(p.item);
    this.g.onToast?.(d.name + '  -  ' + d.text);
    this.refreshPickups();
  }

  /** A keepsake given to someone nearby. */
  give(id: KeepsakeId, p: Person): string[] {
    const d = keepsakeDef(id), first = p.name.split(' ')[0]!;
    if (!this.inv.remove(id)) return [];
    const list = (this.journey.gifts[p.id] ??= []);
    list.push(id);
    this.onSound?.('gift', p.pos);
    const mem = this.g.world.people.memory;
    mem.met[p.id] = (mem.met[p.id] ?? 0) + (d.likedBy.includes(p.job) ? 2 : 1);
    if (d.likedBy.includes(p.job)) {
      // a liked gift: sometimes a keepsake in return
      const back: KeepsakeId[] = ['crane', 'omamori', 'tea', 'riceBall', 'persimmon', 'seeds', 'chime'];
      const ret = back[(list.length + p.id.length) % back.length]!;
      const lines = [`A ${d.name.toLowerCase()}! You remembered. Thank you.`];
      if (list.length % 2 === 1 && this.inv.add(ret)) lines.push(`Here, take this ${keepsakeDef(ret).name.toLowerCase()}. It suits you.`);
      return lines;
    }
    if (id === 'doll' && p.age === 'child') return ['My doll! Where did you find her? I looked everywhere!', 'Thank you, thank you!'];
    if (id === 'letter') return [`A letter? ...It's for my sister across the lake. I'll make sure she gets it, ${first === 'Hayato' ? 'it is my job' : 'thank you'}.`];
    return ['For me? How kind of you.'];
  }

  /** An offering keepsake at a shrine nearby counts double. */
  offerAt(id: KeepsakeId): boolean {
    const sc = this.g.world.secrets.near(this.g.controller.position, 3.5).find((s) => s.kind === 'shrine');
    if (!sc || !this.inv.remove(id)) return false;
    const st = (this.g.world.secrets.shrineState[sc.id] ??= { level: 0, lastDay: -1 });
    st.level = Math.min(3, st.level + 1);
    this.g.world.secrets.offer(sc, clock.day);
    this.g.onEvent?.('offer', sc.pos);
    return true;
  }

  store(slot: number): void { const id = this.inv.slots[slot]; if (id) { this.inv.slots[slot] = null; this.inv.stored.push(id); } }
  take(i: number): void { const id = this.inv.stored[i]; if (id && this.inv.add(id)) this.inv.stored.splice(i, 1); }
  get nearChest(): boolean { return this.chestPos.distanceTo(this.g.controller.position) < 4; }

  /** People hand you tools: called after a conversation starts. */
  afterTalk(p: Person, lines: string[]): void {
    const id = p.wanderer?.id;
    const gifts = id ? TOOL_GIFTS[id] : undefined;
    if (!gifts) return;
    const met = this.g.world.people.memory.met[p.id] ?? 0;
    for (const gf of gifts) {
      if (this.inv.tools.has(gf.tool) || met < (gf.after ?? 0) + 1) continue;
      this.inv.give(gf.tool);
      lines.push(gf.line);
      this.g.onToast?.('Received: ' + toolDef(gf.tool).name);
      this.onSound?.('gift', p.pos);
      break;
    }
  }

  // ---------- garden ----------
  private tendGarden(): void {
    const free = this.garden.indexOf(-1);
    if (free >= 0 && this.inv.remove('seeds')) { this.garden[free] = clock.day; this.g.onToast?.('You plant the seeds. Come back in a few days.'); }
    else if (free >= 0) this.g.onToast?.('The soil is ready. Seeds would grow here.');
    else this.g.onToast?.(this.garden.every((d) => clock.day - d >= 3) ? 'Your garden is in full bloom.' : 'The shoots are growing.');
    this.gardenDay = -1;
  }

  private buildGarden(): void {
    if (this.gardenMesh) { this.g.world.scene.remove(this.gardenMesh); this.gardenMesh.geometry.dispose(); }
    const P = this.gardenPos, parts: THREE.BufferGeometry[] = [boxUV(3.2, 0.12, 1.4, 1, [0.36, 0.26, 0.18]).translate(P.x, P.y + 0.04, P.z)];
    const cols: [number, number, number][] = [[0.9, 0.3, 0.35], [0.95, 0.8, 0.3], [0.6, 0.45, 0.85], [0.95, 0.95, 0.9]];
    this.garden.forEach((d, i) => {
      if (d < 0) return;
      const age = Math.min(3, clock.day - d), x = P.x - 1.2 + i * 0.8, h = 0.1 + age * 0.18;
      parts.push(boxUV(0.05, h, 0.05, 1, [0.3, 0.55, 0.25]).translate(x, P.y + 0.1 + h / 2, P.z));
      if (age >= 1) parts.push(boxUV(0.24, 0.04, 0.12, 1, [0.35, 0.62, 0.28]).translate(x, P.y + 0.1 + h * 0.6, P.z));
      if (age >= 3) parts.push(boxUV(0.16, 0.12, 0.16, 1, cols[i]!).translate(x, P.y + 0.12 + h, P.z));
    });
    this.gardenMesh = new THREE.Mesh(mergeGeoms(parts), this.gardenMat);
    this.gardenMesh.name = 'garden';
    this.g.world.scene.add(this.gardenMesh);
    this.gardenDay = clock.day;
  }

  // ---------- boats ----------
  boardBoat(): void {
    if (!this.inv.tools.has('boat')) { this.g.onToast?.('The boat belongs to Old Genzō. Perhaps ask him.'); return; }
    const m = this.g.world.dock.mooring;
    this.boat.board(m.x, m.z, Math.PI + 0.12);
    this.boating = true;
    this.g.controller.mode = 'boat';
    this.g.controller.pose = 'sit';
    this.status = 'Row with forward/back, steer left/right. Interact near a shore to step out.';
  }

  leaveBoat(): boolean {
    const L = this.boat.landing();
    if (!L) { this.status = 'Too far from the shore to step out.'; return false; }
    this.boating = false;
    const c = this.g.controller;
    c.mode = 'walk';
    c.placeAt(L.x, L.z);
    this.g.world.dock.ride = null;
    this.status = '';
    return true;
  }

  private ferry(toLake: boolean): void {
    const h = clock.hour, next = FERRY.hours.find((x) => x >= Math.floor(h) && h < x + 0.75);
    if (next === undefined || h < next - 0.25) {
      const n = FERRY.hours.find((x) => x > h) ?? FERRY.hours[0]!;
      this.g.onToast?.(`The ferry leaves at ${n}:00. Sit and wait a while.`);
      return;
    }
    this.g.fade = 1.4;
    const c = this.g.controller, pe = this.g.world.dock.anchors.pierEnd!;
    if (toLake) { c.placeAt(pe.x - 1, pe.z - 4); c.yaw = Math.PI; }
    else { c.placeAt(this.ferryPier.x - 2, this.ferryPier.z); c.yaw = -Math.PI / 2; }
    clock.setHour(h + 0.6);
    this.g.onToast?.(toLake ? 'The ferry crosses the bay and the river to Lantern Lake.' : 'The ferry carries you down the river to the sea, to Shiomachi.');
  }

  // ---------- fishing ----------
  private tryCast(): void {
    const c = this.g.controller, w = this.g.world;
    const dir = new THREE.Vector3(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
    for (const d of [9, 7, 5, 11, 4]) {
      const x = c.position.x + dir.x * d, z = c.position.z + dir.z * d;
      const wl = Math.max(0, w.world.hydro.waterAt(x, z)), t = w.world.height(x, z);
      if (wl - t < 0.3 || w.groundHeight(x, z) > wl + 0.05) continue;
      const pond = w.world.hydro.ponds.some((p) => Math.hypot(p.x - x, p.z - z) < p.r);
      const river = !pond && wl > 0.5;
      const b = w.world.biome(x, z);
      this.fishing.cast(c.position.clone().addScaledVector(dir, 0.8).setY(c.position.y + 0.4), new THREE.Vector3(x, wl + 0.02, z), waterKind(x, z, t, b.specialW > 0.5 ? b.special : 0, pond, river, wl));
      return;
    }
    this.g.onToast?.('Face open water to cast.');
  }

  /** Use the tool in hand (F / RB / the tool token). */
  useTool(): void {
    const t = this.inv.current;
    if (t === 'rod') { if (this.fishing.active) this.fishing.stop(); else this.tryCast(); }
    else if (t === 'flute') { this.onSound?.('flute', this.g.controller.position); this.g.onToast?.('You play a few soft notes.'); }
    else if (t === 'umbrella') this.umbrellaOpen = !this.umbrellaOpen;
    else if (t === 'lantern') this.lanternLit = !this.lanternLit;
  }
  umbrellaOpen = false;
  lanternLit = true;

  /** Light from the lantern in hand. */
  lanternLight(): { pos: THREE.Vector3; color: THREE.Color; radius: number; intensity: number; halo: number; phase: number } | null {
    if (this.inv.current !== 'lantern' || !this.lanternLit || this.g.tod.lamps < 0.05) return null;
    const c = this.g.controller;
    const pos = c.position.clone().add(new THREE.Vector3(-Math.sin(c.yaw) * 0.5 + Math.cos(c.yaw) * 0.3, -0.55, -Math.cos(c.yaw) * 0.5 - Math.sin(c.yaw) * 0.3));
    return { pos, color: new THREE.Color(1, 0.62, 0.3), radius: 9, intensity: 1.4, halo: 0, phase: 0 };
  }

  /** Per frame, before the controller moves. Returns true if it used the interact press. */
  update(dt: number): boolean {
    const g = this.g, inp = g.input, c = g.controller, j = this.journey, w = g.world;
    let used = false;
    if (inp.toolPressed && c.mode === 'walk' && !g.dialogue) { this.useTool(); inp.toolPressed = false; }
    // fishing takes the interact button while the line is out
    if (this.fishing.active) {
      const W = g.weather.out, season = W.weights.indexOf(Math.max(...W.weights));
      const press = inp.interactPressed;
      const got = this.fishing.update(dt, press, inp.interactHeld, clock.hour, season, W.rain > 0.2);
      if (press) used = true;
      if (Math.hypot(c.vel.x, c.vel.z) > 0.5) this.fishing.stop();
      if (got) {
        const best = j.caught(got.id, this.fishing.size, clock.day);
        this.landed = { fish: got, size: this.fishing.size, best, t: 0 };
        this.onSound?.('catch', this.fishing.float);
      }
      this.status = this.fishing.note;
    } else if (!this.boating) this.status = '';
    if (this.landed && (this.landed.t += dt) > 6) this.landed = null;
    // rowing
    if (this.boating) {
      this.boat.update(dt, inp.moveZ, inp.moveX);
      w.dock.ride = { x: this.boat.x, z: this.boat.z, heading: this.boat.heading, speed: this.boat.speed, stroke: this.boat.stroke };
      this.boat.eye(c.position, clock.elapsed);
      c.feet = c.position.y - c.eye;
      if (inp.interactPressed) { used = true; this.leaveBoat(); }
    }
    // the map paints itself in as you walk; regions and creatures go into the journal
    this.revealT -= dt;
    if (this.revealT < 0) {
      this.revealT = 0.5;
      j.revealAt(c.position.x, c.position.z, c.position.y > 120 ? 220 : 140);
      const r = w.world.regionAt(c.position.x, c.position.z);
      if (r !== this.region && r >= 0) {
        this.region = r;
        const R = REGIONS[r]!;
        if (j.visit(R.id, clock.day)) g.onToast?.('Discovered: ' + R.name + '  -  ' + R.sub);
      }
      for (const v of w.villages.villages) {
        const d = v.layout.def;
        if (Math.hypot(d.x - c.position.x, d.z - c.position.z) < d.r && j.visit('v-' + d.id, clock.day)) g.onToast?.('Discovered: ' + d.name);
      }
    }
    this.seenT -= dt;
    if (this.seenT < 0) {
      this.seenT = 1;
      for (const a of w.fauna.animals) if (a.pos.distanceToSquared(c.position) < 22 * 22 && j.see(a.sp.id, clock.day)) g.onToast?.('New in the journal: ' + a.sp.name);
    }
    if (this.pickDay !== clock.day) this.refreshPickups();
    if (this.gardenDay !== clock.day) this.buildGarden();
    return used;
  }

  /** The current season's name (journal). */
  get seasonName(): string { const W = this.g.weather.out; return SEASON[W.weights.indexOf(Math.max(...W.weights))]!; }

  toJSON() { return { journey: this.journey.toJSON(), garden: this.garden }; }
  load(o: { journey?: Parameters<Journey['load']>[0]; garden?: number[] }): void {
    if (o.journey) this.journey.load(o.journey);
    if (o.garden) this.garden = o.garden;
    this.refreshPickups();
    this.gardenDay = -1;
  }
}
