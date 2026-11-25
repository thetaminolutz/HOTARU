/** The shared world clock: time of day in hours, day counter, pause and time scale. */
import { wrapHour } from './math';
import { bus } from './events';

export type Period =
  | 'deep night' | 'dawn' | 'morning' | 'noon' | 'afternoon'
  | 'golden hour' | 'sunset' | 'blue hour' | 'night';

export function periodOf(hour: number): Period {
  const h = wrapHour(hour);
  if (h < 4.5) return 'deep night';
  if (h < 6.5) return 'dawn';
  if (h < 11) return 'morning';
  if (h < 13.5) return 'noon';
  if (h < 16.8) return 'afternoon';
  if (h < 18.2) return 'golden hour';
  if (h < 19) return 'sunset';
  if (h < 19.8) return 'blue hour';
  if (h < 23.5) return 'night';
  return 'deep night';
}

export class WorldClock {
  /** Hours in [0,24). */
  hour = 21.5;
  day = 0;
  /** Real minutes per in-game day (SPEC §12: 24 by default). */
  dayLengthMinutes = 24;
  paused = false;
  timeScale = 1;
  /** Seconds of real (unpaused) time since boot — drives animation. */
  elapsed = 0;
  private period: Period = periodOf(this.hour);

  tick(dt: number): void {
    this.elapsed += dt;
    if (this.paused) return;
    const hoursPerSecond = 24 / (this.dayLengthMinutes * 60);
    const h = this.hour + dt * hoursPerSecond * this.timeScale;
    if (h >= 24) this.day++;
    this.setHour(h);
  }

  setHour(h: number): void {
    this.hour = wrapHour(h);
    const p = periodOf(this.hour);
    if (p !== this.period) {
      this.period = p;
      bus.emit('clock:period', { period: p });
    }
  }
}

export const clock = new WorldClock();
