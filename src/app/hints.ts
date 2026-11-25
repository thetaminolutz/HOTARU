/**
 * Gentle tutorial hints (SPEC §26 "hint level", §M14 "a villager explains things"): instead of
 * pop-up tutorials, someone nearby says it, once, when it becomes useful — Akari on your first
 * evening, Old Genzō when you first stand at the water with a rod, and so on. Off in Settings →
 * Comfort. What was said is remembered on this device.
 */
import type { Game } from './game';
import { settings } from './settings';
import { keyName, type Action } from '../player/bindings';
import { clock } from '../core/clock';

const KEY = 'hotaru.hints.v1';

type Rule = { id: string; who: string; when: (g: Game, t: number) => boolean; say: (k: (a: Action, touch: string) => string) => string };

const RULES: Rule[] = [
  { id: 'welcome', who: 'Akari', when: (_g, t) => t > 4, say: (k) => `Welcome to Tomoshibi! Come and say hello - ${k('interact', 'tap the hand')} to talk.` },
  { id: 'journal', who: 'Akari', when: (_g, t) => t > 60, say: (k) => `Your notebook remembers everything: ${k('journal', 'the book token')}. The map fills in as you walk: ${k('map', 'the map token')}.` },
  { id: 'dusk', who: 'Akari', when: (g) => clock.hour > 18.2 && !g.adv.inv.tools.has('lantern'), say: () => 'It is getting dark. Come to the pier, I have a lantern for you.' },
  { id: 'sit', who: 'Old Genzo', when: (_g, t) => t > 180, say: (k) => `Sit a while - on a bench, on the pier - and hold ${k('timelapse', 'the hourglass')} to watch the day go by.` },
  { id: 'rod', who: 'Old Genzo', when: (g) => g.adv.inv.tools.has('rod') && g.controller.pose === 'stand' && g.world.world.height(g.controller.position.x - Math.sin(g.controller.yaw) * 8, g.controller.position.z - Math.cos(g.controller.yaw) * 8) < -0.5, say: (k) => `Face the water and cast with ${k('tool', 'the tool token')}. Then watch the float.` },
  { id: 'boat', who: 'Old Genzo', when: (g) => g.adv.inv.tools.has('boat'), say: () => 'The little boat at the end of the pier is yours to take. Row gently.' },
  { id: 'pockets', who: 'Akari', when: (g) => g.adv.inv.free === 0, say: () => 'Your pockets are full! The chest on your boathouse engawa keeps the rest.' },
  { id: 'photo', who: 'Fumiko the painter', when: (g) => [...g.world.secrets.found].some((s) => s.startsWith('view-')), say: (k) => `A fine view, isn't it? Keep it: ${k('photo', 'the camera token')} takes a picture.` },
  { id: 'tablet', who: 'an old woman', when: (g) => [...g.world.secrets.found].some((s) => s.startsWith('tablet-')), say: () => 'Thirty old stones tell the castle story, they say. Read enough of them and someone may come to find you.' },
  { id: 'ruins', who: 'a travelling monk', when: (_g, t) => t > 900, say: () => 'Out in the hills the old times are still standing, if you look: forts on the maple mountains and the hydrangea hills, a watchtower on the moor, a sea fort on the cliffs, a hamlet the cedars took back. Follow the jizo along the roads.' },
  { id: 'relic', who: 'a travelling monk', when: (g) => [...g.world.secrets.found].some((s) => s.startsWith('place-ruin-')), say: (k) => `Ruins keep things for whoever looks closely - a helmet on the keep stones, words on a gate. When something catches your eye, ${k('interact', 'tap the hand')}.` },
  { id: 'gift', who: 'Akari', when: (g) => g.adv.inv.free < 10, say: (k) => `Found something nice? Give it to someone who likes it - open your notebook (${k('journal', 'the book')}) next to them.` },
];

export class Hints {
  private said: Set<string>;
  private t = 0;
  private check = 0;

  constructor(private g: Game, private touch: () => boolean) {
    let s: string[] = [];
    try { s = JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]; } catch { /* fresh */ }
    this.said = new Set(s);
  }

  private key(a: Action, touch: string): string {
    if (this.touch()) return touch;
    return 'press ' + keyName(settings.bindings[a][0] ?? '?');
  }

  update(dt: number, playing: boolean): void {
    if (!playing || settings.hints === 'off' || this.g.dialogue) return;
    this.t += dt;
    this.check -= dt;
    if (this.check > 0) return;
    this.check = 1;
    for (const r of RULES) {
      if (this.said.has(r.id) || !r.when(this.g, this.t)) continue;
      this.said.add(r.id);
      try { localStorage.setItem(KEY, JSON.stringify([...this.said])); } catch { /* private mode */ }
      this.g.onToast?.(`${r.who}: "${r.say((a, tt) => this.key(a, tt))}"`);
      this.check = 25; // one at a time, gently
      return;
    }
  }
}
