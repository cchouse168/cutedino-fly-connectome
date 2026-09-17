/**
 * 三種子對照的檢定力分析（報告 §6.9）。
 *
 *   node scripts/power.mjs
 *
 * 本專案所有「超參數比較」都是 n=3 的配對設計。這支腳本回答一個必須先問的問題：
 * **這個設計看得見多大的效應？** 答案是 70% —— 所以 §5.3 那兩項對照
 * 能支持的只有「沒有觀察到改善」，不能支持「證明更差」。
 *
 * 配對差異標準差取自 V1 vs V3 實測（兩者訓練種子相同、賽道序列也相同，
 * 因為改 BULLET_HORIZON 不消耗 Trainer 的亂數流）。
 */

/* ── t 分布雙尾 p（連分數法算不完全 beta 函數） ── */
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
const tTest = (t, df) => ibeta(df / 2, 0.5, df / (df + t * t)); // 雙尾 p

const avg = (x) => x.reduce((a, c) => a + c, 0) / x.length;
const sampleSd = (x) => { const m = avg(x); return Math.sqrt(x.reduce((a, c) => a + (c - m) ** 2, 0) / (x.length - 1)); };

/* ── 實測資料（報告 §5.2、§5.3） ── */
const SEEDS = [20260915, 20260916, 20260917];
const V1 = { completed: [46, 87, 82], seconds: [109.75, 167.86, 161.09] };
const ARMS = {
  "V2（courseSeconds 600）": { completed: [28, 93, 13], seconds: [88.59, 172.50, 62.40] },
  "V3（bullet horizon 0.7）": { completed: [34, 86, 49], seconds: [96.60, 164.70, 113.00] },
};

const paired = [];
for (const [tag, arm] of Object.entries(ARMS)) {
  console.log(`== ${tag} vs V1（配對，同 ${SEEDS.length} 個訓練種子）`);
  for (const [label, key, unit] of [["跑完場數", "completed", " 場"], ["平均存活", "seconds", "s"]]) {
    const d = arm[key].map((v, i) => v - V1[key][i]);
    const m = avg(d), s = sampleSd(d), t = m / (s / Math.sqrt(d.length)), p = tTest(t, d.length - 1);
    paired.push({ key, sd: s });
    console.log(
      `   ${label}  差值 ${d.map((v) => v.toFixed(1)).join(" / ")}` +
      `　平均 ${m.toFixed(1)}${unit}　配對 sd ${s.toFixed(2)}　t=${t.toFixed(2)} (df=${d.length - 1})　` +
      `p=${p.toFixed(3)}${p < 0.05 ? "  顯著" : "  未達顯著"}`,
    );
  }
}

/* ── 最小可偵測差異 ── */
const SD = {}; // 取各指標中較小的配對 sd，是對檢定力較樂觀的估計
for (const r of paired) SD[r.key] = Math.min(SD[r.key] ?? Infinity, r.sd);
const T = { 3: [4.303, 1.061], 5: [2.776, 0.941], 8: [2.365, 0.896], 12: [2.201, 0.876] }; // t(.975,df), t(.80,df)
const BASE = { completed: avg(V1.completed), seconds: avg(V1.seconds) };

console.log(`\n== 最小可偵測差異（配對檢定，α=.05 雙尾，power 80%）`);
console.log(`   配對 sd：跑完場數 ${SD.completed.toFixed(1)} 場、平均存活 ${SD.seconds.toFixed(1)}s`);
console.log(`\n訓練種子數   跑完場數 MDE（基準 ${BASE.completed.toFixed(1)} 場）   平均存活 MDE（基準 ${BASE.seconds.toFixed(1)}s）`);
for (const n of Object.keys(T).map(Number)) {
  const k = (T[n][0] + T[n][1]) / Math.sqrt(n);
  const c = k * SD.completed, s = k * SD.seconds;
  console.log(
    String(n).padStart(8) + (n === 3 ? " ←本報告" : "        ") +
    `${c.toFixed(0)} 場 (${((c / BASE.completed) * 100).toFixed(0)}%)`.padStart(20) +
    `${s.toFixed(0)}s (${((s / BASE.seconds) * 100).toFixed(0)}%)`.padStart(24),
  );
}

/* ── 核心主張的檢定：消融比 vs 虛無假設 1.0 ── */
const ablation = [31.21, 47.68, 45.81];
const m = avg(ablation), s = sampleSd(ablation), t = (m - 1) / (s / Math.sqrt(ablation.length));
console.log(`\n== 核心主張（消融比 ≠ 1）`);
console.log(`   ${ablation.join(" / ")}　平均 ${m.toFixed(1)}×　樣本 sd ${s.toFixed(2)}　` +
  `t=${t.toFixed(1)} (df=2)　p=${tTest(t, 2).toFixed(3)}  ${tTest(t, 2) < 0.05 ? "顯著" : "未達顯著"}`);
console.log(`   檢定力限制只影響「不同 config 之間的比較」，不影響「電路有沒有貢獻」。`);
