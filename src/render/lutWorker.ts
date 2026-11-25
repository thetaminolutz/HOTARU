/** Builds palette LUTs off the main thread. */
import { buildLut, paletteAt, LUT_SIZE } from './palette';

type Scope = { onmessage: ((e: MessageEvent<{ id: number; hour: number }>) => void) | null; postMessage(m: unknown, t: Transferable[]): void };
const scope = self as unknown as Scope;
scope.onmessage = (e) => {
  const { id, hour } = e.data;
  const lut = buildLut(paletteAt(hour), LUT_SIZE);
  scope.postMessage({ id, hour, lut }, [lut.buffer]);
};
