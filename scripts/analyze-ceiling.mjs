/**
 * 分析「分數上限」：拿掉 180 秒的基準上限，看現有冠軍能跑多遠、分數怎麼累積，
 * 以及牠到底死在什麼東西手上。
 *
 *   node scripts/analyze-ceiling.mjs [秒數上限] [賽道數]
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

/** 重跑一場並在死亡當下記錄兇手。 */
function run(seed) {
  const g = createGame(seed);
  brain.reset();
  const steps = Math.round(SECONDS / STEP);
  let action = RUN, cause = null, maxLittles = 0;
  const marks = [];
  for (let i = 0; i < steps && !g.dead; i++) {
    if (i % NETWORK.decisionSteps === 0) action = decide(model.weights, g, brain).action;
    // 記錄各時間點的分數，看累積速率
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

console.log(`\n上限 ${SECONDS}s，${COURSES} 條賽道，耗時 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`模型：第 ${model.generation} 代\n`);
console.log(`平均存活 ${mean(runs.map((r) => r.seconds)).toFixed(1)}s   中位 ${sorted[COURSES >> 1].toFixed(1)}s   最長 ${sorted.at(-1).toFixed(1)}s`);
console.log(`平均分數 ${mean(runs.map((r) => r.score)).toFixed(0)}   最高分 ${Math.max(...runs.map((r) => r.score))}`);
console.log(`撐到上限 ${runs.filter((r) => !r.dead).length}/${COURSES}`);
console.log(`活過 300s（難度封頂）：${runs.filter((r) => r.seconds >= 300).length}/${COURSES}`);
console.log(`平均撿道具 ${mean(runs.map((r) => r.pickups)).toFixed(1)}  擊殺 ${mean(runs.map((r) => r.kills)).toFixed(1)}  ` +
  `最高 HP ${Math.max(...runs.map((r) => r.maxHp))}  平均被打中 ${mean(runs.map((r) => r.hitsTaken)).toFixed(1)} 次`);

console.log(`\n死因分布：`);
const causes = {};
for (const r of runs) {
  if (!r.cause) continue;
  const key = r.cause.kind === "bullet" ? "子彈（噴射機）" : "障礙物・" + r.cause.type;
  causes[key] = (causes[key] ?? 0) + 1;
}
for (const [k, v] of Object.entries(causes).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(16)} ${String(v).padStart(3)} 條  ${"█".repeat(v)}`);
const died = runs.filter((r) => r.cause);
if (died.length)
  console.log(`  死亡時的平均 speedScale ${(died.reduce((a, r) => a + r.cause.speedScale, 0) / died.length).toFixed(2)}×`);

console.log(`\n分數累積速率（取活最久那條）：`);
const best = runs.reduce((a, b) => (b.seconds > a.seconds ? b : a));
console.log(`  seed ${best.seed}  存活 ${best.seconds.toFixed(1)}s  分數 ${best.score}  最高 HP ${best.maxHp}`);
for (const m of best.marks)
  console.log(`    t=${m.t.toFixed(0).padStart(4)}s  分數 ${String(m.s).padStart(6)}  HP ${m.hp}`);

// 推估：達到 10000 分需要多久
const rates = [];
for (const r of runs) {
  for (let i = 1; i < r.marks.length; i++) {
    const dt = r.marks[i].t - r.marks[i - 1].t;
    if (dt > 0) rates.push((r.marks[i].s - r.marks[i - 1].s) / dt);
  }
}
if (rates.length) {
  const rate = mean(rates);
  console.log(`\n觀測到的分數累積速率 ${rate.toFixed(1)} 分/秒（僅計活過 60s 的區段）`);
  console.log(`  依此推估，10000 分需要連續存活約 ${(10000 / rate).toFixed(0)} 秒（${(10000 / rate / 60).toFixed(1)} 分鐘）`);
}
