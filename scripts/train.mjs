/**
 * 離線 CEM 訓練（Node，多執行緒）。
 *
 *   node scripts/train.mjs [seed] [generations]
 *
 * 產出 models/model.json 與 models/training.json。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { Trainer, TRAINING } from "../src/lib/training.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(fs.readFileSync(path.join(root, "data/connectome.json"), "utf8"));
const channelMap = JSON.parse(fs.readFileSync(path.join(root, "data/channels.json"), "utf8"));

const seed = Number(process.argv[2] ?? 20260914);
const generations = Number(process.argv[3] ?? TRAINING.generations);
const outDir = process.argv[4] ?? "models";   // replicate 跑法：傳入 models/replicates/<seed>
const threads = Math.max(1, Math.min(os.cpus().length, TRAINING.population));

console.log(`CEM 訓練  seed=${seed}  generations=${generations}  threads=${threads}`);
console.log(`population=${TRAINING.population} elites=${TRAINING.elites} ` +
  `courses=${TRAINING.trainingCourses}x${TRAINING.courseSeconds}s\n`);

const workers = Array.from({ length: threads }, () =>
  new Worker(path.join(root, "scripts/train-worker.mjs"), { workerData: { graph, channelMap } }),
);
const call = (w, msg) =>
  new Promise((resolve) => {
    const onMsg = (r) => { w.off("message", onMsg); resolve(r.fits); };
    w.on("message", onMsg);
    w.postMessage(msg);
  });

const trainer = new Trainer(seed, graph, channelMap);
const t0 = Date.now();

for (let gen = 0; gen < generations; gen++) {
  const { seeds, candidates } = trainer.proposal();

  // 平均切給各 worker
  const chunks = Array.from({ length: threads }, () => []);
  candidates.forEach((w, i) => chunks[i % threads].push(w));
  const results = await Promise.all(
    chunks.map((c, i) =>
      c.length ? call(workers[i], { candidates: c, seeds, seconds: TRAINING.courseSeconds, id: i }) : [],
    ),
  );
  // 還原成原本的候選順序
  const fits = new Array(candidates.length);
  chunks.forEach((c, i) => c.forEach((_, j) => { fits[j * threads + i] = results[i][j]; }));

  // 驗證同樣平行化：同一組權重、16 條驗證賽道切給各 worker
  const p = await trainer.absorb(candidates, fits, seeds, async (w) => {
    const vChunks = Array.from({ length: threads }, () => []);
    TRAINING.validationSeeds.forEach((s, i) => vChunks[i % threads].push(s));
    const parts = await Promise.all(
      vChunks.map((vs, i) =>
        vs.length ? call(workers[i], { candidates: [w], seeds: vs, seconds: TRAINING.validationSeconds, id: i }) : null,
      ),
    );
    // 各 worker 回傳的是該子集的平均，需依子集大小加權還原成總平均
    let total = 0;
    vChunks.forEach((vs, i) => { if (vs.length) total += parts[i][0] * vs.length; });
    return total / TRAINING.validationSeeds.length;
  });

  const el = (Date.now() - t0) / 1000;
  const eta = (el / (gen + 1)) * (generations - gen - 1);
  console.log(
    `gen ${String(p.generation).padStart(3)}/${generations}  ` +
    `best=${p.bestFitness.toFixed(0).padStart(6)}  mean=${p.meanFitness.toFixed(0).padStart(6)}  ` +
    `val=${p.validation.toFixed(0).padStart(6)}  ` +
    `episodes=${p.episodes.toLocaleString().padStart(7)}  ` +
    `${el.toFixed(0)}s  ETA ${(eta / 60).toFixed(1)}min`,
  );
}

await Promise.all(workers.map((w) => w.terminate()));

fs.mkdirSync(path.join(root, outDir), { recursive: true });
fs.writeFileSync(path.join(root, outDir, "model.json"), JSON.stringify(trainer.champion, null, 2) + "\n");
fs.writeFileSync(
  path.join(root, outDir, "training.json"),
  JSON.stringify(
    {
      version: trainer.champion.version,
      channelVersion: channelMap.version,
      trainingSeed: seed,
      generations,
      config: TRAINING,
      elapsedSeconds: (Date.now() - t0) / 1000,
      history: trainer.history,
    },
    null, 2,
  ) + "\n",
);

console.log(`\n完成，耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
console.log(`冠軍：第 ${trainer.champion.generation} 代，驗證分數 ${trainer.champion.validation.toFixed(0)}`);
console.log(`寫入 ${outDir}/model.json 與 ${outDir}/training.json`);
