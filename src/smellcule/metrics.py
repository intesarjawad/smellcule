from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]
MATRIX_DIMENSIONS = 2
MIN_CORRELATION_SAMPLES = 2


@dataclass(frozen=True)
class MacroMetrics:
    """Descriptor averages and the number of nondegenerate labels included."""

    auroc: float
    auprc: float
    label_count: int


@dataclass(frozen=True)
class BootstrapConfig:
    """Seeded percentile bootstrap settings and evaluated-set label support."""

    n_resamples: int = 1000
    seed: int = 0
    min_positives: int = 1


@dataclass(frozen=True)
class BootstrapCI:
    """Percentile interval with the number of usable bootstrap replicates."""

    lower: float
    upper: float
    resamples: int


@dataclass(frozen=True)
class ReliabilityBin:
    """Equal-mass calibration bin, including its observed pair count."""

    probability: float
    frequency: float
    count: int


def _binary_inputs(targets: FloatArray, scores: FloatArray) -> None:
    if targets.ndim != MATRIX_DIMENSIONS or targets.shape != scores.shape or 0 in targets.shape:
        message = "Supply nonempty, matching row-by-label target and score matrices."
        raise ValueError(message)
    if not np.isin(targets, (0, 1)).all():
        message = "Classification metrics require binary targets."
        raise ValueError(message)
    if not np.isfinite(scores).all():
        message = "Metric scores must be finite."
        raise ValueError(message)


def _ranks(values: FloatArray) -> FloatArray:
    _, inverse, counts = np.unique(values, return_inverse=True, return_counts=True)
    return (np.cumsum(counts) - (counts - 1) / 2)[inverse]


def classification_metrics(
    targets: FloatArray, scores: FloatArray, *, min_positives: int = 1
) -> MacroMetrics:
    """Compute macro AUROC and step-integrated average precision, skipping constant labels."""
    _binary_inputs(targets, scores)
    if min_positives < 1:
        message = "min_positives must be positive."
        raise ValueError(message)
    positives = targets.sum(axis=0)
    eligible = (positives >= min_positives) & (positives < len(targets))
    if not eligible.any():
        message = "No eligible labels have the required positives and at least one negative."
        raise ValueError(message)
    aucs: list[float] = []
    aps: list[float] = []
    for target, score in zip(targets[:, eligible].T, scores[:, eligible].T, strict=True):
        positive_count = float(target.sum())
        aucs.append(
            float(
                (_ranks(score)[target == 1].sum() - positive_count * (positive_count + 1) / 2)
                / (positive_count * (len(target) - positive_count))
            )
        )
        order = np.argsort(-score, kind="stable")
        true_positives = np.cumsum(target[order])
        ends = np.concatenate((np.flatnonzero(np.diff(score[order])), [len(score) - 1]))
        increments = np.diff(np.concatenate(([0.0], true_positives[ends])))
        aps.append(float(np.sum(increments * true_positives[ends] / (ends + 1)) / positive_count))
    return MacroMetrics(float(np.mean(aucs)), float(np.mean(aps)), int(eligible.sum()))


def bootstrap_indices(
    n_rows: int, rng: np.random.Generator, *, groups: NDArray[np.int64] | None = None
) -> NDArray[np.int64]:
    """Sample rows or whole groups with replacement, preserving repeated groups."""
    if n_rows < 1:
        message = "Bootstrap requires at least one row."
        raise ValueError(message)
    if groups is None:
        return rng.integers(0, n_rows, size=n_rows)
    if groups.shape != (n_rows,):
        message = "Bootstrap groups must have one identifier per row."
        raise ValueError(message)
    unique = np.unique(groups)
    return np.concatenate(
        [np.flatnonzero(groups == group) for group in rng.choice(unique, len(unique))]
    )


DEFAULT_BOOTSTRAP_CONFIG = BootstrapConfig()


def bootstrap_auroc(
    targets: FloatArray,
    scores: FloatArray,
    *,
    comparison: FloatArray | None = None,
    groups: NDArray[np.int64] | None = None,
    config: BootstrapConfig = DEFAULT_BOOTSTRAP_CONFIG,
) -> BootstrapCI:
    """Return a 95% molecule or group CI, optionally for a paired AUROC difference.

    Label eligibility is fixed on the evaluated set; resample-degenerate labels
    are skipped. Replicates with no usable labels are omitted and counted.
    """
    classification_metrics(targets, scores, min_positives=config.min_positives)
    if comparison is not None:
        _binary_inputs(targets, comparison)
    if config.n_resamples < 1:
        message = "n_resamples must be positive."
        raise ValueError(message)
    positives = targets.sum(axis=0)
    eligible = (positives >= config.min_positives) & (positives < len(targets))
    rng = np.random.default_rng(config.seed)
    values: list[float] = []
    for _ in range(config.n_resamples):
        indices = bootstrap_indices(len(targets), rng, groups=groups)
        sampled = targets[indices][:, eligible]
        if not ((sampled.sum(axis=0) > 0) & (sampled.sum(axis=0) < len(sampled))).any():
            continue
        value = classification_metrics(sampled, scores[indices][:, eligible]).auroc
        if comparison is not None:
            value -= classification_metrics(sampled, comparison[indices][:, eligible]).auroc
        values.append(value)
    if not values:
        message = "No bootstrap resamples contain a nondegenerate label; supply more observations."
        raise ValueError(message)
    lower, upper = np.percentile(values, [2.5, 97.5])
    return BootstrapCI(float(lower), float(upper), len(values))


def reliability_bins(
    targets: FloatArray, probabilities: FloatArray, *, n_bins: int = 10
) -> tuple[ReliabilityBin, ...]:
    """Partition sorted prediction pairs into equal-mass bins, splitting ties stably."""
    _binary_inputs(targets, probabilities)
    if n_bins < 1 or ((probabilities < 0) | (probabilities > 1)).any():
        message = "Use positive n_bins and probabilities in [0, 1]."
        raise ValueError(message)
    truth, predicted = targets.ravel(), probabilities.ravel()
    order = np.argsort(predicted, kind="stable")
    return tuple(
        ReliabilityBin(float(predicted[part].mean()), float(truth[part].mean()), len(part))
        for part in np.array_split(order, min(n_bins, len(order)))
    )


def expected_calibration_error(
    targets: FloatArray, probabilities: FloatArray, *, n_bins: int = 10
) -> float:
    """Compute pooled equal-mass ECE weighted by each bin's pair count."""
    bins = reliability_bins(targets, probabilities, n_bins=n_bins)
    return sum(item.count * abs(item.frequency - item.probability) for item in bins) / targets.size


def classwise_ece(
    targets: FloatArray, probabilities: FloatArray, *, min_positives: int = 5, n_bins: int = 10
) -> tuple[float, int]:
    """Average equal-mass ECE over sufficiently supported descriptor columns."""
    classification_metrics(targets, probabilities, min_positives=min_positives)
    eligible = (targets.sum(axis=0) >= min_positives) & (targets.sum(axis=0) < len(targets))
    values = [
        expected_calibration_error(targets[:, [i]], probabilities[:, [i]], n_bins=n_bins)
        for i in np.flatnonzero(eligible)
    ]
    return float(np.mean(values)), len(values)


def pearson(targets: FloatArray | None, scores: FloatArray | None) -> float | None:
    """Return correlation, or None for absent ratings or constant observations."""
    if targets is None or scores is None:
        return None
    if targets.ndim != 1 or targets.shape != scores.shape or targets.size < MIN_CORRELATION_SAMPLES:
        message = "Correlation requires matching vectors with at least two observations."
        raise ValueError(message)
    if not np.isfinite(targets).all() or not np.isfinite(scores).all():
        message = "Correlation inputs must be finite."
        raise ValueError(message)
    left, right = targets - targets.mean(), scores - scores.mean()
    denominator = float(np.linalg.norm(left) * np.linalg.norm(right))
    return float(np.dot(left, right) / denominator) if denominator else None


def spearman(targets: FloatArray, scores: FloatArray) -> float | None:
    """Compute Pearson correlation of average ranks, retaining ties."""
    pearson(targets, scores)
    return pearson(_ranks(targets), _ranks(scores))
