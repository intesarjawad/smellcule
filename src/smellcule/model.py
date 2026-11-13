import torch
from torch import Tensor, nn

from smellcule.batching import GraphBatch
from smellcule.features import ATOM_FEATURE_DIM, EDGE_FEATURE_DIM


class StableLinear(nn.Module):
    """Accumulate CPU products widely so changing batch shape preserves predictions."""

    def __init__(self, in_features: int, out_features: int) -> None:
        super().__init__()
        self.linear = nn.Linear(in_features, out_features)

    def forward(self, inputs: Tensor) -> Tensor:
        """Retain parameter precision while avoiding float32 reduction-order drift."""
        dtype = torch.float64 if inputs.device.type == "cpu" else self.linear.weight.dtype
        return nn.functional.linear(
            inputs.to(dtype), self.linear.weight.to(dtype), self.linear.bias.to(dtype)
        ).to(self.linear.weight.dtype)


class MessageStep(nn.Module):
    """Apply edge-conditioned neighbour sums and a normalised residual update."""

    def __init__(self, hidden: int) -> None:
        super().__init__()
        self.edge_encoder = StableLinear(EDGE_FEATURE_DIM, hidden)
        self.mlp = nn.Sequential(
            StableLinear(hidden, hidden), nn.ReLU(), StableLinear(hidden, hidden)
        )
        self.norm = nn.LayerNorm(hidden)

    def forward(self, atoms: Tensor, batch: GraphBatch) -> Tensor:
        """Update atoms using both directions of each source bond."""
        source, target = batch.edge_index
        messages = torch.relu(atoms[source] + self.edge_encoder(batch.edge_features))
        # Wider CPU reductions keep atom permutations within the output tolerance.
        reduction_dtype = torch.float64 if atoms.device.type == "cpu" else atoms.dtype
        neighbours = (
            torch.zeros_like(atoms, dtype=reduction_dtype)
            .index_add_(0, target, messages.to(reduction_dtype))
            .to(atoms.dtype)
        )
        return self.norm(atoms + self.mlp(atoms + neighbours))


class OdourMPNN(nn.Module):
    """Predict perception descriptors from disjoint molecular graphs."""

    def __init__(
        self,
        n_labels: int,
        hidden: int = 192,
        steps: int = 4,
        embed_dim: int = 256,
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        self.atom_encoder = StableLinear(ATOM_FEATURE_DIM, hidden)
        self.message_steps = nn.ModuleList([MessageStep(hidden) for _ in range(steps)])
        self.readout = StableLinear(3 * hidden, embed_dim)
        self.dropout = nn.Dropout(dropout)
        self.head = StableLinear(embed_dim, n_labels)

    def embed(self, batch: GraphBatch) -> Tensor:
        """Return graph embeddings before dropout and the descriptor head."""
        counts = torch.bincount(batch.graph_index, minlength=batch.num_graphs)
        if bool((counts == 0).any()):
            message = "Cannot embed an empty molecular graph; supply at least one atom per graph."
            raise ValueError(message)
        atoms = self.atom_encoder(batch.atom_features)
        for step in self.message_steps:
            atoms = step(atoms, batch)
        reduction_dtype = torch.float64 if atoms.device.type == "cpu" else atoms.dtype
        sums = torch.zeros(
            (batch.num_graphs, atoms.shape[1]), dtype=reduction_dtype, device=atoms.device
        ).index_add_(0, batch.graph_index, atoms.to(reduction_dtype))
        means = sums / counts.unsqueeze(1)
        maxima = atoms.new_full(sums.shape, -torch.inf).scatter_reduce_(
            0, batch.graph_index.unsqueeze(1).expand_as(atoms), atoms, reduce="amax"
        )
        return torch.relu(self.readout(torch.cat((sums, means, maxima), dim=1).to(atoms.dtype)))

    def forward(self, batch: GraphBatch) -> Tensor:
        """Return one logit per graph and descriptor."""
        return self.head(self.dropout(self.embed(batch)))
