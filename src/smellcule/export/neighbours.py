from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from rdkit import DataStructs
from rdkit.Chem.rdFingerprintGenerator import GetMorganGenerator

from smellcule.metrics import MATRIX_DIMENSIONS, FloatArray
from smellcule.molecules import Molecule, nearest_similarity, source_structures
from smellcule.splits import MORGAN_BITS, MORGAN_RADIUS, Split

# Neighbours are ranked in the full embedding, before projection.
NEIGHBOUR_COUNT = 8


@dataclass(frozen=True)
class Neighbour:
    """Catalogue id with full-embedding cosine and achiral binary Morgan Tanimoto."""

    id: str
    odour: float
    structure: float


def build_neighbours(
    molecules: Sequence[Molecule], embeddings: FloatArray
) -> tuple[tuple[Neighbour, ...], ...]:
    """Return eight distinct other rows per molecule, breaking cosine ties by input order."""
    if len(molecules) <= NEIGHBOUR_COUNT:
        message = "Neighbours need at least 9 catalogue molecules."
        raise ValueError(message)
    if len({row.molecule_id for row in molecules}) != len(molecules):
        message = "Neighbour molecule ids must be unique."
        raise ValueError(message)
    if (
        embeddings.ndim != MATRIX_DIMENSIONS
        or embeddings.shape[0] != len(molecules)
        or embeddings.shape[1] == 0
        or not np.isfinite(embeddings).all()
    ):
        message = "Neighbour embeddings must be a finite matrix aligned with catalogue rows."
        raise ValueError(message)
    norms = np.linalg.norm(embeddings, axis=1)
    if not np.isfinite(norms).all() or np.any(norms == 0):
        message = "Neighbour embeddings must have finite, nonzero norms for cosine similarity."
        raise ValueError(message)
    normalised = embeddings / norms[:, None]
    similarities = np.clip(normalised @ normalised.T, -1.0, 1.0)
    np.fill_diagonal(similarities, -np.inf)
    generator = GetMorganGenerator(radius=MORGAN_RADIUS, fpSize=MORGAN_BITS, includeChirality=False)
    fingerprints = [
        generator.GetFingerprint(molecule)
        for molecule in source_structures([row.smiles for row in molecules])
    ]
    neighbours: list[tuple[Neighbour, ...]] = []
    for index, scores in enumerate(similarities):
        nearest: list[int] = np.argsort(-scores, kind="stable")[:NEIGHBOUR_COUNT].tolist()
        structure = DataStructs.BulkTanimotoSimilarity(
            fingerprints[index], [fingerprints[other] for other in nearest]
        )
        neighbours.append(
            tuple(
                Neighbour(molecules[other].molecule_id, float(scores[other]), similarity)
                for other, similarity in zip(nearest, structure, strict=True)
            )
        )
    return tuple(neighbours)


def nearest_train_similarities(
    molecules: Sequence[Molecule], assignments: Sequence[Split]
) -> tuple[float | None, ...]:
    """Return max train Tanimoto for validation and held-out rows; train rows stay null."""
    if len(molecules) != len(assignments):
        message = "Split assignments must align with molecule rows."
        raise ValueError(message)
    train = [row for row, split in zip(molecules, assignments, strict=True) if split == "train"]
    query_indices = [index for index, split in enumerate(assignments) if split != "train"]
    result: list[float | None] = [None] * len(molecules)
    if query_indices:
        if not train:
            message = "Nearest-train similarity needs at least one training molecule."
            raise ValueError(message)
        scores = nearest_similarity([molecules[index] for index in query_indices], train)
        for index, score in zip(query_indices, scores, strict=True):
            result[index] = float(score)
    return tuple(result)
