import numpy as np
import pytest
import torch
from test_features import molecule

from smellcule.batching import batch_graphs
from smellcule.features import featurise


def test_batching_three_graphs_offsets_and_membership() -> None:
    graphs = [featurise(molecule(smiles)) for smiles in ("CCO", "[He]", "C=C")]
    batch = batch_graphs(graphs)
    assert batch.num_graphs == 3
    assert batch.atom_features.dtype == batch.edge_features.dtype == torch.float32
    assert batch.edge_index.dtype == batch.graph_index.dtype == torch.int64
    assert batch.atom_features.device.type == "cpu"
    np.testing.assert_array_equal(
        batch.atom_features.numpy(), np.concatenate([graph.atom_features for graph in graphs])
    )
    np.testing.assert_array_equal(
        batch.edge_features.numpy(), np.concatenate([graph.edge_features for graph in graphs])
    )
    np.testing.assert_array_equal(
        batch.edge_index.numpy(), [[0, 1, 1, 2, 4, 5], [1, 0, 2, 1, 5, 4]]
    )
    np.testing.assert_array_equal(batch.graph_index.numpy(), [0, 0, 0, 1, 2, 2])
    for source, target in batch.edge_index.T:
        assert batch.graph_index[source] == batch.graph_index[target]


def test_batching_unbonded_graphs() -> None:
    batch = batch_graphs([featurise(molecule("[He]")), featurise(molecule("C.C"))])
    assert batch.edge_index.shape == (2, 0)
    assert batch.edge_features.shape == (0, 10)
    np.testing.assert_array_equal(batch.graph_index.numpy(), [0, 1, 1])


def test_batching_rejects_empty_sequence() -> None:
    with pytest.raises(ValueError, match="empty graph sequence"):
        batch_graphs([])
