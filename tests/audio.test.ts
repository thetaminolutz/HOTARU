import { describe, expect, it } from 'vitest';
import { composePiece, moodFor, SCALES, MAIN_THEME, degreeToMidi } from '../src/audio/composer';
import { REGIONS } from '../src/world/data/regions';

describe('generative music', () => {
  it('is deterministic for a seed and mood', () => {
    const m = moodFor('lake', 18);
    expect(composePiece(42, m).notes).toEqual(composePiece(42, m).notes);
    expect(composePiece(43, m).notes).not.toEqual(composePiece(42, m).notes);
  });

  it('plays arcs of 2–4 minutes in every region, day and night', () => {
    for (const r of REGIONS) for (const h of [7, 13, 19, 23]) {
      const p = composePiece(7, moodFor(r.id, h));
      expect(p.seconds).toBeGreaterThanOrEqual(120);
      expect(p.seconds).toBeLessThanOrEqual(260);
      expect(p.notes.length).toBeGreaterThan(20);
    }
  });

  it('keeps every pitched note in the mood’s scale', () => {
    for (const id of ['cedar', 'rice', 'coast', 'cherry', 'snow']) {
      const m = moodFor(id, 11);
      const sc = SCALES[m.scale];
      for (const n of composePiece(3, m).notes) {
        if (n.inst === 'taiko') continue;
        const pc = (((n.midi - m.root) % 12) + 12) % 12;
        expect(sc).toContain(pc);
      }
    }
  });

  it('the lake at dusk and the title use the main theme', () => {
    const m = moodFor('lake', 18.5);
    expect(m.theme).toBe(true);
    const p = composePiece(1, moodFor('lake', 12, true));
    const first = p.notes.filter((n) => n.inst === p.mood.melody).slice(0, 3).map((n) => n.midi);
    const theme = MAIN_THEME.slice(0, 3).map(([d]) => degreeToMidi(SCALES.yo, p.mood.root, d));
    // the opening (or, with an intro, the first melody) carries the theme's first notes
    expect(theme.some((t) => first.includes(t))).toBe(true);
  });

  it('night is sparser than day', () => {
    const day = composePiece(5, moodFor('maple', 13)), night = composePiece(5, moodFor('maple', 23));
    expect(night.notes.length / night.seconds).toBeLessThan(day.notes.length / day.seconds);
  });
});
