from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
import torch
from numpy.typing import NDArray

from smellcule import catalogue, splits
from smellcule.features import featurise
from smellcule.metrics import FloatArray
from smellcule.molecules import Molecule, source_structures, standardise
from smellcule.training import TrainingSet


@dataclass(frozen=True)
class ExperimentData:
    """Row-aligned structures, descriptor order and targets for an experiment."""

    molecules: tuple[Molecule, ...]
    labels: tuple[str, ...]
    dataset: TrainingSet

    def subset(self, indices: Sequence[int]) -> TrainingSet:
        """Select rows without changing graph or descriptor order."""
        return TrainingSet(
            tuple(self.dataset.graphs[i] for i in indices), self.dataset.targets[list(indices)]
        )

    @property
    def targets(self) -> FloatArray:
        """Expose ratings at metric precision without altering training precision."""
        return self.dataset.targets.numpy().astype(np.float64)


def prepare(
    rows: Sequence[catalogue.CatalogueRow],
    labels: tuple[str, ...],
    targets: Sequence[Sequence[float]] | None = None,
) -> ExperimentData:
    """Featurise only pinned source molecules; soft ratings retain their scale."""
    molecules = tuple(standardise(row) for row in rows)
    return ExperimentData(
        molecules,
        labels,
        TrainingSet(
            tuple(
                featurise(molecule) for molecule in source_structures([row.smiles for row in rows])
            ),
            torch.tensor(
                [row.measured for row in rows] if targets is None else targets, dtype=torch.float32
            ),
        ),
    )


def cluster_ids(data: ExperimentData) -> tuple[splits.ClusterSplit, NDArray[np.int64]]:
    """Keep the hash-ordered Butina membership for splitting and bootstrap."""
    partition = splits.cluster_split(data.molecules)
    groups = np.empty(len(data.molecules), dtype=np.int64)
    for group, indices in enumerate(partition.clusters):
        groups[list(indices)] = group
    return partition, groups


def gslf_validation(indices: Sequence[int], fold: int) -> tuple[list[int], list[int]]:
    """Reserve the first ceil(10 percent) of the fold-seeded training permutation."""
    order = np.random.default_rng(fold).permutation(indices).tolist()
    count = int(np.ceil(0.1 * len(order)))
    return order[count:], order[:count]
