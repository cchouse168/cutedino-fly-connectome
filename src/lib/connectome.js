/**
 * 80 細胞 MaleCNS 子電路。
 *
 * 移植自 flyjump/src/lib/connectome.ts，動態常數與正規化公式完全未改：
 *
 *   W[j,i] = c[j,i]·s[j] / Σ_k( c[k,i]·|s[k]| )
 *   h_new[i] = (1-leak)·h[i] + leak·tanh( u[i] + gain·Σ_j W[j,i]·h[j] )
 *
 * 其中 c 為實測突觸接觸數、s 為依神經傳導物質假定的正負號
 * （acetylcholine +1；GABA / glutamate −1）。
 *
 * 唯一的差異：輸入廣播表改讀 data/channels.json（13 通道，見 scripts/remap-channels.mjs），
 * 而非 connectome.json 內建的 8 通道。節點、邊、接觸數、DN 輸出皆未更動。
 *
 * 這是無量綱的 signed leaky tanh 活性，不是膜電位、也不是實測發放率。
 */
export const DYNAMICS = { iterations: 3, leak: 0.7, gain: 1.4, outputGain: 4 };

export class Connectome {
  /**
   * @param {object} graph  data/connectome.json
   * @param {object} channelMap  data/channels.json
   */
  constructor(graph, channelMap) {
    this.graph = graph;
    this.channelMap = channelMap;
    this.count = graph.nodes.length;
    this.outputs = graph.outputs;
    this.channelCount = channelMap.channelCount;

    // 每個 post 節點的入邊接觸數總和（取正負號絕對值），用於正規化
    const totals = new Float64Array(this.count);
    for (const [pre, post, contacts] of graph.edges)
      totals[post] += contacts * Math.abs(graph.nodes[pre].sign);

    // 攤平成三個 typed array，避免傳播迴圈裡的物件解構開銷
    const n = graph.edges.length;
    this.pre = new Int32Array(n);
    this.post = new Int32Array(n);
    this.weight = new Float64Array(n);
    for (let e = 0; e < n; e++) {
      const [pre, post, contacts] = graph.edges[e];
      this.pre[e] = pre;
      this.post[e] = post;
      this.weight[e] = totals[post] ? (contacts * graph.nodes[pre].sign) / totals[post] : 0;
    }

    this.inputCells = Int32Array.from(channelMap.inputs.map(([cell]) => cell));
    this.inputChannels = Int32Array.from(channelMap.inputs.map(([, ch]) => ch));

    this.activity = new Float64Array(this.count);
    this.scratch = new Float64Array(this.count);
    this.drive = new Float64Array(this.count);
    this.out = new Array(this.outputs.length).fill(0);
  }

  reset() {
    this.activity.fill(0);
  }

  /**
   * 推進一次決策（3 個同步時間步）。
   * @param {number[]} features  長度 = channelCount，值域 0..1
   * @param {boolean} ablated  消融對照：強制電路靜默
   * @returns {number[]} 16 顆下行神經元的活性 × outputGain
   */
  step(features, ablated = false) {
    if (ablated) {
      this.activity.fill(0);
      for (let i = 0; i < this.out.length; i++) this.out[i] = 0;
      return this.out;
    }

    this.drive.fill(0);
    for (let i = 0; i < this.inputCells.length; i++)
      this.drive[this.inputCells[i]] = 2 * (features[this.inputChannels[i]] - 0.5);

    const { iterations, leak, gain } = DYNAMICS;
    const n = this.pre.length;
    for (let t = 0; t < iterations; t++) {
      this.scratch.set(this.drive);
      for (let e = 0; e < n; e++)
        this.scratch[this.post[e]] += gain * this.weight[e] * this.activity[this.pre[e]];
      for (let i = 0; i < this.count; i++)
        this.activity[i] = (1 - leak) * this.activity[i] + leak * Math.tanh(this.scratch[i]);
    }

    for (let i = 0; i < this.outputs.length; i++)
      this.out[i] = this.activity[this.outputs[i]] * DYNAMICS.outputGain;
    return this.out;
  }
}
