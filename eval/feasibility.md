# Feasibility gate

held_out_macro_auroc: 0.892231186

Passed on the Mac CPU with seed 0 and the default OdourMPNN. This value comes
from the completed run recorded in [feasibility-default.json](feasibility-default.json),
finished at 2026-11-05T10:22:34.268190+00:00. No quality retry or model fallback
was needed. ADR 0011 is therefore not applicable.

Reproduce from the repository root:

```sh
UV_CACHE_DIR=.cache/uv uv run python scripts/feasibility.py --device cpu --out eval/feasibility-default.json
```

Measured environment: `macOS-27.2-arm64-arm-64bit-Mach-O`, Python 3.13.16,
PyTorch 2.15.0, NumPy 2.5.4, RDKit 2026.9.1 and scikit-learn 1.9.1. Device:
`cpu`, four intra-op threads, deterministic algorithms enabled during fitting.
PyTorch reported `mps_built=True`, `mps_available=False` in the measured session.
The CPU run is the evidence for this gate; MPS was not tested.

| Measurement | Observed value |
| --- | ---: |
| Official training rows | 2,246 |
| Official validation rows | 555 |
| Official held-out rows | 722 |
| Held-out labels with a positive and a negative | 113 of 113 |
| Best validation macro AUROC | 0.897837841 |
| Best epoch | 36 |
| Epochs completed, including patience | 66 |
| Training wall time per seed | 39.710907 s |
| Total wall time including source preparation and held-out scoring | 40.906815 s |

Validation is cv0 = 0 within official train. The held-out targets never enter
optimisation or early stopping. The best validation checkpoint is restored before
held-out prediction. Both macro averages skip columns without both classes.
The source SHA-256, configuration and every epoch's measured loss, validation
AUROC and elapsed time are in the JSON record.

The network uses hidden 192, four message steps, embedding 256 and dropout 0.1.
Training uses batch 64, AdamW at 0.001 with weight decay 0.0001, cosine decay to
0.00001 over at most 200 epochs and validation patience 30. CPU dense products
and graph sums accumulate in float64, with float32 parameters and graph inputs;
this meets the required 1e-6 permutation tolerance. See [training notes](../docs/training.md).

Local, ignored evidence is in `artifacts/feasibility-default/model.safetensors`
and `artifacts/feasibility-default/held_out.npz`. The latter retains input-order
molecule IDs, label order, targets and probabilities for independent rescoring.
These files contain the final measured run, not the preliminary implementation.
Independent scikit-learn rescoring of the saved arrays returned
`0.892231186414` over 113 labels and 722 unique held-out IDs. The saved
checkpoint loaded strictly into the default model; all 38 tensors survived a
safetensors serialization round trip unchanged.

## Projected full-run time

The projected MPNN training portion of the full run is **3,952.09 seconds,
65.87 minutes**. This is an estimate from the measured seed, not a completed
ensemble run. The benchmark script computes the stage estimates below.

| Planned training stage | Projection |
| --- | ---: |
| Official, 10 seeds | 397.11 s |
| Cluster, 10 seeds | 390.30 s |
| GS-LF CV, 5 folds, 10 seeds per fold | 2,825.84 s |
| Keller CV, 5 folds, 10 seeds per fold | 271.07 s |
| Keller final, 10 seeds | 67.77 s |

Method: multiply 39.710907 seconds by the number of seeds and the ratio of
training-plus-validation row counts to the official 2,801 rows. Cluster uses
2,753 rows, GS-LF uses approximately 0.8 times 4,983 per fold, Keller CV uses
approximately 0.8 times 478 per fold, and Keller final uses 478. Reused predictions
for the other evaluation runs add no training seeds. The estimate assumes the
same epoch count and comparable cost per row; graph sizes, label counts, cluster
fold sizes and early-stopping behaviour can change actual runtime. Keller will
use Pearson validation and its prescribed final epoch count in the full run.

If every projected seed instead takes all 200 epochs at the measured average
epoch cost, the same workload scaling gives **11,976.04 seconds, 3.33 hours**
of MPNN training. This is a scenario estimate, not a runtime bound.
The end-to-end `smellcule reproduce` projection is the MPNN estimate plus unmeasured
RF fitting, metrics/bootstrap, source preparation and I/O. The separate Chemprop
and map/export stages are also unmeasured and excluded. No timing is claimed
for those stages.

GS-LF with 10 models per fold projects to 47.10 minutes, below the four-hour
tripwire. Keep ensemble size 10. For reference, five models per fold project to
1,412.92 seconds, and one per fold to 282.58 seconds.

## Escalation and fallback rules

The CPU seed is below 30 minutes, so no device escalation is triggered. If a
later CPU seed exceeds 30 minutes, run on a session with MPS available:

```sh
UV_CACHE_DIR=.cache/uv uv run python scripts/feasibility.py --device mps --out eval/feasibility-mps.json
```

If MPS still exceeds 30 minutes, use a CUDA host. Device
runtime is a tripwire, not a quality threshold. If a measured default seed misses
0.86, make exactly the prescribed quality retry:

```sh
UV_CACHE_DIR=.cache/uv uv run python scripts/feasibility.py --device cpu --retry --out eval/feasibility-retry.json
```

That retry uses hidden 256, five steps and dropout 0.2. If it also misses 0.86,
switch to the count-Morgan FingerprintMLP fallback, retain the measured
results, and write `docs/adr/0011-*.md`. Do not replace a failed measurement with
an unmeasured value. For GS-LF, reduce 10 models per fold to five only if its
projection exceeds four hours, then to one if five still exceeds four hours.
