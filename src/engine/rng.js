/**
 * Seeded linear congruential generator (LCG).
 * Same parameters as rng() in flyjump/src/lib/training.ts, so one seed reproduces a course exactly.
 */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
}

/** Box-Muller normal sampling, used by CEM to draw candidate weights. */
export const gaussian = (r) =>
  Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
