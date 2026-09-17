/**
 * BRAIN ACTIVITY — MaleCNS v1.0 胞體圖譜點雲
 *
 * 124,289 顆有實測胞體座標的神經元作為灰色背景，
 * 再把本實驗那 80 顆電路細胞（含 1,296 條實測突觸連結的其中一批）
 * 按其真實座標疊上去，顏色隨活性變化。圖例見 index.html 04 面板。
 *
 * 顏色語意（節點與連結線共用）：
 *   橘＝興奮（該神經元/連結前端為 acetylcholine，sign +1，活性 > 0）
 *   藍＝抑制（GABA・glutamate，sign −1，活性 < 0）
 *   灰＝熄滅（|活性| < DARK，消融對照時整段電路都會是這個狀態）
 *   亮度／線條透明度＝活性強度；節點大小也隨活性放大
 *   方形節點＝32 顆輸入細胞（視覺投射神經元），圓形＝其餘 48 顆
 *   黃色外框＝16 顆下行神經元（DN），牠們的活性直接餵給讀出網路
 *
 * 用 Canvas 2D 的 ImageData 累積密度來畫背景，不需要 WebGL 或 Three.js：
 * 12 萬個點的投影與寫入都在 typed array 裡完成，單幀約 2–3 ms。
 * 1,296 條邊全畫會糊成一團，只取接觸數最多的 320 條。
 *
 * 資料為 CC BY 4.0，出處見 data/brain-atlas/NOTICE.md。
 * 點的大小不代表真實胞體大小；活性為模擬值，不是實測發放率。
 */

const VISIBLE_GROUPS = new Set([0, 1, 2]); // optic / central / descending，排除 vnc 與 other

export async function loadAtlas(base = "data/brain-atlas") {
  const [manifest, posBuf, grpBuf] = await Promise.all([
    fetch(`${base}/manifest.json`).then((r) => r.json()),
    fetch(`${base}/positions.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}/groups.bin`).then((r) => r.arrayBuffer()),
  ]);
  const allPos = new Float32Array(posBuf);
  const allGrp = new Uint8Array(grpBuf);

  // 只留要顯示的群，順便算中心與尺度
  let n = 0;
  for (let i = 0; i < allGrp.length; i++) if (VISIBLE_GROUPS.has(allGrp[i])) n++;
  const pos = new Float32Array(n * 3);
  const grp = new Uint8Array(n);
  let k = 0;
  for (let i = 0; i < allGrp.length; i++) {
    if (!VISIBLE_GROUPS.has(allGrp[i])) continue;
    pos[k * 3] = allPos[i * 3];
    pos[k * 3 + 1] = allPos[i * 3 + 1];
    pos[k * 3 + 2] = allPos[i * 3 + 2];
    grp[k] = allGrp[i];
    k++;
  }
  return { manifest, pos, grp, count: n };
}

/** 由圖譜點算出置中與縮放參數，讓電路細胞能用同一組參數對齊。 */
function frameOf(pos) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3)
    for (let a = 0; a < 3; a++) {
      const v = pos[i + a];
      if (v < mn[a]) mn[a] = v;
      if (v > mx[a]) mx[a] = v;
    }
  const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  const span = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  return { center: c, span };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{pos:Float32Array, grp:Uint8Array, count:number}} atlas
 * @param {object} graph  data/connectome.json（80 節點、1,296 條邊、輸出集合）
 * @param {object} channelMap  data/channels.json（輸入細胞集合）
 */
export function createBrainView(canvas, atlas, graph, channelMap) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const { center, span } = frameOf(atlas.pos);

  const circuitPositions = graph.nodes.map((n) => n.position);
  const signs = graph.nodes.map((n) => n.sign); // +1 acetylcholine（興奮）/ −1 GABA・glutamate（抑制）
  const outputSet = new Set(graph.outputs); // 16 顆下行神經元（DN）
  const inputSet = new Set(channelMap.inputs.map(([cell]) => cell)); // 32 顆視覺投射神經元
  // 1,296 條邊全畫會糊成一團，只取接觸數最多的一批（比照舊版 PROPAGATE 面板的作法）
  const strongEdges = [...graph.edges].sort((a, b) => b[2] - a[2]).slice(0, 320);
  const DARK = 0.02; // 活性低於此視為「熄滅」（消融對照時整段電路都會變成這個狀態）

  let W = 0, H = 0, img = null, acc = null, depth = null;
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(r.width * dpr));
    const h = Math.max(2, Math.round((r.height || r.width * 0.62) * dpr));
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = W; canvas.height = H;
    img = ctx.createImageData(W, H);
    acc = new Float32Array(W * H);
    depth = new Float32Array(W * H);
  }

  const state = { yaw: 0.6, pitch: -0.25, zoom: 1, orbit: true, focus: false };

  // MaleCNS 為 8 nm 體素的 EM 座標；此處只做剛性旋轉與等比縮放，不改變相對位置。
  //
  // 座標系實測驗證（見 git log / PR 說明）：Y 值越大＝越靠近 VNC（腹側／下方），
  // 例如 descending 群重心 y=35068 介於 central（19989）與 VNC（56206）之間，
  // 與 optic/central 構成的「腦頂部」相對，方向正好與螢幕像素座標（y 向下遞增）相同。
  // 故最終螢幕 Y 必須用「H/2 + ry*scale」，而非數學慣例的「H/2 - ry*scale」，
  // 否則畫面會整個上下顛倒（VNC/descending 方向跑到畫面上方）。
  function project(x, y, z, cy, sy, cp, sp, scale) {
    const dx = x - center[0], dy = y - center[1], dz = z - center[2];
    const rx = dx * cy + dz * sy;
    const rz = -dx * sy + dz * cy;
    const ry = dy * cp - rz * sp;
    const rz2 = dy * sp + rz * cp;
    return [W / 2 + rx * scale, H / 2 + ry * scale, rz2];
  }

  function render(activity) {
    resize();
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    const scale = (Math.min(W, H) / span) * 1.22 * state.zoom;

    acc.fill(0);
    depth.fill(-Infinity);

    // 背景圖譜：累積密度，越靠近觀察者越亮
    const pos = atlas.pos;
    const half = span / 2;
    const alpha = state.focus ? 0.32 : 1;
    for (let i = 0; i < pos.length; i += 3) {
      const p = project(pos[i], pos[i + 1], pos[i + 2], cy, sy, cp, sp, scale);
      const px = p[0] | 0, py = p[1] | 0;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const t = 0.45 + 0.55 * ((p[2] + half) / span); // 深度 → 亮度
      const o = py * W + px;
      acc[o] += t * alpha;
      if (p[2] > depth[o]) depth[o] = p[2];
    }

    // 密度 → 灰階（tone map，避免密集區整片死白）
    const d = img.data;
    for (let o = 0, q = 0; o < acc.length; o++, q += 4) {
      const v = acc[o];
      const g = v === 0 ? 0 : 1 - Math.exp(-v * 0.85);
      const lum = 10 + g * 172;
      d[q] = lum; d[q + 1] = lum * 1.02; d[q + 2] = lum * 1.08; d[q + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    // 80 顆電路細胞的螢幕座標，供邊與節點共用
    const dpr = W / canvas.getBoundingClientRect().width;
    const proj = circuitPositions.map((c) => project(c[0], c[1], c[2], cy, sy, cp, sp, scale));

    // 突觸連結（先畫，節點蓋在上面）：顏色=前端神經傳導物質正負號，
    // 透明度=前端神經元活性強弱。消融時全部活性歸零，連結會整片變暗灰，
    // 效果與節點的「熄滅」呼應。
    ctx.lineWidth = Math.max(1, dpr);
    for (const [pre, post] of strongEdges) {
      const a = activity ? activity[pre] : 0;
      const m = Math.min(1, Math.abs(a));
      const rgb = m < DARK ? "71,85,105" : signs[pre] >= 0 ? "249,115,22" : "56,189,248";
      ctx.strokeStyle = `rgba(${rgb},${0.04 + m * 0.5})`;
      ctx.beginPath();
      ctx.moveTo(proj[pre][0], proj[pre][1]);
      ctx.lineTo(proj[post][0], proj[post][1]);
      ctx.stroke();
    }

    // 節點（依深度排序，後面的先畫）
    const pts = proj.map((p, i) => ({ x: p[0], y: p[1], z: p[2], i })).sort((a, b) => a.z - b.z);

    for (const pt of pts) {
      const a = activity ? activity[pt.i] : 0;
      const m = Math.min(1, Math.abs(a));
      const dim = m < DARK;
      const rgb = dim ? "120,134,156" : a >= 0 ? "249,115,22" : "56,189,248";
      const r = (2.0 + m * 3.6) * dpr;
      const isInput = inputSet.has(pt.i);
      if (!dim) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(${rgb},${0.08 + m * 0.16})`;
        ctx.arc(pt.x, pt.y, r * 1.75, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(${rgb},${dim ? 0.5 : 0.35 + m * 0.65})`;
      if (isInput) {
        // 方形＝輸入細胞（32 顆視覺投射神經元，直接接收感官特徵）
        ctx.fillRect(pt.x - r, pt.y - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (outputSet.has(pt.i)) {
        // 黃色外框＝16 顆下行神經元（DN），牠們的活性直接餵給讀出網路
        ctx.strokeStyle = `rgba(250,204,21,${dim ? 0.25 : 0.9})`;
        ctx.lineWidth = 1.3 * dpr;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r + 3 * dpr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function tick(dt) {
    if (state.orbit) state.yaw += dt * 0.18;
  }

  // 拖曳旋轉
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    state.yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
    state.pitch = Math.max(-1.4, Math.min(1.4, drag.pitch + (e.clientY - drag.y) * 0.01));
  });
  const stop = () => (drag = null);
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    state.zoom = Math.max(0.5, Math.min(4, state.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
  }, { passive: false });

  return { render, tick, state, count: atlas.count };
}
