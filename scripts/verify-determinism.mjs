/**
 * M1 acceptance: the deterministic simulator
 *   1. the same seed run twice must produce bit-identical step-by-step snapshots
 *   2. different seeds must produce different courses
 *   3. a time step other than 1/60 must be rejected
 *   4. headless and visual physics trajectories must match (decorative entities must not pollute the random stream)
 */
import { createGame, tick, score, STEP, RUN, JUMP, DUCK, LEFT, RIGHT } from "../src/engine/game.js";

/** Flatten everything that affects physics into a string, for bit-level comparison. */
function snapshot(s) {
  const f = (n) => (Object.is(n, -0) ? "0" : String(n));
  const d = s.dino;
  return [
    f(s.time), f(s.score), f(s.speedScale), f(s.spawnTimer), f(s.powerTimer),
    f(s.jetCooldown), f(s.invincibleUntil), f(s.mgUntil), f(s.fireUntil),
    f(s.mgFireTimer), f(s.littles), f(s.jumpHold), s.holdingJump ? 1 : 0, s.dead ? 1 : 0,
    f(d.x), f(d.y), f(d.vx), f(d.vy), f(d.h), d.onGround ? 1 : 0, d.crouch ? 1 : 0,
    s.obstacles.map((o) => [o.type, f(o.x), f(o.y), f(o.w), f(o.h), f(o.shootTimer ?? 0), o.fired ? 1 : 0].join(",")).join("|"),
    s.bullets.map((b) => [f(b.x), f(b.y), f(b.v)].join(",")).join("|"),
    s.powerups.map((p) => [p.type, f(p.x), f(p.y)].join(",")).join("|"),
    s.pBullets.map((p) => [f(p.x), f(p.y)].join(",")).join("|"),
  ].join(";");
}

/** Drive with a fixed pseudo-random action sequence, so all three actions and pickup interactions are covered. */
function scriptedAction(i) {
  const pattern = [RUN, RUN, JUMP, JUMP, RUN, DUCK, RUN, RIGHT, RUN, LEFT, JUMP, RUN];
  return pattern[i % pattern.length];
}

function run(seed, steps, opts = {}) {
  const g = createGame(seed, opts);
  const snaps = [];
  for (let i = 0; i < steps; i++) {
    tick(g, scriptedAction(i));
    snaps.push(snapshot(g));
    if (g.dead) break;
  }
  return { game: g, snaps };
}

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!ok) failures++;
};

const STEPS = 10800; // 180 seconds

console.log("\n[1] Bit-identical reproduction from the same seed");
for (const seed of [1, 42, 20260914, 2100001]) {
  const a = run(seed, STEPS);
  const b = run(seed, STEPS);
  let firstDiff = -1;
  if (a.snaps.length !== b.snaps.length) firstDiff = Math.min(a.snaps.length, b.snaps.length);
  else for (let i = 0; i < a.snaps.length; i++) if (a.snaps[i] !== b.snaps[i]) { firstDiff = i; break; }
  check(
    `seed=${seed}`,
    firstDiff === -1,
    `steps=${a.snaps.length} t=${a.game.time.toFixed(2)}s score=${score(a.game)} dead=${a.game.dead}` +
      (firstDiff >= 0 ? ` <<< diverges from step ${firstDiff}` : ""),
  );
}

console.log("\n[2] Different seeds produce different courses");
const traces = [1, 2, 3, 4, 5].map((s) => run(s, 1800).snaps.at(-1));
check("5 seeds all differ", new Set(traces).size === 5, `unique=${new Set(traces).size}/5`);

console.log("\n[3] A non-fixed time step is rejected");
const g3 = createGame(1);
let threw = false;
try { tick(g3, RUN, 0.016); } catch { threw = true; }
check("dt=0.016 rejected", threw);
let ok60 = true;
try { tick(g3, RUN, STEP); } catch { ok60 = false; }
check("dt=1/60 accepted", ok60);

console.log("\n[4] Visual mode must not pollute the physics random stream");
const h = run(777, 3600, { visual: false });
const v = run(777, 3600, { visual: true });
let diffAt = -1;
for (let i = 0; i < Math.min(h.snaps.length, v.snaps.length); i++)
  if (h.snaps[i] !== v.snaps[i]) { diffAt = i; break; }
check(
  "headless and visual trajectories match",
  diffAt === -1 && h.snaps.length === v.snaps.length,
  diffAt >= 0 ? `diverges at step ${diffAt}` : `particles(visual)=${v.game.particles.length} / (headless)=${h.game.particles.length}`,
);

console.log("\n[5] Performance");
const t0 = performance.now();
let steps = 0;
for (let seed = 1; seed <= 20; seed++) {
  const g = createGame(seed);
  for (let i = 0; i < STEPS && !g.dead; i++) { tick(g, scriptedAction(i)); steps++; }
}
const ms = performance.now() - t0;
const perStep = (ms * 1000) / steps;
console.log(`  ${steps.toLocaleString()} steps / ${ms.toFixed(0)} ms = ${perStep.toFixed(2)} µs/step`);
const budget = 80 * (64 * 3 + 4) * 10800;
console.log(`  Full training ${(budget / 1e6).toFixed(0)}M steps, estimated ${((budget * perStep) / 1e6 / 60).toFixed(1)} minutes single-threaded`);

console.log(failures === 0 ? "\nAll passed\n" : `\n${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
