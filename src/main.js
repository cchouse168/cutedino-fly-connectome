/**
 * 主程式：把遊戲、連接體、讀出網路與四個視覺化面板接起來。
 */
import { createGame, tick, score, STEP, RUN, ACTIONS } from "./engine/game.js";
import { createRenderer } from "./engine/render.js";
import { Connectome } from "./lib/connectome.js";
import { NETWORK, observe, forward, targets, ruleAction } from "./lib/policy.js";
import { rng, gaussian } from "./engine/rng.js";
import { Trainer, TRAINING } from "./lib/training.js";
import { loadAtlas, createBrainView } from "./ui/brain.js";
import { loadFly, createFlyView, ACTION_KEYS } from "./ui/fly.js";
import { t, tList, setLang, onLangChange, applyStatic } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const json = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);

const [graph, channelMap, model, bench, training, reps] = await Promise.all([
  json("data/connectome.json"),
  json("data/channels.json"),
  json("models/model.json"),
  json("models/benchmark.json"),
  json("models/training.json"),
  json("models/replicates.json"),
]);

const brain = new Connectome(graph, channelMap);
const CH = channelMap.channels;
let curveHistory = training?.history ?? [];
let liveModel = null; // 瀏覽器內訓練產出的模型，優先於 models/model.json

$("statCh").textContent = CH.length;

/** 方法章節的四個步驟：內含通道數與 <code>，所以由 JS 組出來而非 data-i18n。 */
function paintSteps() {
  for (let i = 1; i <= 4; i++) $(`step${i}Body`).innerHTML = t(`step${i}Body`, { n: CH.length });
}

const untrainedWeights = Array.from(
  { length: NETWORK.parameters },
  (() => { const r = rng(model?.trainingSeed ?? 1); return () => gaussian(r) * 0.7; })(),
);

// ---------------------------------------------------------------- 遊戲
const render = createRenderer($("game"));
let game, speedMul = 1, playing = true, decision = null, frame = 0, action = RUN;
let randomStream = rng(1);

function newGame(seed = (Math.random() * 900000) | 0) {
  game = createGame(seed, { visual: true });
  brain.reset();
  randomStream = rng(seed ^ 0x5bf03635);
  frame = 0; action = RUN; decision = null;
  $("hudSeed").textContent = "seed " + seed;
}

const currentWeights = () =>
  $("selMode").value === "untrained"
    ? untrainedWeights
    : liveModel?.weights ?? model?.weights ?? untrainedWeights;

function decideNow() {
  const mode = $("selMode").value;
  if (mode === "rule" || mode === "random") {
    decision = null;
    brain.reset(); // 不清空的話大腦面板會停在上一次的活性，誤導成電路仍在運作
    return mode === "rule" ? ruleAction(game) : Math.floor(randomStream() * NETWORK.outputs);
  }
  const features = observe(game);
  const dn = brain.step(features, mode === "ablated");
  const d = forward(currentWeights(), dn);
  decision = { ...d, features, dn: dn.slice() };
  return d.action;
}

function step() {
  if (game.dead) return;
  if (frame % NETWORK.decisionSteps === 0) action = decideNow();
  tick(game, action);
  frame++;
}

// ---------------------------------------------------------------- 主迴圈
let acc = 0, last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;

  if (playing && !game.dead) {
    acc += dt * speedMul;
    let guard = 0;
    while (acc >= STEP && guard++ < 600) { step(); acc -= STEP; }
  }

  render(game, $("chkOverlay").checked ? targets(game) : null);
  paintStatus();
  paintFeatures();
  paintDecide();
  if (flyView) flyView.render(action, dt);
  if (brainView) { brainView.tick(dt); paintBrain(); }
}

function paintStatus() {
  $("hudScore").textContent = t("score") + " " + score(game);
  $("hudTime").textContent = game.time.toFixed(1) + "s" + (game.dead ? " · " + t("dead") : "");
  $("hudSpeed").textContent = t("difficulty") + " " + game.speedScale.toFixed(2) + "×";
  $("hudHp").textContent = "HP " + (1 + game.littles);
  const inv = game.time < game.invincibleUntil;
  $("hudHp").className = "chip" + (inv ? " on" : "");
  $("hudTime").className = "chip" + (game.dead ? " dead" : "");

  $("runDot").className = "dot" + (game.dead ? " dead" : playing ? "" : " off");
  $("runState").textContent = game.dead ? t("deadState") : playing ? t("running") : t("paused");
  $("btnPlay").textContent = playing ? t("pause") : t("resume");

  // 冠軍代數在下方的基準說明與 replicate 表都已列出，狀態列再寫一次只是噪音
  $("runMeta").textContent = $("selMode").selectedOptions[0].textContent;

  const cfg = ACTION_KEYS[action] ?? ACTION_KEYS[0];
  $("flyTag").textContent = `${ACTIONS[action]}   ${cfg.label}`;
  // 動作名稱沿用 ACTIONS 常數，與 02 決策網路、03 鍵盤輸出 用同一套字，不另外翻譯
  $("hudAction").textContent = ACTIONS[action];
}

// ---------------------------------------------------------------- 05 感官通道
const featRows = CH.map((c) => {
  const row = document.createElement("div");
  row.className = "fx";
  row.innerHTML =
    `<div class="nm"></div><div class="vl">0.00</div>` +
    `<div class="bar"><i></i></div>` +
    `<div class="ct">${c.cellType}${c.mode === "whole" ? " ×4" : c.mode === "half-a" ? "·a" : "·b"}</div>`;
  $("feats").appendChild(row);
  return { fill: row.querySelector("i"), vl: row.querySelector(".vl"), nm: row.querySelector(".nm") };
});

/** 通道名稱跟著語言走；channels.json 的 label 當作沒有翻譯時的退路。 */
function paintFeatureLabels() {
  const names = tList("channels");
  featRows.forEach((r, i) => {
    r.nm.textContent = names[i] ?? CH[i].label;
    r.nm.title = r.nm.textContent; // 超過兩行時滑過去仍看得到完整名稱
  });
}

function paintFeatures() {
  const f = decision?.features ?? observe(game);
  for (let i = 0; i < featRows.length; i++) {
    const v = f[i] ?? 0, r = featRows[i];
    r.fill.style.width = (v * 100).toFixed(1) + "%";
    r.fill.style.background = v > 0.66 ? "var(--danger)" : v > 0.33 ? "var(--warn)" : "var(--accent)";
    r.vl.textContent = v.toFixed(2);
  }
}

// ---------------------------------------------------------------- 02 決策網路
const dc = $("decide"), dctx = dc.getContext("2d");
const DN_LABELS = graph.outputs.map((i) => graph.nodes[i].type);

function paintDecide() {
  const W = dc.width, H = dc.height;
  dctx.clearRect(0, 0, W, H);
  dctx.fillStyle = "#04070c"; dctx.fillRect(0, 0, W, H);

  if (!decision) {
    dctx.fillStyle = "#5d6d84"; dctx.font = "14px system-ui, sans-serif"; dctx.textAlign = "left";
    dctx.fillText(t("decideUnused"), 20, 32);
    return;
  }
  const { dn, hidden, scores, action: act } = decision;
  const colH = 400, colA = 610;

  dctx.font = "12px ui-monospace, monospace"; dctx.fillStyle = "#e8ecf1";
  dctx.textAlign = "left"; dctx.fillText(t("dnColumn"), 26, 22);
  dctx.textAlign = "center"; dctx.fillText(t("hiddenColumn"), colH, 22);
  dctx.fillText(t("actionColumn"), colA, 22);

  const dnY = (i) => 40 + i * 22.2;
  const hY = (i) => 48 + i * 27.5;
  const aY = (i) => 96 + i * 54;

  const w = currentWeights();
  const dnMax = Math.max(0.5, ...dn.map(Math.abs));

  /**
   * 一條連線，強度 m = |權重| × |前一層活性|。
   *
   * m 是兩個 ≤1 的量相乘，典型值只有 0.1 上下 —— 直接拿來當 alpha 等於沒畫。
   * 所以先用 0.5 次方把中低段拉起來，再加一個 MIN_A 下限：只要決定要畫，
   * 就一定看得見；強弱改由「多亮 + 多粗」一起表達，而不是靠肉眼分辨 0.04 和 0.09。
   *
   * 對應地把門檻調高（弱連線直接不畫），否則 16×12 + 12×5 = 252 條全部畫亮會糊成一片。
   */
  const MIN_A = 0.22;
  const link = (x1, y1, x2, y2, wt, act, peak, cut) => {
    const m = Math.min(1, Math.abs(wt) / 1.6) * Math.min(1, Math.abs(act));
    if (m < cut) return;
    const a = MIN_A + Math.sqrt(m) * (peak - MIN_A);
    dctx.strokeStyle = wt >= 0 ? `rgba(249,115,22,${a})` : `rgba(56,189,248,${a})`;
    dctx.lineWidth = m > 0.3 ? 1.8 : 1.1; // 1px 斜線會被反鋸齒攤成兩格，看起來更淡
    dctx.beginPath(); dctx.moveTo(x1, y1); dctx.lineTo(x2, y2); dctx.stroke();
  };

  // 下行神經元 → 隱藏層：16×12 條，最密的一束，門檻較高、峰值較低
  // 權重排列見 policy.js forward()：隱藏單元 h 的第 i 個輸入在 h*(inputs+1)+i
  for (let h = 0; h < NETWORK.hidden; h++)
    for (let i = 0; i < NETWORK.inputs; i++)
      link(169, dnY(i), colH - 12, hY(h), w[h * (NETWORK.inputs + 1) + i], dn[i] / dnMax, 0.72, 0.10);

  // 隱藏層 → 動作：只有 60 條，畫滿也不會亂
  const base = NETWORK.inputs * NETWORK.hidden + NETWORK.hidden;
  for (let a = 0; a < NETWORK.outputs; a++)
    for (let h = 0; h < NETWORK.hidden; h++)
      link(colH + 14, hY(h), colA - 66, aY(a), w[base + a * (NETWORK.hidden + 1) + h], hidden[h], 0.95, 0.05);

  // 16 顆下行神經元。名稱最長 DNpe052（7 字元），13px 等寬約 55px，
  // 右對齊在 x=88 → 左緣約 33，不會超出畫布。
  dctx.font = "13px ui-monospace, monospace";
  for (let i = 0; i < dn.length; i++) {
    const y = dnY(i), m = Math.min(1, Math.abs(dn[i]) / dnMax);
    dctx.textAlign = "right"; dctx.fillStyle = "#e8ecf1";
    dctx.fillText(DN_LABELS[i], 88, y + 4.5);
    dctx.fillStyle = dn[i] >= 0 ? `rgba(249,115,22,${0.28 + m * 0.72})` : `rgba(56,189,248,${0.28 + m * 0.72})`;
    dctx.fillRect(96, y - 6, 3 + m * 66, 12);
    dctx.strokeStyle = "#1c2534"; dctx.lineWidth = 1; dctx.strokeRect(96, y - 6, 69, 12);
  }

  // 12 個隱藏單元
  for (let h = 0; h < hidden.length; h++) {
    const y = hY(h), m = Math.min(1, Math.abs(hidden[h]));
    dctx.fillStyle = hidden[h] >= 0 ? `rgba(249,115,22,${0.25 + m * 0.75})` : `rgba(56,189,248,${0.25 + m * 0.75})`;
    dctx.beginPath(); dctx.arc(colH, y, 4 + m * 6, 0, Math.PI * 2); dctx.fill();
  }

  // 5 個動作分數
  const sMin = Math.min(...scores), sMax = Math.max(...scores);
  const span = Math.max(0.6, sMax - sMin);
  for (let i = 0; i < scores.length; i++) {
    const y = aY(i), m = (scores[i] - sMin) / span, hot = i === act;
    dctx.fillStyle = hot ? "rgba(61,220,132,.85)" : "rgba(93,109,132,.35)";
    dctx.fillRect(colA - 60, y - 12, 10 + m * 90, 24);
    dctx.textAlign = "left";
    dctx.fillStyle = hot ? "#eafff2" : "#e8ecf1";
    dctx.font = (hot ? "bold " : "") + "14px system-ui, sans-serif";
    dctx.fillText(ACTIONS[i], colA - 54, y + 5);
    // 分數靠右對齊到畫布邊界內側，放大後才不會被 720px 的寬度切掉
    dctx.textAlign = "right";
    dctx.fillStyle = hot ? "#f2f5f8" : "#cfd8e3";
    dctx.font = (hot ? "bold " : "") + "16px ui-monospace, monospace";
    dctx.fillText(scores[i].toFixed(2), 714, y + 6);
  }
}

// ---------------------------------------------------------------- 03/04 大型資產
let flyView = null, brainView = null;

// 兩個面板的註腳會因載入結果而不同，記成 key + 參數才能跟著語言重畫
let flyNote = { key: "flyNote" }, brainNote = null;

function paintNotes() {
  $("flyNote").textContent = t(flyNote.key, flyNote.vars);
  if (brainNote) $("brainNote").textContent = t(brainNote.key, brainNote.vars);
}

loadFly()
  .then((fly) => {
    flyView = createFlyView($("fly"), fly);
    if (!flyView) flyNote = { key: "flyNoWebgl" };
    paintNotes();
  })
  .catch((e) => { flyNote = { key: "flyFail", vars: { msg: e.message } }; paintNotes(); console.error(e); });

loadAtlas()
  .then((atlas) => {
    brainView = createBrainView($("brain"), atlas, graph, channelMap);
    brainNote = { key: "brainNoteFmt", vars: { n: atlas.count.toLocaleString() } };
    paintNotes();
  })
  .catch((e) => { brainNote = { key: "atlasFail", vars: { msg: e.message } }; paintNotes(); console.error(e); });

function paintBrain() {
  brainView.render(brain.activity);
  let s = 0;
  for (let i = 0; i < brain.activity.length; i++) s += Math.abs(brain.activity[i]);
  $("brainTag").textContent = t("brainTagFmt", { v: (s / brain.activity.length).toFixed(3) });
}

/** 兩顆按鈕的文字是「按下去會發生什麼」，所以與當前狀態相反。 */
function paintBrainButtons() {
  $("btnFocus").textContent = t(brainView?.state.focus ? "showAll" : "focus");
  $("btnOrbit").textContent = t(brainView?.state.orbit === false ? "startOrbit" : "stopOrbit");
}
$("btnFocus").onclick = () => {
  if (!brainView) return;
  brainView.state.focus = !brainView.state.focus;
  paintBrainButtons();
};
$("btnOrbit").onclick = () => {
  if (!brainView) return;
  brainView.state.orbit = !brainView.state.orbit;
  paintBrainButtons();
};

// ---------------------------------------------------------------- 訓練曲線
function paintCurve() {
  const el = $("curve"), x = el.getContext("2d");
  const W = el.width, H = el.height;
  x.clearRect(0, 0, W, H);
  x.fillStyle = "#04070c"; x.fillRect(0, 0, W, H);
  const h = curveHistory;
  if (!h?.length) {
    x.fillStyle = "#5d6d84"; x.font = "14px system-ui, sans-serif"; x.textAlign = "left";
    x.fillText(t("curveEmpty"), 20, 34);
    $("curveMeta").textContent = "—";
    return;
  }
  const pad = { l: 62, r: 16, t: 16, b: 26 };
  const w = W - pad.l - pad.r, hh = H - pad.t - pad.b;
  const maxY = Math.max(...h.map((r) => Math.max(r.validation, r.bestFitness))) * 1.06;
  const X = (i) => pad.l + (h.length === 1 ? 0 : (i / (h.length - 1)) * w);
  const Y = (v) => pad.t + hh - (v / maxY) * hh;

  x.lineWidth = 1; x.font = "10px ui-monospace, monospace"; x.textAlign = "right";
  for (let g = 0; g <= 4; g++) {
    const y = pad.t + (hh * g) / 4;
    x.strokeStyle = "#1c2534";
    x.beginPath(); x.moveTo(pad.l, y); x.lineTo(pad.l + w, y); x.stroke();
    x.fillStyle = "#5d6d84"; x.fillText(Math.round((maxY * (4 - g)) / 4), pad.l - 8, y + 3.5);
  }
  const line = (key, color, width) => {
    x.strokeStyle = color; x.lineWidth = width; x.beginPath();
    h.forEach((r, i) => (i ? x.lineTo(X(i), Y(r[key])) : x.moveTo(X(i), Y(r[key]))));
    x.stroke();
  };
  line("bestFitness", "rgba(124,196,255,.4)", 1);
  line("validation", "#3ddc84", 2);

  x.textAlign = "left"; x.font = "11px system-ui, sans-serif";
  const legendW = Math.max(x.measureText(t("curveValidation")).width, 56) + 18;
  x.fillStyle = "#3ddc84"; x.fillText(t("curveValidation"), pad.l + w - 78 - legendW, pad.t + 14);
  x.fillStyle = "rgba(124,196,255,.85)"; x.fillText(t("curveBest"), pad.l + w - 78, pad.t + 14);
  $("curveMeta").textContent = t("curveMetaFmt", {
    g: h.length, e: h.at(-1).episodes.toLocaleString(), v: h.at(-1).validation.toFixed(0),
  });
}

function paintBench() {
  const tb = $("bench").querySelector("tbody");
  if (!bench?.results) {
    tb.innerHTML = `<tr><td style="color:var(--dim)">${t("benchEmpty")}</td></tr>`;
    return;
  }
  // 對照組名稱在 benchmark.json 裡是中文，顯示時一律改用字典（順序由 benchmark.js 固定）
  const groups = tList("groups");
  tb.innerHTML =
    `<tr><th>${t("thGroup")}</th><th>${t("thDone")}</th><th>${t("thMeanS")}</th><th>${t("thMedianS")}</th>` +
    `<th>${t("thMeanScore")}</th><th>${t("thPickups")}</th><th>${t("thKills")}</th></tr>` +
    bench.results.map((r, i) =>
      `<tr class="${i === 0 ? "hero-row" : i === 1 || i === 2 ? "abl" : ""}">` +
      `<td>${groups[i] ?? r.name}</td><td class="num">${r.completed}/${r.courses}</td>` +
      `<td class="num">${r.meanSeconds.toFixed(1)}s</td>` +
      `<td class="num">${r.medianSeconds.toFixed(1)}s</td>` +
      `<td class="num">${Math.round(r.meanScore)}</td>` +
      `<td class="num">${r.meanPickups.toFixed(1)}</td>` +
      `<td class="num">${r.meanKills.toFixed(1)}</td></tr>`).join("");

  const [full, silenced, untrained] = bench.results;
  const rs = full.meanSeconds / Math.max(0.01, silenced.meanSeconds);
  const ru = full.meanSeconds / Math.max(0.01, untrained.meanSeconds);
  const ok = rs > 2 && ru > 2;
  $("claim").className = "claim" + (ok ? "" : " bad");
  // 消融後的秒數本身比「掉到 1/46」好懂：46 的分母是環境地板（撞上第一個障礙物的時間），
  // 不是一個有刻度的量 —— 講成倍率會讓人以為消融組還有程度之分。
  $("claim").innerHTML = ok
    ? t("claimOkFmt", { s: silenced.meanSeconds.toFixed(1), u: untrained.meanSeconds.toFixed(1) })
    : t("claimBadFmt", { rs: rs.toFixed(1), ru: ru.toFixed(1) });
  $("benchNote").textContent = t("benchNoteFmt", {
    a: bench.config.seedRange[0], b: bench.config.seedRange[1], s: bench.config.seconds,
    g: bench.model.generation, seed: bench.model.trainingSeed,
  });
}

/**
 * Replicate：用不同訓練種子重跑整條管線的結果。
 * 要看的是消融比的離散程度 —— 絕對分數本來就會因種子而異，
 * 但若電路真有貢獻，消融後的崩潰應該每次都出現。
 */
function paintReplicates() {
  if (!reps?.replicates?.length) return;
  $("repPanel").hidden = false;
  $("repMeta").textContent = t("repMetaFmt", { n: reps.replicates.length, g: reps.generations });
  $("reps").querySelector("tbody").innerHTML =
    `<tr><th>${t("thSeed")}</th><th>${t("thGen")}</th><th>${t("thVal")}</th><th>${t("thDone")}</th>` +
    `<th>${t("thMeanS")}</th><th>${t("thAbl")}</th><th>${t("thUntr")}</th><th>${t("thRule")}</th></tr>` +
    reps.replicates.map((r) =>
      `<tr><td class="num">${r.seed}</td><td class="num">${r.generation}</td>` +
      `<td class="num">${Math.round(r.validation)}</td>` +
      `<td class="num">${r.completed}/100</td>` +
      `<td class="num">${r.meanSeconds.toFixed(1)}s</td>` +
      `<td class="num">${r.ablationRatio.toFixed(1)}×</td>` +
      `<td class="num">${r.untrainedRatio.toFixed(1)}×</td>` +
      `<td class="num">${r.ruleRatio.toFixed(2)}×</td></tr>`).join("") +
    (() => {
      const a = reps.aggregate;
      return `<tr class="hero-row"><td>${t("thAvg")}</td><td></td><td></td>` +
        `<td class="num">${a.completed.mean.toFixed(1)} ± ${a.completed.sd.toFixed(1)}</td>` +
        `<td class="num">${a.meanSeconds.mean.toFixed(1)} ± ${a.meanSeconds.sd.toFixed(1)}s</td>` +
        `<td class="num">${a.ablationRatio.mean.toFixed(1)} ± ${a.ablationRatio.sd.toFixed(1)}×</td>` +
        `<td></td><td class="num">${a.ruleRatio.mean.toFixed(2)} ± ${a.ruleRatio.sd.toFixed(2)}×</td></tr>`;
    })();
  const a = reps.aggregate;
  const stable = a.ablationRatio.mean - a.ablationRatio.sd > 2;
  $("repNote").textContent = t(stable ? "repStable" : "repUnstable");
}

// ---------------------------------------------------------------- 控制
/**
 * 統一的重玩入口：newGame() 本身不會恢復播放狀態，
 * 死亡後若只呼叫 newGame() 畫面會卡住（loop 裡 `playing && !game.dead` 永遠不成立，
 * 因為死亡當下 playing 通常還是 true 但下一輪判斷會因新賽道而正常，
 * 但若原本是暫停狀態則新賽道也不會自動播放）—— 這裡確保重玩後一定是播放中。
 */
function replay(seed) {
  newGame(seed);
  playing = true;
  last = performance.now(); // 按鈕文字由 paintStatus() 依 playing 決定
}

$("btnPlay").onclick = () => {
  if (game.dead) { replay(game.seed); return; } // 死亡時「繼續」鍵改為重玩同一賽道
  playing = !playing;
  last = performance.now();
};
$("btnReplay").onclick = () => replay(game.seed);
$("btnNew").onclick = () => replay((Math.random() * 900000) | 0);
$("selMode").onchange = () => replay(game.seed);
$("selSpeed").onchange = (e) => (speedMul = Number(e.target.value));
addEventListener("keydown", (e) => {
  if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
  if (e.code === "Space") { e.preventDefault(); $("btnPlay").click(); } // 死亡時等同重玩本賽道
  if (e.key === "r" || e.key === "R") replay(game.seed);
  if (e.key === "n" || e.key === "N") replay((Math.random() * 900000) | 0);
});

if (!model) $("selMode").value = "rule"; // 缺模型時預設跑手寫規則，訊息由 paintAllText() 寫

// ---------------------------------------------------------------- 瀏覽器內訓練
const POOL = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 12));
let pool = null, busy = false;

const spawnPool = () =>
  Promise.all(Array.from({ length: POOL }, () =>
    new Promise((resolve) => {
      const w = new Worker(new URL("./lib/train.worker.js", import.meta.url), { type: "module" });
      w.onmessage = (e) => { if (e.data.type === "ready") resolve(w); };
      w.postMessage({ type: "init", graph, channelMap });
    })));

const evalOn = (w, msg) =>
  new Promise((resolve) => {
    const prev = w.onmessage;
    w.onmessage = (e) => { if (e.data.type === "fits") { w.onmessage = prev; resolve(e.data.fits); } };
    w.postMessage({ type: "eval", ...msg });
  });

/** 把一批工作平均切給 worker 池，回傳與輸入順序一致的結果。 */
async function scatter(items, seeds, seconds) {
  const chunks = Array.from({ length: pool.length }, () => []);
  items.forEach((x, i) => chunks[i % pool.length].push(x));
  const parts = await Promise.all(
    chunks.map((c, i) => (c.length ? evalOn(pool[i], { candidates: c, seeds, seconds, id: i }) : [])),
  );
  const out = new Array(items.length);
  chunks.forEach((c, i) => c.forEach((_, j) => { out[j * pool.length + i] = parts[i][j]; }));
  return out;
}

$("btnTrain").onclick = async () => {
  if (busy) return;
  busy = true;
  const btn = $("btnTrain"), stat = $("trainStat");
  const gens = Number($("selGens").value);
  btn.disabled = true;
  stat.className = "tstat run";
  stat.removeAttribute("data-i18n"); // 之後都是動態訊息，別讓語言切換把它蓋回預設文案
  stat.textContent = t("trainStarting", { n: POOL });

  try {
    if (!pool) pool = await spawnPool();
    const trainer = new Trainer((Math.random() * 9e6) | 0, graph, channelMap);
    curveHistory = [];
    const t0 = performance.now();

    for (let g = 0; g < gens; g++) {
      const { seeds, candidates } = trainer.proposal();
      const fits = await scatter(candidates, seeds, TRAINING.courseSeconds);
      const p = await trainer.absorb(candidates, fits, seeds, async (w) =>
        (await scatter([w], TRAINING.validationSeeds, TRAINING.validationSeconds))[0]);
      curveHistory = trainer.history;
      liveModel = trainer.champion;
      paintCurve();
      const el = (performance.now() - t0) / 1000;
      stat.textContent = t("trainProgressFmt", {
        g: p.generation, gens, v: p.validation.toFixed(0),
        e: p.episodes.toLocaleString(), s: el.toFixed(0),
        eta: ((el / (g + 1)) * (gens - g - 1)).toFixed(0),
      });
      await new Promise((r) => setTimeout(r, 0));
    }

    stat.className = "tstat done";
    stat.textContent = t("trainDoneFmt", {
      g: liveModel.generation, v: liveModel.validation.toFixed(0),
    });
    newGame(game.seed);
  } catch (err) {
    stat.className = "tstat";
    stat.textContent = t("trainFail", { msg: err.message });
    console.error(err);
  } finally {
    btn.disabled = false;
    busy = false;
  }
};

// ---------------------------------------------------------------- 啟動
// 開發用：可在 console 直接同步呼叫渲染，不必等 requestAnimationFrame
window.__fly = {
  get flyView() { return flyView; },
  get brainView() { return brainView; },
  get game() { return game; },
  get decision() { return decision; },
  brain,
  setAction(a) { action = a; },
};

/**
 * 語言切換後要重畫的東西：動態組出來的表格、註腳與 canvas 裡的靜態文字。
 * paintStatus() / paintDecide() 每一幀都跑，會自己跟上，不必列在這裡。
 */
function paintAllText() {
  paintSteps();
  paintFeatureLabels();
  paintNotes();
  paintBrainButtons();
  paintCurve();
  paintBench();
  paintReplicates();
  if (!model) {
    $("claim").className = "claim bad";
    $("claim").textContent = t("noModel");
  }
}

for (const b of document.querySelectorAll("[data-lang-btn]"))
  b.onclick = () => setLang(b.dataset.langBtn);
onLangChange(paintAllText);

applyStatic();
newGame(2100001);
paintAllText();
requestAnimationFrame((ts) => { last = ts; loop(ts); });
