/**
 * 觀測編碼 + 可訓練讀出網路。
 *
 * 資料流：13 個工程特徵 → 32 顆輸入細胞 → （80 細胞電路，3 輪傳播）
 *        → 16 顆下行神經元 → 16→12→5 讀出 → argmax 動作
 *
 * 只有讀出網路的 269 個參數可訓練；電路權重全部固定。
 */
import { GEOM, RUN, JUMP, DUCK, LEFT, RIGHT } from "../engine/game.js";

export const NETWORK = {
  inputs: 16, // 下行神經元數
  hidden: 12,
  outputs: 5, // RUN / JUMP / DUCK / LEFT / RIGHT
  get parameters() {
    return this.inputs * this.hidden + this.hidden + this.hidden * this.outputs + this.outputs;
  },
  decisionSteps: 2, // 60 Hz 模擬下每 2 步決策一次 = 30 Hz
  version: "cutedino-malecns-connectome-v1",
};

export const ACTION_LABELS = ["RUN", "JUMP", "DUCK", "LEFT", "RIGHT"];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 子彈通道的感知視野，維持與其他通道相同的 1.5 秒。
 *
 * 曾經改成 0.7 秒，理由是：平台期子彈速度 1020 px/s，1.5s 等於感知範圍 1530px，
 * 但畫面上子彈最遠只出現在約 1053px，導致 ch7 的值域永遠壓在 0.31–1.00，
 * 浪費三成解析度；而子彈是最大單一死因（46%）。
 *
 * 三種子對照下 0.7 秒的成績較差（46→34、87→86、82→49），但配對檢定
 * t=-1.63 (df=2) p=0.24，**沒有達到顯著**（node scripts/power.mjs）。
 *
 * 更關鍵的是：把 1.5 訓練出來的權重原封不動丟到 0.7 的環境評估，得到 83/100・160.7s，
 * 與原環境的 82/100・161.1s 幾乎一致 —— 同一組權重、只換 horizon，成績不動。
 * 所以這個參數在測得出的範圍內不重要，V3 的退步來自 CEM 搜尋路徑分歧。
 *
 * 維持 1.5，理由是「沒有理由改」，不是「1.5 被證明更好」。
 */
const BULLET_HORIZON = 1.5;

/** 撞擊倒數：距離除以接近速度再正規化，讓速度資訊內建，省下一個通道。 */
const impact = (gap, closingSpeed, horizon = 1.5) =>
  closingSpeed <= 0 ? 0 : 1 - clamp01(gap / closingSpeed / horizon);

/** 相對高度差 → 0..1，0.5 表示等高。 */
const relY = (dy, span = 300) => clamp01(dy / span / 2 + 0.5);

/**
 * 由遊戲狀態算出 13 個特徵，順序必須與 data/channels.json 的 channels[].index 一致。
 * @returns {number[]} 長度 13，值域 0..1
 */
export function observe(s) {
  const d = s.dino;
  const dinoRight = d.x + d.w * 0.45;
  const dinoLeft = d.x - d.w * 0.45;
  const dinoCy = d.y + d.h * 0.5;
  const G = GEOM.GROUND_Y;
  const worldV = Math.max(60, s.speed * s.speedScale);

  // 尚未通過 dino 的障礙物，依水平距離排序取最近兩個
  const ahead = s.obstacles
    .filter((o) => o.x + o.w > dinoLeft)
    .sort((a, b) => a.x - b.x);
  const o1 = ahead[0], o2 = ahead[1];

  // 子彈向左飛，接近速度是它自己的速度
  let bullet = null, bulletGap = Infinity;
  for (const b of s.bullets) {
    const gap = b.x - dinoRight;
    if (b.x + b.w > dinoLeft && gap < bulletGap) { bullet = b; bulletGap = gap; }
  }

  // 道具以 worldV*0.9 移動
  let pu = null, puGap = Infinity;
  for (const p of s.powerups) {
    const gap = p.x - dinoRight;
    if (p.x + p.w > dinoLeft && gap < puGap) { pu = p; puGap = gap; }
  }

  const invLeft = Math.max(0, s.invincibleUntil - s.time);

  return [
    /* 0  障礙物撞擊倒數    */ o1 ? impact(Math.max(0, o1.x - dinoRight), worldV) : 0,
    /* 1  障礙物底端離地高  */ o1 ? clamp01((G - (o1.y + o1.h)) / 300) : 0,
    /* 2  玩家離地高度      */ clamp01((G - (d.y + d.h)) / 240),
    /* 3  障礙物頂端離地高  */ o1 ? clamp01((G - o1.y) / 300) : 0,
    /* 4  次近障礙物倒數    */ o2 ? impact(Math.max(0, o2.x - dinoRight), worldV) : 0,
    /* 5  玩家垂直速度      */ clamp01(d.vy / 900 / 2 + 0.5),
    /* 6  是否踩地          */ d.onGround ? 1 : 0,
    /* 7  子彈撞擊倒數      */ bullet ? impact(Math.max(0, bulletGap), Math.max(120, bullet.v), BULLET_HORIZON) : 0,
    /* 8  子彈相對高度差    */ bullet ? relY(bullet.y + bullet.h * 0.5 - dinoCy) : 0.5,
    /* 9  道具接近倒數      */ pu ? impact(Math.max(0, puGap), worldV * 0.9) : 0,
    /* 10 道具相對高度差    */ pu ? relY(pu.y + pu.h * 0.5 - dinoCy) : 0.5,
    /* 11 玩家水平位置      */ clamp01((d.x - GEOM.LEFT_X) / (GEOM.MAX_X - GEOM.LEFT_X)),
    /* 12 護盾狀態          */ Math.max(clamp01(invLeft / 6), s.littles > 0 ? 0.5 : 0),
  ];
}

/**
 * 回報 observe() 當下鎖定的三個目標，供畫面疊圖用。
 * 選取邏輯必須與 observe() 完全一致，否則疊圖會騙人。
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

/** 16→12→5，tanh 隱藏層，線性輸出。 */
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

/** 完整決策：觀測 → 電路 → 讀出。 */
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
 * 手寫規則基線：不使用連接體、不使用神經網路，純幾何門檻。
 * 需處理 cute-dino 特有的正弦擺動 dragon/jet 與高速子彈。
 */
export function ruleAction(s) {
  const d = s.dino;
  const dinoRight = d.x + d.w * 0.45;
  const dinoLeft = d.x - d.w * 0.45;
  const dinoCy = d.y + d.h * 0.5;
  const G = GEOM.GROUND_Y;
  const worldV = Math.max(60, s.speed * s.speedScale);

  // 子彈最優先：命中即死（除非有護盾）
  for (const b of s.bullets) {
    const gap = b.x - dinoRight;
    if (gap < 0 || gap > worldV * 0.6) continue;
    const dy = b.y + b.h * 0.5 - dinoCy;
    if (Math.abs(dy) < 45) return dy < -6 ? DUCK : JUMP; // 子彈偏高就蹲，偏低就跳
  }

  const ahead = s.obstacles.filter((o) => o.x + o.w > dinoLeft).sort((a, b) => a.x - b.x);
  const o = ahead[0];
  if (o) {
    const gap = o.x - dinoRight;
    const bottom = G - (o.y + o.h); // 障礙物底端離地高
    const lead = worldV * 0.34 + o.w * 0.12;
    if (gap < lead && gap > -o.w) {
      // 底端夠高 → 可以從下方蹲過去；否則跳
      if (bottom > 52) return DUCK;
      return JUMP;
    }
    // 仍在空中且正在上升 → 續按以拉高跳躍
    if (!d.onGround && d.vy < 0 && gap < lead * 1.8) return JUMP;
  }

  // 沒有立即威脅時去撿道具
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
