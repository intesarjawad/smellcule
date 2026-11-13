# Feasibility training

The feasibility run passed with the default network on CPU. The measured result, exact command,
environment, source checksum, timing and full-run projections are in
[`eval/feasibility.md`](../eval/feasibility.md) and its linked JSON record.

`OdourMPNN` consumes the committed `GraphBatch` directly. Each message step has
its own edge encoder, two-layer MLP and residual LayerNorm. Sum, mean and max
pooling precede the embedding, dropout and descriptor head. Empty molecular
graphs are rejected; unbonded atoms are supported.

Float32 CPU summation produced an observed permutation error above 1e-6 in the
default network. CPU graph reductions and dense products therefore accumulate
in float64, returning float32 activations and retaining float32 parameters.
This also prevents batch-size-dependent dense products from changing logits
beyond the same tolerance. Accelerator reductions retain the parameter dtype
because MPS does not support float64. Accelerator numerics remain unverified.
The synthetic fixture property test covers Vanillin and every fixture row with atom or
double-bond stereo, with an absolute output tolerance of 1e-6 and zero relative
tolerance. Separate tests check batch isolation and all parameter gradients.

`TrainingSet(graphs, targets)` holds graph-aligned float32 CPU targets.
`train_one_seed(train, validation, *, seed, device, config)` infers the descriptor
count from the target width and checks validation width before fitting. It
returns the restored best model, best epoch, best validation AUROC, complete
wall time and epoch history. The descriptor-width API refinement is recorded in
[ADR 0012](adr/0012-training-label-width.md).

The loop uses seeded shuffling, AdamW, cosine learning-rate decay, binary cross
entropy and validation early stopping. Predictions disable dropout and retain
input order. CPU RNG state and deterministic-algorithm mode are restored on
return. Tests verify exact CPU repeatability and best-checkpoint restoration
after the patience interval. A narrow `torch_api` facade and its companion stub
describe the upstream unannotated seed and optimiser entry points without
changing their runtime implementation or weakening strict checks.

The runner supports CPU, MPS, CUDA and the prescribed larger-network retry.
It writes machine-readable evidence plus ignored safetensors and held-out
prediction arrays. The public `smellcule train`, `smellcule evaluate` and
`smellcule reproduce` commands support ensembles, Keller Pearson validation and
final fixed-epoch training. Their checkpoint formats, timings and reproduction
workflow are described in [reproduction.md](reproduction.md). Binary evaluation
uses the shared metrics module for both descriptor support thresholds.
