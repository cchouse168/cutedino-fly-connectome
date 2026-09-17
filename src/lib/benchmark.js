/**
 * Held-out 基準與消融對照。
 *
 * 對照組與 flyjump/src/lib/benchmark.ts 對齊，才有可比性：
 *   連接體+訓練讀出 / 電路靜默 / 未訓練讀出 / 手寫規則 / 隨機 / 無動作
 *
 * 核心主張：若「電路靜默」與「未訓練讀出」的表現接近完整版，
 * 就代表讀出網路在硬記而非真的利用了解剖結構 —— 實驗即失敗。
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
    ["連接體 + 訓練讀出", model.weights, "model"],
    ["電路靜默（消融）", model.weights, "ablated"],
    ["未訓練讀出", untrained, "model"],
    ["手寫規則", null, "rule"],
    ["隨機動作", null, "random"],
    ["完全不動", null, "idle"],
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
