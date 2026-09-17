/**
 * 交叉熵方法（CEM）神經演化。
 *
 * 移植自 flyjump/src/lib/training.ts，演算法與更新規則完全相同；
 * 少數超參數因 cute-dino 的分數變異較大而調整，說明見 TRAINING。
 * 沒有腳本化動作、沒有標籤、沒有教師策略 —— 只有分數。
 */
import { createGame, tick, score, STEP, RUN } from "../engine/game.js";
import { rng, gaussian } from "../engine/rng.js";
import { Connectome } from "./connectome.js";
import { NETWORK, decide, forward, observe, ruleAction } from "./policy.js";

/**
 * 超參數。population / elites / courseSeconds / 更新規則與 flyjump 相同，
 * 但 trainingCourses 與 validationSeeds 針對 cute-dino 調高，原因：
 *
 *   實測冠軍權重在 40 條賽道的分數變異係數達 0.74（Chrome Dino 遠低於此，
 *   因為它沒有道具、HP、正弦擺動障礙這些隨機來源）。用原作的 3 條賽道估計，
 *   標準誤是平均值的 42% —— CEM 會挑到運氣好的候選而非真正強的；
 *   4 個驗證種子同樣太吵，一次僥倖高分就會把冠軍門檻永久鎖死。
 *
 * 曾試過把 courseSeconds 拉到 600（讓 agent 見到 1.60×–2.00× 的高難度區間），不採用。
 *
 * 要分清楚兩條證據。三種子 replicate 的跑完率從 71.7±18.3 掉到 44.7±34.7，
 * 但配對檢定 t=-1.22 (df=2) p=0.35，**沒有達到顯著** —— n=3 的偵測下限是 70%，
 * 這個設計本來就看不見小於 50 場的差異（node scripts/power.mjs）。
 *
 * 真正的依據是直接觀測到的失效機制：600 秒賽道的分數上限高得多（8000+ vs 2500），
 * 驗證分數的動態範圍跟著暴增，早期一個高分就把冠軍門檻永久鎖死 ——
 * 實測種子 20260917 的冠軍停在第 39 代，之後 361 代零更替。
 * 那不是估計量，是直接看到的病理，所以不採用。
 *
 * 補充：鑑別力在 360–480 秒就飽和（node scripts/censoring.mjs），
 * 600 秒多出來的那 240 秒不提供任何鑑別力，只把分數上限翻倍 —— 純粹是過頭。
 * 完整數據見 models/exp-v2/。
 *
 * 原作值保留於 FLYJUMP_TRAINING 供對照。
 */
export const TRAINING = {
  population: 64,
  elites: 8,
  generations: 150,
  courseSeconds: 180,
  trainingCourses: 12,
  validationSeeds: Array.from({ length: 16 }, (_, i) => 1100001 + i),
  validationSeconds: 180,
  meanBlend: 0.7, // 新平均值權重（舊值 0.3）
  sigmaFloor: 0.07,
  initialSigma: 0.8,
};

/** 原作 flyjump 的設定，供對照與重現其數字。 */
export const FLYJUMP_TRAINING = {
  ...TRAINING,
  generations: 80,
  courseSeconds: 180,
  trainingCourses: 3,
  validationSeeds: [1100001, 1100002, 1100003, 1100004],
  validationSeconds: 180,
};

export function randomWeights(random) {
  return Array.from({ length: NETWORK.parameters }, () => gaussian(random) * 0.7);
}

export const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

/**
 * 跑一場。
 * @param {number[]|null} weights
 * @param {number} seed
 * @param {number} seconds
 * @param {"model"|"ablated"|"rule"|"random"|"idle"} mode
 * @param {Connectome} brain  可重複使用以省去重建成本
 */
export function episode(weights, seed, seconds, mode, brain) {
  const g = createGame(seed);
  const r = rng(seed ^ 0x9e3779b9);
  const actions = new Array(NETWORK.outputs).fill(0);
  const steps = Math.round(seconds / STEP);
  if (brain) brain.reset();
  let action = RUN;

  for (let i = 0; i < steps && !g.dead; i++) {
    if (i % NETWORK.decisionSteps === 0) {
      if (mode === "model" || mode === "ablated")
        action = decide(weights, g, brain, mode === "ablated").action;
      else if (mode === "rule") action = ruleAction(g);
      else if (mode === "random") action = Math.floor(r() * NETWORK.outputs);
      else action = RUN;
      actions[action]++;
    }
    tick(g, action);
  }

  return {
    seed,
    seconds: g.time,
    score: score(g),
    dead: g.dead,
    jumps: g.jumps,
    ducks: g.ducks,
    pickups: g.pickups,
    kills: g.kills,
    hitsTaken: g.hitsTaken,
    actions,
  };
}

/** 評估一組權重在多條賽道上的平均分數。 */
export function fitness(weights, seeds, seconds, brain) {
  let total = 0;
  for (const seed of seeds) total += episode(weights, seed, seconds, "model", brain).score;
  return total / seeds.length;
}

export class Trainer {
  constructor(seed = 20260914, graph, channelMap, config = {}) {
    this.config = { ...TRAINING, ...config };
    this.seed = seed;
    this.random = rng(seed);
    this.brain = new Connectome(graph, channelMap);
    this.mean = new Array(NETWORK.parameters).fill(0);
    this.sigma = new Array(NETWORK.parameters).fill(this.config.initialSigma);
    this.generation = 0;
    this.episodes = 0;
    this.history = [];
    this.champion = {
      version: NETWORK.version,
      weights: randomWeights(this.random),
      generation: 0,
      trainingSeed: seed,
      validation: 0,
      channelVersion: channelMap.version,
    };
  }

  /** 產生本代的候選權重與賽道種子。可交給 worker 平行評估。 */
  proposal() {
    const c = this.config;
    // 同一代所有候選跑同樣的賽道；每代換新賽道，避免過擬合特定地圖
    const seeds = Array.from({ length: c.trainingCourses }, () => 1 + Math.floor(this.random() * 900000));
    const candidates = Array.from({ length: c.population }, (_, i) =>
      i === 0
        ? this.champion.weights.slice() // 菁英保留
        : this.mean.map((m, k) => m + this.sigma[k] * gaussian(this.random)),
    );
    return { seeds, candidates };
  }

  /** 用已算好的 fitness 更新分布，並驗證最佳候選。validate 可回傳 Promise。 */
  async absorb(candidates, fitnesses, seeds, validate) {
    const c = this.config;
    const generation = ++this.generation;
    const ranked = candidates
      .map((weights, i) => ({ weights, fitness: fitnesses[i] }))
      .sort((a, b) => b.fitness - a.fitness);
    const elite = ranked.slice(0, c.elites);
    this.episodes += candidates.length * seeds.length;

    for (let k = 0; k < NETWORK.parameters; k++) {
      const m = mean(elite.map((e) => e.weights[k]));
      const sd = Math.sqrt(mean(elite.map((e) => (e.weights[k] - m) ** 2)));
      this.mean[k] = (1 - c.meanBlend) * this.mean[k] + c.meanBlend * m;
      this.sigma[k] = Math.max(c.sigmaFloor, (1 - c.meanBlend) * this.sigma[k] + c.meanBlend * sd);
    }

    const best = ranked[0];
    const validation = await validate(best.weights);
    this.episodes += c.validationSeeds.length;

    /*
     * 僅在驗證分數嚴格進步時才換冠軍（與原作 flyjump 相同）。
     *
     * 曾經試過「每代重新驗證現任冠軍」，想解決冠軍門檻被早期僥倖高分鎖死的問題
     * （實測 courseSeconds=600 時，種子 20260917 的冠軍停在第 39 代，
     * 後面 361 代完全沒進步，最終只有 13/100）。
     *
     * 但那個修法是無效的：本專案的驗證是**確定性**的 ——
     * 同一組權重、同一批驗證種子，跑幾次都是同一個數字（實測三次皆為 2965.3750），
     * 根本沒有雜訊可以被「修正」。真正的問題不是雜訊而是**驗證集過擬合**：
     * 第 39 代那組權重在那 16 條驗證賽道上確實最好，只是泛化很差。
     * 正確的方向是增加驗證種子數讓驗證集更有代表性，不是重驗同一批賽道。
     */
    if (validation > this.champion.validation)
      this.champion = {
        version: NETWORK.version,
        weights: best.weights.slice(),
        generation,
        trainingSeed: this.seed,
        validation,
        channelVersion: this.champion.channelVersion,
      };

    const row = {
      generation,
      episodes: this.episodes,
      bestFitness: best.fitness,
      meanFitness: mean(fitnesses),
      validation: this.champion.validation,
    };
    this.history.push(row);
    return { ...row, model: this.champion };
  }

  /** 單執行緒跑一代。 */
  async step() {
    const { seeds, candidates } = this.proposal();
    const fits = candidates.map((w) => fitness(w, seeds, this.config.courseSeconds, this.brain));
    return await this.absorb(candidates, fits, seeds, (w) =>
      fitness(w, this.config.validationSeeds, this.config.validationSeconds, this.brain),
    );
  }
}
