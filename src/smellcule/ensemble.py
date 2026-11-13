from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
import torch
from torch import Tensor

from smellcule.batching import batch_graphs
from smellcule.metrics import FloatArray
from smellcule.model import OdourMPNN
from smellcule.training import (
    TrainedModel,
    TrainingConfig,
    TrainingSet,
    graph_batch_to,
    predict_probabilities,
    train_one_seed,
)


@dataclass(frozen=True)
class Ensemble:
    """Seed-ordered members with unaligned embedding spaces kept separate."""

    members: tuple[TrainedModel, ...]

    def predict(self, dataset: TrainingSet, device: torch.device) -> tuple[FloatArray, FloatArray]:
        """Return mean sigmoid probabilities and population standard deviation."""
        values = np.stack(
            [
                predict_probabilities(member.model, dataset, device).numpy()
                for member in self.members
            ]
        ).astype(np.float64)
        return values.mean(axis=0), values.std(axis=0)

    def embed(self, dataset: TrainingSet, device: torch.device, batch_size: int = 64) -> Tensor:
        """Concatenate per-member L2-normalised embeddings in input order."""
        embeddings: list[Tensor] = []
        with torch.no_grad():
            for member in self.members:
                member.model.eval()
                values = torch.cat(
                    [
                        member.model.embed(
                            graph_batch_to(
                                batch_graphs(dataset.graphs[start : start + batch_size]), device
                            )
                        ).cpu()
                        for start in range(0, len(dataset.graphs), batch_size)
                    ]
                )
                embeddings.append(torch.nn.functional.normalize(values, dim=1))
        return torch.cat(embeddings, dim=1)


def train_ensemble(
    train: TrainingSet,
    validation: TrainingSet,
    *,
    device: torch.device,
    config: TrainingConfig,
    seeds: Sequence[int] = tuple(range(10)),
) -> Ensemble:
    """Fit independent seeds through the committed binary training API."""
    if not seeds:
        message = "An ensemble needs at least one seed."
        raise ValueError(message)
    return Ensemble(
        tuple(
            train_one_seed(train, validation, seed=seed, device=device, config=config)
            for seed in seeds
        )
    )


def model_from_config(n_labels: int, config: TrainingConfig) -> OdourMPNN:
    """Construct the pinned network for Keller's distinct stopping protocol."""
    return OdourMPNN(n_labels, config.hidden, config.steps, config.embed_dim, config.dropout)
