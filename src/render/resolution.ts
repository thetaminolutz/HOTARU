/**
 * Internal resolution for a device size: pick an INTEGER scale closest to the target height,
 * then size the internal image to cover the screen. Pixels stay square and even with no
 * letterbox and no filtering (crop ≤ scale−1 device pixels).
 */
export function chooseInternal(deviceW: number, deviceH: number, targetH: number): { scale: number; width: number; height: number } {
  const scale = Math.max(1, Math.round(deviceH / targetH));
  return { scale, width: Math.ceil(deviceW / scale), height: Math.ceil(deviceH / scale) };
}
