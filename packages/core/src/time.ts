import type { Fps, Easing } from './types.js';

/** Round nonnegative rational values to nearest integer; ties go up. */
export function frameTimestamp(frame: number, fps: Fps, units = 1_000_000): number {
  if (![frame, fps.numerator, fps.denominator, units].every(Number.isSafeInteger) || frame < 0 || fps.numerator <= 0 || fps.denominator <= 0 || units <= 0) {
    throw new RangeError('Frame, FPS and units must be safe integers with positive FPS/units');
  }
  const numerator = BigInt(frame) * BigInt(fps.denominator) * BigInt(units);
  const denominator = BigInt(fps.numerator);
  const result = (2n * numerator + denominator) / (2n * denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Timestamp exceeds safe integer range');
  return Number(result);
}
export function frameSeconds(frame: number, fps: Fps): number { return frame * fps.denominator / fps.numerator; }
export function ease(t: number, easing: Easing): number {
  if (easing === 'linear' || t <= 0 || t >= 1) return t;
  const [x1, y1, x2, y2] = easing;
  const cubic = (s: number, a: number, b: number) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (cubic(mid, x1, x2) < t) low = mid; else high = mid;
  }
  return cubic((low + high) / 2, y1, y2);
}
