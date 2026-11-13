from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from rdkit import Chem
from rdkit.Chem.rdFingerprintGenerator import GetMorganGenerator
from sklearn.ensemble import RandomForestClassifier

from smellcule.metrics import FloatArray

MORGAN_RADIUS = 2
FINGERPRINT_SIZE = 2048
N_ESTIMATORS = 500
MATRIX_DIMENSIONS = 2


def count_fingerprints(molecules: Sequence[Chem.Mol]) -> NDArray[np.uint32]:
    """Encode catalogue structures as achiral radius-two count Morgan fingerprints."""
    if not molecules:
        message = "Supply at least one catalogue molecule for fingerprinting."
        raise ValueError(message)
    generator = GetMorganGenerator(
        radius=MORGAN_RADIUS, fpSize=FINGERPRINT_SIZE, includeChirality=False
    )
    return np.stack([generator.GetCountFingerprintAsNumPy(molecule) for molecule in molecules])


@dataclass(frozen=True)
class RandomForestBaseline:
    """Multi-output count-fingerprint forest preserving input descriptor order."""

    forest: RandomForestClassifier
    n_labels: int

    def predict_probabilities(self, fingerprints: NDArray[np.uint32]) -> FloatArray:
        """Select each output's positive class, including constant-zero and constant-one labels."""
        _validate_fingerprints(fingerprints)
        raw = self.forest.predict_proba(fingerprints)
        classes = self.forest.classes_
        outputs = raw if isinstance(raw, list) else [raw]
        labels = classes if isinstance(classes, list) else [classes]
        probabilities = np.zeros((len(fingerprints), self.n_labels), dtype=np.float64)
        for column, (output, known) in enumerate(zip(outputs, labels, strict=True)):
            positive = np.flatnonzero(known == 1)
            if positive.size:
                probabilities[:, column] = output[:, positive[0]]
        return probabilities


def _validate_fingerprints(fingerprints: NDArray[np.uint32]) -> None:
    if fingerprints.ndim != MATRIX_DIMENSIONS or fingerprints.shape[1] != FINGERPRINT_SIZE:
        message = "Supply row-by-2048 count Morgan fingerprints."
        raise ValueError(message)
    if len(fingerprints) == 0:
        message = "Supply at least one fingerprint row."
        raise ValueError(message)


def fit_random_forest(
    fingerprints: NDArray[np.uint32], targets: FloatArray
) -> RandomForestBaseline:
    """Fit the pinned 500-tree CPU baseline without reordering target columns."""
    _validate_fingerprints(fingerprints)
    if (
        targets.ndim != MATRIX_DIMENSIONS
        or len(targets) != len(fingerprints)
        or targets.shape[1] == 0
        or not np.isin(targets, (0, 1)).all()
    ):
        message = "Supply row-aligned, nonempty binary descriptor targets."
        raise ValueError(message)
    forest = RandomForestClassifier(n_estimators=N_ESTIMATORS, n_jobs=-1, random_state=0)
    # sklearn flattens a single output, including when fit receives a two-dimensional column.
    forest.fit(fingerprints, targets.ravel() if targets.shape[1] == 1 else targets)
    return RandomForestBaseline(forest, targets.shape[1])
