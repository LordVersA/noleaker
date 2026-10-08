/** Stateless noise: the same (seed, index) always gives the same value in [0, 1). */
export function unit(seed: number, index: number): number {
  let t = (seed + Math.imul(index | 0, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Same, mapped to [-1, 1). */
export function signed(seed: number, index: number): number {
  return unit(seed, index) * 2 - 1;
}
