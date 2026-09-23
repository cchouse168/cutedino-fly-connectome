/**
 * Held-out benchmark and ablation controls.
 *
 * The control groups match flyjump/src/lib/benchmark.ts so the results stay comparable:
 *   connectome+trained readout / circuit silenced / untrained readout / hand-written rules / random / no action
 *
 * The core claim: if "circuit silenced" and "untrained readout" come close to the full system,
 * the readout is memorising rather than using the anatomy -- and the experiment has failed.
 */
import { episode, randomWeights, mean } from "./training.js";
import { rng } from "../engine/rng.js";
import { Connectome } from "./connectome.js";

export const BENCHMARK = {
  seconds: 180,
  seeds: Array.from({ length: 100 }, (_, i) => 2100001 + i),
};

export function summarize(runs) {
  const sorted = runs.map((r) => r.seconds).sort((a, b) => a - b);
  return {
    courses: runs.length,
    completed: runs.filter((r) => !r.dead).length,
    meanSeconds: mean(runs.map((r) => r.seconds)),
    medianSeconds: sorted[Math.floor(sorted.length / 2)],
    meanScore: mean(runs.map((r) => r.score)),
    meanPickups: mean(runs.map((r) => r.pickups)),
    meanKills: mean(runs.map((r) => r.kills)),
  };
}

export function benchmark(model, graph, channelMap, opts = {}) {
  const config = { ...BENCHMARK, ...opts };
  const brain = new Connectome(graph, channelMap);
  const untrained = randomWeights(rng(model.trainingSeed));

  const policies = [
    ["Connectome + trained readout", model.weights, "model"],
    ["Circuit silenced (ablation)", model.weights, "ablated"],
    ["Untrained readout", untrained, "model"],
    ["Hand-written rules", null, "rule"],
    ["Random actions", null, "random"],
    ["No action at all", null, "idle"],
  ];

  return {
    model: { version: model.version, generation: model.generation, trainingSeed: model.trainingSeed, validation: model.validation },
    channelVersion: channelMap.version,
    channelCount: channelMap.channelCount,
    config: { seconds: config.seconds, seedRange: [config.seeds[0], config.seeds.at(-1)] },
    results: policies.map(([name, weights, mode]) => {
      const runs = config.seeds.map((seed) => episode(weights, seed, config.seconds, mode, brain));
      return { name, mode, ...summarize(runs), runs: runs.map((r) => ({ seed: r.seed, seconds: r.seconds, score: r.score, dead: r.dead })) };
    }),
  };
}
