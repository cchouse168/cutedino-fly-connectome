# A fly brain plays cute-dino

**[Try it live →](https://cchouse168.github.io/cutedino-fly-connectome/)** · [繁體中文](README.zh-TW.md)

**80 real neurons and 1,296 measured synaptic connections** from the MaleCNS v1.0
fly connectome form a circuit that is entirely fixed and never trained. Behind it sits a
single **269-parameter** readout network — the only thing in the system that is trained.
It plays [cute-dino](https://github.com/cchouse168/cute-dino).

> Built with [fly-connectome-template](https://github.com/cobanov/fly-connectome-template) by [Mert Cobanov](https://github.com/cobanov).

Method and code architecture adapted from [cobanov/flyjump](https://github.com/cobanov/flyjump)
([Fly Dino](https://flydino.cobanov.dev/)) under the **Cobanov Template Attribution License 1.0**
([`LICENSE-flyjump.txt`](LICENSE-flyjump.txt)). **Changes made in this project**, as required by
section 4 of that license: plays cute-dino instead of the Chromium dinosaur game and rebuilt as a
deterministic headless simulator; sensory channels remapped 8 → 13; action space expanded 3 → 5
(LEFT/RIGHT added); CEM training courses and validation seeds raised for cute-dino's higher variance.

---

## Results

100 unseen tracks, 180 s cap each:

| Group | Completed | Mean survival |
|---|---:|---:|
| **Connectome + trained readout** | **82/100** | **161.1s** |
| Circuit silenced (ablation) | 0/100 | 3.5s |
| Untrained readout | 0/100 | 3.5s |
| Hand-written rules | 25/100 | 82.4s |
| No action at all | 0/100 | 3.5s |

With the circuit zeroed the readout receives 16 zeros, its action scores freeze, and the agent
repeats a single action for the whole run — dead at the first obstacle after 3.5 s, exactly the
same as doing nothing.

Two caveats: **82/100 is one deployed model, not the method's average** (other training seeds give
46–87), and **this does not show that the fly's wiring beats random wiring** — that would need a
shuffled-connectome control retrained from scratch, which this project did not run.
Full data, power analysis and limitations are in [`docs/report.md`](docs/report.md).

## Running it

No build step.

```bash
npx serve -l 4173 .      # open http://localhost:4173
npm test                 # simulator determinism + circuit/readout sanity checks
npm run train            # CEM training (~20 min on 12 threads)
npm run benchmark        # 100 held-out tracks + ablation controls
```

The keyboard-output panel needs WebGL2; without it that panel shows a notice and everything
else still works. The interface ships in both English and 繁體中文 — toggle in the top right.

## Documentation

| | |
|---|---|
| [`docs/report.md`](docs/report.md) | Full results, method trade-offs and known limitations |
| [`docs/experiment.md`](docs/experiment.md) | Reproduction: protocol, equations, channel table, benchmark method |
| [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) | Complete third-party provenance and licensing |

## Licensing

- Original work in this project: MIT ([`LICENSE`](LICENSE))
- Parts adapted from flyjump: Cobanov Template Attribution License 1.0 — the attribution in the
  web interface and in this README is a **mandatory condition of that license and must not be removed**
- `data/connectome.json`, `data/brain-atlas/`: derived from MaleCNS v1.0, CC BY 4.0, created by
  FlyEM / HHMI Janelia, University of Cambridge, MRC Laboratory of Molecular Biology and
  Google Research ([`data/NOTICE.md`](data/NOTICE.md))
- `data/flybody/`: [TuragaLab/flybody](https://github.com/TuragaLab/flybody), Apache 2.0
- cute-dino game: [cchouse168](https://github.com/cchouse168), MIT

## Disclaimer

Circuit activity is a simulated, dimensionless value — not a membrane potential and not a measured
firing rate. The input encoding and action readout are both hand-specified, not biological
measurements. This is one small selected circuit, not a complete brain. The data providers do not
endorse this experiment.
