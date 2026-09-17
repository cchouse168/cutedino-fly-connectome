/**
 * M1 驗收：確定性模擬器
 *   1. 同一 seed 跑兩次，逐步快照必須位元級相同
 *   2. 不同 seed 必須產生不同賽道
 *   3. 非 1/60 的時間步必須被拒絕
 *   4. headless 與 visual 模式的物理軌跡必須一致（裝飾實體不得污染亂數流）
 */
import { createGame, tick, score, STEP, RUN, JUMP, DUCK, LEFT, RIGHT } from "../src/engine/game.js";

/** 把所有影響物理的量攤平成字串，用於位元級比對。 */
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

/** 用固定的偽隨機動作序列驅動，確保三種動作與道具互動都被覆蓋。 */
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

const STEPS = 10800; // 180 秒

console.log("\n[1] 同一 seed 逐步位元級重現");
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
      (firstDiff >= 0 ? ` <<< 第 ${firstDiff} 步開始分歧` : ""),
  );
}

console.log("\n[2] 不同 seed 產生不同賽道");
const traces = [1, 2, 3, 4, 5].map((s) => run(s, 1800).snaps.at(-1));
check("5 個 seed 互不相同", new Set(traces).size === 5, `unique=${new Set(traces).size}/5`);

console.log("\n[3] 拒絕非固定時間步");
const g3 = createGame(1);
let threw = false;
try { tick(g3, RUN, 0.016); } catch { threw = true; }
check("dt=0.016 被拒絕", threw);
let ok60 = true;
try { tick(g3, RUN, STEP); } catch { ok60 = false; }
check("dt=1/60 被接受", ok60);

console.log("\n[4] visual 模式不得污染物理亂數流");
const h = run(777, 3600, { visual: false });
const v = run(777, 3600, { visual: true });
let diffAt = -1;
for (let i = 0; i < Math.min(h.snaps.length, v.snaps.length); i++)
  if (h.snaps[i] !== v.snaps[i]) { diffAt = i; break; }
check(
  "headless 與 visual 軌跡一致",
  diffAt === -1 && h.snaps.length === v.snaps.length,
  diffAt >= 0 ? `第 ${diffAt} 步分歧` : `particles(visual)=${v.game.particles.length} / (headless)=${h.game.particles.length}`,
);

console.log("\n[5] 效能");
const t0 = performance.now();
let steps = 0;
for (let seed = 1; seed <= 20; seed++) {
  const g = createGame(seed);
  for (let i = 0; i < STEPS && !g.dead; i++) { tick(g, scriptedAction(i)); steps++; }
}
const ms = performance.now() - t0;
const perStep = (ms * 1000) / steps;
console.log(`  ${steps.toLocaleString()} 步 / ${ms.toFixed(0)} ms = ${perStep.toFixed(2)} µs/步`);
const budget = 80 * (64 * 3 + 4) * 10800;
console.log(`  完整訓練 ${(budget / 1e6).toFixed(0)}M 步 推估單執行緒 ${((budget * perStep) / 1e6 / 60).toFixed(1)} 分鐘`);

console.log(failures === 0 ? "\n全部通過\n" : `\n${failures} 項失敗\n`);
process.exit(failures === 0 ? 0 : 1);
