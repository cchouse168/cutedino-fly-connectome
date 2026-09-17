/**
 * 長場基準：拿掉 180 秒上限，測 agent 在難度封頂後（t>300s）的持續能力。
 *
 *   node scripts/benchmark-long.mjs [秒數] [模型目錄]
 *
 * 標準基準（scripts/benchmark.mjs）維持 180 秒不動，才能跟已發布的數字比較；
 * 這支是額外的長場指標，用來回答「能不能破 10000 分」。
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
  ["連接體 + 訓練讀出", model.weights, "model"],
  ["電路靜默（消融）", model.weights, "ablated"],
  ["未訓練讀出", untrained, "model"],
  ["手寫規則", null, "rule"],
];

console.log(`\n長場基準：100 條 held-out 賽道 × ${SECONDS} 秒`);
console.log(`模型：第 ${model.generation} 代，訓練種子 ${model.trainingSeed}（${dir}）\n`);

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
console.log(pad("對照組", 20) + "跑完".padStart(7) + "過300s".padStart(8) + "破萬".padStart(6) +
  "平均存活".padStart(11) + "中位存活".padStart(11) + "平均分".padStart(9) + "最高分".padStart(9));
console.log("-".repeat(82));
for (const r of results)
  console.log(pad(r.name, 20) + `${r.completed}/100`.padStart(7) + `${r.past300}/100`.padStart(8) +
    `${r.over10k}`.padStart(6) + (r.meanSeconds.toFixed(1) + "s").padStart(11) +
    (r.medianSeconds.toFixed(1) + "s").padStart(11) +
    Math.round(r.meanScore).toString().padStart(9) + Math.round(r.maxScore).toString().padStart(9));

// 死因統計（只看完整版）
const causes = {};
for (const r of results[0].runs) {
  if (!r.cause) continue;
  const k = r.cause.kind === "bullet" ? "子彈" : "障礙物・" + r.cause.type;
  causes[k] = (causes[k] ?? 0) + 1;
}
console.log(`\n完整版死因分布：`);
for (const [k, v] of Object.entries(causes).sort((a, b) => b[1] - a[1]))
  console.log(`  ${pad(k, 16)}${String(v).padStart(3)} 條  ${"█".repeat(v)}`);

const out = { seconds: SECONDS, modelDir: dir, model: { generation: model.generation, trainingSeed: model.trainingSeed }, results };
fs.writeFileSync(path.join(root, dir, `benchmark-${SECONDS}s.json`), JSON.stringify(out, null, 2) + "\n");
console.log(`\n耗時 ${((Date.now() - t0) / 1000).toFixed(0)}s，寫入 ${dir}/benchmark-${SECONDS}s.json`);
