/**
 * Offline benchmark (Node).
 *   node scripts/benchmark.mjs
 * Writes models/benchmark.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { benchmark } from "../src/lib/benchmark.js";
import { validModel } from "../src/lib/policy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(fs.readFileSync(path.join(root, "data/connectome.json"), "utf8"));
const channelMap = JSON.parse(fs.readFileSync(path.join(root, "data/channels.json"), "utf8"));
const dir = process.argv[2] ?? "models";   // for replicate runs, pass models/replicates/<seed>
const model = JSON.parse(fs.readFileSync(path.join(root, dir, "model.json"), "utf8"));

if (!validModel(model)) throw new Error("models/model.json is not a valid model file");

console.log(`Benchmark: 100 held-out courses x 180 seconds`);
console.log(`Model: generation ${model.generation}, training seed ${model.trainingSeed}\n`);

const t0 = Date.now();
const report = benchmark(model, graph, channelMap);
fs.writeFileSync(path.join(root, dir, "benchmark.json"), JSON.stringify(report, null, 2) + "\n");

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n, d = 2) => v.toFixed(d).padStart(n);
console.log(pad("Control", 30) + "Done".padStart(8) + "Mean surv".padStart(11) + "Median".padStart(11) + "Mean score".padStart(11) + "Pickups".padStart(7) + "Kills".padStart(7));
console.log("-".repeat(85));
for (const r of report.results)
  console.log(
    pad(r.name, 30) + `${r.completed}/100`.padStart(8) + num(r.meanSeconds, 10) + "s" +
    num(r.medianSeconds, 10) + "s" + num(r.meanScore, 11, 0) + num(r.meanPickups, 7, 1) + num(r.meanKills, 7, 1),
  );

const full = report.results[0], silenced = report.results[1], untrained = report.results[2], rule = report.results[3];
console.log(`\nTesting the core claim:`);
const ratioS = full.meanSeconds / Math.max(0.01, silenced.meanSeconds);
const ratioU = full.meanSeconds / Math.max(0.01, untrained.meanSeconds);
console.log(`  full / circuit silenced = ${ratioS.toFixed(1)}x`);
console.log(`  full / untrained readout = ${ratioU.toFixed(1)}x`);
console.log(`  full / hand-written rules = ${(full.meanSeconds / Math.max(0.01, rule.meanSeconds)).toFixed(2)}x`);
const ok = ratioS > 2 && ratioU > 2;
console.log(ok
  ? `\n  Holds: performance degrades sharply under ablation, so the fixed anatomy does contribute.`
  : `\n  Fails: ablation does not degrade performance much, so the readout may be memorising -- revisit the channel design.`);
console.log(`\nTook ${((Date.now() - t0) / 1000).toFixed(0)}s, wrote ${dir}/benchmark.json`);
