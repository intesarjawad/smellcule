# 0009: Isolated Chemprop environment

## Context

Chemprop is a baseline with its own dependency requirements.

## Decision

Run Chemprop in an isolated environment.

I confirmed the installed 2.3.1 CLI using `chemprop train --help` and
`chemprop predict --help`, each launched through
`uv run --isolated --with chemprop==2.3.1`.

- Explicit train, validation and held-out files use
  `--data-path train.csv validation.csv held_out.csv`, in that order. Separate
  validation and test path flags are unnecessary with this version.
- Training retains `--task-type classification --ensemble-size 10 --epochs 100
  --accelerator cpu --data-seed 0 --pytorch-seed 0`. The CLI increments the
  PyTorch seed by member index. Default early-stopping patience equals the epoch
  count, so it does not shorten this run.
- Both commands also use `--devices 1 --num-workers 0`. Training writes to an
  explicit `--output-dir`. Prediction uses `--test-path`, `--model-paths` with
  exactly ten `best.pt` files, and `--preds-path`. Those files contain the best
  validation checkpoint for each member. Prediction averages the ensemble.
- CPU thread environment variables default to four when the caller has not set
  them. No architecture or optimisation defaults are changed.
- CSVs, model checkpoints, command logs and intermediate evaluation results live
  in a `TemporaryDirectory` under `TMPDIR`, removed on exit. Only held-out
  InChIKey-keyed prediction CSVs remain in `artifacts/`.
- Each split is scored with `smellcule evaluate --predictions --split` into temporary
  results. The runner combines the two split entries under the required model
  name through `update_results`, preserving unrelated submissions and top-level
  results. This avoids overwriting the first split when scoring the second.

## Consequence

The baseline can be run without adding its dependencies to the project's base environment.

`make chemprop` runs both full ensembles on CPU and records training, prediction
and evaluation wall times beside their submission metrics in `eval/results.json`.
Its source URL identifies the versioned Chemprop documentation; the source
licence remains MIT. Training structures and measured perception targets come
only from the pinned catalogue and committed split implementation.
