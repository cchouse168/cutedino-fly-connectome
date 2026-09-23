/**
 * Cross-entropy method (CEM) neuroevolution.
 *
 * Ported from flyjump/src/lib/training.ts; the algorithm and update rules are identical.
 * A few hyperparameters were raised because cute-dino's score variance is larger -- see TRAINING.
 * No scripted actions, no labels, no teacher policy -- only the score.
 */
import { createGame, tick, score, STEP, RUN } from "../engine/game.js";
import { rng, gaussian } from "../engine/rng.js";
import { Connectome } from "./connectome.js";
import { NETWORK, decide, forward, observe, ruleAction } from "./policy.js";

/**
 * Hyperparameters. population / elites / courseSeconds / update rules match flyjump,
 * but trainingCourses and validationSeeds were raised for cute-dino, because:
 *
 *   the champion weights measured across 40 courses have a score CV of 0.74 (Chrome Dino is far
 *   below that, having no pickups, no HP and no weaving obstacles). Estimated from the original's
 *   3 courses, the standard error is 42% of the mean -- CEM would pick lucky candidates rather
 *   than strong ones; and 4 validation seeds are just as noisy, where one fluke high score locks
 *   the champion threshold permanently.
 *
 * Raising courseSeconds to 600 was tried (to let the agent see the 1.60x-2.00x band); not adopted.
 *
 * Two lines of evidence, of different strength. Across three seeds the completion rate fell from
 * 71.7+/-18.3 to 44.7+/-34.7, but the paired test gives t=-1.22 (df=2) p=0.35, **not significant**
 * -- with n=3 the detection floor is 70%, so this design could never see a difference below
 * 50 courses (node scripts/power.mjs).
 *
 * The real basis is a directly observed failure mechanism: a 600s course has a far higher score
 * ceiling (8000+ vs 2500), so the validation score's dynamic range explodes and one early high
 * score locks the champion threshold permanently -- measured, seed 20260917's champion froze at
 * generation 39 with zero replacements over the following 361. That is an observed pathology,
 * not an estimate, which is why it is not adopted.
 *
 * Also: discriminative power saturates between 360 and 480 seconds (node scripts/censoring.mjs),
 * so 600s's extra 240 seconds add no discrimination and merely double the score ceiling.
 * Full data in models/exp-v2/.
 *
 * The original's values are preserved as FLYJUMP_TRAINING for comparison.
 */
export const TRAINING = {
  population: 64,
  elites: 8,
  generations: 150,
  courseSeconds: 180,
  trainingCourses: 12,
  validationSeeds: Array.from({ length: 16 }, (_, i) => 1100001 + i),
  validationSeconds: 180,
  meanBlend: 0.7, // weight on the new mean (old value 0.3)
  sigmaFloor: 0.07,
  initialSigma: 0.8,
};

/** flyjump's original settings, kept for comparison and to reproduce its numbers. */
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
 * Run one episode.
 * @param {number[]|null} weights
 * @param {number} seed
 * @param {number} seconds
 * @param {"model"|"ablated"|"rule"|"random"|"idle"} mode
 * @param {Connectome} brain  reusable, to avoid rebuild cost
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

/** Evaluate one weight vector's mean score across several courses. */
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

  /** Produce this generation's candidate weights and course seeds. Can be farmed out to workers. */
  proposal() {
    const c = this.config;
    // All candidates in a generation run the same courses; fresh courses each generation avoid overfitting a map
    const seeds = Array.from({ length: c.trainingCourses }, () => 1 + Math.floor(this.random() * 900000));
    const candidates = Array.from({ length: c.population }, (_, i) =>
      i === 0
        ? this.champion.weights.slice() // elitism
        : this.mean.map((m, k) => m + this.sigma[k] * gaussian(this.random)),
    );
    return { seeds, candidates };
  }

  /** Update the distribution from the computed fitness and validate the best candidate. validate may return a Promise. */
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
     * Replace the champion only on a strict validation improvement (same as the original flyjump).
     *
     * Re-validating the incumbent champion every generation was tried, to fix a champion threshold
     * locked by an early fluke high score (measured at courseSeconds=600, seed 20260917's champion
     * froze at generation 39, made no progress over the following 361, and ended at just 13/100).
     *
     * That fix was ineffective, because validation here is **deterministic**: the same weights on
     * the same validation seeds give the same number every time (measured: 2965.3750, three times
     * running). There is no noise to correct. The real problem is not noise but **overfitting to
     * the validation set**: the generation-39 weights genuinely were best on those 16 validation
     * courses, they just generalised badly. The right direction is more validation seeds for a
     * more representative set, not re-running the same courses.
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

  /** Run one generation single-threaded. */
  async step() {
    const { seeds, candidates } = this.proposal();
    const fits = candidates.map((w) => fitness(w, seeds, this.config.courseSeconds, this.brain));
    return await this.absorb(candidates, fits, seeds, (w) =>
      fitness(w, this.config.validationSeeds, this.config.validationSeconds, this.brain),
    );
  }
}
