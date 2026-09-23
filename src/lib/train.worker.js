/** In-browser CEM candidate-evaluation worker. */
import { Connectome } from "./connectome.js";
import { fitness } from "./training.js";

let brain = null;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "init") {
    brain = new Connectome(m.graph, m.channelMap);
    self.postMessage({ type: "ready" });
    return;
  }
  if (m.type === "eval") {
    const fits = m.candidates.map((w) => fitness(w, m.seeds, m.seconds, brain));
    self.postMessage({ type: "fits", id: m.id, fits });
  }
};
