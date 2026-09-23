/**
 * KEYBOARD OUTPUT - the flybody anatomical model operating a keyboard
 *
 * A 93,879-triangle fruit-fly body model whose two forelegs move independently,
 * pressing whichever key matches the action the agent just chose.
 *
 * Rendered with raw WebGL2, no Three.js:
 * one draw call per part (12 in total), with per-face normals computed live from the fragment
 * shader's screen-space derivatives (flat shading), so the model carries no normal data.
 *
 * The model comes from TuragaLab/flybody, Apache-2.0; provenance in data/flybody/NOTICE.md.
 * The keyboard pose and the key-press animation were added by this project, not output of the research simulation.
 */

const MATERIAL_COLORS = {
  body: [0.68, 0.47, 0.22],
  black: [0.09, 0.09, 0.11],
  red: [0.72, 0.18, 0.12],
  ocelli: [0.90, 0.74, 0.42],
  "bristle-brown": [0.36, 0.25, 0.14],
  lower: [0.52, 0.38, 0.19],
  brown: [0.45, 0.30, 0.15],
  membrane: [0.78, 0.84, 0.88],
};

/** Action -> which foreleg presses, and which key */
export const ACTION_KEYS = {
  0: { key: null, legs: "none", label: "—" },            // RUN
  1: { key: "space", legs: "both", label: "SPACE" },     // JUMP
  2: { key: "down", legs: "both", label: "↓" },          // DUCK
  3: { key: "left", legs: "left", label: "←" },          // LEFT
  4: { key: "right", legs: "right", label: "→" },        // RIGHT
};

const VERT = `#version 300 es
in vec3 aPos;
uniform mat4 uMVP;
uniform mat4 uModel;
out vec3 vWorld;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vWorld;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uEmis;
out vec4 frag;
void main() {
  // The model ships no normals, so derive each face's normal from screen-space derivatives (flat shading)
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 l1 = normalize(vec3(0.45, 0.9, 0.6));
  vec3 l2 = normalize(vec3(-0.6, 0.25, -0.4));
  float d = max(dot(n, l1), 0.0) * 0.85 + max(dot(n, l2), 0.0) * 0.28;
  vec3 h = normalize(l1 + normalize(vec3(0.0, 0.55, 1.0)));
  float spec = pow(max(dot(n, h), 0.0), 26.0) * 0.35;
  vec3 c = uColor * (0.22 + d) + vec3(spec) + uColor * uEmis;
  frag = vec4(c, uAlpha);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error("shader: " + gl.getShaderInfoLog(s));
  return s;
}

// --- 4x4 matrix helpers (column-major, matching WebGL's convention) ---
const ident = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
  o[0] = f / aspect; o[5] = f; o[10] = (far + near) / (near - far);
  o[11] = -1; o[14] = (2 * far * near) / (near - far);
  return o;
}
function lookAt(eye, at, up) {
  const z = norm(sub(eye, at)), x = norm(cross(up, z)), y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
function translation(x, y, z) { const m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }
function rotX(a) {
  const m = ident(), c = Math.cos(a), s = Math.sin(a);
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m;
}

export async function loadFly(base = "data/flybody") {
  const [model, bin] = await Promise.all([
    fetch(`${base}/model.json`).then((r) => r.json()),
    fetch(`${base}/model.bin`).then((r) => r.arrayBuffer()),
  ]);
  return { model, bin };
}

/**
 * A procedurally generated keyboard: one base plate + four keycaps.
 *
 * Heights match the model's real dimensions: the fly's mid and hind legs rest at y = -0.132 (the ground),
 * and at rest the forelegs' tips sit at y ~ -0.105, so the keycap tops go at -0.118, leaving the
 * forelegs hovering about 0.013 above the keys and touching the caps exactly when pressed.
 */
const GROUND_Y = -0.132;
const KEY_TOP = -0.118;

function box(pos, idx, x0, x1, y0, y1, z0, z1) {
  const base = pos.length / 3;
  const v = [
    [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
    [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],
  ];
  for (const p of v) pos.push(p[0], p[1], p[2]);
  const faces = [
    [0,1,2],[0,2,3], [5,4,7],[5,7,6], [4,0,3],[4,3,7],
    [1,5,6],[1,6,2], [3,2,6],[3,6,7], [4,5,1],[4,1,0],
  ];
  for (const f of faces) idx.push(base + f[0], base + f[1], base + f[2]);
}

function keyboardGeometry() {
  // Key positions follow the measured foot-tip coordinates: front_left tip (+0.067, -0.105, +0.063),
  // front_right tip (-0.067, -0.105, +0.062). A leg can only swing about its pivot in the y-z plane,
  // so each leg's own column of keys must sit at its x, or it can never reach them.
  const keys = [
    { id: "space", x: 0.000, z: 0.086, w: 0.190, d: 0.026 },  // wide key, pressed by both legs
    { id: "right", x: 0.067, z: 0.042, w: 0.040, d: 0.026 },  // front_left's column
    { id: "down",  x: 0.000, z: 0.042, w: 0.044, d: 0.026 },  // pressed by both legs drawing inward
    { id: "left",  x: -0.067, z: 0.042, w: 0.040, d: 0.026 }, // front_right's column
  ];
  const pos = [], idx = [], ranges = [];

  const plateStart = idx.length;
  box(pos, idx, -0.112, 0.112, GROUND_Y - 0.008, KEY_TOP - 0.010, 0.020, 0.106);
  ranges.push({ id: "plate", offset: plateStart, count: idx.length - plateStart });

  for (const k of keys) {
    const start = idx.length;
    box(pos, idx,
      k.x - k.w / 2, k.x + k.w / 2,
      KEY_TOP - 0.009, KEY_TOP,
      k.z - k.d / 2, k.z + k.d / 2);
    ranges.push({ id: k.id, offset: start, count: idx.length - start });
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx), ranges };
}

export function createFlyView(canvas, fly) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!gl) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error("link: " + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const U = {
    mvp: gl.getUniformLocation(prog, "uMVP"),
    model: gl.getUniformLocation(prog, "uModel"),
    color: gl.getUniformLocation(prog, "uColor"),
    alpha: gl.getUniformLocation(prog, "uAlpha"),
    emis: gl.getUniformLocation(prog, "uEmis"),
  };
  const aPos = gl.getAttribLocation(prog, "aPos");

  // One VAO per part
  const parts = fly.model.parts.map((p) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fly.bin, p.positionByteOffset, p.positionCount * 3), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(fly.bin, p.indexByteOffset, p.indexCount), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: p.indexCount, group: p.group, material: p.material };
  });

  const kb = keyboardGeometry();
  const kbVao = gl.createVertexArray();
  gl.bindVertexArray(kbVao);
  const kvb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, kvb);
  gl.bufferData(gl.ARRAY_BUFFER, kb.pos, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
  const kib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, kib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, kb.idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const pivots = fly.model.pivots;
  const state = { yaw: 0.30, pitch: 0.34, sway: 0, orbit: true, press: { left: 0, right: 0 }, lean: 0, converge: 0 };
  const keyPress = { space: 0, left: 0, down: 0, right: 0 };

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(r.width * dpr));
    const h = Math.max(2, Math.round((r.height || r.width * 0.62) * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  /**
   * Pressing: rotate about the pivot around the x axis to lower the foot tip, plus a lateral offset.
   * Rotation can only move the tip within the y-z plane, so reaching the central down key needs extra inward travel.
   */
  function legMatrix(group, amount, shiftX) {
    const p = pivots[group];
    if (!p) return ident();
    const a = amount * 0.30;
    const r = mul(mul(translation(p[0], p[1], p[2]), rotX(a)), translation(-p[0], -p[1], -p[2]));
    return shiftX ? mul(translation(shiftX, 0, 0), r) : r;
  }

  function render(action, dt) {
    resize();
    const cfg = ACTION_KEYS[action] ?? ACTION_KEYS[0];

    // The press amount approaches its target exponentially, so the motion does not snap
    const want = {
      left: cfg.legs === "both" || cfg.legs === "left" ? 1 : 0,
      right: cfg.legs === "both" || cfg.legs === "right" ? 1 : 0,
    };
    const k = 1 - Math.exp(-dt * 18);
    state.press.left += (want.left - state.press.left) * k;
    state.press.right += (want.right - state.press.right) * k;
    for (const id of Object.keys(keyPress)) {
      const target = cfg.key === id ? 1 : 0;
      keyPress[id] += (target - keyPress[id]) * k;
    }
    const down = cfg.key === "down" ? 1 : 0;
    state.lean += (down - state.lean) * k;
    state.converge += (down - state.converge) * k;
    if (state.orbit) state.sway += dt * 0.45;

    gl.clearColor(0.024, 0.039, 0.071, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    const aspect = canvas.width / canvas.height;
    const dist = 0.40;
    const yaw = state.yaw + (state.orbit ? Math.sin(state.sway) * 0.34 : 0);
    const eye = [
      Math.sin(yaw) * dist * Math.cos(state.pitch),
      Math.sin(state.pitch) * dist - 0.010,
      Math.cos(yaw) * dist * Math.cos(state.pitch),
    ];
    // The camera looks between the forelegs and the keyboard - the point of this experiment is watching it press keys
    const view = lookAt(eye, [0, -0.058, 0.030], [0, 1, 0]);
    const proj = perspective(0.85, aspect, 0.005, 6);
    const vp = mul(proj, view);

    // The whole body leans forward slightly during the duck action
    const bodyM = rotX(state.lean * 0.10);

    gl.uniform1f(U.emis, 0);
    for (const part of parts) {
      const m =
        part.group === "front_left" ? mul(bodyM, legMatrix("front_left", state.press.left, -state.converge * 0.062))
        : part.group === "front_right" ? mul(bodyM, legMatrix("front_right", state.press.right, state.converge * 0.062))
        : bodyM;
      const col = MATERIAL_COLORS[part.material] ?? [0.6, 0.6, 0.6];
      gl.uniformMatrix4fv(U.model, false, m);
      gl.uniformMatrix4fv(U.mvp, false, mul(vp, m));
      gl.uniform3fv(U.color, col);
      gl.uniform1f(U.alpha, part.material === "membrane" ? 0.45 : 1);
      if (part.material === "membrane") {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
      }
      gl.bindVertexArray(part.vao);
      gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0);
      if (part.material === "membrane") { gl.disable(gl.BLEND); gl.depthMask(true); }
    }

    // Keyboard: the pressed key sinks and lights up
    gl.uniform1f(U.alpha, 1);
    gl.bindVertexArray(kbVao);
    for (const r of kb.ranges) {
      const isPlate = r.id === "plate";
      const p = isPlate ? 0 : keyPress[r.id];
      const m = translation(0, -p * 0.005, 0);
      gl.uniformMatrix4fv(U.model, false, m);
      gl.uniformMatrix4fv(U.mvp, false, mul(vp, m));
      gl.uniform3fv(U.color, isPlate
        ? [0.07, 0.085, 0.11]
        : [0.20 + p * 0.05, 0.25 + p * 0.40, 0.32 + p * 0.16]);
      gl.uniform1f(U.emis, isPlate ? 0 : p * 1.6);
      gl.drawElements(gl.TRIANGLES, r.count, gl.UNSIGNED_INT, r.offset * 4);
    }
    gl.bindVertexArray(null);
  }

  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    state.yaw = drag.yaw - (e.clientX - drag.x) * 0.01;
    state.pitch = Math.max(-0.2, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.01));
  });
  const stop = () => (drag = null);
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);

  return { render, state, triangles: fly.model.outputTriangles };
}
