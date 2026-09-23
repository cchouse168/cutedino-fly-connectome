/**
 * Long-course benchmark: drop the 180s cap and measure staying power past the difficulty cap (t>300s).
 *
 *   node scripts/benchmark-long.mjs [seconds] [model directory]
 *
 * The standard benchmark (scripts/benchmark.mjs) stays at 180 seconds so it remains comparable
 * with the published numbers; this is an extra long-course metric answering "can it break 10000 points".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGame, tick, score, STEP, RUN } from "../src/engine/game.js";
import { Connectome } from "../src/lib/connectome.js";
import { NETWORK, decide, ruleAction } from "../src/lib/policy.js";
import { rng, gaussian } from "../src/engine/rng.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECONDS = Number(process.argv[2] ?? 600);
const dir = process.argv[3] ?? "models";

const graph = JSON.parse(fs.readFileSync(path.join(root, "data/connectome.json"), "utf8"));
const cm = JSON.parse(fs.readFileSync(path.join(root, "data/channels.json"), "utf8"));
const model = JSON.parse(fs.readFileSync(path.join(root, dir, "model.json"), "utf8"));
const brain = new Connectome(graph, cm);

const SEEDS = Array.from({ length: 100 }, (_, i) => 2100001 + i);

function episode(weights, seed, mode) {
  const g = createGame(seed);
  brain.reset();
  const r = rng(seed ^ 0x9e3779b9);
  const steps = Math.round(SECONDS / STEP);
  let action = RUN;
  for (let i = 0; i < steps && !g.dead; i++) {
    if (i % NETWORK.decisionSteps === 0) {
      action = mode === "model" || mode === "ablated"
        ? decide(weights, g, brain, mode === "ablated").action
        : mode === "rule" ? ruleAction(g)
        : mode === "random" ? Math.floor(r() * NETWORK.outputs) : RUN;
    }
    tick(g, action);
  }
  return {
    seed, seconds: g.time, score: score(g), dead: g.dead,
    pickups: g.pickups, kills: g.kills, maxHp: 1 + g.littles,
    cause: g.deathCause,
  };
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const untrained = Array.from({ length: NETWORK.parameters },
  (() => { const r = rng(model.trainingSeed); return () => gaussian(r) * 0.7; })());

const policies = [
  ["Connectome + trained readout", model.weights, "model"],
  ["Circuit silenced (ablation)", model.weights, "ablated"],
  ["Untrained readout", untrained, "model"],
  ["Hand-written rules", null, "rule"],
];

console.log(`\nLong-course benchmark: 100 held-out courses x ${SECONDS} seconds`);
console.log(`Model: generation ${model.generation}, training seed ${model.trainingSeed} (${dir})\n`);

const t0 = Date.now();
const results = policies.map(([name, w, mode]) => {
  const runs = SEEDS.map((s) => episode(w, s, mode));
  const t = runs.map((r) => r.seconds).sort((a, b) => a - b);
  const sc = runs.map((r) => r.score).sort((a, b) => a - b);
  return {
    name, mode,
    completed: runs.filter((r) => !r.dead).length,
    past300: runs.filter((r) => r.seconds >= 300).length,
    over10k: runs.filter((r) => r.score >= 10000).length,
    meanSeconds: mean(t), medianSeconds: t[50], maxSeconds: t.at(-1),
    meanScore: mean(sc), medianScore: sc[50], maxScore: sc.at(-1),
    meanPickups: mean(runs.map((r) => r.pickups)),
    meanKills: mean(runs.map((r) => r.kills)),
    runs: runs.map((r) => ({ seed: r.seed, seconds: r.seconds, score: r.score, dead: r.dead, cause: r.cause })),
  };
});

const pad = (s, n) => String(s).padEnd(n);
console.log(pad("Control", 30) + "Done".padStart(7) + "Past300s".padStart(8) + ">10k".padStart(6) +
  "Mean surv".padStart(11) + "Median".padStart(11) + "Mean".padStart(9) + "Best".padStart(9));
console.log("-".repeat(92));
for (const r of results)
  console.log(pad(r.name, 30) + `${r.completed}/100`.padStart(7) + `${r.past300}/100`.padStart(8) +
    `${r.over10k}`.padStart(6) + (r.meanSeconds.toFixed(1) + "s").padStart(11) +
    (r.medianSeconds.toFixed(1) + "s").padStart(11) +
    Math.round(r.meanScore).toString().padStart(9) + Math.round(r.maxScore).toString().padStart(9));

// Cause-of-death statistics (full system only)
const causes = {};
for (const r of results[0].runs) {
  if (!r.cause) continue;
  const k = r.cause.kind === "bullet" ? "bullet" : "obstacle " + r.cause.type;
  causes[k] = (causes[k] ?? 0) + 1;
}
console.log(`\nCause of death, full system:`);
for (const [k, v] of Object.entries(causes).sort((a, b) => b[1] - a[1]))
  console.log(`  ${pad(k, 20)}${String(v).padStart(3)} courses  ${"█".repeat(v)}`);

const out = { seconds: SECONDS, modelDir: dir, model: { generation: model.generation, trainingSeed: model.trainingSeed }, results };
fs.writeFileSync(path.join(root, dir, `benchmark-${SECONDS}s.json`), JSON.stringify(out, null, 2) + "\n");
console.log(`\nTook ${((Date.now() - t0) / 1000).toFixed(0)}s, wrote ${dir}/benchmark-${SECONDS}s.json`);
