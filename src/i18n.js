/**
 * 介面文案（繁體中文 / English）。
 *
 * 英文文案與設計稿 dashboard 的用語一致（該稿已不在本 repo 內）。
 *
 * 用法：
 *   靜態文字  在 HTML 上標 data-i18n="key"（含標記的用 data-i18n-html，
 *            屬性用 data-i18n-title）
 *   動態文字  在 JS 裡呼叫 t("key", { n: 3 })，字串中的 {n} 會被代換
 *
 * 語言切換時 applyStatic() 重跑靜態節點，onLangChange() 的回呼負責重畫動態面板。
 */

const STORE_KEY = "flydino-lang"; // 與 dashboard 共用同一個鍵，切一次兩邊都記得

export const ZH = {
  htmlLang: "zh-Hant",
  docTitle: "果蠅大腦玩 cute-dino",
  docDesc: "用 MaleCNS 果蠅連接體的 80 顆真實神經元與 1,296 條實測突觸連接，操控 cute-dino。",

  brand: "果蠅大腦玩 cute-dino",
  navLive: "實驗", navTrain: "訓練", navRes: "結果", navMethod: "方法", navSource: "原作",

  h1: "一段果蠅神經迴路在玩你的遊戲。",
  lede: "80 顆真實神經元、1,296 條實測突觸連接，構成一段完全固定、不可訓練的電路。後面只接一個 269 參數的讀出網路決定要跑、跳、蹲，還是左右移動。畫面是即時運算，不是預錄動畫 —— 每 1/30 秒，遊戲狀態都真的流經這 1,296 條接線一次。",
  sNeurons: "模擬神經元", sEdges: "實測連接", sSyn: "突觸接觸",
  sCh: "感官通道", sParams: "可訓練參數", sRate: "決策頻率",
  jump: "它怎麼運作 ↓",

  running: "運行中", paused: "已暫停", deadState: "已陣亡",
  driver: "駕駛", playback: "播放",
  speedTip: "只是快轉播放，不影響 agent 的決策與結果",
  m1: "連接體 + 訓練讀出", m2: "電路靜默（消融對照）", m3: "未訓練讀出",
  m4: "手寫規則", m5: "隨機動作",
  replay: "重玩本賽道", replayTip: "用同一個 seed 重玩，方便比較不同駕駛模式在同一條賽道上的表現",
  newTrack: "換賽道（隨機）", pause: "暫停", resume: "繼續",

  p1: "遊戲", p2: "決策網路", p2sub: "可訓練的動作讀出",
  p3: "鍵盤輸出", p3sub: "flybody 解剖模型",
  p4: "大腦活性", p4sub: "MaleCNS v1.0 胞體圖譜",
  p5: "感官通道", p5sub: "遊戲狀態 → 32 顆視覺投射神經元",

  actionLabel: "動作",
  score: "分數", difficulty: "難度", diffTip: "遊戲內難度倍率，隨時間爬升至 2.0× 封頂",
  dead: "陣亡", overlay: "觀測疊圖",

  decideNote: "16 → 12 → 5 · 269 個參數 · 每秒 30 次決策",
  argmax: "分數最高者被選中 · 橘 + / 藍 −",
  dnColumn: "下行神經元", hiddenColumn: "隱藏層", actionColumn: "動作分數",
  decideUnused: "此模式未使用連接體與讀出網路",

  flyNote: "兩隻前腳依動作按下對應的鍵", drag: "可拖曳旋轉",
  flyNoWebgl: "此瀏覽器不支援 WebGL2，無法顯示果蠅模型",
  flyFail: "模型載入失敗：{msg}",

  brainTagFmt: "平均 |活性| {v}",
  focus: "聚焦電路", showAll: "顯示全腦",
  stopOrbit: "停止旋轉", startOrbit: "開始旋轉",
  brainNoteFmt: "{n} 顆胞體 · 80 顆電路細胞疊於真實座標",
  atlasFail: "圖譜載入失敗：{msg}",
  dragZoom: "拖曳旋轉 · 滾輪縮放",
  lgExcite: "興奮", lgInhibit: "抑制", lgOff: "熄滅",
  lgInput: "輸入", lgDn: "輸出 DN",

  featFoot: "值域 0..1，經 u = 2·(特徵 − 0.5) 注入該通道被指定的細胞",
  featNote: "通道數由實測的型內投射可區分性決定，非任意指定",
  channels: [
    "障礙物撞擊倒數", "障礙物底端離地高", "玩家離地高度", "障礙物頂端離地高",
    "次近障礙物撞擊倒數", "玩家垂直速度", "是否踩地", "子彈撞擊倒數",
    "子彈相對高度差", "道具接近倒數", "道具相對高度差", "玩家水平位置", "護盾狀態",
  ],

  eyebrowTrain: "訓練與評估", h2Train: "只教那個小小的讀出網路",
  ledeTrain: "80 顆細胞的電路權重全程固定不動，被演化的只有末端 269 個參數。用交叉熵方法（CEM）：每代 64 個候選、取最好的 8 個更新分布，一代換一批新賽道。",
  curve: "訓練曲線", retrain: "在瀏覽器中重跑訓練", gens: "代數",
  trainStat: "用你自己的 CPU 重跑 CEM，結果只留在本機",
  curveEmpty: "尚未有訓練紀錄（執行 node scripts/train.mjs）",
  curveValidation: "驗證分數", curveBest: "該代最佳",
  curveMetaFmt: "第 {g} 代 · {e} 場 · 驗證 {v}",
  trainStarting: "啟動 {n} 個 worker…",
  trainProgressFmt: "第 {g}/{gens} 代 · 驗證 {v} · {e} 場 · {s}s · ETA {eta}s",
  trainDoneFmt: "完成：第 {g} 代，驗證 {v}。遊戲畫面已改用這組新權重（下方結果表仍為隨附模型）。",
  trainFail: "訓練失敗：{msg}",

  eyebrowRes: "結果", h2Res: "把電路關掉，牠就不會玩了",
  ledeRes: "100 條從未見過的賽道、每條上限 180 秒。消融組把 16 顆下行神經元的輸出強制歸零，其餘一切不變 —— 若成績不掉，就代表讀出網路根本沒用到那段電路。",
  benchEmpty: "尚未有基準結果（執行 node scripts/benchmark.mjs）",
  thGroup: "對照組", thDone: "跑完", thMeanS: "平均存活", thMedianS: "中位存活",
  thMeanScore: "平均分數", thPickups: "道具", thKills: "擊殺",
  groups: ["連接體 + 訓練讀出", "電路靜默（消融）", "未訓練讀出", "手寫規則", "隨機動作", "完全不動"],
  claimOkFmt: "關掉電路後，「連接體 + 訓練讀出」整場只重複同一個動作，<b>{s} 秒</b>就結束，和完全不操作一樣；未訓練的讀出也是 {u} 秒。它是看著畫面在動，不是背下來的 —— 那段複製自果蠅腦、訓練時完全沒動過的電路，確實有在出力。",
  claimBadFmt: "消融後表現未顯著劣化（{rs}× / {ru}×），代表讀出網路可能在硬記，通道設計需要檢討。",
  benchNoteFmt: "測試種子 {a}–{b}，每條上限 {s} 秒；模型為第 {g} 代，訓練種子 {seed}。「手寫規則」不使用連接體也不使用神經網路，是純幾何門檻的對照。",
  noModel: "找不到 models/model.json，請先執行 node scripts/train.mjs。",

  repTitle: "Replicate", repMetaFmt: "{n} 個訓練種子 × {g} 代",
  thSeed: "訓練種子", thGen: "冠軍代", thVal: "驗證",
  thAbl: "消融比", thUntr: "未訓練比", thRule: "勝規則", thAvg: "平均 ± 標準差",
  repStable: "消融效應在各 replicate 之間穩定重現（比值減一個標準差後仍 > 2×），單次結果並非僥倖。",
  repUnstable: "消融效應在各 replicate 之間不穩定，單次結果不足採信。",

  eyebrowMethod: "方法", h2Method: "資料怎麼流過去",
  step1Lead: "觀察", step1Body: "遊戲狀態轉成 {n} 個工程特徵，值域 0..1。用「撞擊倒數」而非距離，速度資訊因此內建。",
  step2Lead: "注入", step2Body: "特徵經 <code>u = 2·(特徵 − 0.5)</code> 廣播給 32 顆輸入細胞。同通道的細胞收到相同驅動值，沒有學出來的投影矩陣。",
  step3Lead: "傳播", step3Body: "沿 1,296 條實測連接同步更新 3 輪：<code>h′ = 0.3·h + 0.7·tanh(u + 1.4·Σ W·h)</code>。權重來自突觸接觸數與傳導物質正負號，全程固定。",
  step4Lead: "讀出", step4Body: "16 顆下行神經元的活性經 16→12→5 的小網路取 argmax，決定跑／跳／蹲／左／右。只有這 269 個參數被訓練。",
  caveat: "電路活性為模擬值、無量綱，不是膜電位也不是實測發放率。輸入編碼與動作讀出皆為人工指定，非生物量測。這是一小段選定的電路，不是完整的腦。",

  f1: "方法與程式架構改編自 <a href=\"https://github.com/cobanov/flyjump\" target=\"_blank\" rel=\"noopener\">cobanov/flyjump</a>（<a href=\"https://flydino.cobanov.dev/\" target=\"_blank\" rel=\"noopener\">Fly Dino</a>），依 Cobanov Template Attribution License 1.0 使用。本專案的修改：改玩 <a href=\"https://github.com/cchouse168/cute-dino\" target=\"_blank\" rel=\"noopener\">cute-dino</a> 而非 Chromium 恐龍遊戲、感官通道由 8 個重新映射為 13 個、動作空間由 3 個擴充為 5 個。",
  f2: "連接體與胞體圖譜取自 <a href=\"https://male-cns.janelia.org/download/\" target=\"_blank\" rel=\"noopener\">MaleCNS v1.0</a>，由 FlyEM / HHMI Janelia、University of Cambridge、MRC Laboratory of Molecular Biology 與 Google Research 建立，採 <a href=\"https://creativecommons.org/licenses/by/4.0/\" target=\"_blank\" rel=\"noopener\">CC BY 4.0</a> 授權。資料方不對本實驗背書。",
  f3: "果蠅身體模型來自 <a href=\"https://github.com/TuragaLab/flybody\" target=\"_blank\" rel=\"noopener\">TuragaLab/flybody</a>（Turaga Lab、Google DeepMind 與 HHMI Janelia），Apache License 2.0。鍵盤姿勢與按鍵動畫是本專案所加，不是研究模擬的輸出。",
};

export const EN = {
  htmlLang: "en",
  docTitle: "A fly brain plays cute-dino",
  docDesc: "80 real neurons and 1,296 measured synaptic connections from the MaleCNS fly connectome, driving cute-dino.",

  brand: "A fly brain plays cute-dino",
  navLive: "Experiment", navTrain: "Training", navRes: "Results", navMethod: "Method", navSource: "Original",

  h1: "Fly's neurons are playing your cute-dino game.",
  lede: "80 real neurons and 1,296 measured synaptic connections form a circuit that is entirely fixed and untrainable. Behind it sits a single 269-parameter readout network that decides whether to run, jump, duck, or move left and right. What you see is computed live, not a recording — every 1/30 s the game state really does pass through those 1,296 connections once.",
  sNeurons: "Neurons", sEdges: "Edges", sSyn: "Synapses",
  sCh: "Channels", sParams: "Params", sRate: "Rate",
  jump: "How it works ↓",

  running: "Running", paused: "Paused", deadState: "Dead",
  driver: "Driver", playback: "Playback",
  speedTip: "Fast-forwards the playback only; the agent's decisions and results are unaffected",
  m1: "Connectome + trained readout", m2: "Circuit silenced (ablation control)", m3: "Untrained readout",
  m4: "Hand-written rules", m5: "Random actions",
  replay: "Replay this track", replayTip: "Replays the same seed, so you can compare drivers on an identical track",
  newTrack: "New track", pause: "Pause", resume: "Resume",

  p1: "Game", p2: "Decision network", p2sub: "Trainable action readout",
  p3: "Keyboard output", p3sub: "flybody anatomical model",
  p4: "Brain activity", p4sub: "MaleCNS v1.0 soma atlas",
  p5: "Sensory channels", p5sub: "Game state → 32 visual projection neurons",

  actionLabel: "Action",
  score: "Score", difficulty: "Difficulty", diffTip: "In-game difficulty multiplier; climbs over time and caps at 2.0×",
  dead: "dead", overlay: "Observation overlay",

  decideNote: "16 → 12 → 5 · 269 params · 30 decisions/s",
  argmax: "Highest score wins · orange + / blue −",
  dnColumn: "Descending neurons", hiddenColumn: "Hidden layer", actionColumn: "Action scores",
  decideUnused: "This mode uses neither the connectome nor the readout network",

  flyNote: "Both forelegs press the key for the current action", drag: "Drag to rotate",
  flyNoWebgl: "This browser has no WebGL2, so the fly model cannot be shown",
  flyFail: "Model failed to load: {msg}",

  brainTagFmt: "Mean |activity| {v}",
  focus: "Focus circuit", showAll: "Show whole brain",
  stopOrbit: "Stop rotation", startOrbit: "Start rotation",
  brainNoteFmt: "{n} somata · 80 circuit cells at true coordinates",
  atlasFail: "Atlas failed to load: {msg}",
  dragZoom: "Drag · scroll to zoom",
  lgExcite: "Excitatory", lgInhibit: "Inhibitory", lgOff: "Silenced",
  lgInput: "Input", lgDn: "Output DN",

  featFoot: "Range 0..1, injected as u = 2·(feature − 0.5) into the cells assigned to that channel",
  featNote: "The channel count follows measured within-type projection separability, not an arbitrary choice",
  channels: [
    "Time to obstacle", "Obstacle bottom height", "Height above ground", "Obstacle top height",
    "Time to 2nd obstacle", "Vertical speed", "On ground", "Time to bullet",
    "Bullet relative height", "Time to pickup", "Pickup relative height", "Horizontal position", "Shield state",
  ],

  eyebrowTrain: "Training & evaluation", h2Train: "Only the tiny readout network is taught",
  ledeTrain: "The 80-cell circuit's weights never move; only the final 269 parameters are evolved. Cross-entropy method (CEM): 64 candidates per generation, the best 8 update the distribution, and each generation draws a fresh batch of tracks.",
  curve: "Learning curve", retrain: "Re-run training in the browser", gens: "Generations",
  trainStat: "Re-runs CEM on your own CPU; results stay on this machine",
  curveEmpty: "No training record yet (run node scripts/train.mjs)",
  curveValidation: "Validation", curveBest: "Best of generation",
  curveMetaFmt: "gen {g} · {e} episodes · validation {v}",
  trainStarting: "Starting {n} workers…",
  trainProgressFmt: "gen {g}/{gens} · validation {v} · {e} episodes · {s}s · ETA {eta}s",
  trainDoneFmt: "Done: gen {g}, validation {v}. The game now runs on these new weights (the results table below still shows the bundled model).",
  trainFail: "Training failed: {msg}",

  eyebrowRes: "Results", h2Res: "Switch the circuit off and it stops playing",
  ledeRes: "100 unseen tracks, 180 s cap each. The ablation group forces the 16 descending neurons' output to zero and changes nothing else — if the score holds, the readout was never using that circuit.",
  benchEmpty: "No benchmark results yet (run node scripts/benchmark.mjs)",
  thGroup: "Group", thDone: "Completed", thMeanS: "Mean survival", thMedianS: "Median survival",
  thMeanScore: "Mean score", thPickups: "Pickups", thKills: "Kills",
  groups: ["Connectome + trained readout", "Circuit silenced (ablation)", "Untrained readout", "Hand-written rules", "Random actions", "No action"],
  claimOkFmt: "With the circuit off, “Connectome + trained readout” repeats a single action and ends after <b>{s}s</b> — the same as doing nothing; an untrained readout also lasts {u}s. It plays from what it sees, not from a memorised routine — that circuit, copied from a real fly brain and never trained, really is doing work.",
  claimBadFmt: "Ablation did not degrade performance meaningfully ({rs}× / {ru}×), so the readout may be memorising and the channel design needs review.",
  benchNoteFmt: "Test seeds {a}–{b}, {s} s cap each; model is generation {g}, training seed {seed}. “Hand-written rules” uses neither the connectome nor a neural network — it is a pure geometric-threshold control.",
  noModel: "models/model.json not found — run node scripts/train.mjs first.",

  repTitle: "Replicates", repMetaFmt: "{n} training seeds × {g} generations",
  thSeed: "Training seed", thGen: "Champion gen", thVal: "Validation",
  thAbl: "Ablation ratio", thUntr: "Untrained ratio", thRule: "vs rules", thAvg: "Mean ± SD",
  repStable: "The ablation effect reproduces across replicates (still > 2× after subtracting one SD), so the single run was not a fluke.",
  repUnstable: "The ablation effect is unstable across replicates; a single run is not trustworthy.",

  eyebrowMethod: "Method", h2Method: "How the data flows through",
  step1Lead: "Observe.", step1Body: "The game state becomes {n} engineered features in the range 0..1. Time-to-impact is used instead of distance, so velocity is built in.",
  step2Lead: "Inject.", step2Body: "Features are broadcast to 32 input cells as <code>u = 2·(feature − 0.5)</code>. Cells on the same channel receive identical drive; there is no learned projection matrix.",
  step3Lead: "Propagate.", step3Body: "Three synchronous rounds along 1,296 measured connections: <code>h′ = 0.3·h + 0.7·tanh(u + 1.4·Σ W·h)</code>. Weights come from synapse counts and neurotransmitter sign, fixed throughout.",
  step4Lead: "Read out.", step4Body: "The 16 descending neurons' activity passes through a 16→12→5 network; argmax picks run / jump / duck / left / right. Only those 269 parameters are trained.",
  caveat: "Circuit activity is a simulated, dimensionless value — not a membrane potential and not a measured firing rate. The input encoding and action readout are both hand-specified, not biological measurements. This is one selected circuit, not a whole brain.",

  f1: "Method and code architecture adapted from <a href=\"https://github.com/cobanov/flyjump\" target=\"_blank\" rel=\"noopener\">cobanov/flyjump</a> (<a href=\"https://flydino.cobanov.dev/\" target=\"_blank\" rel=\"noopener\">Fly Dino</a>), used under the Cobanov Template Attribution License 1.0. Changes in this project: plays <a href=\"https://github.com/cchouse168/cute-dino\" target=\"_blank\" rel=\"noopener\">cute-dino</a> instead of the Chromium dinosaur game, sensory channels remapped from 8 to 13, and the action space expanded from 3 to 5.",
  f2: "Connectome and soma atlas from <a href=\"https://male-cns.janelia.org/download/\" target=\"_blank\" rel=\"noopener\">MaleCNS v1.0</a>, built by FlyEM / HHMI Janelia, the University of Cambridge, the MRC Laboratory of Molecular Biology and Google Research, licensed <a href=\"https://creativecommons.org/licenses/by/4.0/\" target=\"_blank\" rel=\"noopener\">CC BY 4.0</a>. The data providers do not endorse this experiment.",
  f3: "Fly body model from <a href=\"https://github.com/TuragaLab/flybody\" target=\"_blank\" rel=\"noopener\">TuragaLab/flybody</a> (Turaga Lab, Google DeepMind and HHMI Janelia), Apache License 2.0. The keyboard posture and key animation were added by this project and are not output of the research simulation.",
};

const DICTS = { zh: ZH, en: EN };
const listeners = new Set();
let lang = "zh";

try {
  const saved = localStorage.getItem(STORE_KEY);
  if (saved === "en" || saved === "zh") lang = saved;
  else if (!saved && !/^zh/i.test(navigator.language || "")) lang = "en";
} catch { /* 隱私模式下 localStorage 會 throw，維持預設 */ }

export const getLang = () => lang;

/** 取一則文案；字串中的 {x} 由 vars.x 代換。找不到的 key 直接回傳 key，方便發現漏翻。 */
export function t(key, vars) {
  const raw = DICTS[lang][key] ?? ZH[key] ?? key;
  if (typeof raw !== "string" || !vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** 取整個陣列型文案（channels / groups）。 */
export const tList = (key) => DICTS[lang][key] ?? ZH[key] ?? [];

export function setLang(next) {
  if ((next !== "zh" && next !== "en") || next === lang) return;
  lang = next;
  try { localStorage.setItem(STORE_KEY, next); } catch { /* 同上 */ }
  applyStatic();
  for (const fn of listeners) fn(lang);
}

/** 註冊語言切換回呼，用來重畫 canvas 與表格等非 data-i18n 的內容。 */
export const onLangChange = (fn) => listeners.add(fn);

/**
 * 套用所有靜態標記：
 *   data-i18n       → textContent
 *   data-i18n-html  → innerHTML（僅用於本檔內建、含 <a>/<code> 的文案）
 *   data-i18n-title → title 屬性
 */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll("[data-i18n-title]")) el.title = t(el.dataset.i18nTitle);

  document.documentElement.lang = t("htmlLang");
  document.title = t("docTitle");
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.content = t("docDesc");

  for (const b of root.querySelectorAll("[data-lang-btn]"))
    b.classList.toggle("on", b.dataset.langBtn === lang);
}
