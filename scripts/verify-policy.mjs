/**
 * M2 acceptance: the connectome and the policy
 *   1. under ablation all 16 outputs must be 0
 *   2. incoming normalisation: each post node's total |W| must be 1 (0 if it has no incoming edges)
 *   3. the readout's parameter count = 269
 *   4. feature values must fall within 0..1
 *   5. the circuit must produce different outputs for different inputs (or the channel design has failed)
 *   6. sanity: how long the hand-written rule baseline survives (is the game playable)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGame, tick, score, RUN } from "../src/engine/game.js";
import { Connectome, DYNAMICS } from "../src/lib/connectome.js";
import { NETWORK, observe, forward, decide, ruleAction } from "../src/lib/policy.js";
import { rng, gaussian } from "../src/engine/rng.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(fs.readFileSync(path.join(root, "data/connectome.json"), "utf8"));
const channelMap = JSON.parse(fs.readFileSync(path.join(root, "data/channels.json"), "utf8"));

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!ok) failures++;
};

const brain = new Connectome(graph, channelMap);

console.log("\n[1] Ablation control");
brain.reset();
const live = brain.step(new Array(13).fill(0.8), false).slice();
brain.reset();
const dead = brain.step(new Array(13).fill(0.8), true).slice();
check("all 16 outputs are 0 when ablated=true", dead.every((v) => v === 0));
check("outputs are not all 0 when ablated=false", live.some((v) => Math.abs(v) > 1e-9),
  `max|out|=${Math.max(...live.map(Math.abs)).toFixed(4)}`);

console.log("\n[2] Incoming normalisation");
const sums = new Float64Array(graph.nodes.length);
for (let e = 0; e < brain.pre.length; e++) sums[brain.post[e]] += Math.abs(brain.weight[e]);
const hasIn = new Set(Array.from(brain.post));
let bad = 0, worst = 0;
for (let i = 0; i < sums.length; i++) {
  if (!hasIn.has(i)) { if (sums[i] !== 0) bad++; continue; }
  worst = Math.max(worst, Math.abs(sums[i] - 1));
  if (Math.abs(sums[i] - 1) > 1e-9) bad++;
}
check("every post node has Σ|W| = 1", bad === 0, `nodes with incoming=${hasIn.size}/80 worst deviation=${worst.toExponential(2)}`);

console.log("\n[3] Readout network");
check("parameter count = 269", NETWORK.parameters === 269, `actual ${NETWORK.parameters}`);
const r = rng(1);
const w = Array.from({ length: NETWORK.parameters }, () => gaussian(r) * 0.7);
const f = forward(w, live);
check("outputs 5 action scores", f.scores.length === 5 && f.scores.every(Number.isFinite));
check("hidden layer has 12 tanh units", f.hidden.length === 12 && f.hidden.every((v) => Math.abs(v) <= 1));
check("action is the argmax", f.action === f.scores.indexOf(Math.max(...f.scores)));

console.log("\n[4] Feature ranges");
let outOfRange = 0, samples = 0, featMin = new Array(13).fill(1), featMax = new Array(13).fill(0);
for (let seed = 1; seed <= 30; seed++) {
  const g = createGame(seed);
  for (let i = 0; i < 3600 && !g.dead; i++) {
    tick(g, ruleAction(g));
    if (i % 7 === 0) {
      const ft = observe(g);
      samples++;
      if (ft.length !== channelMap.channelCount) outOfRange += 1000;
      ft.forEach((v, j) => {
        if (!(v >= 0 && v <= 1)) outOfRange++;
        featMin[j] = Math.min(featMin[j], v);
        featMax[j] = Math.max(featMax[j], v);
      });
    }
  }
}
check(`all ${samples} samples fall within 0..1`, outOfRange === 0, `violations ${outOfRange}`);
console.log("  Range actually observed per channel:");
channelMap.channels.forEach((c, j) =>
  console.log(`    ch${String(j).padStart(2)} ${c.label.padEnd(11)} ${featMin[j].toFixed(3)} .. ${featMax[j].toFixed(3)}` +
    (featMax[j] - featMin[j] < 0.05 ? "   <<< barely varies, low information" : "")));

console.log("\n[5] Circuit separability (drive each channel alone, watch the 16 DNs respond)");
const base = new Array(13).fill(0.5);
const responses = channelMap.channels.map((_, j) => {
  brain.reset();
  const ft = base.slice(); ft[j] = 1.0;
  for (let t = 0; t < 4; t++) brain.step(ft);
  return brain.step(ft).slice();
});
const cos = (a, b) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
};
let maxPair = { sim: -2 };
for (let i = 0; i < responses.length; i++)
  for (let j = i + 1; j < responses.length; j++) {
    const sim = cos(responses[i], responses[j]);
    if (sim > maxPair.sim) maxPair = { sim, i, j };
  }
check("every channel produces a distinguishable DN response", maxPair.sim < 0.999,
  `most similar pair: ch${maxPair.i}(${channelMap.channels[maxPair.i].label}) vs ch${maxPair.j}(${channelMap.channels[maxPair.j].label}) = ${maxPair.sim.toFixed(4)}`);

console.log("\n[6] Sanity: how long the hand-written rule baseline survives");
const runs = [];
for (let seed = 2100001; seed <= 2100030; seed++) {
  const g = createGame(seed);
  for (let i = 0; i < 10800 && !g.dead; i++) tick(g, ruleAction(g));
  runs.push({ t: g.time, s: score(g), dead: g.dead, kills: g.kills, pickups: g.pickups });
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const survived = runs.filter((x) => !x.dead).length;
console.log(`  30 courses: mean survival ${mean(runs.map((x) => x.t)).toFixed(1)}s  mean score ${mean(runs.map((x) => x.s)).toFixed(0)}  completed ${survived}/30`);
console.log(`  Mean pickups ${mean(runs.map((x) => x.pickups)).toFixed(1)}, kills ${mean(runs.map((x) => x.kills)).toFixed(1)}`);

const idle = [];
for (let seed = 2100001; seed <= 2100030; seed++) {
  const g = createGame(seed);
  for (let i = 0; i < 10800 && !g.dead; i++) tick(g, RUN);
  idle.push(g.time);
}
console.log(`  Control (no action at all): mean survival ${mean(idle).toFixed(2)}s`);
check("the rule baseline clearly beats doing nothing", mean(runs.map((x) => x.t)) > mean(idle) * 2);
check("the game is playable (rule baseline mean survival > 20s)", mean(runs.map((x) => x.t)) > 20,
  mean(runs.map((x) => x.t)) <= 20 ? "<<< the game may be too hard, making the benchmark meaningless" : "");

console.log(failures === 0 ? "\nAll passed\n" : `\n${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
