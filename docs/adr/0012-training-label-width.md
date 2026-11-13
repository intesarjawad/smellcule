# 0012: Infer training descriptor width from targets

The planned training signature repeats the descriptor count already present in
the target matrix and exceeds the repository's five-argument lint limit.
`train_one_seed(train, validation, *, seed, device, config)` instead infers the
count from training targets and rejects a differing validation width before
fitting. Model construction still accepts `n_labels`. This removes a redundant
input without changing the prescribed network, optimiser, split or acceptance
threshold, and preserves the lint rule without a suppression. Later training
callers must use this signature and preserve the catalogue's label order.
