from collections.abc import Sequence
from dataclasses import dataclass

import torch
from torch import Tensor

from smellcule.features import GraphArrays


@dataclass(frozen=True)
class GraphBatch:
    """Disjoint graphs with atom-to-graph membership for message passing and pooling."""

    atom_features: Tensor
    edge_index: Tensor
    edge_features: Tensor
    graph_index: Tensor
    num_graphs: int


def batch_graphs(graphs: Sequence[GraphArrays]) -> GraphBatch:
    """Concatenate graphs on CPU, offsetting edges by preceding atom counts."""
    if not graphs:
        message = "Cannot batch an empty graph sequence."
        raise ValueError(message)
    offset = 0
    edges: list[Tensor] = []
    membership: list[Tensor] = []
    for index, graph in enumerate(graphs):
        atom_count = graph.atom_features.shape[0]
        edges.append(torch.tensor(graph.edge_index, dtype=torch.int64) + offset)
        membership.append(torch.full((atom_count,), index, dtype=torch.int64))
        offset += atom_count
    return GraphBatch(
        torch.cat([torch.tensor(graph.atom_features, dtype=torch.float32) for graph in graphs]),
        torch.cat(edges, dim=1),
        torch.cat([torch.tensor(graph.edge_features, dtype=torch.float32) for graph in graphs]),
        torch.cat(membership),
        len(graphs),
    )
