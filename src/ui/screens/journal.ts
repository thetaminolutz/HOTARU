/**
 * The journal (SPEC §11): a washi notebook with tabs — Items (tools, the 12 keepsake slots,
 * the chest at home, and what you can do with a keepsake right here: give it, offer it, store
 * it), Places, People, Creatures (animals and fish with sizes), Secrets (counts only), Haiku,
 * Lore and the Album (photos and sketches; open one to save it, or draw on it with the Pencil).
 */
import type { UICanvas } from '../uiCanvas';
import { bodyFont, tinyFont, headingFont } from '../font';
import { C } from '../art';
import { Button, panel, type Pointer } from '../widgets';
import type { Pixmap } from '../../render/pixmap';
import { itemIcon, keepsakeDef, toolDef, TOOLS, KEEPSAKES, type KeepsakeId, type ToolId } from '../../items/items';
import type { Journey, AlbumEntry } from '../../items/journey';
import { decode, encode, inkLine, download, type Img } from '../../items/photo';
import { FISH } from '../../items/data/fish';
import { cleanText } from './hud';

export type JournalSource = {
  journey: Journey;
  places: { name: string; sub: string; day: number }[];
  regionsTotal: number;
  people: () => { name: string; title: string; met: number; likes: string; gifts: number; portrait: Pixmap }[];
  animals: { id: string; name: string; color: number }[];
  secrets: () => { label: string; n: number; of: number }[];
  hidden: () => { region: string; left: number }[];
  haiku: () => { place: string; text: string }[];
  lore: () => { n: number; text: string }[];
  near: () => { person: string | null; shrine: boolean; chest: boolean };
  give: (id: KeepsakeId) => void;
  offer: (id: KeepsakeId) => boolean;
  store: (slot: number) => void;
  take: (i: number) => void;
  hold: (t: ToolId) => void;
  day: () => number;
};

const TABS = ['Items', 'Places', 'People', 'Creatures', 'Secrets', 'Haiku', 'Lore', 'Album'] as const;
type Tab = (typeof TABS)[number];
type Sel = { kind: 'tool'; id: ToolId } | { kind: 'slot'; i: number } | { kind: 'stored'; i: number } | null;
type Rect = { x: number; y: number; w: number; h: number; on: () => void };

export class JournalScreen {
  tab: Tab = 'Items';
  chest = false;
  private page = 0;
  private sel: Sel = null;
  private rects: Rect[] = [];
  private buttons: Button[] = [];
  private thumbs = new Map<number, Img | 'loading'>();
  private viewing: { e: AlbumEntry; img: Img; drawing: boolean; dirty: boolean } | null = null;
  private pen: { id: number; x: number; y: number } | null = null;
  private area = { x: 0, y: 0, w: 0, h: 0 };
  /** a page-turn sound */
  onTurn: (() => void) | null = null;

  constructor(private src: JournalSource, private onClose: () => void) {}

  open(tab: Tab = this.tab, chest = false): void { this.tab = tab; this.chest = chest; this.page = 0; this.sel = null; this.viewing = null; if (chest) this.tab = 'Items'; }

  private btn(label: string, x: number, y: number, on: () => void, w = 0): void {
    const b = new Button(label, on, w);
    b.place(x, y);
    this.buttons.push(b);
  }
  private hit(x: number, y: number, w: number, h: number, on: () => void): void { this.rects.push({ x, y, w, h, on }); }

  draw(ui: UICanvas, t: number): void {
    this.rects = []; this.buttons = [];
    const s = ui.safe;
    ui.rect(0, 0, ui.w, ui.h, C.indigoDark, 190);
    const W = Math.min(ui.w - s.left - s.right - 12, 400), H = ui.h - s.top - s.bottom - 10;
    const x0 = Math.round((ui.w - W) / 2), y0 = s.top + 5;
    // tabs along the top, like coloured paper slips
    const tw = Math.floor((W - 40) / TABS.length);
    TABS.forEach((name, i) => {
      const tx = x0 + 6 + i * tw, on = name === this.tab;
      ui.rect(tx, y0 + (on ? 0 : 3), tw - 2, 13, on ? C.paperLight : [0xc8b088, 0xb8a078, 0xa8b088, 0xa0a8b8][i % 4]!);
      ui.hline(tx, tx + tw - 3, y0 + (on ? 0 : 3), on ? C.vermilion : C.woodDark);
      ui.text(tinyFont, name.toUpperCase(), tx + (tw - 2) / 2, y0 + (on ? 4 : 6), on ? C.vermilion : C.ink, { align: 'center' });
      this.hit(tx, y0, tw - 2, 14, () => { if (this.tab !== name) { this.tab = name; this.page = 0; this.sel = null; this.viewing = null; this.onTurn?.(); } });
    });
    panel(ui, 'washi', x0, y0 + 13, W, H - 13);
    ui.vline(x0 + Math.round(W / 2), y0 + 18, y0 + H - 6, C.paperDark);
    this.btn('x', x0 + W - 24, y0 + 1, () => this.onClose(), 20);
    this.area = { x: x0 + 10, y: y0 + 21, w: W - 20, h: H - 30 };
    switch (this.tab) {
      case 'Items': this.items(ui); break;
      case 'Places': this.list(ui, this.src.places.map((p) => [p.name, p.sub + '  -  day ' + (p.day + 1)]), `${this.src.places.length} places found`, 2); break;
      case 'People': this.people(ui); break;
      case 'Creatures': this.creatures(ui); break;
      case 'Secrets': this.secrets(ui); break;
      case 'Haiku': this.list(ui, this.src.haiku().map((h) => [h.place, h.text.split(' / ').join('\n')]), 'Haiku collected', 4); break;
      case 'Lore': this.list(ui, this.src.lore().map((l) => ['Fragment ' + l.n, l.text]), 'The story of Kagejo', 3); break;
      case 'Album': this.album(ui); break;
    }
    for (const b of this.buttons) b.draw(ui);
    this.drawLate(ui);
    void t;
  }

  // ---------- Items ----------
  private items(ui: UICanvas): void {
    const A = this.area, inv = this.src.journey.inv, near = this.src.near();
    let y = A.y;
    ui.text(bodyFont, 'Tools', A.x, y, C.ink); y += 12;
    TOOLS.forEach((td, i) => {
      const x = A.x + i * 20, has = inv.tools.has(td.id), on = this.sel?.kind === 'tool' && this.sel.id === td.id;
      ui.rect(x, y, 18, 18, on ? C.amberCore : C.paperDark);
      if (inv.current === td.id) ui.rect(x, y + 17, 18, 1, C.vermilion);
      if (has) ui.sprite(itemIcon(td.id, td.color), x + 3, y + 3); else ui.text(bodyFont, '?', x + 9, y + 4, C.paperLight, { align: 'center' });
      if (has) this.hit(x, y, 18, 18, () => { this.sel = { kind: 'tool', id: td.id }; });
    });
    y += 26;
    ui.text(bodyFont, `Keepsakes  ${12 - inv.free} / 12`, A.x, y, C.ink); y += 12;
    inv.slots.forEach((id, i) => {
      const x = A.x + (i % 6) * 20, yy = y + Math.floor(i / 6) * 20, on = this.sel?.kind === 'slot' && this.sel.i === i;
      ui.rect(x, yy, 18, 18, on ? C.amberCore : C.paperDark);
      if (id) { ui.sprite(itemIcon(id, keepsakeDef(id).color), x + 3, yy + 3); this.hit(x, yy, 18, 18, () => { this.sel = { kind: 'slot', i }; }); }
    });
    y += 44;
    if (this.chest || near.chest) {
      ui.text(bodyFont, `Chest at home  (${inv.stored.length})`, A.x, y, C.ink); y += 12;
      inv.stored.slice(this.page * 12, this.page * 12 + 12).forEach((id, k) => {
        const i = this.page * 12 + k, x = A.x + (k % 6) * 20, yy = y + Math.floor(k / 6) * 20, on = this.sel?.kind === 'stored' && this.sel.i === i;
        ui.rect(x, yy, 18, 18, on ? C.amberCore : C.woodLight);
        ui.sprite(itemIcon(id, keepsakeDef(id).color), x + 3, yy + 3);
        this.hit(x, yy, 18, 18, () => { this.sel = { kind: 'stored', i }; });
      });
      if (inv.stored.length > 12) this.pager(Math.ceil(inv.stored.length / 12), A.x, y + 42);
    }
    // the right page: what's selected and what you can do with it
    const rx = A.x + A.w / 2 + 6, rw = A.w / 2 - 8;
    let ry = A.y;
    const sel = this.sel;
    if (!sel) { ui.textBlock(bodyFont, 'Tap something to look at it. Keepsakes can be given to people, offered at shrines or kept at home.', rx, ry, rw, C.inkSoft); return; }
    if (sel.kind === 'tool') {
      const d = toolDef(sel.id);
      ui.sprite(itemIcon(d.id, d.color), rx, ry, 2); ry += 28;
      ui.text(headingFont, d.name, rx, ry, C.ink); ry += 20;
      ry += ui.textBlock(bodyFont, cleanText(d.text), rx, ry, rw, C.inkSoft) + 6;
      if (['lantern', 'rod', 'flute', 'umbrella'].includes(d.id)) this.btn(this.src.journey.inv.current === d.id ? 'In hand' : 'Hold', rx, ry, () => this.src.hold(d.id));
      return;
    }
    const id = sel.kind === 'slot' ? inv.slots[sel.i] : inv.stored[sel.i];
    if (!id) { this.sel = null; return; }
    const d = keepsakeDef(id);
    ui.sprite(itemIcon(id, d.color), rx, ry, 2); ry += 28;
    ui.text(headingFont, d.name, rx, ry, C.ink); ry += 20;
    ry += ui.textBlock(bodyFont, cleanText(d.text), rx, ry, rw, C.inkSoft) + 4;
    if (d.likedBy.length) { ry += ui.textBlock(tinyFont, ('LIKED BY ' + d.likedBy.map((j) => j.replace(/([A-Z])/g, ' $1')).join(', ')).toUpperCase(), rx, ry, rw, C.inkSoft) + 4; }
    if (sel.kind === 'stored') { this.btn('Take', rx, ry, () => { this.src.take(sel.i); this.sel = null; }); return; }
    const slot = sel.i;
    if (near.person) { this.btn('Give to ' + near.person, rx, ry, () => { this.src.give(id); this.sel = null; this.onClose(); }); ry += 21; }
    if (near.shrine && d.offering) { this.btn('Offer at the shrine', rx, ry, () => { if (this.src.offer(id)) { this.sel = null; this.onClose(); } }); ry += 21; }
    if (this.chest || near.chest) { this.btn('Store in the chest', rx, ry, () => { this.src.store(slot); this.sel = null; }); ry += 21; }
    if (!near.person && !near.shrine && !near.chest) ui.textBlock(tinyFont, 'FIND SOMEONE TO GIVE IT TO, A SHRINE, OR YOUR CHEST AT HOME.', rx, ry, rw, C.inkSoft);
  }

  // ---------- generic pages ----------
  private pager(pages: number, x: number, y: number): void {
    if (pages <= 1) return;
    this.btn('<', x, y, () => { this.page = Math.max(0, this.page - 1); this.onTurn?.(); }, 16);
    ui_text_hold.push({ s: `${this.page + 1} / ${pages}`, x: x + 30, y: y + 4 });
    this.btn('>', x + 46, y, () => { this.page = Math.min(pages - 1, this.page + 1); this.onTurn?.(); }, 16);
  }

  /** Two-page list: entries of [title, body]; `per` per half-page. */
  private list(ui: UICanvas, entries: [string, string][], header: string, per: number): void {
    const A = this.area, half = A.w / 2 - 8;
    ui.text(bodyFont, header, A.x, A.y, C.vermilion);
    if (!entries.length) { ui.textBlock(bodyFont, 'Nothing here yet. Walk, look, listen.', A.x, A.y + 16, half, C.inkSoft); return; }
    const perSpread = per * 2, pages = Math.ceil(entries.length / perSpread);
    this.page = Math.min(this.page, pages - 1);
    const items = entries.slice(this.page * perSpread, this.page * perSpread + perSpread);
    items.forEach(([title, body], k) => {
      const col = Math.floor(k / per), x = A.x + col * (A.w / 2 + 6);
      const slotH = (A.h - 34) / per, y = A.y + 14 + (k % per) * slotH;
      ui.text(bodyFont, cleanText(title), x, y, C.ink);
      let yy = y + 11;
      for (const line of cleanText(body).split('\n')) yy += ui.textBlock(tinyFont, line.toUpperCase(), x, yy, half, C.inkSoft);
    });
    this.pager(pages, A.x + A.w - 64, A.y + A.h - 16);
  }

  private people(ui: UICanvas): void {
    const A = this.area, ps = this.src.people(), half = A.w / 2 - 8;
    ui.text(bodyFont, `${ps.length} people met`, A.x, A.y, C.vermilion);
    if (!ps.length) { ui.textBlock(bodyFont, 'You have not talked to anyone yet.', A.x, A.y + 16, half, C.inkSoft); return; }
    const pages = Math.ceil(ps.length / 6);
    this.page = Math.min(this.page, pages - 1);
    ps.slice(this.page * 6, this.page * 6 + 6).forEach((p, k) => {
      const x = A.x + Math.floor(k / 3) * (A.w / 2 + 6), y = A.y + 14 + (k % 3) * 40;
      ui.sprite(p.portrait, x, y);
      ui.text(bodyFont, cleanText(p.name), x + 32, y, C.ink);
      ui.text(tinyFont, cleanText(p.title).toUpperCase().slice(0, 30), x + 32, y + 11, C.inkSoft);
      ui.text(tinyFont, `MET ${p.met}x  GIFTS ${p.gifts}`, x + 32, y + 18, C.inkSoft);
      ui.text(tinyFont, ('LIKES ' + p.likes).toUpperCase().slice(0, 32), x + 32, y + 25, C.vermilion);
    });
    this.pager(pages, A.x + A.w - 64, A.y + A.h - 16);
  }

  private creatures(ui: UICanvas): void {
    const A = this.area, j = this.src.journey, half = A.w / 2 - 8;
    const seen = this.src.animals.filter((a) => j.creatures[a.id] !== undefined);
    ui.text(bodyFont, `Animals  ${seen.length} / ${this.src.animals.length}`, A.x, A.y, C.vermilion);
    this.src.animals.forEach((a, i) => {
      const x = A.x + (i % 2) * (half / 2 + 2), y = A.y + 13 + Math.floor(i / 2) * 7;
      if (y > A.y + A.h - 8) return;
      const has = j.creatures[a.id] !== undefined;
      ui.rect(x, y + 1, 3, 3, has ? a.color : C.paperDark);
      ui.text(tinyFont, has ? cleanText(a.name).toUpperCase() : '. . .', x + 5, y, has ? C.ink : C.paperDark);
    });
    const rx = A.x + A.w / 2 + 6;
    ui.text(bodyFont, `Fish  ${Object.keys(j.fish).length} / ${FISH.length}`, rx, A.y, C.vermilion);
    FISH.forEach((f, i) => {
      const x = rx + (i % 2) * (half / 2 + 2), y = A.y + 13 + Math.floor(i / 2) * 7;
      const c = j.fish[f.id];
      ui.rect(x, y + 1, 3, 3, c ? parseInt(f.colors[0].slice(1), 16) : C.paperDark);
      ui.text(tinyFont, c ? `${cleanText(f.name).toUpperCase()} ${c.size}CM` : '. . .', x + 5, y, c ? C.ink : C.paperDark);
    });
  }

  private secrets(ui: UICanvas): void {
    const A = this.area;
    ui.text(bodyFont, 'Found', A.x, A.y, C.vermilion);
    this.src.secrets().forEach((s, i) => {
      const y = A.y + 14 + i * 14;
      ui.text(bodyFont, s.label, A.x, y, C.ink);
      ui.text(bodyFont, `${s.n} of ${s.of}`, A.x + A.w / 2 - 12, y, C.inkSoft, { align: 'right' });
    });
    const rx = A.x + A.w / 2 + 6;
    ui.text(bodyFont, 'Still hidden', rx, A.y, C.vermilion);
    this.src.hidden().forEach((h, i) => {
      const y = A.y + 13 + i * 8;
      if (y > A.y + A.h - 8) return;
      ui.text(tinyFont, cleanText(h.region).toUpperCase(), rx, y, C.ink);
      ui.text(tinyFont, String(h.left), A.x + A.w - 4, y, h.left ? C.inkSoft : C.paperDark, { align: 'right' });
    });
  }

  // ---------- Album ----------
  private thumb(e: AlbumEntry): Img | null {
    const t = this.thumbs.get(e.id);
    if (t === 'loading') return null;
    if (t) return t;
    this.thumbs.set(e.id, 'loading');
    void decode(e.data).then((img) => this.thumbs.set(e.id, img));
    return null;
  }
  private blit(ui: UICanvas, img: Img, x: number, y: number, w: number, h: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (Math.floor((j * img.h) / h) * img.w + Math.floor((i * img.w) / w)) * 4;
      ui.blend(x + i, y + j, (img.px[k]! << 16) | (img.px[k + 1]! << 8) | img.px[k + 2]!);
    }
  }
  private album(ui: UICanvas): void {
    const A = this.area, al = this.src.journey.album;
    if (this.viewing) {
      const v = this.viewing, k = Math.min((A.w - 70) / v.img.w, (A.h - 4) / v.img.h);
      const w = Math.floor(v.img.w * k), h = Math.floor(v.img.h * k);
      this.view = { x: A.x, y: A.y, k };
      this.blit(ui, v.img, A.x, A.y, w, h);
      const bx = A.x + w + 8;
      ui.text(tinyFont, (v.e.place + ' day ' + (v.e.day + 1)).toUpperCase(), bx, A.y, C.inkSoft);
      this.btn('Save', bx, A.y + 12, () => { void download(v.img, 'hotaru-' + v.e.id); }, 50);
      this.btn(v.drawing ? 'Done' : 'Draw', bx, A.y + 33, () => { if (v.drawing && v.dirty) { v.e.data = encode(v.img); v.dirty = false; } v.drawing = !v.drawing; }, 50);
      this.btn('Back', bx, A.y + 54, () => { if (v.dirty) v.e.data = encode(v.img); this.viewing = null; }, 50);
      if (v.drawing) ui.textBlock(tinyFont, 'DRAW WITH THE PENCIL OR A FINGER', bx, A.y + 78, 56, C.vermilion);
      return;
    }
    ui.text(bodyFont, `${al.length} pictures`, A.x, A.y, C.vermilion);
    if (!al.length) { ui.textBlock(bodyFont, 'Press P (or the camera token) to take photos and sketches.', A.x, A.y + 16, A.w / 2 - 8, C.inkSoft); return; }
    const tw = 56, th = 38, cols = Math.floor(A.w / (tw + 6)), rows = Math.floor((A.h - 34) / (th + 6)), per = cols * rows;
    const pages = Math.ceil(al.length / per);
    this.page = Math.min(this.page, pages - 1);
    const list = [...al].reverse().slice(this.page * per, this.page * per + per);
    list.forEach((e, k) => {
      const x = A.x + (k % cols) * (tw + 6), y = A.y + 14 + Math.floor(k / cols) * (th + 6);
      ui.rect(x - 1, y - 1, tw + 2, th + 2, C.paperDark);
      const img = this.thumb(e);
      if (img) this.blit(ui, img, x, y, tw, th);
      if (e.kind === 'sketch') ui.rect(x + tw - 4, y + th - 4, 3, 3, C.seal);
      this.hit(x, y, tw, th, () => { if (img) this.viewing = { e, img: { w: img.w, h: img.h, px: new Uint8ClampedArray(img.px) }, drawing: false, dirty: false }; });
    });
    this.pager(pages, A.x + A.w - 64, A.y + A.h - 16);
  }
  private view = { x: 0, y: 0, k: 1 };

  pointer(p: Pointer & { pressure?: number }): void {
    for (const b of this.buttons) if (b.pointer(p)) return;
    const v = this.viewing;
    if (v?.drawing) {
      const ix = (p.x - this.view.x) / this.view.k, iy = (p.y - this.view.y) / this.view.k;
      const inside = ix >= 0 && iy >= 0 && ix < v.img.w && iy < v.img.h;
      if (p.type === 'down' && inside) { this.pen = { id: p.id, x: ix, y: iy }; return; }
      if (p.type === 'move' && this.pen?.id === p.id) {
        const wdt = p.kind === 'pen' ? 0.6 + (p.pressure ?? 0.5) * 3.2 : 1.6;
        inkLine(v.img, this.pen.x, this.pen.y, ix, iy, wdt);
        this.pen.x = ix; this.pen.y = iy; v.dirty = true;
        return;
      }
      if (p.type === 'up') this.pen = null;
    }
    if (p.type !== 'down') return;
    for (const r of this.rects) if (p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h) { r.on(); return; }
  }

  /** Draw deferred page numbers (kept simple: drawn after buttons). */
  drawLate(ui: UICanvas): void {
    for (const h of ui_text_hold) ui.text(bodyFont, h.s, h.x, h.y, C.inkSoft, { align: 'center' });
    ui_text_hold.length = 0;
  }
}

const ui_text_hold: { s: string; x: number; y: number }[] = [];
export const ALL_KEEPSAKES = KEEPSAKES.length;
