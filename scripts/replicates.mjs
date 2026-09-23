/**
 * Replicate validation: rerun the whole pipeline with different training seeds to confirm the result is not one seed's luck.
 *
 *   node scripts/replicates.mjs [generations] [seed...]
 *
 * Each seed writes models/replicates/<seed>/{model,training,benchmark}.json,
 * summarised at the end into models/replicates.json.
 *
 * What matters is whether the ablation ratio stays stable across replicates --
 * absolute scores vary by training seed anyway, but if the circuit contributes, the collapse after ablation should appear every time.
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
  if (r.status !== 0) throw new Error(`Failed: ${args.join(" ")}`);
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

console.log(`\n${"=".repeat(64)}\nReplicate summary\n${"=".repeat(64)}`);
console.log("Seed".padEnd(12) + "Gen".padStart(5) + "Done".padStart(8) + "Mean surv".padStart(11) + "Ablation".padStart(9) + "Untrained".padStart(10) + "vs rules".padStart(9));
for (const r of rows)
  console.log(
    String(r.seed).padEnd(12) + String(r.generation).padStart(5) +
    `${r.completed}/100`.padStart(8) + r.meanSeconds.toFixed(1).padStart(10) + "s" +
    r.ablationRatio.toFixed(1).padStart(8) + "×" + r.untrainedRatio.toFixed(1).padStart(9) + "×" +
    r.ruleRatio.toFixed(2).padStart(8) + "×",
  );
const a = summary.aggregate;
console.log(
  `\nMean survival ${a.meanSeconds.mean.toFixed(1)} ± ${a.meanSeconds.sd.toFixed(1)}s  ` +
  `completed ${a.completed.mean.toFixed(1)} ± ${a.completed.sd.toFixed(1)}/100`,
);
console.log(`Ablation ratio ${a.ablationRatio.mean.toFixed(1)} ± ${a.ablationRatio.sd.toFixed(1)}x   vs rules ${a.ruleRatio.mean.toFixed(2)} ± ${a.ruleRatio.sd.toFixed(2)}x`);
console.log(
  a.ablationRatio.mean - a.ablationRatio.sd > 2
    ? "\nThe ablation effect reproduces stably across replicates."
    : "\nThe ablation effect is unstable; a single run is not trustworthy.",
);
console.log("Wrote models/replicates.json");
