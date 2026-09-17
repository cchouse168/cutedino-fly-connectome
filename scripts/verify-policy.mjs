/**
 * M2 驗收：連接體與策略
 *   1. 消融時 16 個輸出必須全為 0
 *   2. 入邊正規化：每個 post 節點的 |W| 總和必須為 1（無入邊者為 0）
 *   3. 讀出網路參數計數 = 269
 *   4. 特徵值域必須落在 0..1
 *   5. 電路對不同輸入必須產生不同輸出（否則通道設計失效）
 *   6. 健全性：手寫規則基線能存活多久（遊戲是否可玩）
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

console.log("\n[1] 消融對照");
brain.reset();
const live = brain.step(new Array(13).fill(0.8), false).slice();
brain.reset();
const dead = brain.step(new Array(13).fill(0.8), true).slice();
check("ablated=true 時 16 輸出全為 0", dead.every((v) => v === 0));
check("ablated=false 時輸出非全 0", live.some((v) => Math.abs(v) > 1e-9),
  `max|out|=${Math.max(...live.map(Math.abs)).toFixed(4)}`);

console.log("\n[2] 入邊正規化");
const sums = new Float64Array(graph.nodes.length);
for (let e = 0; e < brain.pre.length; e++) sums[brain.post[e]] += Math.abs(brain.weight[e]);
const hasIn = new Set(Array.from(brain.post));
let bad = 0, worst = 0;
for (let i = 0; i < sums.length; i++) {
  if (!hasIn.has(i)) { if (sums[i] !== 0) bad++; continue; }
  worst = Math.max(worst, Math.abs(sums[i] - 1));
  if (Math.abs(sums[i] - 1) > 1e-9) bad++;
}
check("每個 post 節點 Σ|W| = 1", bad === 0, `有入邊節點=${hasIn.size}/80 最大偏差=${worst.toExponential(2)}`);

console.log("\n[3] 讀出網路");
check("參數計數 = 269", NETWORK.parameters === 269, `實際 ${NETWORK.parameters}`);
const r = rng(1);
const w = Array.from({ length: NETWORK.parameters }, () => gaussian(r) * 0.7);
const f = forward(w, live);
check("輸出 5 個動作分數", f.scores.length === 5 && f.scores.every(Number.isFinite));
check("隱藏層 12 個 tanh 單元", f.hidden.length === 12 && f.hidden.every((v) => Math.abs(v) <= 1));
check("action 為 argmax", f.action === f.scores.indexOf(Math.max(...f.scores)));

console.log("\n[4] 特徵值域");
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
check(`${samples} 個樣本全部落在 0..1`, outOfRange === 0, `違規 ${outOfRange}`);
console.log("  各通道實際觀測到的值域：");
channelMap.channels.forEach((c, j) =>
  console.log(`    ch${String(j).padStart(2)} ${c.label.padEnd(11)} ${featMin[j].toFixed(3)} .. ${featMax[j].toFixed(3)}` +
    (featMax[j] - featMin[j] < 0.05 ? "   <<< 幾乎不變，資訊量低" : "")));

console.log("\n[5] 電路可區分性（每個通道單獨驅動，看 16 個 DN 的反應）");
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
check("所有通道在 DN 層產生可區分的反應", maxPair.sim < 0.999,
  `最相似的一對：ch${maxPair.i}(${channelMap.channels[maxPair.i].label}) vs ch${maxPair.j}(${channelMap.channels[maxPair.j].label}) = ${maxPair.sim.toFixed(4)}`);

console.log("\n[6] 健全性：手寫規則基線能活多久");
const runs = [];
for (let seed = 2100001; seed <= 2100030; seed++) {
  const g = createGame(seed);
  for (let i = 0; i < 10800 && !g.dead; i++) tick(g, ruleAction(g));
  runs.push({ t: g.time, s: score(g), dead: g.dead, kills: g.kills, pickups: g.pickups });
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const survived = runs.filter((x) => !x.dead).length;
console.log(`  30 條賽道：平均存活 ${mean(runs.map((x) => x.t)).toFixed(1)}s  平均分數 ${mean(runs.map((x) => x.s)).toFixed(0)}  跑完 ${survived}/30`);
console.log(`  平均撿道具 ${mean(runs.map((x) => x.pickups)).toFixed(1)} 個，擊殺 ${mean(runs.map((x) => x.kills)).toFixed(1)} 個`);

const idle = [];
for (let seed = 2100001; seed <= 2100030; seed++) {
  const g = createGame(seed);
  for (let i = 0; i < 10800 && !g.dead; i++) tick(g, RUN);
  idle.push(g.time);
}
console.log(`  對照（完全不動）：平均存活 ${mean(idle).toFixed(2)}s`);
check("規則基線顯著優於不動", mean(runs.map((x) => x.t)) > mean(idle) * 2);
check("遊戲可玩（規則基線平均存活 > 20s）", mean(runs.map((x) => x.t)) > 20,
  mean(runs.map((x) => x.t)) <= 20 ? "<<< 遊戲可能過難，基準將失去意義" : "");

console.log(failures === 0 ? "\n全部通過\n" : `\n${failures} 項失敗\n`);
process.exit(failures === 0 ? 0 : 1);
