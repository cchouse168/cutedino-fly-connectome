/**
 * cute-dino 確定性遊戲引擎（headless-capable）
 *
 * 由 cchouse168/cute-dino 的 index.html 抽出（原始行段見 docs/experiment.md），
 * 並施加四項改造使其可重現、可訓練：
 *   1. 全部影響物理的 Math.random() 改為種子化 state.random()
 *   2. 邏輯尺寸固定為 1280x576（原版跟著 canvas.clientWidth 變動）
 *   3. 時間步固定 1/60（原版為 rAF 變動 dt）
 *   4. 移除 DOM 寫入與音效副作用；headless 下跳過純裝飾實體
 *
 * 注意：裝飾性亂數（火花、雲、火焰音效計時）一律使用 Math.random()，
 *       絕不可動用 state.random()，否則視覺模式與 headless 模式的亂數流會分歧。
 */
import { rng } from "./rng.js";

/** 固定邏輯尺寸。原版由 canvas.clientWidth 推導，此處鎖死以確保可重現。 */
export const GEOM = {
  W: 1280,
  H: 576,
  GROUND_Y: 496, // H - 80
  LEFT_X: 256, // max(150, W*0.20)
  MAX_X: 768, // W*0.6
};

export const STEP = 1 / 60;

/** 動作索引。JUMP 為「持續按住」語意，連續選中即形成原版的長按更高跳。 */
export const ACTIONS = ["RUN", "JUMP", "DUCK", "LEFT", "RIGHT"];
export const RUN = 0, JUMP = 1, DUCK = 2, LEFT = 3, RIGHT = 4;

const INITIAL_SPEED = 300;
const INITIAL_SPEED_SCALE = 1;
const INITIAL_SPEEDUP_EVERY = 12;

export const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * @param {number} seed  賽道種子
 * @param {{visual?:boolean}} opts  visual=true 才產生雲/火花等裝飾實體
 */
export function createGame(seed, opts = {}) {
  const visual = !!opts.visual;
  const random = rng(seed);
  const s = {
    seed,
    visual,
    random,
    dead: false,
    time: 0,
    nextSpeedUpAt: INITIAL_SPEEDUP_EVERY,
    speed: INITIAL_SPEED,
    speedScale: INITIAL_SPEED_SCALE,
    speedUpEvery: INITIAL_SPEEDUP_EVERY,
    gravity: 1800,
    jumpV: -820,
    score: 0,
    obstacles: [],
    bullets: [],
    powerups: [],
    pBullets: [],
    particles: [],
    floatingScores: [],
    clouds: [],
    invincibleUntil: 0,
    night: false,
    littles: 0,
    mgUntil: 0,
    mgFireRate: 10,
    mgFireTimer: 0,
    jetCooldown: 0,
    fireUntil: 0,
    flameSfxTimer: 0,
    holdingJump: false,
    jumpHold: 0,
    jumpHoldMax: 0.18,
    // 原版這兩個計時器是模組層變數、reset() 未清除；此處納入 state 以求可重現
    spawnTimer: 0,
    powerTimer: 3.5,
    // 按鍵邊緣偵測（原版蹲下需要 keydown 邊緣且當下踩地）
    keys: { left: false, right: false, down: false },
    dino: {
      x: GEOM.LEFT_X,
      y: GEOM.GROUND_Y - 70,
      w: 70,
      h: 70,
      baseH: 70,
      crouchH: 46,
      vy: 0,
      onGround: true,
      vx: 0,
      crouch: false,
    },
    // 統計
    jumps: 0,
    ducks: 0,
    pickups: 0,
    kills: 0,
    hitsTaken: 0,
    deathCause: null,   // { kind:'obstacle'|'bullet', type, t, speedScale }
  };
  if (visual) {
    for (let i = 0; i < 6; i++) {
      s.clouds.push({
        x: Math.random() * GEOM.W,
        y: 40 + Math.random() * GEOM.H * 0.4,
        r: 20 + Math.random() * 30,
        layer: 0.3 + Math.random() * 0.4,
      });
    }
  }
  return s;
}

const rand = (s, a, b) => a + s.random() * (b - a);

function spawnObstacle(s) {
  const baseX = GEOM.W + 60;
  const G = GEOM.GROUND_Y;
  let t = "cactus";
  const r = s.random();
  if (r < 0.5) t = "cactus";
  else if (r < 0.8) t = "palm";
  else if (r < 0.88) t = "dragon";
  else t = "jet";
  if (t === "jet" && s.jetCooldown > 0) t = s.random() < 0.5 ? "cactus" : "palm";

  if (t === "cactus") {
    const h = 40 + s.random() * 60;
    s.obstacles.push({ type: t, x: baseX, y: G - h, w: 22, h });
  } else if (t === "dragon") {
    const w = 88, h = 54;
    const yBase = G - (160 + s.random() * 140);
    const amp = rand(s, 40, 80), freq = rand(s, 0.9, 1.6);
    const phase = s.random() * Math.PI * 2;
    s.obstacles.push({ type: t, x: baseX, y: yBase, w, h, y0: yBase, amp, freq, phase });
  } else if (t === "jet") {
    const h = 28, w = 90;
    const yBase = G - (120 + s.random() * 140);
    const amp = rand(s, 20, 70), freq = rand(s, 0.6, 1.2);
    const phase = s.random() * Math.PI * 2;
    s.obstacles.push({
      type: t, x: baseX, y: yBase, w, h,
      shootTimer: rand(s, 0.6, 1.8), fired: false, y0: yBase, amp, freq, phase,
    });
    s.jetCooldown = 3 + s.random() * 2;
  } else {
    const h = 60 + s.random() * 40, w = 40;
    s.obstacles.push({ type: t, x: baseX, y: G - h, w, h });
  }
}

function spawnPowerup(s) {
  const baseX = GEOM.W + 60;
  const G = GEOM.GROUND_Y;
  let pType, w, h, y;
  const r = s.random();
  if (r < 0.5) { pType = "chest"; w = 34; h = 28; y = G - h; }
  else if (r < 0.7) { pType = "star"; w = 32; h = 32; y = G - (90 + s.random() * 120); }
  else if (r < 0.85) { pType = "gun"; w = 52; h = 28; y = G - (70 + s.random() * 120); }
  else { pType = "mini"; w = 30; h = 24; y = G - h; }
  // 短路求值：score<5000 時不抽這個亂數 —— 亂數流順序必須與原版一致
  if (s.score >= 5000 && s.random() < 0.25) {
    pType = "flame"; w = 40; h = 40; y = G - (70 + s.random() * 120);
  }
  s.powerups.push({
    type: pType, x: baseX,
    y: Math.max(0, y | 0), w: Math.max(1, w | 0), h: Math.max(1, h | 0),
    spin: 0, wiggle: 0,
  });
}

function spawnSparks(s, x, y, n = 20, baseV = 340, life = 0.6, size = 4,
                     colorDay = "#ffd166", colorNight = "#ffffff") {
  if (!s.visual) return; // headless 跳過：純裝飾，且是訓練期最大的 CPU 浪費
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI - Math.PI / 2;
    const spd = baseV * (0.5 + Math.random());
    s.particles.push({
      x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd * 0.6 - 20,
      life: life * (0.8 + Math.random() * 0.4), age: 0, size, colorDay, colorNight,
    });
  }
}

function floatScore(s, text, x, y) {
  if (!s.visual) return;
  s.floatingScores.push({ text: "+" + text, x, y, age: 0, life: 0.8 });
}

/** 把 5 選 1 的動作轉成原版的按鍵狀態，含蹲下的 keydown 邊緣語意。 */
export function applyAction(s, action) {
  const d = s.dino, k = s.keys;
  const wantJump = action === JUMP;
  const wantDown = action === DUCK;

  if (wantJump) {
    if (d.onGround && !s.holdingJump) {
      d.vy = s.jumpV;
      d.onGround = false;
      s.jumpHold = 0;
      d.crouch = false;
      s.jumps++;
    }
    s.holdingJump = true;
  } else {
    s.holdingJump = false;
  }

  // 原版：keydown 邊緣且踩地才蹲；keyup 立即解除
  if (wantDown && !k.down) {
    if (d.onGround) { d.crouch = true; s.ducks++; }
  } else if (!wantDown && k.down) {
    d.crouch = false;
  }
  k.down = wantDown;
  k.left = action === LEFT;
  k.right = action === RIGHT;
}

export function tick(s, action = RUN, dt = STEP) {
  if (s.dead) return;
  if (Math.abs(dt - STEP) > 1e-12)
    throw new Error("確定性模擬器僅接受固定 1/60 時間步");
  applyAction(s, action);
  update(s, dt);
}

function update(s, dt) {
  const d = s.dino, k = s.keys, G = GEOM.GROUND_Y;
  s.time += dt;
  if (s.time >= s.nextSpeedUpAt) {
    s.speedScale = Math.min(2.0, s.speedScale + 0.04);
    s.nextSpeedUpAt += s.speedUpEvery;
  }

  const targetH = d.crouch && d.onGround ? d.crouchH : d.baseH;
  if (targetH !== d.h) { const feet = d.y + d.h; d.h = targetH; d.y = feet - d.h; }

  d.vy += s.gravity * dt;
  if (s.holdingJump && !d.onGround && d.vy < 0 && s.jumpHold < s.jumpHoldMax) {
    d.vy += -1200 * dt; s.jumpHold += dt;
  }
  if ((!s.holdingJump || s.jumpHold >= s.jumpHoldMax) && d.vy < 0) d.vy += 1200 * dt;

  d.y += d.vy * dt;
  if (d.y + d.h >= G) {
    d.y = G - d.h; d.vy = 0; d.onGround = true; s.jumpHold = 0; s.holdingJump = false;
  } else d.onGround = false;

  const ax = (k.left ? -1400 : 0) + (k.right ? 1400 : 0);
  d.vx += ax * dt; d.vx *= 0.88;
  d.vx = Math.max(-360, Math.min(360, d.vx));
  d.x += d.vx * dt;
  if (d.x < GEOM.LEFT_X) { d.x = GEOM.LEFT_X; d.vx = 0; }
  if (d.x > GEOM.MAX_X) { d.x = GEOM.MAX_X; d.vx = 0; }

  s.spawnTimer -= dt;
  s.jetCooldown = Math.max(0, s.jetCooldown - dt);
  if (s.spawnTimer <= 0) {
    spawnObstacle(s); // 先抽障礙物，再抽間距 —— 順序不可調換
    const worldVForGap = Math.max(120, s.speed * s.speedScale);
    s.spawnTimer = rand(s, 360, 720) / worldVForGap;
  }
  s.powerTimer = Math.max(-1, s.powerTimer - dt);
  if (s.powerTimer <= 0) {
    s.powerTimer = 5.5 + s.random() * 4.5; // 先重設計時器，再抽道具
    spawnPowerup(s);
  }

  const worldV = Math.max(60, s.speed * s.speedScale);

  for (const ob of s.obstacles) {
    ob.x -= worldV * dt;
    if (ob.type === "jet") {
      ob.y = ob.y0 + Math.sin(s.time * ob.freq + ob.phase) * ob.amp;
      ob.shootTimer -= dt;
      if (!ob.fired && ob.shootTimer <= 0) {
        ob.fired = true;
        s.bullets.push({ x: ob.x - 6, y: ob.y + ob.h * 0.5, w: 10, h: 4, v: worldV + 420 });
      }
    } else if (ob.type === "dragon") {
      ob.y = ob.y0 + Math.sin(s.time * ob.freq + ob.phase) * ob.amp;
    }
  }
  s.obstacles = s.obstacles.filter((ob) => ob.x + ob.w > -80);

  for (const b of s.bullets) b.x -= Math.max(120, b.v) * dt;
  s.bullets = s.bullets.filter((b) => b.x + b.w > -60);

  for (const p of s.powerups) {
    p.x -= worldV * 0.9 * dt;
    p.spin += p.type === "star" ? dt * 6 : 0;
    if (p.type === "gun" || p.type === "flame") { p.wiggle += dt * 4; p.y += Math.sin(p.wiggle) * 0.3; }
  }
  s.powerups = s.powerups.filter((p) => p.x + p.w > -60 && Number.isFinite(p.x) && Number.isFinite(p.y));

  s.score += worldV * dt * 0.02;
  s.night = (Math.floor(s.score / 1000) % 2) === 1;

  const inv = s.time < s.invincibleUntil;
  const dbox = { x: d.x - d.w * 0.45, y: d.y, w: d.w * 0.9, h: d.h };

  for (let i = s.powerups.length - 1; i >= 0; i--) {
    const p = s.powerups[i];
    if (!intersects(dbox, p)) continue;
    if (p.type === "chest") { s.score += 100; floatScore(s, 100, p.x + p.w / 2, p.y); }
    else if (p.type === "star") s.invincibleUntil = s.time + 6.0;
    else if (p.type === "gun") { s.mgUntil = s.time + 6.0; s.mgFireTimer = 0; }
    else if (p.type === "mini") s.littles++;
    else if (p.type === "flame") s.fireUntil = s.time + 6.0;
    s.pickups++;
    s.powerups.splice(i, 1);
  }

  if (inv) {
    for (let j = s.obstacles.length - 1; j >= 0; j--) {
      const ob = s.obstacles[j];
      if (intersects(dbox, { x: ob.x, y: ob.y, w: ob.w, h: ob.h })) {
        spawnSparks(s, ob.x + ob.w * 0.5, ob.y + ob.h * 0.5, 22, 360, 0.7, 5);
        s.obstacles.splice(j, 1);
      }
    }
    for (let m = s.bullets.length - 1; m >= 0; m--) {
      const b = s.bullets[m];
      if (intersects(dbox, b)) { spawnSparks(s, b.x, b.y, 14, 320, 0.6, 4); s.bullets.splice(m, 1); }
    }
  } else {
    let collided = null;
    for (let j = s.obstacles.length - 1; j >= 0; j--) {
      const ob = s.obstacles[j];
      if (intersects(dbox, { x: ob.x, y: ob.y, w: ob.w, h: ob.h })) {
        collided = { kind: "obstacle", type: ob.type };
        spawnSparks(s, ob.x + ob.w * 0.5, ob.y + ob.h * 0.5, 20, 340, 0.6, 4);
        s.obstacles.splice(j, 1);
        break;
      }
    }
    for (let m = s.bullets.length - 1; m >= 0 && !collided; m--) {
      const b = s.bullets[m];
      if (intersects(dbox, b)) {
        collided = { kind: "bullet", type: "jet-bullet" };
        spawnSparks(s, b.x, b.y, 14, 320, 0.5, 4);
        s.bullets.splice(m, 1);
        break;
      }
    }
    if (collided) {
      s.hitsTaken++;
      if (s.littles > 0) s.littles--;
      else {
        s.dead = true;
        s.deathCause = { ...collided, t: s.time, speedScale: s.speedScale };
        return;
      }
    }
  }

  if (s.time < s.mgUntil) {
    s.mgFireTimer -= dt;
    if (s.mgFireTimer <= 0) {
      s.mgFireTimer = 1.0 / s.mgFireRate;
      s.pBullets.push({ x: d.x + d.w * 0.5, y: d.y + d.h * 0.45, w: 12, h: 3, v: 720 });
    }
  }
  for (const pb of s.pBullets) pb.x += pb.v * dt;

  if (s.time < s.fireUntil) {
    if (s.visual) {
      s.flameSfxTimer -= dt;
      if (s.flameSfxTimer <= 0) s.flameSfxTimer = 0.18 + Math.random() * 0.1;
    }
    const fx = d.x + d.w * 0.35, fy = d.y + d.h * 0.18, fw = 240, fh = d.h * 0.7;
    const flameBox = { x: fx, y: fy - fh * 0.5, w: fw, h: fh };
    for (let j = s.obstacles.length - 1; j >= 0; j--) {
      const ob = s.obstacles[j];
      if (intersects(flameBox, { x: ob.x, y: ob.y, w: ob.w, h: ob.h })) {
        s.score += 40; s.kills++;
        floatScore(s, 40, ob.x + ob.w / 2, ob.y);
        spawnSparks(s, ob.x + ob.w * 0.5, ob.y + ob.h * 0.5, 18, 320, 0.55, 4.5);
        s.obstacles.splice(j, 1);
      }
    }
    for (let m = s.bullets.length - 1; m >= 0; m--) {
      const b = s.bullets[m];
      if (intersects(flameBox, b)) {
        spawnSparks(s, b.x + b.w * 0.5, b.y + b.h * 0.5, 12, 280, 0.45, 4);
        s.bullets.splice(m, 1);
      }
    }
  }

  for (let i = s.pBullets.length - 1; i >= 0; i--) {
    const pb = s.pBullets[i];
    let hit = false;
    for (let j = s.obstacles.length - 1; j >= 0; j--) {
      const ob = s.obstacles[j];
      if (!intersects(pb, { x: ob.x, y: ob.y, w: ob.w, h: ob.h })) continue;
      hit = true;
      const sx = ob.x + ob.w * 0.6, sy = ob.y + ob.h * 0.5;
      spawnSparks(s, sx, sy, 26, 380, 0.75, 5);
      let add = 0;
      if (ob.type === "jet") {
        if (s.random() < 0.6) { add = 150; s.obstacles.splice(j, 1); }
      } else if (ob.type === "dragon") { add = 90; s.obstacles.splice(j, 1); }
      else { add = ob.type === "cactus" ? 60 : 80; s.obstacles.splice(j, 1); }
      if (add > 0) { s.score += add; s.kills++; floatScore(s, add, sx, sy); }
      break;
    }
    if (hit || pb.x > GEOM.W + 60) s.pBullets.splice(i, 1);
  }

  if (s.visual) {
    for (const p of s.particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt * 0.6; }
    s.particles = s.particles.filter((p) => p.age < p.life);
    for (const f of s.floatingScores) { f.age += dt; f.y -= 25 * dt; }
    s.floatingScores = s.floatingScores.filter((f) => f.age < f.life);
    for (const c of s.clouds) {
      c.x -= worldV * c.layer * dt * 0.3;
      if (c.x + c.r < -40) { c.x = GEOM.W + c.r; c.y = 40 + Math.random() * GEOM.H * 0.4; }
    }
  }
}

export const score = (s) => Math.floor(s.score);
