/**
 * How the censoring cap affects discriminative power (report §5.4).
 *
 *   node scripts/censoring.mjs [models/benchmark-600s.json]
 *
 * The problem with the 180s benchmark is right-censoring: both the agent and the hand-written
 * rules hit the cap on many courses, those courses tie each other, and differences above the cap cannot be measured.
 *
 * This script takes one set of long-course data, censors it artificially at different caps, and uses
 * **one single statistic** to watch discriminative power change -- avoiding the mistake of mixing a ratio of means with a ratio of threshold counts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mean } from "../src/lib/training.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2] ?? "models/benchmark-600s.json";
const b = JSON.parse(fs.readFileSync(path.join(root, src), "utf8"));

const group = (i, n) => {
  const g = b.results[i];
  if (!g || !g.runs) throw new Error(`Control group ${i} (${n}) is missing from ${src}`);
  return g.runs.map((r) => r.seconds);
};
const agent = group(0, "connectome"), rule = group(3, "hand-written rules"), silenced = group(1, "circuit silenced");

const sd = (x) => { const m = mean(x); return Math.sqrt(mean(x.map((v) => (v - m) ** 2))); };
const CAPS = [180, 240, 300, 360, 420, 480, 600];

console.log(`Source ${src}  courses ${agent.length}  agent longest survival ${Math.max(...agent).toFixed(1)}s  rules longest ${Math.max(...rule).toFixed(1)}s\n`);
console.log("     cap  agent mean   rules mean     ratio  Cohen d     wins   ties   at cap a/r   ablation");
for (const cap of CAPS) {
  const a = agent.map((v) => Math.min(v, cap)), r = rule.map((v) => Math.min(v, cap));
  const s = silenced.map((v) => Math.min(v, cap));
  const ma = mean(a), mr = mean(r);
  const d = Math.abs(ma - mr) / Math.sqrt((sd(a) ** 2 + sd(r) ** 2) / 2);
  let win = 0, tie = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] > r[i] + 1e-9) win++; else if (Math.abs(a[i] - r[i]) < 1e-9) tie++;
  }
  const ceil = (x) => x.filter((v) => v >= cap - 1e-9).length;
  console.log(
    `${String(cap).padStart(6)}s ${ma.toFixed(1).padStart(9)}s ${mr.toFixed(1).padStart(8)}s ` +
    `${(ma / mr).toFixed(3).padStart(8)}× ${d.toFixed(2).padStart(7)} ${String(win).padStart(8)} ${String(tie).padStart(5)} ` +
    `${(ceil(a) + "/" + ceil(r)).padStart(10)} ${(ma / mean(s)).toFixed(1).padStart(8)}×`,
  );
}

// Find where discriminative power saturates: the ratio changes < 1% from the previous cap
let sat = null;
for (let i = 1; i < CAPS.length; i++) {
  const ratio = (c) => { const a = agent.map((v) => Math.min(v, c)), r = rule.map((v) => Math.min(v, c)); return mean(a) / mean(r); };
  if (sat === null && Math.abs(ratio(CAPS[i]) - ratio(CAPS[i - 1])) / ratio(CAPS[i - 1]) < 0.01) sat = CAPS[i - 1];
}
const uncensored = CAPS.find((c) => !agent.some((v) => v >= c - 1e-9) && !rule.some((v) => v >= c - 1e-9));
console.log(`\nDiscriminative power saturates around ${sat}s (a longer cap changes the ratio by < 1%); fully uncensored needs ${uncensored}s.`);
console.log("Always quote the cap alongside the number -- ratios from one model under different caps are not interchangeable.");
