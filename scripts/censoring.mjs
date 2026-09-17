/**
 * 截尾上限對鑑別力的影響（報告 §5.4）。
 *
 *   node scripts/censoring.mjs [models/benchmark-600s.json]
 *
 * 180 秒基準的問題是右截尾：agent 與手寫規則都有大量賽道撞到上限，
 * 撞頂的那些互相比就變成平手，上限以上的差異量不出來。
 *
 * 這支腳本拿同一批長場資料，在不同上限人工截尾，用**同一個統計量**
 * 看鑑別力怎麼隨上限變化 —— 才不會犯「拿平均值比跟拿門檻計數比混著講」的錯。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mean } from "../src/lib/training.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2] ?? "models/benchmark-600s.json";
const b = JSON.parse(fs.readFileSync(path.join(root, src), "utf8"));

const group = (n) => {
  const g = b.results.find((r) => r.name.includes(n));
  if (!g) throw new Error(`找不到對照組：${n}`);
  return g.runs.map((r) => r.seconds);
};
const agent = group("連接體"), rule = group("手寫規則"), silenced = group("靜默");

const sd = (x) => { const m = mean(x); return Math.sqrt(mean(x.map((v) => (v - m) ** 2))); };
const CAPS = [180, 240, 300, 360, 420, 480, 600];

console.log(`來源 ${src}　賽道 ${agent.length} 條　agent 最長存活 ${Math.max(...agent).toFixed(1)}s　規則最長 ${Math.max(...rule).toFixed(1)}s\n`);
console.log("截尾上限  agent平均  規則平均   存活比  Cohen d   逐場勝  平手   撞頂 a/r   消融比");
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

// 找出鑑別力飽和點：比值與上一個上限相差 < 1%
let sat = null;
for (let i = 1; i < CAPS.length; i++) {
  const ratio = (c) => { const a = agent.map((v) => Math.min(v, c)), r = rule.map((v) => Math.min(v, c)); return mean(a) / mean(r); };
  if (sat === null && Math.abs(ratio(CAPS[i]) - ratio(CAPS[i - 1])) / ratio(CAPS[i - 1]) < 0.01) sat = CAPS[i - 1];
}
const uncensored = CAPS.find((c) => !agent.some((v) => v >= c - 1e-9) && !rule.some((v) => v >= c - 1e-9));
console.log(`\n鑑別力飽和於約 ${sat}s（再拉長比值變化 < 1%）；完全無截尾需要 ${uncensored}s。`);
console.log("引用時必須連上限一起講 —— 同一個模型在不同上限下的比值不可混用。");
