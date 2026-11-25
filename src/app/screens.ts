/**
 * Wires the M11 screens to the game: the journal (J), the map (M), photo mode (P) and the tool
 * in hand (F), from keys, gamepad or the touch tokens; the chest at home opens the journal's
 * Items page in storage mode. Time stops while the journal or map is open.
 */
import type { Game } from './game';
import type { UIManager } from '../ui/manager';
import { JournalScreen } from '../ui/screens/journal';
import { MapScreen } from '../ui/screens/map';
import { PhotoScreen } from '../ui/screens/photo';
import { clock } from '../core/clock';
import { REGIONS } from '../world/data/regions';
import { KEEPSAKES, keepsakeDef, toolDef } from '../items/items';
import { SPECIES } from '../fauna/data/species';
import { KIND_NAMES, type SecretKind } from '../secrets/secrets';
import { VIEW_HAIKU, SHRINE_HAIKU, LORE } from '../secrets/data/texts';
import { portrait } from '../people/portrait';
import { VILLAGES } from '../buildings/data/villages';

export function wireScreens(game: Game, ui: UIManager): { close(): boolean; update(): void } {
  const adv = game.adv, w = game.world;
  const nearPerson = () => {
    let best: (typeof w.people.people)[number] | null = null, bd = 3.6;
    for (const p of w.people.people) { const d = p.pos.distanceTo(game.controller.position); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  const journal = new JournalScreen({
    journey: adv.journey,
    get places() {
      const out: { name: string; sub: string; day: number }[] = [];
      for (const r of REGIONS) { const d = adv.journey.places[r.id]; if (d !== undefined) out.push({ name: r.name, sub: r.sub, day: d }); }
      for (const v of VILLAGES) { const d = adv.journey.places['v-' + v.id]; if (d !== undefined) out.push({ name: v.name, sub: 'Village', day: d }); }
      return out.sort((a, b) => a.day - b.day);
    },
    regionsTotal: REGIONS.length,
    people: () => w.people.people.filter((p) => (w.people.memory.met[p.id] ?? 0) > 0).map((p) => ({
      name: p.name, title: p.wanderer?.title ?? (p.villageName ? p.job.replace(/([A-Z])/g, ' $1') + ' of ' + p.villageName : p.job),
      met: w.people.memory.met[p.id] ?? 0, gifts: adv.journey.gifts[p.id]?.length ?? 0, portrait: portrait(p),
      likes: KEEPSAKES.filter((k) => k.likedBy.includes(p.job)).map((k) => k.name.toLowerCase()).slice(0, 3).join(', ') || 'kind words',
    })),
    animals: SPECIES.map((s) => ({ id: s.id, name: s.name, color: parseInt(s.colors[0]!.slice(1), 16) })),
    secrets: () => Object.entries(w.secrets.counts()).map(([k, [n, of]]) => ({ label: KIND_NAMES[k as SecretKind], n, of })),
    hidden: () => REGIONS.map((r) => ({ region: r.name, left: w.secrets.list.filter((s) => s.region === r.id && !w.secrets.found.has(s.id)).length })).filter((h) => h.left > 0 || adv.journey.places[REGIONS.find((r) => r.name === h.region)!.id] !== undefined),
    haiku: () => w.secrets.list.filter((s) => w.secrets.found.has(s.id) && (s.kind === 'view' || s.kind === 'shrine') && (VIEW_HAIKU.includes(s.text) || SHRINE_HAIKU.includes(s.text))).map((s) => ({ place: s.label, text: s.text })),
    lore: () => w.secrets.list.filter((s) => s.kind === 'tablet' && w.secrets.found.has(s.id)).map((s) => ({ n: LORE.indexOf(s.text) + 1, text: s.text })).sort((a, b) => a.n - b.n),
    near: () => {
      const p = nearPerson();
      return { person: p ? p.name.split(' ')[0]! : null, shrine: w.secrets.near(game.controller.position, 3.5).some((s) => s.kind === 'shrine'), chest: adv.nearChest };
    },
    give: (id) => {
      const p = nearPerson();
      if (!p) return;
      const lines = adv.give(id, p);
      if (lines.length) { game.talkTo(p); if (game.dialogue) { game.dialogue.lines = lines; game.dialogue.index = 0; game.dialogue.shown = 0; } }
    },
    offer: (id) => { const ok = adv.offerAt(id); if (ok) game.onToast?.('You leave the ' + keepsakeDef(id).name.toLowerCase() + ' at the shrine.'); return ok; },
    store: (slot) => adv.store(slot),
    take: (i) => adv.take(i),
    hold: (t) => { adv.inv.current = t; game.onToast?.('In hand: ' + toolDef(t).name); },
    day: () => clock.day,
  }, () => close());
  const map = new MapScreen({
    world: w.world, journey: adv.journey,
    player: () => ({ x: game.controller.position.x, z: game.controller.position.z, yaw: game.controller.yaw }),
    get dock() { const d = w.dock.anchors.shore!; return { x: d.x, z: d.z }; },
    villages: VILLAGES.map((v) => ({ id: v.id, name: v.name, x: v.x, z: v.z })),
    info: () => `day ${clock.day + 1}  ${String(Math.floor(clock.hour)).padStart(2, '0')}:${String(Math.floor((clock.hour % 1) * 60)).padStart(2, '0')}  ${adv.seasonName}`,
  }, () => close());
  const photo = new PhotoScreen(game.photo, () => close());
  ui.journal = journal; ui.map = map; ui.photo = photo;
  let wasPaused = false;

  const openOverlay = (s: 'journal' | 'map') => {
    if (document.pointerLockElement) document.exitPointerLock();
    wasPaused = clock.paused;
    clock.paused = true;
    game.input.frozen = true;
    ui.show(s);
    adv.onSound?.('page', game.controller.position);
  };
  function close(): boolean {
    const s = ui.screen;
    if (s === 'journal' || s === 'map') { clock.paused = wasPaused; game.input.frozen = false; adv.chestOpen = false; ui.show('play'); adv.onSound?.('page', game.controller.position); return true; }
    if (s === 'photo') { game.photo.exit(); ui.show('play'); return true; }
    return false;
  }

  return {
    close,
    update(): void {
      const inp = game.input, t = ui.hud.taps;
      const j = inp.journalPressed || t.journal, m = inp.mapPressed || t.map, p = inp.photoPressed || t.photo;
      if (t.tool) inp.toolPressed = true;
      inp.journalPressed = inp.mapPressed = inp.photoPressed = false;
      t.journal = t.map = t.photo = t.tool = false;
      const s = ui.screen;
      if (j) { if (s === 'journal') close(); else if (s === 'play') { journal.open(); openOverlay('journal'); } }
      if (m) { if (s === 'map') close(); else if (s === 'play') { map.open(); openOverlay('map'); } }
      if (p) {
        if (s === 'photo') photo.snap();
        else if (s === 'play' && adv.inv.tools.has('camera')) { game.photo.enter(); if (game.photo.active) { photo.open(); ui.show('photo'); } }
      }
      if (adv.chestOpen && ui.screen === 'play') { journal.open('Items', true); openOverlay('journal'); adv.chestOpen = false; }
      // HUD: the tool in hand, fishing, a landed fish
      const cur = adv.inv.current, f = adv.fishing;
      ui.hud.held = cur && ui.screen === 'play' ? { id: cur, color: toolDef(cur).color, glow: cur === 'lantern' && adv.lanternLit && game.tod.lamps > 0.05 } : null;
      ui.hud.status = adv.status;
      ui.hud.reel = f.state === 'reel' ? f.reel : null;
      const L = adv.landed;
      ui.hud.landed = L && L.t < 5 ? { name: L.fish.name, text: L.fish.text, size: L.size, best: L.best, colors: L.fish.colors } : null;
      inp.touchInteractHeld = ui.hud.actHeld;
    },
  };
}
