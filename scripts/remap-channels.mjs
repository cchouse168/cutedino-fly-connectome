/**
 * 產生 cute-dino 的感官輸入廣播表（data/channels.json）。
 *
 * 原作 flyjump 用 8 通道：8 種 LC 型態 × 4 顆細胞，每型態一個特徵。
 * cute-dino 的狀態更豐富（子彈、道具、增益、HP、正弦擺動障礙），需要更多通道。
 *
 * 但通道數不是想開幾個就幾個 —— 同一型態的多顆細胞若投射幾乎相同，
 * 拆成兩個通道後電路根本無法區分，只是自欺欺人。本腳本實際量測：
 *
 *   對每個型態的 4 顆細胞，窮舉 3 種 2-2 分組，取「跨組出邊餘弦相似度」最低者。
 *   相似度 < 0.2 才視為可拆（兩個通道確實獨立）。
 *
 * 量測結果：LC9 / LC16 / LC21 / LPLC2 完美可拆（~0.000），LC15 勉強（0.534），
 * LC4 / LC11 / LC17 不可拆（> 0.94）。故實際上限為 13 通道，非 16。
 *
 * 80 顆細胞、1,296 條邊、突觸接觸數、16 顆 DN 輸出全部不動 ——
 * 只改「哪顆輸入細胞收哪個工程特徵」這張人工指定的廣播表。
 * 原始 NOTICE.md 已載明 "Input encoding and action readout are artificial"。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const g = JSON.parse(fs.readFileSync(path.join(root, "data/connectome.json"), "utf8"));
const N = g.nodes.length;

const SPLIT_THRESHOLD = 0.2;

// 出邊向量（以突觸接觸數為權重）
const out = Array.from({ length: N }, () => new Float64Array(N));
for (const [pre, post, contacts] of g.edges) out[pre][post] += contacts;

const addVec = (a, b) => {
  const r = new Float64Array(N);
  for (let i = 0; i < N; i++) r[i] = a[i] + b[i];
  return r;
};
const cosine = (a, b) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < N; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
};

// 依原始 8 通道分組取得每個型態的輸入細胞
const byType = new Map();
for (const [cell, ch] of g.inputs) {
  const t = g.channels[ch];
  if (!byType.has(t)) byType.set(t, []);
  byType.get(t).push(cell);
}

// 每個型態找最佳 2-2 分組
const PARTITIONS = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
const analysis = [];
for (const type of g.channels) {
  const cells = byType.get(type);
  let best = null;
  for (const [A, B] of PARTITIONS) {
    const va = addVec(out[cells[A[0]]], out[cells[A[1]]]);
    const vb = addVec(out[cells[B[0]]], out[cells[B[1]]]);
    const sim = cosine(va, vb);
    if (!best || sim < best.similarity)
      best = { similarity: sim, a: A.map((i) => cells[i]), b: B.map((i) => cells[i]) };
  }
  analysis.push({ type, cells, ...best, splittable: best.similarity < SPLIT_THRESHOLD });
}

/**
 * 特徵定義。splitRank 決定指派順序：
 *   不可拆型態（4 顆細胞、下游影響最強）留給最關鍵的特徵。
 */
const UNSPLIT_FEATURES = [
  { key: "obstacleImpact", label: "障礙物撞擊倒數", note: "最關鍵：距離已除以接近速度，速度資訊內建" },
  { key: "obstacleBottom", label: "障礙物底端離地高", note: "決定該跳還是該蹲" },
  { key: "playerHeight", label: "玩家離地高度" },
];
const SPLIT_FEATURES = [
  [
    { key: "obstacleTop", label: "障礙物頂端離地高" },
    { key: "obstacle2Impact", label: "次近障礙物撞擊倒數", note: "連續障礙預判" },
  ],
  [
    { key: "playerVy", label: "玩家垂直速度" },
    { key: "grounded", label: "是否踩地" },
  ],
  [
    { key: "bulletImpact", label: "子彈撞擊倒數", note: "噴射機子彈速度 worldV+420" },
    { key: "bulletDy", label: "子彈相對高度差" },
  ],
  [
    { key: "powerupImpact", label: "道具接近倒數" },
    { key: "powerupDy", label: "道具相對高度差" },
  ],
  [
    { key: "playerX", label: "玩家水平位置", note: "5 動作含左右移動，需知道是否貼牆" },
    { key: "shield", label: "護盾狀態", note: "無敵剩餘時間與備用 HP" },
  ],
];

// 可拆型態依可區分性由高到低排序，最好的配最重要的特徵組
const splittable = analysis.filter((a) => a.splittable).sort((a, b) => a.similarity - b.similarity);
const marginal = analysis.filter((a) => !a.splittable && a.similarity < 0.8).sort((a, b) => a.similarity - b.similarity);
const unsplittable = analysis.filter((a) => a.similarity >= 0.8)
  // 不可拆的：出邊數越多＝下游影響越強，排前面
  .sort((a, b) => b.cells.reduce((n, c) => n + out[c].filter((v) => v > 0).length, 0)
                - a.cells.reduce((n, c) => n + out[c].filter((v) => v > 0).length, 0));

const splitPool = [...splittable, ...marginal];
if (unsplittable.length < UNSPLIT_FEATURES.length)
  throw new Error(`不可拆型態只有 ${unsplittable.length} 個，少於需要的 ${UNSPLIT_FEATURES.length}`);
if (splitPool.length < SPLIT_FEATURES.length)
  throw new Error(`可拆型態只有 ${splitPool.length} 個，少於需要的 ${SPLIT_FEATURES.length}`);

const channels = [];
const inputs = [];
const pushChannel = (feature, cells, type, similarity, mode) => {
  const index = channels.length;
  channels.push({
    index, key: feature.key, label: feature.label, note: feature.note ?? "",
    cellType: type, mode, cells: cells.map((c) => g.nodes[c].id),
    separation: mode === "whole" ? null : Number(similarity.toFixed(4)),
  });
  for (const c of cells) inputs.push([c, index]);
};

UNSPLIT_FEATURES.forEach((f, i) => {
  const a = unsplittable[i];
  pushChannel(f, a.cells, a.type, a.similarity, "whole");
});
SPLIT_FEATURES.forEach((pair, i) => {
  const a = splitPool[i];
  pushChannel(pair[0], a.a, a.type, a.similarity, "half-a");
  pushChannel(pair[1], a.b, a.type, a.similarity, "half-b");
});

const outFile = {
  version: "cutedino-malecns-channels-v1",
  derivedFrom: "malecns-dino-circuit-v1",
  note:
    "僅重新指派工程化的輸入廣播表；80 節點、1296 條邊、突觸接觸數、16 顆 DN 輸出皆未更動。" +
    "通道數由實測的型內投射可區分性決定，非任意指定。",
  splitThreshold: SPLIT_THRESHOLD,
  channelCount: channels.length,
  channels,
  inputs,
  analysis: analysis.map((a) => ({
    type: a.type,
    bestSplitSimilarity: Number(a.similarity.toFixed(4)),
    splittable: a.splittable,
    outDegree: a.cells.map((c) => out[c].filter((v) => v > 0).length),
  })),
};

fs.writeFileSync(path.join(root, "data/channels.json"), JSON.stringify(outFile, null, 2) + "\n");

// 報表
console.log("\n型內可區分性量測（跨組出邊餘弦相似度，越低越好）");
console.log("型態      最佳2-2相似度  判定");
for (const a of [...analysis].sort((x, y) => x.similarity - y.similarity))
  console.log(
    "  " + a.type.padEnd(8), a.similarity.toFixed(3).padStart(10), "  ",
    a.similarity < SPLIT_THRESHOLD ? "可拆（2 通道）" : a.similarity < 0.8 ? "勉強可拆（2 通道）" : "不可拆（1 通道，保留 4 細胞）",
  );

console.log(`\n產生 ${channels.length} 個通道：`);
for (const c of channels)
  console.log(
    `  ch${String(c.index).padStart(2)}  ${c.label.padEnd(11)} <- ${c.cellType}${c.mode === "whole" ? "（4 細胞）" : c.mode === "half-a" ? "·a" : "·b"}`.padEnd(46) +
      (c.separation === null ? "" : `sep=${c.separation.toFixed(3)}`),
  );

const used = new Set(inputs.map(([c]) => c));
console.log(`\n輸入細胞使用 ${used.size}/32，每通道細胞數 ${channels.map((c) => c.cells.length).join(",")}`);
console.log(`寫入 data/channels.json`);
