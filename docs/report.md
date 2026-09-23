# Results report: a fly connectome plays cute-dino

> This report records the full implementation, validation and control results. Every number can be
> reproduced with the scripts under `scripts/`.

---

## 1. One-sentence summary

A **fixed circuit** of 80 real neurons and 1,296 measured synaptic connections from the MaleCNS fly
connectome, wired to a **269-parameter** readout network, plays cute-dino.
Ablation control: zeroing the circuit's activity drops survival from **161.1s to 3.5s** (a ratio of
46×). Note that 3.5s is this environment's floor — "no action at all" is also 3.5s on all 100 courses.
After ablation the agent repeats a single action for the whole run, so the denominator of that 46× is
a constant, not a graded quantity.
The effect reproduces stably across three independent training seeds (41.6 ± 7.4×); it is not a
one-off fluke.

The standard 180-second cap censors the results (the agent hits it on 82/100 courses, the
hand-written rules on 25/100). On an uncensored 480-second ruler, the mean-survival ratio against the
hand-written rules goes from 1.95× to 2.60×, and the per-course record goes from 69 wins / 24 ties to
92 wins / 0 ties (see §5.4).

---

## 2. Differences from Fly Dino (the original)

### 2.1 Identical

These are the connectome itself — not a single bit changed:

| Item | Value |
|---|---|
| Neurons | 80 (32 input / 32 interneuron / 16 output) |
| Directed connections | 1,296 |
| Total synaptic contacts | 26,029 |
| Data source | MaleCNS v1.0, CC BY 4.0 |
| Neurotransmitter signs | ACh +1; GABA / glutamate −1 |
| Weight normalisation | `W[j,i] = c[j,i]·s[j] / Σ_k(c[k,i]·|s[k]|)` |
| Dynamics | `h′ = 0.3·h + 0.7·tanh(u + 1.4·Σ W·h)` |
| Propagation iterations | 3 (per decision) |
| External drive | `u = 2·(feature − 0.5)` |
| Decision rate | 30 Hz |
| CEM population / elites | 64 / 8 |

### 2.2 Different

| Item | Fly Dino (original) | This project | Why |
|---|---|---|---|
| **Game environment** | Chromium Dino (native engine, 600×150) | cute-dino (purpose-built deterministic simulator, 1280×576) | swapped in the user's own game |
| **Environment complexity** | cactus, pterodactyl | cactus, palm, sinusoidally weaving dragon, jet (fires 1020 px/s bullets), 5 pickup types, HP system | cute-dino is simply much more complex |
| **Sensory channels** | 8 | **13** | richer state; the channel count is set by measured within-type projection separability (see §4) |
| **Action space** | 3 (run / jump / duck) | **5** (+ move left / right) | cute-dino has lateral movement |
| **Readout network** | 16→12→3 = **243** parameters | 16→12→5 = **269** parameters | different action count |
| **Training generations** | 80 | **400** | validation was still climbing at generation 400 (see §5) |
| **Courses per generation** | 3 | **12** | cute-dino's score CV is 0.74; with 3 courses the standard error is 42% of the mean |
| **Validation seeds** | 4 | **16** | same reason; with 4 seeds one fluke high score locks the champion permanently |
| **Total episodes** | 15,680 | about 313,600 | both generations and courses were raised |

### 2.3 Why the original's hyperparameters are bad for cute-dino

The champion weights measured across 40 courses have a **score coefficient of variation of 0.74**.
Estimated from the original's 3 training courses, the standard error is 42% of the mean — CEM would
pick lucky candidates rather than genuinely strong ones.
Four validation seeds are just as noisy: measured, validation did not move at all in 46 of 80
generations, because one fluke high score at generation 34 locked the threshold.

Chrome Dino has no pickups, no HP and no sinusoidally weaving obstacles, so its variance is far
smaller and the original's 3 courses are sufficient. The original parameters are preserved for
comparison as `FLYJUMP_TRAINING` in `src/lib/training.js`.

### 2.4 Score comparison (note: different environments — not a strength comparison)

| | Fly Dino | This project |
|---|---:|---:|
| Completed (180s cap) | 99/100 | 82/100 |
| Mean survival | 179.4s | 161.1s |
| Mean score | 2,885.75 | 2,512 |
| Survival after ablation | 4.51s | 3.5s |
| Ablation ratio | 39.8× | 45.8× |

**This table cannot be used to compare whose agent is stronger** — the two games differ enormously in
difficulty. cute-dino has jet bullets that chase you, sinusoidally weaving flying obstacles and five
action dimensions. The only comparable figure is the **ablation ratio**: both show that the fixed
anatomical structure is genuinely doing work.

---

## 3. The hardest engineering problem: turning the game into a trainable environment

The original could be trained because the Chromium engine can itself be wrapped as a deterministic
simulator. cute-dino cannot:

| Obstacle | Original | Fix |
|---|---|---|
| Randomness not seeded | 26 `Math.random()` call sites | seeded LCG, **the draw order must be exactly fixed** |
| Time step not fixed | `clamp(rAF delta, 0.0005, 0.032)` | fixed `1/60`; any other value throws |
| Geometry depends on window size | `W()`/`H()` read `canvas.clientWidth` | locked to 1280×576 |
| Side effects mixed into the logic | `update()` writes the DOM and calls `sfx.*` | removed; headless skips decorative entities |

### Three places that break silently if you skip them

1. **Random draw order**: `spawnObstacle()` must come before the gap `rand()`, and the `powerTimer`
   reset must come before `spawnPowerup()`; the flame-pickup line `score>=5000 && random()<0.25` is
   still short-circuit evaluation — one step out of order and the same seed will not reproduce.
2. **Decorative randomness must stay isolated**: sparks, clouds and sound-effect timers use
   `Math.random()` and must never touch the seeded stream, or headless training and what runs on
   screen are no longer the same world.
3. **The visual page must lock its logical coordinates**: scale with a CSS transform; never let
   `W()`/`H()` follow the window.

Acceptance: the same seed runs 10,800 steps with a step-by-step comparison of physics snapshots, and
must be bit-identical; cost per step is **1.31 µs**.

---

## 4. Why 13 channels, not 16

The plan was to split each LC type's 4 cells into 2 groups for 16 channels, but measurement showed
they cannot be split:

| Type | Cross-group out-edge cosine similarity, best 2-2 grouping | Verdict |
|---|---:|---|
| LC9 / LC16 / LC21 / LPLC2 | 0.000 – 0.004 | splittable → 8 channels |
| LC15 | 0.534 | marginally splittable → 2 channels |
| LC4 / LC11 / LC17 | 0.940 – 0.988 | **not splittable** → 4 cells each, 3 channels |

LC17's four cells have a projection similarity of **0.988** — force them into two channels and the
circuit cannot tell them apart; you just make two features into twins. So the real ceiling is
**8 + 2 + 3 = 13**. The three unsplittable types were reassigned to the most critical features (they
have the most cells and the highest out-degree).

Both the measurement and the assignment live in `scripts/remap-channels.mjs` and can be rerun.

---

## 5. Results

### 5.1 Main model (100 held-out courses, 180s cap)

The model is the generation-311 champion (training seed 20260917). **The model was selected on the
validation score during training, not on the held-out table below** — otherwise it would amount to
picking a model on the test set.

| Control | Completed | Mean survival | Median survival | Mean score |
|---|---:|---:|---:|---:|
| **Connectome + trained readout** | **82/100** | **161.1s** | **180.0s** | **2512** |
| Circuit silenced (ablation) | 0/100 | 3.5s | 3.5s | 21 |
| Untrained readout | 0/100 | 3.5s | 3.5s | 21 |
| Hand-written rules | 25/100 | 82.4s | 55.1s | 1354 |
| Random actions | 0/100 | 4.1s | 3.5s | 24 |
| No action at all | 0/100 | 3.5s | 3.5s | 21 |

Median survival reaches the 180-second cap — it lasts to the end on more than half the courses.

Two caveats that must be stated together:

1. **This table is right-censored.** The agent hits the 180s cap on 82/100 courses and the
   hand-written rules on 25/100, and **24 of those courses are false ties where both hit the cap**.
   Differences above the cap are invisible to this table (see §5.4).
2. **82/100 is this deployed model's score, not the method's score.** The same pipeline with
   different training seeds gives 46–87/100 (see §5.2).

### 5.2 Replicates: the ablation effect reproduces stably

| Training seed | Champion gen | Validation score | Completed | Mean survival | Ablation ratio | vs rules |
|---:|---:|---:|---:|---:|---:|---:|
| 20260915 | 340 | 2064 | 46/100 | 109.7s | 31.2× | 1.33× |
| 20260916 | 337 | 2905 | 87/100 | 167.9s | 47.7× | 2.04× |
| 20260917 | 311 | 2965 | 82/100 | 161.1s | 45.8× | 1.95× |
| **Mean ± SD** | | | **71.7 ± 18.3** | **146.2 ± 25.9s** | **41.6 ± 7.4×** | **1.77 ± 0.31×** |

One standard deviation below the mean ablation ratio still leaves 34×, far above the 2× decision
threshold (with the sample SD of 9.0 it is 32.6×; every `±` in this report is a population SD, see
§6.12). Testing against the null hypothesis "ablation ratio = 1": t = 7.8 (df = 2), p = 0.016,
significant.

Two further findings:

1. **The validation score correlates with held-out performance, but not well enough to pick the
   winner.** (val ≈ 2070 → 40–46/100; val ≈ 2900 → 82–87/100.)
   Model selection used only the validation score and never touched held-out, which is clean — but
   it **picked wrong**: seed 20260917, with a validation score of 2965, was selected as the main
   model (82/100), while seed 20260916, with a validation score of only 2905, is actually 87/100.

   Re-scoring on an enlarged validation set of 64 or 128 courses **does not remove this inversion**.
   Measured on 6 existing champions (spanning 13/100 to 93/100), the rank correlation between
   validation score and held-out result is:

   | Validation set size | Spearman ρ | Order of the top two |
   |---:|---:|---|
   | 16 (used in this project) | 0.886 | wrong |
   | 64 | 0.943 | still wrong |
   | 128 | 0.943 | still wrong |

   Enlarging the validation set fixes the mid-table ordering and saturates by 64 courses, but it
   **cannot fix the top of the table**. So "select the model on its validation score" is, in this
   project, an **unbiased but imprecise** procedure.

   This table is reproduced by `node scripts/validation-size.mjs`.
2. **Variance between training seeds is large** (109.7s–167.9s). Any "improvement" must be validated
   across several seeds; a single run cannot distinguish a real gain from luck — which matters
   directly in §5.3. But three seeds are **still not enough**: the variance is large enough that a
   three-seed design has a detection floor of 70% (see §6.9).

### 5.3 Two plausible-sounding improvements, neither supported by measurement

Starting from the cause-of-death analysis (`scripts/analyze-ceiling.mjs`), I proposed two fixes, each
with a clear quantitative rationale. Compared against **the same set of training seeds**, neither was
supported, and the final configuration was left unchanged.
But one thing has to be said first: **this three-seed design has a detection floor of 70%** (see
§6.9), so the strongest conclusion these two comparisons can support is "no improvement observed" —
not "shown to be worse".

**Fix A: raise the training courses from 180s to 600s (V2)**

Rationale: `speedScale` tops out at 2.00× at t=300s, while a 180-second course only reaches 1.60× —
the whole 1.60×–2.00× band never appears in any training sample, and that is exactly where points
accumulate fastest (29.5 points/second).

| Training seed | V1 (180s) | V2 (600s) | Change |
|---:|---:|---:|---:|
| 20260915 | 46/100 | 28/100 | −18 |
| 20260916 | 87/100 | 93/100 | +6 |
| 20260917 | 82/100 | 13/100 | **−69** |
| **Mean** | **71.7 ± 18.3** | **44.7 ± 34.7** | SD nearly doubled |

Verdict: **not adopted**. But this verdict stands on two legs of very different strength, and they
must be reported separately.

**The statistical leg is weak.** The paired differences across the three seeds are −18 / +6 / −69,
mean −27.0 courses, paired t = −1.22 (df = 2), **p = 0.35, not significant**.
An earlier version of this report said "three-seed replicates confirm this is harmful", which was an
overclaim — with n = 3 the detection floor is 70% (see §6.9), and this design was never able to see a
difference smaller than 50 courses.

**The mechanistic leg is solid.** Seed 20260917's champion **froze at generation 39**, with zero
replacements over the following 361 generations. That is not an estimate; it is a directly observed
pathology. A 600-second course has a much higher score ceiling (8000+ vs 2500), so the dynamic range
of the validation score explodes and one early high score locks the champion threshold permanently.
The three-seed SD widening from 18.3 to 34.7 is consistent with that mechanism.

The correct statement is: **there is a clear, directly observed failure mechanism, but not enough
statistical evidence to say it is worse on average.**

**Fix B: shrink the bullet channel's sensing horizon from 1.5s to 0.7s (V3)**

Rationale: at the plateau, bullets travel 1020 px/s, so 1.5s is a 1530 px sensing range — but on
screen bullets appear at most 1053 px away, confining ch7's value range to 0.31–1.00 and wasting 30%
of its resolution. And bullets were the single largest cause of death (46%).

| Training seed | V1 (h=1.5) | V3 (h=0.7) | Change |
|---:|---:|---:|---:|
| 20260915 | 46/100 | 34/100 | −12 |
| 20260916 | 87/100 | 86/100 | −1 |
| 20260917 | 82/100 | 49/100 | **−33** |
| **Mean** | **71.7 ± 18.3** | **56.3 ± 21.9** | **−15.3** |

Verdict: **no evidence of improvement, not adopted**.

The paired differences across the three seeds are −12 / −1 / −33, mean −15.3 courses, paired
t = −1.63 (df = 2), **p = 0.24, not significant**.
All three seeds pointing the same way is admittedly suspicious, but n = 3 cannot rule out that this
is just divergence in the CEM search path (see §6.9).

**A separate piece of evidence points straight at "this horizon does not matter"**: evaluating the
main model (trained at 1.5) unchanged in a 0.7 environment gives **83/100 · 160.7s**, essentially
identical to 82/100 · 161.1s in its own environment. Same weights, only the observation horizon
changed, and the score does not move.

So what I once wrote — "the extra warning time 1.5 seconds provides is the key" — **was also an
overreach**. All the data supports is one sentence: **this parameter does not matter within the range
we can measure**, and V3's three-seed regression comes mainly from CEM search-path divergence, not
from the horizon itself.

### 5.4 Long-course validation: the 180s cap understates the circuit's contribution

The standard benchmark's 180-second cap exists for comparability with the original. But median
survival is already pinned at 180 seconds, which means this ruler **cannot measure differences in its
upper half**. Removing the cap and measuring to 600 seconds:

| Control | Past 300s (difficulty capped) | Mean survival | Median survival | Mean score | Best score |
|---|---:|---:|---:|---:|---:|
| **Connectome + trained readout** | **35/100** | **261.4s** | **285.6s** | **4500** | **9008** |
| Circuit silenced (ablation) | 0/100 | 3.5s | 3.5s | 21 | 21 |
| Untrained readout | 0/100 | 3.5s | 3.5s | 21 | 21 |
| Hand-written rules | 3/100 | 100.6s | 55.1s | 1725 | 8047 |

**The 180-second cap compresses the gap.** Taking the same 600-second data and artificially censoring
it at different caps, using **one single statistic** to see how discriminative power varies with the
cap:

| Censoring cap | Agent mean | Rules mean | Mean survival ratio | Cohen d | Per-course wins | Ties | At cap, agent/rules |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 180s | 161.1s | 82.4s | 1.955× | 1.32 | 69 | **24** | 82/25 |
| 240s | 209.7s | 94.8s | 2.213× | 1.46 | 77 | 16 | 76/17 |
| 300s | 246.5s | 100.2s | 2.461× | 1.59 | 90 | 2 | 35/3 |
| 360s | 257.5s | 100.6s | 2.561× | 1.62 | 92 | 0 | 6/0 |
| **480s** | **261.4s** | **100.6s** | **2.599×** | **1.62** | **92** | **0** | **0/0** |
| 600s | 261.4s | 100.6s | 2.599× | 1.62 | 92 | 0 | 0/0 |

At 180 seconds, **24 courses are false ties where both hit the cap**, and the per-course win count
only reaches 69/100; at 480 seconds there is no censoring at all, the win count is 92/100 and the
mean survival ratio is 2.60×.

**Discriminative power saturates between 360 and 480 seconds** — extending to 600 adds nothing at
all. That in turn explains why Fix A in §5.3 overshot: the extra 240 seconds contribute no
discriminative power, but they double the score ceiling, and that is exactly what locks the champion.

The same cap also inflates the ablation ratio: 45.8× at 180s, 74.3× at 480s (the ablated group lives
3.5s regardless of the cap). **Both numbers must be reported** — quoting only 74.3× is inflating the
result by choice of ruler.

This table is reproduced by `node scripts/censoring.mjs`.

> ⚠️ This table comes from the single champion of seed 20260917, not a three-seed average.

### 5.5 Why my improvement direction was wrong: the death distribution shifts with model strength

The long-course validation also explains why the two fixes in §5.3 were proposed at all. Same
cause-of-death statistic, but measured with **models of different strength**, it gives opposite
answers:

| Cause of death | Weak model (40/100, 1200s cap) | Strong model (82/100, 600s) |
|---|---:|---:|
| Obstacle · cactus | 22% | **41%** |
| Obstacle · palm | 7% | **30%** |
| Obstacle · jet | 13% | 14% |
| Obstacle · dragon | 12% | 9% |
| **Bullets** | **46%** | **6%** |

**Bullets go from the largest cause of death to the smallest.** The strong model learned to dodge
bullets long ago; it is now stuck on the most basic ground obstacles (cactus + palm together, 71%).

I derived "bullets are the bottleneck → the bullet channel should change" from the death analysis of
that 40/100 weak model, then applied that conclusion to a much stronger model — **the direction was
wrong from the start**.

This explains **why I proposed Fix B**, not "why Fix B got worse". The latter was already answered by
the cross-environment evaluation in §5.3: the same weights with a different horizon score the same
(82→83), so V3's three-seed regression comes from CEM search-path divergence, not from the horizon
supplying worse information.

Lesson: cause-of-death statistics diagnose a **specific model**, not a **method**. To use them to
guide improvements, they must be measured on a model at the strength you are targeting.

### 5.6 A diagnostic mistake of my own

Seeing V2 seed 20260917's champion freeze at generation 39, I concluded "an early fluke validation
high score locked the threshold", and added a mechanism to re-validate the incumbent champion every
generation so that a fluke score would be corrected back to its true level.

**That fix was entirely ineffective** — because validation in this project is deterministic: the same
weights on the same validation seeds give 2965.3750 three times running, identically. There is no
noise to correct.

The real problem is not noise but **overfitting to the validation set**: the generation-39 weights
genuinely were the best on those 16 validation courses, they just generalised badly (held-out
13/100). The right direction is to enlarge the validation set, not re-run the same courses. That code
has been removed.

**That direction was later measured, and the conclusion is "it helps but not enough"** (see §5.2):
re-scoring 6 existing champions on 16 / 64 / 128 validation courses raises the rank correlation from
ρ = 0.886 to 0.943, saturating at 64. The generation-39 model is indeed caught more accurately by the
enlarged set (val@16 = 1198 → val@128 = 1004; its rank is unchanged but it is pushed further down).
But enlarging the validation set **cannot fix the inversion at the top** — 64 and 128 both rank the
82/100 model above the 87/100 one. So it is a fix with the right direction that is still insufficient
for the model-selection problem, and this report does not adopt it.

It is recorded here because "the diagnosis sounds reasonable" and "the diagnosis is correct" are two
different things, and I nearly shipped an ineffective fix as an improvement.

### 5.7 Final configuration

After three rounds of experiments, **the original V1 configuration stands**:

| Parameter | Value | Basis |
|---|---|---|
| Bullet channel horizon | 1.5s | no improvement observed in V3; the cross-environment evaluation shows this parameter is insensitive (82→83, see §5.3) |
| courseSeconds | 180 | V2's 600 exhibited an observed champion-freeze failure mechanism (not statistically significant, see §5.3, §6.9) |
| Champion selection | replace only on a strict validation improvement (as in the original) | the re-validation mechanism was shown to be ineffective |
| trainingCourses | 12 | score CV is 0.74; the original's 3 courses give a standard error of 42% |
| validationSeeds | 16 | same; 64 measured a better rank correlation (ρ 0.886→0.943) but still picks the wrong winner, so it was not adopted (see §5.6) |
| Main model | seed 20260917, generation 311 | selected on the **validation score** (held-out was never touched), 82/100; but the validation score picked the wrong winner, see §5.2 |

What actually took the score from 40/100 to 82/100 was not either of these "improvements" — it was
**running a few more training seeds**. Between-seed variance (109.7s–167.9s) is far larger than any
single hyperparameter's effect, large enough that hyperparameter comparisons cannot measure it at all
(§6.9).

To be precise, though: what did the work was "run several seeds", not "pick with the validation
score". The validation score only captures part of it — the best of the three seeds is 87/100, and
the one the validation score picked is 82/100 (§5.2).

### 5.8 Candidate directions for next time (unverified hypotheses)

The long-course death analysis shows the strong model stuck on ground obstacles (cactus 41% + palm
30% = 71%). Tracing the channel values at the moment of death reveals a concrete gap:

| Cause of death | Count | Mean ch1 (bottom height above ground) | Actual bottom height |
|---|---:|---:|---:|
| cactus | 42 | **0.000** | 0px |
| palm | 30 | **0.000** | 0px |
| jet | 15 | 0.259 | 45–99px |
| dragon | 7 | 0.207 | 46–89px |

**When it dies to a ground obstacle, ch1 is always 0** — that channel carries no information about
them at all. Cactus and palm overlap in height (both roughly 40–100px); the real difference is width
(22px vs 40px, nearly double, requiring different jump timing), and **width is not among the 13
channels**. When the channels were chosen, "obstacle width" was traded away for "second-nearest
obstacle time-to-impact".

Candidate fix: replace ch4 (second-nearest obstacle time-to-impact) with obstacle width.

**But this is only a hypothesis, not yet verified.** This report already contains two cases where the
reasoning was sound and the measurement disagreed (§5.3), and §5.5 shows that the death analysis
drifts with model strength. Reaching a conclusion requires a three-seed comparison with a model at
the target strength, not reasoning.

---

## 6. Honest limitations

> This section is numbered; the text refers to items as §6.1, §6.9 and so on.

1. **The agent is 1.77 ± 0.31× better than the hand-written rules**, not an overwhelming win.
   The ablation control shows "the circuit contributes", not "this agent is the strongest solution".
   Note that 1.77× is the conservative value **after 180-second censoring**; the same main model on
   an uncensored 480-second ruler is 2.60× (see §5.4). Both are real — the difference is the ruler,
   and the cap must be quoted alongside either number.
2. **Between-seed variance is large** (109.7s–167.9s). A single training run is not trustworthy, and
   every comparison in this report uses three seeds — but "used three seeds" is not the same as "has
   statistical power": the smallest difference three seeds can detect is 70%, see §6.9.
3. **13 channels is the ceiling for this 80-cell graph.** More independent sensory channels would
   require going back to the raw MaleCNS data and reselecting cells.
4. **The signs are assumed, not measured.** ACh → +1 and GABA/glutamate → −1 is a convention; the
   actual polarity of individual synapses has not been verified.
5. **The hand-written rule baseline was tuned for one round only** — it is a control, not an upper
   bound.
6. **The best single-course score is 9,008** (measured on 600-second courses), close to 10,000, but
   **0/100 break 10,000**. 35/100 courses survive past the 300-second difficulty cap, better than the
   13/100 originally estimated, but a mean score above 10,000 would need almost every course to
   survive ~590 seconds, which is out of reach today. The next target should be **ground obstacles**
   (cactus 41% + palm 30% = 71% of deaths), not bullets.
7. **Both improvements derived from the death analysis were refuted by measurement** (see §5.3,
   §5.5). The root cause is that I used a weak model's (40/100) death distribution to guide
   improvements to a strong model, and that distribution drifts heavily with model strength (bullets
   46% → 6%).
8. **V3 was once aborted because a single seed stalled, and has since been completed**; all three
   seeds' data exist. Checking confirmed the configuration was consistent and the data valid
   (`training.js` was finalised 35 minutes before V3 started and was not modified mid-run), so the
   reasoning at the time — "the data is void" — did not actually hold. The real reason to abort would
   have been that the return did not justify the compute.

9. **Three training seeds give a detection floor of 70%; every hyperparameter comparison in this
   report is underpowered.**

   Using the measured paired-difference SDs from V1 vs V3 (16.3 courses completed, 23.6s mean
   survival) to back out the minimum detectable difference (paired test, α = .05 two-tailed,
   power 80%):

   | Training seeds | MDE, courses completed (baseline 71.7) | MDE, mean survival (baseline 146.2s) |
   |---:|---:|---:|
   | **3 (this report)** | **50 courses (70%)** | **73s (50%)** |
   | 5 | 27 courses (38%) | 39s (27%) |
   | 8 | 19 courses (26%) | 27s (19%) |
   | 12 | 14 courses (20%) | 21s (14%) |

   Which is to say: **an effect has to be 70% before it becomes visible.** Both comparisons in §5.3
   (p = 0.35, p = 0.24) fall inside that floor; all they can support is "no improvement observed",
   and they **cannot support "shown to be worse"**. Fix A is still rejected on the strength of a
   directly observed failure mechanism (the champion freezing at generation 39), not on those three
   numbers.

   **The core claim is unaffected by this limitation.** Ablation ratios 31.2 / 47.7 / 45.8 against
   the null hypothesis of 1.0 give t = 7.8 (df = 2), p = 0.016, significant. What statistical power
   blocks is only "comparisons between configurations", not "whether the fixed anatomical structure
   contributes".

   All of the above is reproduced by `node scripts/power.mjs`.

10. **Of the three V1 champions cited in §5.2, only one still exists on disk.**
    `scripts/replicates.mjs` always writes to `models/replicates/<seed>/`, and the V2 and V3
    experiments overwrote the same directory in turn. What that directory actually holds now is:
    20260915 and 20260916 → the **V3** results, 20260917 → the **V2** result (identifiable from the
    champion generations: replicates.json records 340/337/311, while the disk has 371/361/39).

    The V1 champion weights for seeds 20260915 and 20260916 **no longer exist**; all that remains of
    §5.2's 71.7 ± 18.3 is the summary in `models/replicates.json`, which cannot be recomputed from
    artefacts. The only surviving V1 champion is `models/model.json` (seed 20260917).

11. **The model files do not record the observation-function version.** `model.json` records only
    `channelVersion`, while `BULLET_HORIZON` lives in `src/lib/policy.js`, not in `channels.json` —
    so V1 and V3 have byte-identical `channelVersion` strings. Evaluating the weights in
    `models/exp-v3/` with today's code uses an observation function that is no longer the one they
    were trained with; the result is meaningless, and **nothing raises an error**.

12. **Every `±` in this report is a population SD (divided by n), not a sample SD.** That is what
    `scripts/replicates.mjs` computes. At n = 3 the sample SD is 1.22× larger — for example
    71.7 ± 18.3 becomes 71.7 ± 22.4 as a sample SD. These `±` values understate the uncertainty.

---

## 7. Reproduction

```bash
node scripts/verify-determinism.mjs                      # simulator reproducibility
node scripts/verify-policy.mjs                           # circuit, readout, feature ranges
node scripts/remap-channels.mjs                          # the 13-channel input broadcast table
node scripts/train.mjs 20260917 400                      # CEM training
node scripts/benchmark.mjs                               # 100 held-out courses (180s)
node scripts/benchmark-long.mjs 600                      # long-course benchmark
node scripts/replicates.mjs 400 20260915 20260916 20260917  # three-seed replicate
node scripts/analyze-ceiling.mjs 1200 100                # score ceiling and cause-of-death analysis
node scripts/validation-size.mjs                         # §5.2 validation size vs selection accuracy
node scripts/censoring.mjs                               # §5.4 censoring cap vs discriminative power
node scripts/power.mjs                                   # §6.9 paired tests and minimum detectable difference
```

> ⚠️ `scripts/replicates.mjs` writes to `models/replicates/<seed>/` and **overwrites whatever is
> already there**; the output directory carries no experiment name. That is exactly how the data loss
> in §6.10 happened — change the output path before running a new experiment, or you will destroy the
> previous round's champion weights.
>
> Also, `scripts/train.mjs` reads `TRAINING` from `src/lib/training.js` directly, with no command-line
> override, so every experiment variant was produced by editing the source file — which is the origin
> of the version-tracking gap in §6.11.

---

## Licensing

- Method and code architecture adapted from [cobanov/flyjump](https://github.com/cobanov/flyjump),
  used under the Cobanov Template Attribution License 1.0
- Connectome and soma atlas: MaleCNS v1.0, CC BY 4.0
- Fruit-fly body model: [TuragaLab/flybody](https://github.com/TuragaLab/flybody), Apache 2.0
- Full provenance in `THIRD_PARTY_NOTICES.md`

> Built with [fly-connectome-template](https://github.com/cobanov/fly-connectome-template)
> by [Mert Cobanov](https://github.com/cobanov).
