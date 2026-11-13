from collections.abc import Callable
from dataclasses import asdict

import numpy as np
from numpy.typing import NDArray

from smellcule.metrics import (
    MIN_CORRELATION_SAMPLES,
    BootstrapConfig,
    FloatArray,
    bootstrap_auroc,
    bootstrap_indices,
    classification_metrics,
    classwise_ece,
    expected_calibration_error,
    pearson,
    reliability_bins,
    spearman,
)

N_RESAMPLES = 1000
STABLE_MIN_POSITIVES = 5
SIMILARITY_BINS = ((0.0, 0.30), (0.30, 0.50), (0.50, 1.01))


def interval(
    n_rows: int,
    statistic: Callable[[NDArray[np.int64]], float | None],
    groups: NDArray[np.int64] | None = None,
) -> dict[str, object]:
    """Seeded percentile CI for a scalar statistic with the split's sampling unit."""
    rng = np.random.default_rng(0)
    values = [
        value
        for _ in range(N_RESAMPLES)
        if (value := statistic(bootstrap_indices(n_rows, rng, groups=groups))) is not None
        and np.isfinite(value)
    ]
    if not values:
        return {"lower": None, "upper": None, "resamples": 0}
    lower, upper = np.percentile(values, [2.5, 97.5])
    return {"lower": float(lower), "upper": float(upper), "resamples": len(values)}


def classification_summary(
    targets: FloatArray,
    probabilities: FloatArray,
    groups: NDArray[np.int64] | None = None,
    comparison: FloatArray | None = None,
) -> dict[str, object]:
    """Report both support thresholds, including paired intervals against a baseline."""
    summaries: dict[str, object] = {}
    for name, minimum in (("all_labels", 1), ("stable_labels", 5)):
        eligible = (targets.sum(axis=0) >= minimum) & (targets.sum(axis=0) < len(targets))
        if not eligible.any():
            summaries[name] = {"auroc": None, "auprc": None, "label_count": 0, "ci": None}
            continue
        summary: dict[str, object] = asdict(
            classification_metrics(targets, probabilities, min_positives=minimum)
        )
        summary["ci"] = asdict(
            bootstrap_auroc(
                targets, probabilities, groups=groups, config=BootstrapConfig(min_positives=minimum)
            )
        )

        def average_precision(
            indices: NDArray[np.int64], eligible: NDArray[np.bool_] = eligible
        ) -> float | None:
            sampled = targets[indices][:, eligible]
            if not ((sampled.sum(axis=0) > 0) & (sampled.sum(axis=0) < len(sampled))).any():
                return None
            return classification_metrics(sampled, probabilities[indices][:, eligible]).auprc

        summary["auprc_ci"] = interval(len(targets), average_precision, groups)
        if comparison is not None:
            summary["paired_auroc_difference_ci"] = asdict(
                bootstrap_auroc(
                    targets,
                    probabilities,
                    comparison=comparison,
                    groups=groups,
                    config=BootstrapConfig(min_positives=minimum),
                )
            )
        summaries[name] = summary
    return summaries


def correlation_summary(
    targets: FloatArray,
    probabilities: FloatArray,
    groups: NDArray[np.int64],
    observed: NDArray[np.bool_],
) -> dict[str, object]:
    """Descriptor-wise and mean Pearson correlation with whole-cluster intervals."""

    def correlations(indices: NDArray[np.int64]) -> list[float | None]:
        return [
            pearson(left[mask], right[mask]) if mask.sum() >= MIN_CORRELATION_SAMPLES else None
            for left, right, mask in zip(
                targets[indices].T, probabilities[indices].T, observed[indices].T, strict=True
            )
        ]

    def average(indices: NDArray[np.int64]) -> float | None:
        values = [value for value in correlations(indices) if value is not None]
        return float(np.mean(values)) if values else None

    indices = np.arange(len(targets), dtype=np.int64)
    per_label = correlations(indices)
    count = sum(value is not None for value in per_label)
    return {
        "mean_pearson": average(indices),
        "per_descriptor_pearson": per_label,
        "ci": interval(len(targets), average, groups),
        "all_labels": {"label_count": count, "metric": "pearson"},
        "stable_labels": {
            "label_count": count,
            "metric": "pearson",
            "support": "continuous ratings; positive-count threshold is inapplicable",
        },
    }


def domain_summary(
    targets: FloatArray,
    probabilities: FloatArray,
    similarities: FloatArray,
    groups: NDArray[np.int64] | None,
) -> list[dict[str, object]]:
    """Evaluate prespecified nearest-training similarity bins, including empty bins."""
    result: list[dict[str, object]] = []
    for lower, upper in SIMILARITY_BINS:
        selected = (similarities >= lower) & (similarities < upper)
        result.append(
            {
                "lower": lower,
                "upper": min(upper, 1.0),
                "molecule_count": int(selected.sum()),
                "metrics": classification_summary(
                    targets[selected],
                    probabilities[selected],
                    None if groups is None else groups[selected],
                )
                if selected.any()
                else None,
            }
        )
    return result


def calibration_summary(
    targets: FloatArray,
    probabilities: FloatArray,
    spread: FloatArray,
    train_targets: FloatArray,
    groups: NDArray[np.int64],
) -> dict[str, object]:
    """Calibration diagnostics with cluster-resampled uncertainty."""
    prevalence = train_targets.mean(axis=0)
    bce = -(
        targets * np.log(np.clip(probabilities, 1e-12, 1))
        + (1 - targets) * np.log(np.clip(1 - probabilities, 1e-12, 1))
    ).mean(axis=1)

    def statistics(indices: NDArray[np.int64]) -> dict[str, float | None]:
        truth, predicted = targets[indices], probabilities[indices]
        brier = float(np.mean((truth - predicted) ** 2))
        reference = float(np.mean((truth - prevalence) ** 2))
        supported = (
            (truth.sum(axis=0) >= STABLE_MIN_POSITIVES) & (truth.sum(axis=0) < len(truth))
        ).any()
        return {
            "pooled_ece": expected_calibration_error(truth, predicted),
            "classwise_ece": classwise_ece(truth, predicted)[0] if supported else None,
            "brier": brier,
            "brier_skill": 1 - brier / reference if reference else None,
            "spread_bce_spearman": spearman(spread[indices].mean(axis=1), bce[indices]),
        }

    measured = statistics(np.arange(len(targets), dtype=np.int64))
    return {
        "statistics": measured,
        "ci": {
            key: interval(len(targets), lambda indices, key=key: statistics(indices)[key], groups)
            for key in measured
        },
        "reliability_bins": [asdict(item) for item in reliability_bins(targets, probabilities)],
        "classwise_label_count": classwise_ece(targets, probabilities)[1],
    }
