/**
 * Offline CEM training (Node, multi-threaded).
 *
 *   node scripts/train.mjs [seed] [generations]
 *
 * Writes models/model.json and models/training.json.
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
const outDir = process.argv[4] ?? "models";   // for replicate runs, pass models/replicates/<seed>
const threads = Math.max(1, Math.min(os.cpus().length, TRAINING.population));

console.log(`CEM training  seed=${seed}  generations=${generations}  threads=${threads}`);
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

  // Split evenly across the workers
  const chunks = Array.from({ length: threads }, () => []);
  candidates.forEach((w, i) => chunks[i % threads].push(w));
  const results = await Promise.all(
    chunks.map((c, i) =>
      c.length ? call(workers[i], { candidates: c, seeds, seconds: TRAINING.courseSeconds, id: i }) : [],
    ),
  );
  // Restore the original candidate order
  const fits = new Array(candidates.length);
  chunks.forEach((c, i) => c.forEach((_, j) => { fits[j * threads + i] = results[i][j]; }));

  // Validation is parallelised too: one weight vector, 16 validation courses split across workers
  const p = await trainer.absorb(candidates, fits, seeds, async (w) => {
    const vChunks = Array.from({ length: threads }, () => []);
    TRAINING.validationSeeds.forEach((s, i) => vChunks[i % threads].push(s));
    const parts = await Promise.all(
      vChunks.map((vs, i) =>
        vs.length ? call(workers[i], { candidates: [w], seeds: vs, seconds: TRAINING.validationSeconds, id: i }) : null,
      ),
    );
    // Each worker returns its subset's mean, so weight by subset size to recover the overall mean
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

console.log(`\nDone in ${((Date.now() - t0) / 60000).toFixed(1)} minutes`);
console.log(`Champion: generation ${trainer.champion.generation}, validation score ${trainer.champion.validation.toFixed(0)}`);
console.log(`Wrote ${outDir}/model.json and ${outDir}/training.json`);
