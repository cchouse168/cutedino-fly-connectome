/**
 * BRAIN ACTIVITY - the MaleCNS v1.0 soma atlas point cloud
 *
 * 124,289 neurons with measured soma coordinates form the grey background, with this
 * experiment's 80 circuit cells (and a subset of its 1,296 measured synaptic links) overlaid
 * at their real coordinates, coloured by activity. The legend is in index.html panel 04.
 *
 * Colour meaning (shared by nodes and links):
 *   orange = excitatory (the neuron / link's presynaptic side is acetylcholine, sign +1, activity > 0)
 *   blue   = inhibitory (GABA / glutamate, sign -1, activity < 0)
 *   grey   = dark (|activity| < DARK; the whole circuit sits here during the ablation control)
 *   brightness / line opacity = activity magnitude; node size also grows with activity
 *   square nodes = the 32 input cells (visual projection neurons), circles = the other 48
 *   yellow outline = the 16 descending neurons (DNs), whose activity feeds the readout directly
 *
 * The background is drawn by accumulating density into Canvas 2D ImageData - no WebGL or Three.js:
 * projecting and writing 120k points happens entirely in typed arrays, about 2-3 ms per frame.
 * Drawing all 1,296 edges would be a smear, so only the 320 with the most contacts are kept.
 *
 * The data is CC BY 4.0; provenance in data/brain-atlas/NOTICE.md.
 * Dot size does not represent real soma size, and the activity is simulated, not a measured firing rate.
 */

const VISIBLE_GROUPS = new Set([0, 1, 2]); // optic / central / descending, excluding vnc and other

export async function loadAtlas(base = "data/brain-atlas") {
  const [manifest, posBuf, grpBuf] = await Promise.all([
    fetch(`${base}/manifest.json`).then((r) => r.json()),
    fetch(`${base}/positions.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}/groups.bin`).then((r) => r.arrayBuffer()),
  ]);
  const allPos = new Float32Array(posBuf);
  const allGrp = new Uint8Array(grpBuf);

  // Keep only the groups being shown, and compute the centre and scale while passing through
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

/** Derive the centring and scaling from the atlas points, so circuit cells can align using the same parameters. */
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
 * @param {object} graph  data/connectome.json (80 nodes, 1,296 edges, the output set)
 * @param {object} channelMap  data/channels.json (the input cell set)
 */
export function createBrainView(canvas, atlas, graph, channelMap) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const { center, span } = frameOf(atlas.pos);

  const circuitPositions = graph.nodes.map((n) => n.position);
  const signs = graph.nodes.map((n) => n.sign); // +1 acetylcholine (excitatory) / -1 GABA, glutamate (inhibitory)
  const outputSet = new Set(graph.outputs); // the 16 descending neurons (DNs)
  const inputSet = new Set(channelMap.inputs.map(([cell]) => cell)); // the 32 visual projection neurons
  // Drawing all 1,296 edges would be a smear, so take the ones with the most contacts (as the old PROPAGATE panel did)
  const strongEdges = [...graph.edges].sort((a, b) => b[2] - a[2]).slice(0, 320);
  const DARK = 0.02; // below this an activity counts as "dark" (the whole circuit goes here during ablation)

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

  // MaleCNS uses EM coordinates in 8 nm voxels; only a rigid rotation and a uniform scale are applied, so relative positions are unchanged.
  //
  // Coordinate system verified empirically (see git log / PR notes): larger Y = closer to the VNC (ventral / below),
  // e.g. the descending group's centroid y=35068 sits between central (19989) and the VNC (56206),
  // opposite the "top of the brain" formed by optic/central -- the same direction as screen pixels (y increases downward).
  // So the final screen Y must be "H/2 + ry*scale", not the mathematical convention "H/2 - ry*scale",
  // or the whole image flips vertically (VNC/descending ends up at the top of the screen).
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

    // Background atlas: accumulate density, brighter the closer to the viewer
    const pos = atlas.pos;
    const half = span / 2;
    const alpha = state.focus ? 0.32 : 1;
    for (let i = 0; i < pos.length; i += 3) {
      const p = project(pos[i], pos[i + 1], pos[i + 2], cy, sy, cp, sp, scale);
      const px = p[0] | 0, py = p[1] | 0;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const t = 0.45 + 0.55 * ((p[2] + half) / span); // depth -> brightness
      const o = py * W + px;
      acc[o] += t * alpha;
      if (p[2] > depth[o]) depth[o] = p[2];
    }

    // Density -> greyscale (tone map, so dense regions do not blow out to white)
    const d = img.data;
    for (let o = 0, q = 0; o < acc.length; o++, q += 4) {
      const v = acc[o];
      const g = v === 0 ? 0 : 1 - Math.exp(-v * 0.85);
      const lum = 10 + g * 172;
      d[q] = lum; d[q + 1] = lum * 1.02; d[q + 2] = lum * 1.08; d[q + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    // Screen coordinates of the 80 circuit cells, shared by edges and nodes
    const dpr = W / canvas.getBoundingClientRect().width;
    const proj = circuitPositions.map((c) => project(c[0], c[1], c[2], cy, sy, cp, sp, scale));

    // Synaptic links (drawn first, nodes go on top): colour = the presynaptic neurotransmitter's sign,
    // opacity = the presynaptic neuron's activity. Under ablation all activity is zero, so the links
    // all fade to dark grey, echoing the nodes going dark.
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

    // Nodes (sorted by depth, farthest drawn first)
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
        // Square = an input cell (one of the 32 visual projection neurons that receive sensory features directly)
        ctx.fillRect(pt.x - r, pt.y - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (outputSet.has(pt.i)) {
        // Yellow outline = one of the 16 descending neurons (DNs), whose activity feeds the readout directly
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

  // Drag to rotate
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
