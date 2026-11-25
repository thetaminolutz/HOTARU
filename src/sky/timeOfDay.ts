/** Evaluates the time-of-day keyframes into a lighting state. */
import * as THREE from 'three';
import { TOD_KEYS, type TodKey } from './data/timeOfDay';
import { hexToLinear } from '../render/color';
import { wrapHour, clamp } from '../core/math';

export type TodState = {
  hour: number;
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  /** The light that casts shadows: sun by day, moon by night. */
  keyDir: THREE.Vector3;
  keyColor: THREE.Color;
  zenith: THREE.Color; horizon: THREE.Color; sunGlow: THREE.Color;
  ambSky: THREE.Color; ambGround: THREE.Color;
  shadowTint: THREE.Color; rim: THREE.Color;
  fog: number; heightFog: number; exposure: number;
  lift: THREE.Color; gain: THREE.Color; sat: number;
  stars: number; lamps: number;
  clouds: THREE.Color; cloudLit: THREE.Color;
};

const colorKeys = ['zenith', 'horizon', 'sunGlow', 'ambSky', 'ambGround', 'shadowTint', 'rim', 'lift', 'gain', 'clouds', 'cloudLit'] as const;

/** Scene orientation: the lake looks north (−z). Sun rises in the east (+x), sets in the west (−x). */
export function sunDirection(hour: number, out = new THREE.Vector3()): THREE.Vector3 {
  // 6:00 → east horizon, 12:00 → south high, 18:00 → west horizon. Sun path tilted towards south (+z).
  const a = ((hour - 6) / 12) * Math.PI; // 0 at sunrise, π at sunset
  const elev = Math.sin(a) * 0.95; // max ~72°
  out.set(Math.cos(a), elev, 0.45 * Math.max(0.2, Math.sin(a)) + 0.15);
  return out.normalize();
}

export function moonDirection(hour: number, out = new THREE.Vector3()): THREE.Vector3 {
  const a = ((hour - 18.5) / 12) * Math.PI;
  out.set(Math.cos(a) * 0.9, Math.sin(a) * 0.75 + 0.08, -0.35);
  return out.normalize();
}

export function createTodState(): TodState {
  const c = () => new THREE.Color();
  return {
    hour: 0, sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), keyDir: new THREE.Vector3(), keyColor: c(),
    zenith: c(), horizon: c(), sunGlow: c(), ambSky: c(), ambGround: c(), shadowTint: c(), rim: c(),
    fog: 0, heightFog: 0, exposure: 1, lift: c(), gain: c(), sat: 1, stars: 0, lamps: 0, clouds: c(), cloudLit: c(),
  };
}

const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function setLin(col: THREE.Color, hex: string) { const [r, g, b] = hexToLinear(hex); return col.setRGB(r, g, b, THREE.LinearSRGBColorSpace); }

/** Moon phase 0..1 (0 new, 0.5 full) over an 8-day cycle (SPEC §3.7: 8 phases). */
export function moonPhase(day: number, hour: number): number {
  return (((day + hour / 24) / 8) % 1 + 1) % 1;
}

export function evaluateTod(hour: number, s: TodState, phase = 0.5): TodState {
  const h = wrapHour(hour);
  let i = 0;
  while (i < TOD_KEYS.length - 2 && TOD_KEYS[i + 1]!.hour <= h) i++;
  const a = TOD_KEYS[i]!, b = TOD_KEYS[i + 1]!;
  const t = clamp((h - a.hour) / (b.hour - a.hour), 0, 1);
  const num = (k: keyof TodKey) => (a[k] as number) + ((b[k] as number) - (a[k] as number)) * t;
  for (const k of colorKeys) {
    setLin(tmpA, a[k]); setLin(tmpB, b[k]);
    s[k].copy(tmpA).lerp(tmpB, t);
  }
  s.hour = h;
  s.fog = num('fog'); s.heightFog = num('heightFog'); s.exposure = num('exposure');
  s.sat = num('sat'); s.stars = num('stars'); s.lamps = num('lamps');
  sunDirection(h, s.sunDir);
  moonDirection(h, s.moonDir);
  const sunI = num('sunI'), moonI = num('moonI');
  setLin(tmpA, a.sun); setLin(tmpB, b.sun);
  const sunCol = tmpA.lerp(tmpB, t);
  if (sunI >= moonI) {
    s.keyDir.copy(s.sunDir);
    if (s.keyDir.y < 0.06) s.keyDir.y = 0.06;
    s.keyDir.normalize();
    s.keyColor.copy(sunCol).multiplyScalar(sunI);
  } else {
    s.keyDir.copy(s.moonDir);
    // the full moon lights the scene noticeably more than a crescent
    const full = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
    s.keyColor.setRGB(0.42, 0.5, 0.85, THREE.LinearSRGBColorSpace).multiplyScalar(moonI * (0.35 + 0.65 * full));
  }
  const ambI = num('ambI');
  s.ambSky.multiplyScalar(ambI); s.ambGround.multiplyScalar(ambI);
  s.rim.multiplyScalar(num('rimI'));
  return s;
}
