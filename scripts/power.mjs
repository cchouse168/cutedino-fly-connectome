/**
 * Statistical power of the three-seed comparisons (report §6.9).
 *
 *   node scripts/power.mjs
 *
 * Every hyperparameter comparison in this project is a paired design with n=3. This script answers
 * the question that has to come first: **how large an effect can this design see?** The answer is 70%,
 * which is why the two comparisons in §5.3 support only "no improvement observed", not "shown to be worse".
 *
 * The paired-difference SD comes from the measured V1 vs V3 runs (same training seeds and same course
 * sequences, because changing BULLET_HORIZON does not consume any of the Trainer's random stream).
 */

/* -- two-tailed p for the t distribution (incomplete beta by continued fractions) -- */
function betacf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}
function lgamma(z) {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
             12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < 8; i++) x += g[i] / (z + i + 1);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
function ibeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const f = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (f * betacf(a, b, x)) / a : 1 - (f * betacf(b, a, 1 - x)) / b;
}
const tTest = (t, df) => ibeta(df / 2, 0.5, df / (df + t * t)); // two-tailed p

const avg = (x) => x.reduce((a, c) => a + c, 0) / x.length;
const sampleSd = (x) => { const m = avg(x); return Math.sqrt(x.reduce((a, c) => a + (c - m) ** 2, 0) / (x.length - 1)); };

/* -- measured data (report §5.2, §5.3) -- */
const SEEDS = [20260915, 20260916, 20260917];
const V1 = { completed: [46, 87, 82], seconds: [109.75, 167.86, 161.09] };
const ARMS = {
  "V2 (courseSeconds 600)": { completed: [28, 93, 13], seconds: [88.59, 172.50, 62.40] },
  "V3 (bullet horizon 0.7)": { completed: [34, 86, 49], seconds: [96.60, 164.70, 113.00] },
};

const paired = [];
for (const [tag, arm] of Object.entries(ARMS)) {
  console.log(`== ${tag} vs V1 (paired, the same ${SEEDS.length} training seeds)`);
  for (const [label, key, unit] of [["courses completed", "completed", ""], ["mean survival", "seconds", "s"]]) {
    const d = arm[key].map((v, i) => v - V1[key][i]);
    const m = avg(d), s = sampleSd(d), t = m / (s / Math.sqrt(d.length)), p = tTest(t, d.length - 1);
    paired.push({ key, sd: s });
    console.log(
      `   ${label.padEnd(18)} differences ${d.map((v) => v.toFixed(1)).join(" / ")}` +
      `  mean ${m.toFixed(1)}${unit}  paired sd ${s.toFixed(2)}  t=${t.toFixed(2)} (df=${d.length - 1})  ` +
      `p=${p.toFixed(3)}${p < 0.05 ? "  significant" : "  not significant"}`,
    );
  }
}

/* -- minimum detectable difference -- */
const SD = {}; // take the smaller paired sd per metric, which is the optimistic estimate of power
for (const r of paired) SD[r.key] = Math.min(SD[r.key] ?? Infinity, r.sd);
const T = { 3: [4.303, 1.061], 5: [2.776, 0.941], 8: [2.365, 0.896], 12: [2.201, 0.876] }; // t(.975,df), t(.80,df)
const BASE = { completed: avg(V1.completed), seconds: avg(V1.seconds) };

console.log(`\n== Minimum detectable difference (paired test, alpha=.05 two-tailed, power 80%)`);
console.log(`   Paired sd: courses completed ${SD.completed.toFixed(1)}, mean survival ${SD.seconds.toFixed(1)}s`);
console.log(`\nSeeds        courses-completed MDE (baseline ${BASE.completed.toFixed(1)})   mean-survival MDE (baseline ${BASE.seconds.toFixed(1)}s)`);
for (const n of Object.keys(T).map(Number)) {
  const k = (T[n][0] + T[n][1]) / Math.sqrt(n);
  const c = k * SD.completed, s = k * SD.seconds;
  console.log(
    String(n).padStart(8) + (n === 3 ? " <-report" : "         ") +
    `${c.toFixed(0)} courses (${((c / BASE.completed) * 100).toFixed(0)}%)`.padStart(24) +
    `${s.toFixed(0)}s (${((s / BASE.seconds) * 100).toFixed(0)}%)`.padStart(24),
  );
}

/* -- testing the core claim: ablation ratio vs the null hypothesis of 1.0 -- */
const ablation = [31.21, 47.68, 45.81];
const m = avg(ablation), s = sampleSd(ablation), t = (m - 1) / (s / Math.sqrt(ablation.length));
console.log(`\n== Core claim (ablation ratio != 1)`);
console.log(`   ${ablation.join(" / ")}  mean ${m.toFixed(1)}x  sample sd ${s.toFixed(2)}  ` +
  `t=${t.toFixed(1)} (df=2)  p=${tTest(t, 2).toFixed(3)}  ${tTest(t, 2) < 0.05 ? "significant" : "not significant"}`);
console.log(`   The power limit affects only comparisons between configurations, not whether the circuit contributes.`);
