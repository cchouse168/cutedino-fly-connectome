# Third-party notices

This project bundles the third-party material below. Each retains its original licence.

---

## 1. flyjump / fly-connectome-template (code architecture and method)

**Source**: <https://github.com/cobanov/flyjump> (template: <https://github.com/cobanov/fly-connectome-template>)
**Author**: Mert Cobanov (<https://github.com/cobanov>)
**Licence**: Cobanov Template Attribution License 1.0
(SPDX: `LicenseRef-Cobanov-Template-Attribution-1.0`; full text in `LICENSE-flyjump.txt`)

> Built with [fly-connectome-template](https://github.com/cobanov/fly-connectome-template)
> by [Mert Cobanov](https://github.com/cobanov).

This is a **custom, attribution-requiring source-available licence**. It is not OSI-approved and it
is not MIT / Apache-2.0 / GPL / AGPL. Sections 3 and 4 are mandatory:

- **§3**: every deployed or distributed web interface must display the attribution above, with
  working links, in the main interface, its footer, or an About page reachable by one click, at
  readable contrast and normal zoom. Hidden text, HTML comments, source-code comments, off-screen
  content, hover-only text, or a bare repository link **do not satisfy it**. This project implements
  it in the `<footer>` of `index.html`.
- **§4**: every source repository containing substantial portions of the software must carry the
  same attribution and a reference to the licence in its root README, and modified versions must
  state what was changed. This project implements it at the top of `README.md`.

**Both obligations carry over to anything derived from this project.**

### Scope of adaptation

The algorithms and structure of the following files are adapted from flyjump:

| This project | Corresponding original |
|---|---|
| `src/lib/connectome.js` | `src/lib/connectome.ts` |
| `src/lib/policy.js` | `src/lib/policy.ts` |
| `src/lib/training.js` | `src/lib/training.ts` |
| `src/lib/benchmark.js` | `src/lib/benchmark.ts` |
| `scripts/train.mjs`, `scripts/benchmark.mjs` | `scripts/train.mjs`, `scripts/benchmark.mjs` |

`src/engine/game.js` replaces the original `src/lib/runner.ts` (a Chromium engine wrapper) with a
deterministic cute-dino simulator, and is original to this project.

---

## 2. MaleCNS v1.0 connectome data and soma atlas

**Files**:
- `data/connectome.json` (80 nodes, 1,296 edges)
- `data/brain-atlas/` (positions.bin / ids.bin / groups.bin — 140,024 measured soma coordinates)

**Data creators**: FlyEM / HHMI Janelia, University of Cambridge,
MRC Laboratory of Molecular Biology, Google Research
**Dataset**: <https://male-cns.janelia.org/download/>
**Licence**: Creative Commons Attribution 4.0 International (CC BY 4.0)
(<https://creativecommons.org/licenses/by/4.0/>)

The full notices and change statements are in `data/NOTICE.md` and `data/brain-atlas/NOTICE.md`,
both preserved verbatim.

The soma atlas is the grey background point cloud in the "Brain activity" panel, showing 124,289
classified somata across the optic, central and descending groups; VNC-related and unclassified
somata are not drawn. Rendering applies only centring, rigid rotation and uniform scaling — source
coordinates and body IDs are unmodified. **Dot size on screen does not represent real soma size.**

What this project additionally did to the data: `data/channels.json` reassigns the input-channel
broadcast table. Nodes, edges, synaptic contact counts, neurotransmitter annotations and the output
cell set are **all unmodified**. The input encoding was an engineered choice from the outset, not a
biological measurement.

**The data providers do not endorse this experiment.**

---

## 3. Flybody fruit-fly body model

**Files**: `data/flybody/` (model.bin / model.json — 93,879 triangles)
**Source**: <https://github.com/TuragaLab/flybody>
**Licence**: Apache License 2.0 (full text in `data/flybody/LICENSE`)
**Authors**: Roman Vaxenburg, Igor Siwanowicz, Josh Merel, Alice A. Robie, Carmen Morrow,
Guido Novati, Zinovia Stefanidi, Gert-Jan Both, Gwyneth M. Card, Michael B. Reiser,
Matthew M. Botvinick, Kristin M. Branson, Yuval Tassa, Srinivas C. Turaga
**Collaboration**: Google DeepMind and HHMI Janelia Research Campus
**Paper**: Whole-body physics simulation of fruit fly locomotion,
Nature 643, 1312-1320 (2025), <https://doi.org/10.1038/s41586-025-09029-4>

Used in the "Keyboard output" panel. The binary conversion and foreleg grouping were done by
flyjump and are reused here. **The keyboard geometry, key layout and key-press animation were added
by this project and are not output of the research simulation**; only the anatomical surface
geometry is flybody's work. Full notice in `data/flybody/NOTICE.md`.

---

## 4. cute-dino (game logic and art)

**Source**: <https://github.com/cchouse168/cute-dino>
**Author**: cchouse168

The game rules in `src/engine/game.js` (physics, spawning, collision, pickups, scoring) and the
obstacle, pickup, ground and bullet drawing in `src/engine/render.js` were extracted from that
project's `index.html` and rewritten into a deterministic, headless-capable form. The dinosaur
itself is drawn in a simplified form (the original has 10 skin tiers, wings, spikes and a follower
system).

---

## 5. Original work in this project

Everything else — the deterministic simulator rewrite, the 13-channel measurement and assignment,
the visualisation interface including its point-cloud and WebGL renderers, the acceptance tests and
the documentation — is MIT licensed; see `LICENSE`.

The MIT licence covers **only** this project's original additions. It **cannot** be used to
circumvent the attribution obligations in item 1 above (that licence's §5 explicitly forbids
replacing or contradicting its conditions with another licence).
