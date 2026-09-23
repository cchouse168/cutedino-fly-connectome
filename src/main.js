/**
 * Main program: wires the game, the connectome, the readout and the four visualisation panels together.
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
let liveModel = null; // a model trained in-browser, which takes precedence over models/model.json

$("statCh").textContent = CH.length;

/** The Method section's four steps: they embed the channel count and <code>, so JS builds them rather than data-i18n. */
function paintSteps() {
  for (let i = 1; i <= 4; i++) $(`step${i}Body`).innerHTML = t(`step${i}Body`, { n: CH.length });
}

const untrainedWeights = Array.from(
  { length: NETWORK.parameters },
  (() => { const r = rng(model?.trainingSeed ?? 1); return () => gaussian(r) * 0.7; })(),
);

// ---------------------------------------------------------------- game
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
    brain.reset(); // without this the brain panel freezes on the last activity, implying the circuit is still running
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

// ---------------------------------------------------------------- main loop
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

  // The champion generation already appears in the benchmark note and the replicate table below; repeating it in the status bar is noise
  $("runMeta").textContent = $("selMode").selectedOptions[0].textContent;

  const cfg = ACTION_KEYS[action] ?? ACTION_KEYS[0];
  $("flyTag").textContent = `${ACTIONS[action]}   ${cfg.label}`;
  // Action names reuse the ACTIONS constant, the same wording as panels 02 and 03, and are not translated separately
  $("hudAction").textContent = ACTIONS[action];
}

// ---------------------------------------------------------------- 05 sensory channels
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

/** Channel names follow the language; channels.json's label is the fallback when there is no translation. */
function paintFeatureLabels() {
  const names = tList("channels");
  featRows.forEach((r, i) => {
    r.nm.textContent = names[i] ?? CH[i].label;
    r.nm.title = r.nm.textContent; // past two lines, hovering still shows the full name
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

// ---------------------------------------------------------------- 02 decision network
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
   * One connection, with strength m = |weight| x |previous layer's activity|.
   *
   * m multiplies two quantities that are both <=1, so it typically sits around 0.1 -- used directly as alpha it draws nothing.
   * So raise the low-to-mid range with a 0.5 power first, then add a MIN_A floor: once a line is
   * worth drawing at all it is visible, and strength is carried by brightness and width together, not by telling 0.04 from 0.09.
   *
   * The threshold rises to match (weak links are simply not drawn), or all 16x12 + 12x5 = 252
   * lines drawn bright would blur into a smear.
   */
  const MIN_A = 0.22;
  const link = (x1, y1, x2, y2, wt, act, peak, cut) => {
    const m = Math.min(1, Math.abs(wt) / 1.6) * Math.min(1, Math.abs(act));
    if (m < cut) return;
    const a = MIN_A + Math.sqrt(m) * (peak - MIN_A);
    dctx.strokeStyle = wt >= 0 ? `rgba(249,115,22,${a})` : `rgba(56,189,248,${a})`;
    dctx.lineWidth = m > 0.3 ? 1.8 : 1.1; // a 1px diagonal gets spread over two pixels by antialiasing and looks fainter
    dctx.beginPath(); dctx.moveTo(x1, y1); dctx.lineTo(x2, y2); dctx.stroke();
  };

  // Descending neurons -> hidden layer: 16x12 lines, the densest bundle, so a higher threshold and lower peak
  // Weight layout is in policy.js forward(): hidden unit h's i-th input is at h*(inputs+1)+i
  for (let h = 0; h < NETWORK.hidden; h++)
    for (let i = 0; i < NETWORK.inputs; i++)
      link(169, dnY(i), colH - 12, hY(h), w[h * (NETWORK.inputs + 1) + i], dn[i] / dnMax, 0.72, 0.10);

  // Hidden layer -> actions: only 60 lines, so drawing them all stays readable
  const base = NETWORK.inputs * NETWORK.hidden + NETWORK.hidden;
  for (let a = 0; a < NETWORK.outputs; a++)
    for (let h = 0; h < NETWORK.hidden; h++)
      link(colH + 14, hY(h), colA - 66, aY(a), w[base + a * (NETWORK.hidden + 1) + h], hidden[h], 0.95, 0.05);

  // The 16 descending neurons. The longest name is DNpe052 (7 characters), about 55px at 13px monospace,
  // right-aligned at x=88 -> a left edge around 33, which stays inside the canvas.
  dctx.font = "13px ui-monospace, monospace";
  for (let i = 0; i < dn.length; i++) {
    const y = dnY(i), m = Math.min(1, Math.abs(dn[i]) / dnMax);
    dctx.textAlign = "right"; dctx.fillStyle = "#e8ecf1";
    dctx.fillText(DN_LABELS[i], 88, y + 4.5);
    dctx.fillStyle = dn[i] >= 0 ? `rgba(249,115,22,${0.28 + m * 0.72})` : `rgba(56,189,248,${0.28 + m * 0.72})`;
    dctx.fillRect(96, y - 6, 3 + m * 66, 12);
    dctx.strokeStyle = "#1c2534"; dctx.lineWidth = 1; dctx.strokeRect(96, y - 6, 69, 12);
  }

  // The 12 hidden units
  for (let h = 0; h < hidden.length; h++) {
    const y = hY(h), m = Math.min(1, Math.abs(hidden[h]));
    dctx.fillStyle = hidden[h] >= 0 ? `rgba(249,115,22,${0.25 + m * 0.75})` : `rgba(56,189,248,${0.25 + m * 0.75})`;
    dctx.beginPath(); dctx.arc(colH, y, 4 + m * 6, 0, Math.PI * 2); dctx.fill();
  }

  // The 5 action scores
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
    // Scores right-align to just inside the canvas edge, so zooming does not clip them at 720px
    dctx.textAlign = "right";
    dctx.fillStyle = hot ? "#f2f5f8" : "#cfd8e3";
    dctx.font = (hot ? "bold " : "") + "16px ui-monospace, monospace";
    dctx.fillText(scores[i].toFixed(2), 714, y + 6);
  }
}

// ---------------------------------------------------------------- 03/04 large assets
let flyView = null, brainView = null;

// Both panels' footnotes depend on what loaded, so they are stored as key + args to be repainted on a language change
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

/** Both buttons are labelled with what pressing them will do, so they read as the opposite of the current state. */
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

// ---------------------------------------------------------------- training curve
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
  // The control names in benchmark.json are Chinese; display always goes through the dictionary (the order is fixed by benchmark.js)
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
  // The seconds after ablation are easier to grasp than "down to 1/46": the 46's denominator is the environment's floor
  // (time to hit the first obstacle), not a graded quantity -- a ratio implies the ablated group still has degrees
  $("claim").innerHTML = ok
    ? t("claimOkFmt", { s: silenced.meanSeconds.toFixed(1), u: untrained.meanSeconds.toFixed(1) })
    : t("claimBadFmt", { rs: rs.toFixed(1), ru: ru.toFixed(1) });
  $("benchNote").textContent = t("benchNoteFmt", {
    a: bench.config.seedRange[0], b: bench.config.seedRange[1], s: bench.config.seconds,
    g: bench.model.generation, seed: bench.model.trainingSeed,
  });
}

/**
 * Replicates: rerunning the whole pipeline with different training seeds.
 * What matters is how tightly the ablation ratio clusters -- absolute scores vary by seed anyway,
 * but if the circuit really contributes, the collapse after ablation should appear every time.
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

// ---------------------------------------------------------------- controls
/**
 * The single entry point for replaying. newGame() does not restore the playing state by itself,
 * so calling it alone after a death leaves the screen stuck (in the loop, `playing && !game.dead`
 * never holds: playing is usually still true at the moment of death, and the next iteration is fine
 * on a fresh course, but from a paused state the new course would never start) -- this guarantees play resumes.
 */
function replay(seed) {
  newGame(seed);
  playing = true;
  last = performance.now(); // the button label is decided by paintStatus() from `playing`
}

$("btnPlay").onclick = () => {
  if (game.dead) { replay(game.seed); return; } // when dead, the "resume" button replays the same course
  playing = !playing;
  last = performance.now();
};
$("btnReplay").onclick = () => replay(game.seed);
$("btnNew").onclick = () => replay((Math.random() * 900000) | 0);
$("selMode").onchange = () => replay(game.seed);
$("selSpeed").onchange = (e) => (speedMul = Number(e.target.value));
addEventListener("keydown", (e) => {
  if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
  if (e.code === "Space") { e.preventDefault(); $("btnPlay").click(); } // when dead, this replays the course
  if (e.key === "r" || e.key === "R") replay(game.seed);
  if (e.key === "n" || e.key === "N") replay((Math.random() * 900000) | 0);
});

if (!model) $("selMode").value = "rule"; // with no model, default to the hand-written rules; the message comes from paintAllText()

// ---------------------------------------------------------------- in-browser training
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

/** Split a batch evenly across the worker pool, returning results in the input order. */
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
  stat.removeAttribute("data-i18n"); // everything after this is a dynamic message; a language switch must not overwrite it
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

// ---------------------------------------------------------------- startup
// For development: render can be called synchronously from the console without waiting for requestAnimationFrame
window.__fly = {
  get flyView() { return flyView; },
  get brainView() { return brainView; },
  get game() { return game; },
  get decision() { return decision; },
  brain,
  setAction(a) { action = a; },
};

/**
 * What has to be repainted after a language change: dynamically built tables, footnotes and static text inside canvases.
 * paintStatus() / paintDecide() run every frame and keep up on their own, so they are not listed here.
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
