/**
 * 種子化線性同餘產生器（LCG）。
 * 參數與 flyjump/src/lib/training.ts 的 rng() 相同，確保同一 seed 可完整重現賽道。
 */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
}

/** Box-Muller 常態取樣，供 CEM 產生候選權重。 */
export const gaussian = (r) =>
  Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
