/**
 * Generate cute-dino's sensory input broadcast table (data/channels.json).
 *
 * The original flyjump uses 8 channels: 8 LC types x 4 cells, one feature per type.
 * cute-dino's state is richer (bullets, pickups, buffs, HP, weaving obstacles) and needs more channels.
 *
 * But the channel count is not a free choice -- if several cells of one type project almost
 * identically, splitting them into two channels is something the circuit cannot resolve -- it only fools us. So this script measures it:
 *
 *   for each type's 4 cells, enumerate all three 2-2 groupings and take the lowest cross-group out-edge cosine similarity.
 *   A similarity below 0.2 counts as splittable (the two channels really are independent).
 *
 * Result: LC9 / LC16 / LC21 / LPLC2 split perfectly (~0.000), LC15 marginally (0.534),
 * and LC4 / LC11 / LC17 do not split (> 0.94). So the real ceiling is 13 channels, not 16.
 *
 * The 80 cells, 1,296 edges, synaptic contact counts and 16 DN outputs are all untouched --
 * only the hand-specified broadcast table of "which input cell receives which engineered feature" changes.
 * The original NOTICE.md already states "Input encoding and action readout are artificial".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const g = JSON.parse(fs.readFileSync(path.join(root, "data/connectome.json"), "utf8"));
const N = g.nodes.length;

const SPLIT_THRESHOLD = 0.2;

// Out-edge vector (weighted by synaptic contact count)
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

// Get each type's input cells from the original 8-channel grouping
const byType = new Map();
for (const [cell, ch] of g.inputs) {
  const t = g.channels[ch];
  if (!byType.has(t)) byType.set(t, []);
  byType.get(t).push(cell);
}

// Find the best 2-2 grouping for each type
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
 * Feature definitions. splitRank sets the assignment order:
 *   unsplittable types (4 cells, strongest downstream influence) are saved for the most critical features.
 */
const UNSPLIT_FEATURES = [
  { key: "obstacleImpact", label: "obstacle time-to-impact", note: "most critical: distance already divided by closing speed, so speed is built in" },
  { key: "obstacleBottom", label: "obstacle bottom height", note: "decides jump versus duck" },
  { key: "playerHeight", label: "player height off ground" },
];
const SPLIT_FEATURES = [
  [
    { key: "obstacleTop", label: "obstacle top height" },
    { key: "obstacle2Impact", label: "2nd-nearest obstacle TTI", note: "anticipating back-to-back obstacles" },
  ],
  [
    { key: "playerVy", label: "player vertical velocity" },
    { key: "grounded", label: "on the ground" },
  ],
  [
    { key: "bulletImpact", label: "bullet time-to-impact", note: "jet bullet speed is worldV+420" },
    { key: "bulletDy", label: "bullet relative height" },
  ],
  [
    { key: "powerupImpact", label: "pickup time-to-reach" },
    { key: "powerupDy", label: "pickup relative height" },
  ],
  [
    { key: "playerX", label: "player horizontal pos", note: "the 5 actions include lateral movement, so it needs to know if it is against a wall" },
    { key: "shield", label: "shield state", note: "invulnerability remaining and spare HP" },
  ],
];

// Splittable types sorted by separability, best first, so the best gets the most important feature pair
const splittable = analysis.filter((a) => a.splittable).sort((a, b) => a.similarity - b.similarity);
const marginal = analysis.filter((a) => !a.splittable && a.similarity < 0.8).sort((a, b) => a.similarity - b.similarity);
const unsplittable = analysis.filter((a) => a.similarity >= 0.8)
  // Unsplittable: more out-edges = stronger downstream influence, so those come first
  .sort((a, b) => b.cells.reduce((n, c) => n + out[c].filter((v) => v > 0).length, 0)
                - a.cells.reduce((n, c) => n + out[c].filter((v) => v > 0).length, 0));

const splitPool = [...splittable, ...marginal];
if (unsplittable.length < UNSPLIT_FEATURES.length)
  throw new Error(`Only ${unsplittable.length} unsplittable types, fewer than the ${UNSPLIT_FEATURES.length} needed`);
if (splitPool.length < SPLIT_FEATURES.length)
  throw new Error(`Only ${splitPool.length} splittable types, fewer than the ${SPLIT_FEATURES.length} needed`);

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
    "Only the engineered input broadcast table is reassigned; the 80 nodes, 1296 edges, synaptic contact counts and 16 DN outputs are all unmodified. " +
    "The channel count is set by measured within-type projection separability, not chosen arbitrarily.",
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

// Report
console.log("\nWithin-type separability (cross-group out-edge cosine similarity, lower is better)");
console.log("Type      best 2-2 similarity  verdict");
for (const a of [...analysis].sort((x, y) => x.similarity - y.similarity))
  console.log(
    "  " + a.type.padEnd(8), a.similarity.toFixed(3).padStart(10), "  ",
    a.similarity < SPLIT_THRESHOLD ? "splittable (2 channels)" : a.similarity < 0.8 ? "marginally splittable (2 channels)" : "not splittable (1 channel, keeps 4 cells)",
  );

console.log(`\nGenerated ${channels.length} channels:`);
for (const c of channels)
  console.log(
    `  ch${String(c.index).padStart(2)}  ${c.label.padEnd(26)} <- ${c.cellType}${c.mode === "whole" ? " (4 cells)" : c.mode === "half-a" ? "·a" : "·b"}`.padEnd(58) +
      (c.separation === null ? "" : `sep=${c.separation.toFixed(3)}`),
  );

const used = new Set(inputs.map(([c]) => c));
console.log(`\nInput cells used ${used.size}/32, cells per channel ${channels.map((c) => c.cells.length).join(",")}`);
console.log(`Wrote data/channels.json`);
