# Experimental protocol

This document records the full method, equations, channel assignment and benchmark procedure,
in the same shape as
[`flyjump/docs/experiment.md`](https://github.com/cobanov/flyjump/blob/main/docs/experiment.md).

---

## 1. The claim

If a **physically measured** fly neural circuit is held fixed (its weights are never trained) and
only a very small linear readout layer behind it is evolved, can that combination beat a control
that has no such circuit?

The test is ablation: force the circuit's activity to zero (`ablated=true`) and change nothing else.
If performance does not drop, the readout was never using the circuit and the experiment has failed.

---

## 2. Environment: a deterministic cute-dino simulator

The original game [cchouse168/cute-dino](https://github.com/cchouse168/cute-dino) is a single
`index.html`. Its game logic was extracted into `src/engine/game.js` from `update(dt)`
(lines 324–436), `spawnObstacle`/`spawnPowerup` (259–293) and the state definitions (156–175),
with four modifications:

| Modification | Original | After |
|---|---|---|
| Randomness | 26 `Math.random()` call sites | Seeded LCG `s = (s·1664525 + 1013904223) mod 2³²` |
| Time step | `clamp(rAF delta, 0.0005, 0.032)` | Fixed `1/60`; any other value throws |
| Geometry | `W()`/`H()` read `canvas.clientWidth` | Constants `1280×576`, `GROUND_Y=496`, `LEFT_X=256`, `MAX_X=768` |
| Side effects | `update()` writes the DOM and calls `sfx.*` | Removed; headless also skips particles / floating scores / clouds |

### The random stream is order-sensitive

For a seed to reproduce, **the order in which numbers are drawn must be fixed**. Known order traps:

1. `spawnObstacle()` draws first, `gapPx` second (as in the original — they cannot be swapped)
2. `powerTimer` is reset first, `spawnPowerup()` is called second
3. The flame-pickup test `score >= 5000 && random() < 0.25` inside `spawnPowerup()` **short-circuits** —
   below 5000 points that random number is never drawn
4. When jet is on cooldown, `random() < 0.5 ? cactus : palm` draws one extra number

### Decorative randomness must stay isolated

Sparks, clouds and flame sound-effect timers use `Math.random()` and **must never touch the seeded
`state.random()`**. Otherwise the random stream diverges between visual mode (which spawns particles)
and headless mode (which does not), and the trained weights no longer describe what is on screen.
Check `[4]` in `scripts/verify-determinism.mjs` exists specifically for this.

### Acceptance

```bash
node scripts/verify-determinism.mjs
```

The same seed runs 10,800 steps (180 seconds) with a step-by-step comparison of physics snapshots;
they must be bit-identical. Measured cost per step is about **1.3 µs**.

---

## 3. The circuit

`data/connectome.json` is taken directly from flyjump, unmodified:

| Item | Count |
|---|---:|
| Nodes | 80 (32 input / 32 interneuron / 16 output) |
| Directed edges | 1,296 |
| Total synaptic contacts | 26,029 |
| Neurotransmitters | acetylcholine 61, GABA 13, glutamate 5, unclear 1 |
| Assumed signs | +1 for 61, −1 for 18, 0 for 1 |

### Weight normalisation

```
W[j,i] = c[j,i]·s[j] / Σ_k ( c[k,i]·|s[k]| )
```

`c` is the measured contact count and `s` the sign assumed from the neurotransmitter
(ACh +1; GABA / glutamate −1). The result is `Σ|W| = 1` over the incoming edges of each
post-synaptic node (79 of the 80 nodes have incoming edges).

### Dynamics

```
u[i]     = 2·(feature[channel(i)] − 0.5)        external drive; non-zero only for input cells
h_new[i] = 0.3·h[i] + 0.7·tanh( u[i] + 1.4·Σ_j W[j,i]·h[j] )
```

The constants `{ iterations: 3, leak: 0.7, gain: 1.4, outputGain: 4 }` are exactly the original's.
Three synchronous iterations run before every decision, giving activity a chance to spread from the
input cells through the interneurons to the descending neurons. The number 3 has no biological
meaning — it is an engineering hyperparameter.

**This is a dimensionless signed leaky-tanh activity. It is not a membrane potential and not a
measured firing rate.**

---

## 4. Sensory channels: 13 of them

### Why not 16

The original plan was to split each LC type's 4 cells into 2 groups, giving 8×2 = 16 channels.
But a channel is only meaningful if **the two groups really do project differently downstream** —
otherwise the circuit cannot tell them apart.

Measurement (`scripts/remap-channels.mjs`): for each type, enumerate all three 2-2 groupings,
compute the cosine similarity between the two groups' summed out-edge vectors, and take the lowest.

| Type | Best cross-group similarity | Verdict | Channels |
|---|---:|---|---:|
| LC9 | 0.000 | splittable | 2 |
| LC16 | 0.000 | splittable | 2 |
| LC21 | 0.000 | splittable | 2 |
| LPLC2 | 0.004 | splittable | 2 |
| LC15 | 0.534 | marginally splittable | 2 |
| LC4 | 0.940 | not splittable | 1 (keeps 4 cells) |
| LC11 | 0.944 | not splittable | 1 (keeps 4 cells) |
| LC17 | 0.988 | not splittable | 1 (keeps 4 cells) |

The decision threshold is `SPLIT_THRESHOLD = 0.2`. Mean similarity *across* types is only 0.057, so
LC17's within-type 0.988 means those four cells are near-duplicates of one another.

The three unsplittable types were assigned the most critical features: they have the most cells (4)
and the highest out-degree (LC4: 25–28 edges each), so they influence downstream the most.

### Channel table

`u = 2·(feature − 0.5)`. Every cell on a channel receives the same drive value — a broadcast, with no
learned projection matrix.

| # | Feature | Normalisation | Target cells |
|---:|---|---|---|
| 0 | Obstacle time-to-impact | `1 − clamp(gap / worldV / 1.5, 0, 1)` | LC4 ×4 |
| 1 | Obstacle bottom height above ground | `clamp((G − (o.y+o.h)) / 300, 0, 1)` | LC11 ×4 |
| 2 | Player height above ground | `clamp((G − (d.y+d.h)) / 240, 0, 1)` | LC17 ×4 |
| 3 | Obstacle top height above ground | `clamp((G − o.y) / 300, 0, 1)` | LC9·a |
| 4 | Second-nearest obstacle time-to-impact | as #0, for the second-nearest | LC9·b |
| 5 | Player vertical velocity | `clamp(vy / 900 / 2 + 0.5, 0, 1)` | LC16·a |
| 6 | On the ground | `onGround ? 1 : 0` | LC16·b |
| 7 | Bullet time-to-impact | `1 − clamp(gap / v_bullet / 1.5, 0, 1)` | LC21·a |
| 8 | Bullet relative height | `clamp(dy / 300 / 2 + 0.5, 0, 1)` | LC21·b |
| 9 | Pickup time-to-reach | as #0, closing speed `worldV·0.9` | LPLC2·a |
| 10 | Pickup relative height | as #8 | LPLC2·b |
| 11 | Player horizontal position | `(d.x − 256) / (768 − 256)` | LC15·a |
| 12 | Shield state | `max(invulnerability remaining/6, littles>0 ? 0.5 : 0)` | LC15·b |

Every `gap` is measured from the right edge of the dino's hitbox (`d.x + d.w·0.45`), and `G = 496`.

**Using time-to-impact rather than distance is deliberate**: dividing distance by closing speed folds
the speed information in automatically, so the agent never has to learn "jump earlier when it is
faster" — and it saves a channel.

These are all engineered reads of game state. **No biological interpretation is claimed.**

---

## 5. Readout network

```
16 (descending-neuron activity × outputGain 4)
  → 12 (tanh)
  → 5 (linear) → argmax
```

Parameter count: `16·12 + 12 + 12·5 + 5 = 269`. Decisions run at 30 Hz (every 2 steps of the 60 Hz
simulation).

The actions are `{RUN, JUMP, DUCK, LEFT, RIGHT}`. `JUMP` has **hold** semantics: selecting it on
consecutive decisions keeps `holdingJump` set, which naturally produces cute-dino's higher held jump
(`jumpHoldMax = 0.18s`, an extra −1200 px/s² of lift while held).
The machine gun and flames fire automatically once picked up and do not occupy an action.

`DUCK` copies the original's keydown-edge semantics: it ducks only on the transition from not-pressed
to pressed while on the ground. Pressing in mid-air does not take effect on landing.

---

## 6. Training: the cross-entropy method

```
population       64
elites            8
generations     400   (original: 80)
courseSeconds   180
trainingCourses  12   (original: 3)
validationSeeds  16   (original: 4)
mean/sigma update  0.3·old + 0.7·elite statistic
sigma floor      0.07
initialSigma     0.8
```

Every generation runs all candidates on the **same** set of fresh courses; candidate 0 holds the
previous generation's champion (elitism). Fitness is the mean cute-dino score across the courses.
The champion is replaced only when the validation score **strictly improves**.

### Why the course counts were raised

The champion weights measured across 40 courses have a score coefficient of variation of **0.74**
(mean 1603, SD 1180). Estimated from the original's 3 courses, the standard error is 42% of the mean —
CEM would pick lucky candidates rather than genuinely strong ones. Four validation seeds are just as
noisy: one fluke high score in the first round locks the champion threshold permanently (measured:
validation did not move at all in 46 of 80 generations).

Chrome Dino has no pickups, no HP and no sinusoidally weaving obstacles, so its variance is far
smaller and the original's 3 courses are sufficient. The original parameters are preserved as
`FLYJUMP_TRAINING` in `src/lib/training.js`.

After raising them the validation curve became monotonically increasing
(51 → 366 → 576 → 854 → 1205 → 1418 → 1758 → 2082), meaning champion selection finally reflects real
ability rather than luck. No plateau is visible even at generation 400.

---

## 7. Benchmark

Held-out seeds `2100001–2100100`, capped at 180 seconds each. The control groups match the original:

| Control | Description |
|---|---|
| Connectome + trained readout | the full system |
| Circuit silenced (ablation) | `ablated=true`; the 16 DN outputs are forced to 0, readout weights unchanged |
| Untrained readout | circuit intact, readout replaced with random weights from `rng(trainingSeed)` |
| Hand-written rules | no connectome, no neural network — pure geometric thresholds (`ruleAction`) |
| Random actions | each decision picks uniformly among the 5 actions |
| No action at all | always RUN |

Decision threshold: the claim holds only if full / circuit-silenced **> 2×** *and*
full / untrained-readout **> 2×**.

```bash
node scripts/benchmark.mjs
```

### Results (400-generation champion, from generation 382)

| Control | Completed | Mean survival | Median survival | Mean score |
|---|---:|---:|---:|---:|
| Connectome + trained readout | 40/100 | 102.0s | 98.0s | 1593 |
| Circuit silenced (ablation) | 0/100 | 2.3s | 2.3s | 13 |
| Untrained readout | 0/100 | 2.7s | 2.7s | 16 |
| Hand-written rules | 25/100 | 82.4s | 55.1s | 1354 |
| Random actions | 0/100 | 4.1s | 3.5s | 24 |
| No action at all | 0/100 | 3.5s | 3.5s | 21 |

Ablation ratio **44.7×**, untrained-readout ratio **37.9×** — the claim holds.

### Replicates

A single training seed is not trustworthy on its own. `scripts/replicates.mjs` reruns the whole
pipeline across several seeds and checks whether the ablation ratio reproduces stably:

```bash
node scripts/replicates.mjs 400 20260915 20260916 20260917
```

---

## 8. Known limitations

1. **The agent is only about 1.24× better than the hand-written rules.** The ablation control shows
   *that the circuit contributes*, not *that this agent is strong*. The original completes 99/100 on
   the simpler Chrome Dino. CEM has also **not converged**: validation was 1418 at generation 150 and
   2082 at 400, still rising throughout, so more generations would still pay off. The current result
   is a lower bound set by the compute budget, not the method's ceiling.
2. **The training courses are too short to cover the game's full difficulty range.**
   `speedScale = min(2.0, 1 + 0.04·⌊t/12⌋)` tops out at 2.00× at t=300s, but `courseSeconds = 180`,
   so during training the agent only ever reaches **1.60×**; **the 1.60×–2.00× band never appears in a
   single training sample**. That band is exactly where the points are: the measured plateau
   accumulates about 29.5 points/second, more than three times the early rate. Raising
   `courseSeconds` past 400s should improve long-run performance directly.

3. **The bullet channel's horizon is set too large.** `impact()` uses a horizon of 1.5 seconds; at the
   plateau, bullets travel 1020 px/s, giving a 1530 px sensing range — but on screen bullets appear at
   most about 1053 px away. So ch7's value range is permanently confined to 0.31–1.00, the bottom 30%
   is wasted, and resolution in the critical band is compressed. Bullets cause a measured **46%** of
   deaths, the single largest cause. A horizon of 0.7s would let 0–800 px use the full range.

4. **13 channels is the ceiling for this 80-cell graph.** More independent sensory channels would
   require going back to the raw MaleCNS data and reselecting cells
   (`flyjump/scripts/build-connectome.py`) to include more visual projection types.
5. **`ch11 player horizontal position` has a low dynamic range.** Lateral movement helps survival
   little, the evolved policy rarely uses it, and the channel carries little actual information.
6. **The signs are assumed, not measured.** ACh → +1 and GABA/glutamate → −1 is a convention; the
   actual polarity of individual synapses has not been verified.
7. The hand-written rule baseline was tuned for one round only. It does not qualify as "the best
   possible solution without a neural network" — it is a control, not an upper bound.
