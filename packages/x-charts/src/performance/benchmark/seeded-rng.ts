/**
 * Deterministic seeded random number generator — Faz 21.11 PR-A1.
 *
 * Codex iter-2 consensus (thread `019e0e7a`): benchmark fixtures must
 * be reproducible across machines and CI runs. We use **mulberry32**,
 * a small, fast 32-bit RNG with a 2^32 period. It is NOT
 * cryptographically secure — that's intentional: deterministic
 * benchmarks beat realistic noise.
 *
 *   const rng = mulberry32(0xC001D00D);
 *   for (let i = 0; i < 1_000_000; i++) {
 *     points.push({ x: rng(), y: rng() });
 *   }
 *
 * Same seed → same sequence → benchmark numbers are comparable across
 * dev laptops, CI runners, and recorded test reports.
 *
 * Algorithm credit: Tommy Ettinger / mulberry32 (public domain).
 */

/**
 * Build a mulberry32 RNG from a 32-bit unsigned integer seed.
 * The returned function yields a `[0, 1)` float on each call.
 */
export function mulberry32(seed: number): () => number {
  // Coerce to uint32 (mulberry32 contract).
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Produce N samples in `[min, max)` from a mulberry32 RNG. Tiny
 * helper to keep fixture generators readable.
 */
export function uniform(rng: () => number, n: number, min: number, max: number): number[] {
  const range = max - min;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = min + rng() * range;
  }
  return out;
}

/**
 * Build a Gaussian-ish sample by averaging 6 uniforms (central-limit
 * shortcut). Used for "clustered scatter" fixtures so the WebGL path
 * has a non-uniform shape to render.
 */
export function gaussian(rng: () => number, mean: number, stddev: number): number {
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += rng();
  return mean + (sum - 3) * stddev;
}
