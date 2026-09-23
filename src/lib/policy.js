/**
 * Observation encoding + the trainable readout network.
 *
 * Data flow: 13 engineered features -> 32 input cells -> (80-cell circuit, 3 propagation rounds)
 *            -> 16 descending neurons -> 16->12->5 readout -> argmax action
 *
 * Only the readout's 269 parameters are trainable; every circuit weight is fixed.
 */
import { GEOM, RUN, JUMP, DUCK, LEFT, RIGHT } from "../engine/game.js";

export const NETWORK = {
  inputs: 16, // descending neuron count
  hidden: 12,
  outputs: 5, // RUN / JUMP / DUCK / LEFT / RIGHT
  get parameters() {
    return this.inputs * this.hidden + this.hidden + this.hidden * this.outputs + this.outputs;
  },
  decisionSteps: 2, // one decision every 2 steps of the 60 Hz simulation = 30 Hz
  version: "cutedino-malecns-connectome-v1",
};

export const ACTION_LABELS = ["RUN", "JUMP", "DUCK", "LEFT", "RIGHT"];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The bullet channel's sensing horizon, kept at 1.5 seconds like every other channel.
 *
 * It was once changed to 0.7s, on the grounds that at the plateau bullets travel 1020 px/s, so
 * 1.5s is a 1530px sensing range -- but on screen bullets appear at most about 1053px away,
 * confining ch7's range to 0.31-1.00 and wasting 30% of its resolution; and bullets were the
 * single largest cause of death (46%).
 *
 * Across three seeds 0.7s scored worse (46->34, 87->86, 82->49), but the paired test gives
 * t=-1.63 (df=2) p=0.24, **not significant** (node scripts/power.mjs).
 *
 * More tellingly: evaluating the weights trained at 1.5 unchanged in a 0.7 environment gives
 * 83/100 / 160.7s, essentially the 82/100 / 161.1s of its own environment -- same weights, only
 * the horizon changed, and the score does not move. So this parameter does not matter within
 * the range we can measure, and V3's regression comes from CEM search-path divergence.
 *
 * 1.5 stays because there is no reason to change it, not because 1.5 was shown to be better.
 */
const BULLET_HORIZON = 1.5;

/** Time-to-impact: distance over closing speed, normalised -- folds speed in and saves a channel. */
const impact = (gap, closingSpeed, horizon = 1.5) =>
  closingSpeed <= 0 ? 0 : 1 - clamp01(gap / closingSpeed / horizon);

/** Relative height -> 0..1, where 0.5 means level. */
const relY = (dy, span = 300) => clamp01(dy / span / 2 + 0.5);

/**
 * Compute the 13 features from game state; the order must match channels[].index in data/channels.json.
 * @returns {number[]} length 13, values in 0..1
 */
export function observe(s) {
  const d = s.dino;
  const dinoRight = d.x + d.w * 0.45;
  const dinoLeft = d.x - d.w * 0.45;
  const dinoCy = d.y + d.h * 0.5;
  const G = GEOM.GROUND_Y;
  const worldV = Math.max(60, s.speed * s.speedScale);

  // Obstacles not yet passed, sorted by horizontal distance; take the nearest two
  const ahead = s.obstacles
    .filter((o) => o.x + o.w > dinoLeft)
    .sort((a, b) => a.x - b.x);
  const o1 = ahead[0], o2 = ahead[1];

  // Bullets fly left, so the closing speed is their own speed
  let bullet = null, bulletGap = Infinity;
  for (const b of s.bullets) {
    const gap = b.x - dinoRight;
    if (b.x + b.w > dinoLeft && gap < bulletGap) { bullet = b; bulletGap = gap; }
  }

  // Pickups move at worldV*0.9
  let pu = null, puGap = Infinity;
  for (const p of s.powerups) {
    const gap = p.x - dinoRight;
    if (p.x + p.w > dinoLeft && gap < puGap) { pu = p; puGap = gap; }
  }

  const invLeft = Math.max(0, s.invincibleUntil - s.time);

  return [
    /* 0  obstacle time-to-impact  */ o1 ? impact(Math.max(0, o1.x - dinoRight), worldV) : 0,
    /* 1  obstacle bottom height   */ o1 ? clamp01((G - (o1.y + o1.h)) / 300) : 0,
    /* 2  player height off ground */ clamp01((G - (d.y + d.h)) / 240),
    /* 3  obstacle top height      */ o1 ? clamp01((G - o1.y) / 300) : 0,
    /* 4  2nd-nearest obstacle TTI */ o2 ? impact(Math.max(0, o2.x - dinoRight), worldV) : 0,
    /* 5  player vertical velocity */ clamp01(d.vy / 900 / 2 + 0.5),
    /* 6  on the ground            */ d.onGround ? 1 : 0,
    /* 7  bullet time-to-impact    */ bullet ? impact(Math.max(0, bulletGap), Math.max(120, bullet.v), BULLET_HORIZON) : 0,
    /* 8  bullet relative height   */ bullet ? relY(bullet.y + bullet.h * 0.5 - dinoCy) : 0.5,
    /* 9  pickup time-to-reach     */ pu ? impact(Math.max(0, puGap), worldV * 0.9) : 0,
    /* 10 pickup relative height   */ pu ? relY(pu.y + pu.h * 0.5 - dinoCy) : 0.5,
    /* 11 player horizontal pos    */ clamp01((d.x - GEOM.LEFT_X) / (GEOM.MAX_X - GEOM.LEFT_X)),
    /* 12 shield state             */ Math.max(clamp01(invLeft / 6), s.littles > 0 ? 0.5 : 0),
  ];
}

/**
 * Report the three targets observe() is currently locked on to, for the overlay.
 * The selection logic must match observe() exactly, or the overlay lies.
 */
export function targets(s) {
  const d = s.dino;
  const dinoRight = d.x + d.w * 0.45;
  const dinoLeft = d.x - d.w * 0.45;
  const ahead = s.obstacles.filter((o) => o.x + o.w > dinoLeft).sort((a, b) => a.x - b.x);
  let bullet = null, bg = Infinity;
  for (const b of s.bullets) {
    const gap = b.x - dinoRight;
    if (b.x + b.w > dinoLeft && gap < bg) { bullet = b; bg = gap; }
  }
  let powerup = null, pg = Infinity;
  for (const p of s.powerups) {
    const gap = p.x - dinoRight;
    if (p.x + p.w > dinoLeft && gap < pg) { powerup = p; pg = gap; }
  }
  return { obstacle: ahead[0] ?? null, obstacle2: ahead[1] ?? null, bullet, powerup };
}

/** 16->12->5, tanh hidden layer, linear output. */
export function forward(weights, inputs) {
  const { inputs: nIn, hidden: nH, outputs: nO } = NETWORK;
  const hidden = new Array(nH);
  const scores = new Array(nO);
  let k = 0;
  for (let h = 0; h < nH; h++) {
    let z = 0;
    for (let i = 0; i < nIn; i++) z += weights[k++] * inputs[i];
    hidden[h] = Math.tanh(z + weights[k++]);
  }
  for (let a = 0; a < nO; a++) {
    let z = 0;
    for (let h = 0; h < nH; h++) z += weights[k++] * hidden[h];
    scores[a] = z + weights[k++];
  }
  let action = 0;
  for (let a = 1; a < nO; a++) if (scores[a] > scores[action]) action = a;
  return { inputs, hidden, scores, action };
}

/** A full decision: observe -> circuit -> readout. */
export function decide(weights, s, brain, ablated = false) {
  const features = observe(s);
  const dn = brain.step(features, ablated);
  return { ...forward(weights, dn), features };
}

export function validModel(m) {
  return (
    m && typeof m === "object" &&
    m.version === NETWORK.version &&
    Array.isArray(m.weights) &&
    m.weights.length === NETWORK.parameters &&
    m.weights.every((n) => Number.isFinite(n) && Math.abs(n) < 1e4) &&
    Number.isInteger(m.generation) && m.generation >= 0 &&
    Number.isInteger(m.trainingSeed) && Number.isFinite(m.validation)
  );
}

/**
 * Hand-written rule baseline: no connectome, no neural network, pure geometric thresholds.
 * Has to cope with cute-dino's sinusoidally weaving dragon/jet and its fast bullets.
 */
export function ruleAction(s) {
  const d = s.dino;
  const dinoRight = d.x + d.w * 0.45;
  const dinoLeft = d.x - d.w * 0.45;
  const dinoCy = d.y + d.h * 0.5;
  const G = GEOM.GROUND_Y;
  const worldV = Math.max(60, s.speed * s.speedScale);

  // Bullets come first: a hit is fatal (unless shielded)
  for (const b of s.bullets) {
    const gap = b.x - dinoRight;
    if (gap < 0 || gap > worldV * 0.6) continue;
    const dy = b.y + b.h * 0.5 - dinoCy;
    if (Math.abs(dy) < 45) return dy < -6 ? DUCK : JUMP; // duck under a high bullet, jump over a low one
  }

  const ahead = s.obstacles.filter((o) => o.x + o.w > dinoLeft).sort((a, b) => a.x - b.x);
  const o = ahead[0];
  if (o) {
    const gap = o.x - dinoRight;
    const bottom = G - (o.y + o.h); // obstacle bottom height above ground
    const lead = worldV * 0.34 + o.w * 0.12;
    if (gap < lead && gap > -o.w) {
      // Bottom high enough -> duck underneath; otherwise jump
      if (bottom > 52) return DUCK;
      return JUMP;
    }
    // Still airborne and rising -> keep holding to jump higher
    if (!d.onGround && d.vy < 0 && gap < lead * 1.8) return JUMP;
  }

  // Go for a pickup when nothing is an immediate threat
  let pu = null, best = Infinity;
  for (const p of s.powerups) {
    const gap = p.x - dinoRight;
    if (p.x + p.w > dinoLeft && gap < best) { pu = p; best = gap; }
  }
  if (pu && best < worldV * 0.5) {
    const dy = pu.y + pu.h * 0.5 - dinoCy;
    if (dy < -40 && d.onGround) return JUMP;
  }
  return RUN;
}
