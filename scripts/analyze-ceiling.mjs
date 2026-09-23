/**
 * Analyse the score ceiling: drop the 180s benchmark cap and see how far the current champion gets,
 * how its score accumulates, and what actually kills it.
 *
 *   node scripts/analyze-ceiling.mjs [second cap] [course count]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGame, tick, score, STEP, GEOM, intersects, RUN } from "../src/engine/game.js";
import { Connectome } from "../src/lib/connectome.js";
import { NETWORK, decide } from "../src/lib/policy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(fs.readFileSync(path.join(root, "data/connectome.json"), "utf8"));
const cm = JSON.parse(fs.readFileSync(path.join(root, "data/channels.json"), "utf8"));
const model = JSON.parse(fs.readFileSync(path.join(root, "models/model.json"), "utf8"));

const SECONDS = Number(process.argv[2] ?? 1200);
const COURSES = Number(process.argv[3] ?? 60);
const brain = new Connectome(graph, cm);

/** Rerun one episode and record the culprit at the moment of death. */
function run(seed) {
  const g = createGame(seed);
  brain.reset();
  const steps = Math.round(SECONDS / STEP);
  let action = RUN, cause = null, maxLittles = 0;
  const marks = [];
  for (let i = 0; i < steps && !g.dead; i++) {
    if (i % NETWORK.decisionSteps === 0) action = decide(model.weights, g, brain).action;
    // Record the score at intervals, to see the accumulation rate
    if (i % 3600 === 0) marks.push({ t: g.time, s: score(g), hp: 1 + g.littles });
    maxLittles = Math.max(maxLittles, g.littles);
    tick(g, action);
  }
  cause = g.deathCause;
  return {
    seed, seconds: g.time, score: score(g), dead: g.dead,
    pickups: g.pickups, kills: g.kills, hitsTaken: g.hitsTaken, maxHp: 1 + maxLittles,
    cause, marks,
  };
}

const seeds = Array.from({ length: COURSES }, (_, i) => 2100001 + i);
const t0 = Date.now();
const runs = seeds.map(run);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sorted = runs.map((r) => r.seconds).sort((a, b) => a - b);

console.log(`\nCap ${SECONDS}s, ${COURSES} courses, took ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`Model: generation ${model.generation}\n`);
console.log(`Mean survival ${mean(runs.map((r) => r.seconds)).toFixed(1)}s   median ${sorted[COURSES >> 1].toFixed(1)}s   longest ${sorted.at(-1).toFixed(1)}s`);
console.log(`Mean score ${mean(runs.map((r) => r.score)).toFixed(0)}   best ${Math.max(...runs.map((r) => r.score))}`);
console.log(`Reached the cap ${runs.filter((r) => !r.dead).length}/${COURSES}`);
console.log(`Survived past 300s (difficulty capped): ${runs.filter((r) => r.seconds >= 300).length}/${COURSES}`);
console.log(`Mean pickups ${mean(runs.map((r) => r.pickups)).toFixed(1)}  kills ${mean(runs.map((r) => r.kills)).toFixed(1)}  ` +
  `peak HP ${Math.max(...runs.map((r) => r.maxHp))}  mean hits taken ${mean(runs.map((r) => r.hitsTaken)).toFixed(1)}`);

console.log(`\nCause of death:`);
const causes = {};
for (const r of runs) {
  if (!r.cause) continue;
  const key = r.cause.kind === "bullet" ? "bullet (jet)" : "obstacle " + r.cause.type;
  causes[key] = (causes[key] ?? 0) + 1;
}
for (const [k, v] of Object.entries(causes).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(20)} ${String(v).padStart(3)} courses  ${"█".repeat(v)}`);
const died = runs.filter((r) => r.cause);
if (died.length)
  console.log(`  Mean speedScale at death ${(died.reduce((a, r) => a + r.cause.speedScale, 0) / died.length).toFixed(2)}x`);

console.log(`\nScore accumulation rate (from the longest-surviving course):`);
const best = runs.reduce((a, b) => (b.seconds > a.seconds ? b : a));
console.log(`  seed ${best.seed}  survived ${best.seconds.toFixed(1)}s  score ${best.score}  peak HP ${best.maxHp}`);
for (const m of best.marks)
  console.log(`    t=${m.t.toFixed(0).padStart(4)}s  score ${String(m.s).padStart(6)}  HP ${m.hp}`);

// Estimate how long reaching 10000 points would take
const rates = [];
for (const r of runs) {
  for (let i = 1; i < r.marks.length; i++) {
    const dt = r.marks[i].t - r.marks[i - 1].t;
    if (dt > 0) rates.push((r.marks[i].s - r.marks[i - 1].s) / dt);
  }
}
if (rates.length) {
  const rate = mean(rates);
  console.log(`\nObserved score accumulation rate ${rate.toFixed(1)} points/second (counting only the segment past 60s)`);
  console.log(`  On that basis, 10000 points needs about ${(10000 / rate).toFixed(0)} seconds of continuous survival (${(10000 / rate / 60).toFixed(1)} minutes)`);
}
