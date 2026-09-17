/**
 * 驗證集大小對選模準確度的影響（報告 §5.2、§5.6）。
 *
 *   node scripts/validation-size.mjs
 *
 * 拿現存的冠軍權重，用不同大小的驗證集重新評分，比對它們對 held-out 的等級相關。
 * 要看的是：擴大驗證集能不能讓「驗證分數最高的模型」真的是「held-out 最好的模型」。
 *
 * 注意：只列入用目前 policy.js 訓練出來的權重。models/exp-v3/ 的權重是在
 * BULLET_HORIZON=0.7 下訓練的，而那個常數不在 channelVersion 裡（見報告 §6.11），
 * 用現在的觀測函式評估它們沒有意義。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connectome } from "../src/lib/connectome.js";
import { episode, mean } from "../src/lib/training.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

const brain = new Connectome(read("data/connectome.json"), read("data/channels.json"));
const SIZES = [16, 64, 128];

const valScore = (w, n) =>
  mean(Array.from({ length: n }, (_, i) => episode(w, 1100001 + i, 180, "model", brain).score));

const heldOut = (w) => {
  const runs = Array.from({ length: 100 }, (_, i) => episode(w, 2100001 + i, 180, "model", brain));
  return { completed: runs.filter((r) => !r.dead).length, meanSeconds: mean(runs.map((r) => r.seconds)) };
};

const MODELS = [
  ["V1 s20260917（主模型）", "models/model.json"],
  ["V1 s20260914 400代", "models/baseline-v1/model.json"],
  ["V1 s20260914 150代", "models/run-150gen/model.json"],
  ["V2 s20260915", "models/exp-v2/per-seed/20260915/model.json"],
  ["V2 s20260916", "models/exp-v2/per-seed/20260916/model.json"],
  ["V2 s20260917（第39代鎖死）", "models/exp-v2/per-seed/20260917/model.json"],
];

const rows = MODELS.map(([tag, p]) => {
  const m = read(p);
  const r = { tag, ...heldOut(m.weights) };
  for (const n of SIZES) r["v" + n] = valScore(m.weights, n);
  console.log(
    tag.padEnd(26) +
      SIZES.map((n) => `val@${n}=${r["v" + n].toFixed(0).padStart(5)}`).join("  ") +
      `  held-out=${String(r.completed).padStart(3)}/100 ${r.meanSeconds.toFixed(1).padStart(6)}s`,
  );
  return r;
});

const pearson = (x, y) => {
  const mx = mean(x), my = mean(y);
  return x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0) /
    Math.sqrt(x.reduce((a, v) => a + (v - mx) ** 2, 0) * y.reduce((a, v) => a + (v - my) ** 2, 0));
};
const rank = (a) => { const s = [...a].sort((p, q) => p - q); return a.map((v) => s.indexOf(v) + 1); };
const spearman = (x, y) => pearson(rank(x), rank(y));

const truth = rows.map((r) => r.meanSeconds);
const bestByHeldOut = [...rows].sort((a, b) => b.meanSeconds - a.meanSeconds)[0].tag;

console.log(`\n${"驗證集".padEnd(10)}${"Spearman ρ".padStart(12)}${"Pearson r".padStart(12)}   驗證分數最高的模型`);
for (const n of SIZES) {
  const v = rows.map((r) => r["v" + n]);
  const pick = [...rows].sort((a, b) => b["v" + n] - a["v" + n])[0].tag;
  console.log(
    String(n).padEnd(10) + spearman(v, truth).toFixed(3).padStart(12) + pearson(v, truth).toFixed(3).padStart(12) +
      `   ${pick}${pick === bestByHeldOut ? " ✓" : " ✗（真正最好的是 " + bestByHeldOut + "）"}`,
  );
}
console.log(`\nheld-out 最好的模型：${bestByHeldOut}`);
