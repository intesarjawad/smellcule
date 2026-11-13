# Reproducing the perception experiments

From the repository root, `make reproduce` fetches checksum-verified sources,
trains new ensembles on the CPU, evaluates them, and atomically merges the owned
runs into `eval/results.json`. It renders the evaluation report and figures in
`docs/evaluation.md` and `docs/figures/` from the recorded results.
Map run 9 requires the exported bundle. Chemprop run 10 requires its isolated
environment. Neither is part of this command.

The installed command defaults to `smellcule-results/results.json` and
`smellcule-results/evaluation.md` in the current directory. For a smaller independent
run:

```sh
smellcule reproduce --runs official --ensemble-size 2 \
  --results scratch/results.json --report scratch/evaluation.md \
  --artifacts scratch/artifacts
```

`--runs` accepts names or the corresponding run numbers. Dependencies are trained
even when only a derived run is requested. For example, `cross_source` needs the
cluster ensemble. `smellcule train` writes local checkpoints without evaluating or
changing results. `smellcule evaluate` restores matching checkpoints and evaluates
them; it fits the deterministic random forest on the prescribed training rows.
`reproduce` always trains fresh members and never resumes a saved checkpoint.

The CLI is a package at `src/smellcule/cli/`. Its public entry points are
unchanged. The base shell defers loading the research shell until a research
subcommand is selected. A lint rule forbids importing that research shell at
module level, preserving the base installation's dependency boundary.

## Local evidence

All weights and prediction arrays are ignored by Git and remain local:

| Path under `artifacts/` | Contents |
| --- | --- |
| `official/` | Official ensemble weights, configuration and descriptor order |
| `cluster/` | Released Leffingwell ensemble inputs for later publishing |
| `gslf_cv/fold{k}/` | Independently trained members for each GS-LF fold |
| `keller_cv/fold{k}/` | Independently trained members for each Keller fold |
| `smellcule-open/` | Final ensemble trained on all Keller molecules |
| `official.npz`, `cluster.npz` | Input-order probabilities, spread, split and nearest-train similarity |
| `gslf_oof.npz` | Out-of-fold probabilities, spread, targets, descriptor order and fold |
| `keller_oof.npz` | CID, out-of-fold probabilities, spread, fold, nearest-train similarity, targets and observation mask |

Each checkpoint uses `model.safetensors` with `seed{k}.{parameter}` keys,
`config.json`, and `labels.json`. Ensembles average member sigmoids and use the
population standard deviation for spread. Export embeddings concatenate each
member's separately normalised embedding; the member spaces are never averaged.

Keller's absent ratings are masked in both the soft-target loss and Pearson
validation. Zero placeholders in the training matrix are never observations.
The observation mask is saved with out-of-fold evidence. CV holds out one fold,
uses the next fold for validation, and trains on the other folds. Each fold's
best epoch is the integer median of its members' best epochs. The median of
those fold epochs sets the final fixed epoch count. The final fit has no
validation set.

Result entries record both macro support thresholds, confidence intervals,
ensemble size, installed versions, machine, and elapsed time. The stable binary
macro average requires five positives. For Keller, both label-count fields
refer to defined continuous correlations; positive-count thresholds do not apply.
Bootstrap intervals resample molecules or whole clusters as required by the run.
Paired model comparisons use the same resampled rows. Stereo intervals resample
molecule pairs.

Derived runs record their parent's preparation time under `training.wall_time_s`.
Their total includes that preparation plus their own evaluation, so summing all
run totals double-counts reused training. Per-run training and evaluation timings are recorded in the `wall_time_s`
fields in `eval/results.json`.
