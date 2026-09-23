/**
 * The 80-cell MaleCNS subcircuit.
 *
 * Ported from flyjump/src/lib/connectome.ts; the dynamics constants and normalisation are unchanged:
 *
 *   W[j,i] = c[j,i]·s[j] / Σ_k( c[k,i]·|s[k]| )
 *   h_new[i] = (1-leak)·h[i] + leak·tanh( u[i] + gain·Σ_j W[j,i]·h[j] )
 *
 * where c is the measured synaptic contact count and s the sign assumed from the
 * neurotransmitter (acetylcholine +1; GABA / glutamate -1).
 *
 * The only difference: the input broadcast table is read from data/channels.json (13 channels, see
 * scripts/remap-channels.mjs) instead of connectome.json's built-in 8. Nodes, edges, contact counts and DN outputs are untouched.
 *
 * This is a dimensionless signed leaky-tanh activity -- not a membrane potential, not a measured firing rate.
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

    // Summed incoming contact counts per post node (using the sign's absolute value), for normalisation
    const totals = new Float64Array(this.count);
    for (const [pre, post, contacts] of graph.edges)
      totals[post] += contacts * Math.abs(graph.nodes[pre].sign);

    // Flattened into three typed arrays, avoiding object-destructuring overhead in the propagation loop
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
   * Advance one decision (3 synchronous time steps).
   * @param {number[]} features  length = channelCount, values in 0..1
   * @param {boolean} ablated  ablation control: force the circuit silent
   * @returns {number[]} the 16 descending neurons' activity x outputGain
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
