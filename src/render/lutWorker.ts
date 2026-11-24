/// <reference lib="webworker" />
import { buildLut, paletteAt, LUT_SIZE } from './palette';

self.onmessage = (e: MessageEvent<{ id: number; hour: number }>) => {
  const { id, hour } = e.data;
  const lut = buildLut(paletteAt(hour), LUT_SIZE);
  (self as unknown as Worker).postMessage({ id, hour, lut }, [lut.buffer]);
};
