# Graph features and batches

`features.featurise(molecule)` builds the atom and bond features. It copies the
RDKit molecule before assigning CIP labels, preserving input atom order and
properties. Each bond produces adjacent forward and reverse edges with identical
features. Unbonded molecules have edge arrays shaped `(2, 0)` and `(0, 10)`.
Unsupported degree, charge, hydrogen count or bond categories raise `ValueError`.

`batching.batch_graphs(graphs)` returns CPU tensors: `atom_features` and
`edge_features` are float32; `edge_index` and `graph_index` are int64.
`graph_index` maps each atom to its input graph, and `num_graphs` preserves the
input graph count. Edges are offset by preceding atom counts. An empty sequence
raises `ValueError`. Tensor construction copies the feature arrays. The pinned
PyTorch `from_numpy` annotation exposes an unknown argument type under strict
Pyright, so batching uses `torch.tensor` with explicit dtypes.

The Vanillin golden specifies all 11 atom rows, 22 directed edges and 22 bond
rows independently. The renumbering property covers Vanillin and all five stereo
rows in the synthetic Leffingwell-format fixture, checking row multisets and directed connectivity.
Separate cases verify R/S, pseudo-asymmetric r/s, E/Z and unspecified stereo.
`test_model_atom_renumbering` verifies model outputs on the same six
fixture molecules with absolute tolerance 1e-6 and zero relative tolerance.
CPU accumulation details and the measured gate result are in
[training.md](training.md).
