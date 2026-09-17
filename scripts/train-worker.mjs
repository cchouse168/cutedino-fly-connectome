/** CEM 候選評估 worker（Node worker_threads）。 */
import { parentPort, workerData } from "node:worker_threads";
import { Connectome } from "../src/lib/connectome.js";
import { fitness } from "../src/lib/training.js";

const brain = new Connectome(workerData.graph, workerData.channelMap);

parentPort.on("message", (msg) => {
  const { candidates, seeds, seconds, id } = msg;
  const fits = candidates.map((w) => fitness(w, seeds, seconds, brain));
  parentPort.postMessage({ id, fits });
});
