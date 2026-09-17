/**
 * Replicate 驗證：用不同的訓練種子重跑整條管線，確認結果不是單一種子的僥倖。
 *
 *   node scripts/replicates.mjs [generations] [seed...]
 *
 * 每個種子產出 models/replicates/<seed>/{model,training,benchmark}.json，
 * 最後彙整成 models/replicates.json。
 *
 * 要看的是「消融比」在各 replicate 之間是否穩定 ——
 * 絕對分數本來就會因訓練種子而異，但若電路有貢獻，消融後的崩潰應該每次都出現。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generations = Number(process.argv[2] ?? 400);
const seeds = process.argv.slice(3).map(Number);
if (!seeds.length) seeds.push(20260915, 20260916, 20260917);

const run = (args) => {
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`失敗：${args.join(" ")}`);
};

const rows = [];
for (const seed of seeds) {
  const dir = path.posix.join("models/replicates", String(seed));
  console.log(`\n${"=".repeat(64)}\nReplicate seed=${seed}  generations=${generations}\n${"=".repeat(64)}`);
  run(["scripts/train.mjs", String(seed), String(generations), dir]);
  run(["scripts/benchmark.mjs", dir]);

  const b = JSON.parse(fs.readFileSync(path.join(root, dir, "benchmark.json"), "utf8"));
  const [full, silenced, untrained, rule] = b.results;
  rows.push({
    seed,
    generation: b.model.generation,
    validation: b.model.validation,
    completed: full.completed,
    meanSeconds: full.meanSeconds,
    meanScore: full.meanScore,
    ablationRatio: full.meanSeconds / Math.max(0.01, silenced.meanSeconds),
    untrainedRatio: full.meanSeconds / Math.max(0.01, untrained.meanSeconds),
    ruleRatio: full.meanSeconds / Math.max(0.01, rule.meanSeconds),
  });
}

const mean = (f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
const sd = (f) => {
  const m = mean(f);
  return Math.sqrt(rows.reduce((a, r) => a + (f(r) - m) ** 2, 0) / rows.length);
};

const summary = {
  generations,
  seeds,
  replicates: rows,
  aggregate: {
    meanSeconds: { mean: mean((r) => r.meanSeconds), sd: sd((r) => r.meanSeconds) },
    completed: { mean: mean((r) => r.completed), sd: sd((r) => r.completed) },
    ablationRatio: { mean: mean((r) => r.ablationRatio), sd: sd((r) => r.ablationRatio) },
    ruleRatio: { mean: mean((r) => r.ruleRatio), sd: sd((r) => r.ruleRatio) },
  },
};
fs.writeFileSync(path.join(root, "models/replicates.json"), JSON.stringify(summary, null, 2) + "\n");

console.log(`\n${"=".repeat(64)}\nReplicate 彙整\n${"=".repeat(64)}`);
console.log("種子".padEnd(12) + "代".padStart(5) + "跑完".padStart(8) + "平均存活".padStart(11) + "消融比".padStart(9) + "未訓練比".padStart(10) + "勝規則".padStart(9));
for (const r of rows)
  console.log(
    String(r.seed).padEnd(12) + String(r.generation).padStart(5) +
    `${r.completed}/100`.padStart(8) + r.meanSeconds.toFixed(1).padStart(10) + "s" +
    r.ablationRatio.toFixed(1).padStart(8) + "×" + r.untrainedRatio.toFixed(1).padStart(9) + "×" +
    r.ruleRatio.toFixed(2).padStart(8) + "×",
  );
const a = summary.aggregate;
console.log(
  `\n平均存活 ${a.meanSeconds.mean.toFixed(1)} ± ${a.meanSeconds.sd.toFixed(1)}s  ` +
  `跑完 ${a.completed.mean.toFixed(1)} ± ${a.completed.sd.toFixed(1)}/100`,
);
console.log(`消融比 ${a.ablationRatio.mean.toFixed(1)} ± ${a.ablationRatio.sd.toFixed(1)}×   勝規則 ${a.ruleRatio.mean.toFixed(2)} ± ${a.ruleRatio.sd.toFixed(2)}×`);
console.log(
  a.ablationRatio.mean - a.ablationRatio.sd > 2
    ? "\n消融效應在各 replicate 之間穩定重現。"
    : "\n消融效應不穩定，單次結果不足採信。",
);
console.log("寫入 models/replicates.json");
