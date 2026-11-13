from collections import defaultdict
from collections.abc import Sequence
from itertools import combinations

import numpy as np
from numpy.typing import NDArray

from smellcule.evaluation import interval
from smellcule.metrics import MIN_CORRELATION_SAMPLES, FloatArray, spearman
from smellcule.molecules import Molecule


def stereo_summary(
    molecules: Sequence[Molecule],
    probabilities: FloatArray,
    held_out: Sequence[int],
) -> dict[str, object]:
    """Compare measured and predicted stereo-pair distances, leading with held-out groups."""
    grouped: dict[str, list[int]] = defaultdict(list)
    for index, molecule in enumerate(molecules):
        grouped[molecule.connectivity_key].append(index)
    held = set(held_out)
    results: dict[str, object] = {}
    for name, eligible in (("held_out", held), ("all_groups", set(range(len(molecules))))):
        measured: list[float] = []
        predicted: list[float] = []
        for group in grouped.values():
            for left, right in combinations(group, 2):
                if left not in eligible or right not in eligible:
                    continue
                a, b = (
                    np.array(molecules[left].measured, dtype=bool),
                    np.array(molecules[right].measured, dtype=bool),
                )
                union = int((a | b).sum())
                measured.append(1 - int((a & b).sum()) / union if union else 0.0)
                x: FloatArray = probabilities[left]
                y: FloatArray = probabilities[right]
                predicted.append(
                    1 - float(np.sum(x * y) / (np.sqrt(np.sum(x * x)) * np.sqrt(np.sum(y * y))))
                )
        truth, scores = np.array(measured, dtype=np.float64), np.array(predicted, dtype=np.float64)

        def correlation(
            indices: NDArray[np.int64], truth: FloatArray = truth, scores: FloatArray = scores
        ) -> float | None:
            return (
                spearman(truth[indices], scores[indices])
                if len(indices) >= MIN_CORRELATION_SAMPLES
                else None
            )

        def mean_distance(
            indices: NDArray[np.int64],
            *,
            identical: bool,
            truth: FloatArray = truth,
            scores: FloatArray = scores,
        ) -> float | None:
            selected = (truth[indices] == 0) == identical
            return float(scores[indices][selected].mean()) if selected.any() else None

        indices = np.arange(len(truth), dtype=np.int64)
        results[name] = {
            "pair_count": len(truth),
            "spearman": correlation(indices),
            "ci": interval(len(truth), correlation) if len(truth) else None,
            "identical_labels": {
                "mean_distance": mean_distance(indices, identical=True),
                "pair_count": int((truth == 0).sum()),
                "ci": interval(len(truth), lambda indices: mean_distance(indices, identical=True))
                if len(truth)
                else None,
            },
            "different_labels": {
                "mean_distance": mean_distance(indices, identical=False),
                "pair_count": int((truth != 0).sum()),
                "ci": interval(len(truth), lambda indices: mean_distance(indices, identical=False))
                if len(truth)
                else None,
            },
        }
    return results
