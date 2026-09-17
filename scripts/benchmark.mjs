/**
 * 離線基準測試（Node）。
 *   node scripts/benchmark.mjs
 * 產出 models/benchmark.json。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { benchmark } from "../src/lib/benchmark.js";
import { validModel } from "../src/lib/policy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(fs.readFileSync(path.join(root, "data/connectome.json"), "utf8"));
const channelMap = JSON.parse(fs.readFileSync(path.join(root, "data/channels.json"), "utf8"));
const dir = process.argv[2] ?? "models";   // replicate 跑法：傳入 models/replicates/<seed>
const model = JSON.parse(fs.readFileSync(path.join(root, dir, "model.json"), "utf8"));

if (!validModel(model)) throw new Error("models/model.json 不是有效的模型檔");

console.log(`基準測試：100 條 held-out 賽道 × 180 秒`);
console.log(`模型：第 ${model.generation} 代，訓練種子 ${model.trainingSeed}\n`);

const t0 = Date.now();
const report = benchmark(model, graph, channelMap);
fs.writeFileSync(path.join(root, dir, "benchmark.json"), JSON.stringify(report, null, 2) + "\n");

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n, d = 2) => v.toFixed(d).padStart(n);
console.log(pad("對照組", 20) + "跑完".padStart(8) + "平均存活".padStart(11) + "中位存活".padStart(11) + "平均分數".padStart(11) + "道具".padStart(7) + "擊殺".padStart(7));
console.log("-".repeat(75));
for (const r of report.results)
  console.log(
    pad(r.name, 20) + `${r.completed}/100`.padStart(8) + num(r.meanSeconds, 10) + "s" +
    num(r.medianSeconds, 10) + "s" + num(r.meanScore, 11, 0) + num(r.meanPickups, 7, 1) + num(r.meanKills, 7, 1),
  );

const full = report.results[0], silenced = report.results[1], untrained = report.results[2], rule = report.results[3];
console.log(`\n核心主張檢驗：`);
const ratioS = full.meanSeconds / Math.max(0.01, silenced.meanSeconds);
const ratioU = full.meanSeconds / Math.max(0.01, untrained.meanSeconds);
console.log(`  完整版 / 電路靜默 = ${ratioS.toFixed(1)}×`);
console.log(`  完整版 / 未訓練讀出 = ${ratioU.toFixed(1)}×`);
console.log(`  完整版 / 手寫規則 = ${(full.meanSeconds / Math.max(0.01, rule.meanSeconds)).toFixed(2)}×`);
const ok = ratioS > 2 && ratioU > 2;
console.log(ok
  ? `\n  成立：消融後表現顯著劣化，固定的解剖結構確實有貢獻。`
  : `\n  不成立：消融後表現未顯著劣化，讀出網路可能在硬記，需檢討通道設計。`);
console.log(`\n耗時 ${((Date.now() - t0) / 1000).toFixed(0)}s，寫入 ${dir}/benchmark.json`);
