import numpy as np
import pytest
from numpy.typing import NDArray

from smellcule.metrics import (
    BootstrapConfig,
    bootstrap_auroc,
    bootstrap_indices,
    classification_metrics,
    classwise_ece,
    expected_calibration_error,
    pearson,
    reliability_bins,
    spearman,
)


def test_six_sample_auc_and_average_precision() -> None:
    targets = np.array(
        [[0, 0, 1], [1, 0, 1], [0, 0, 1], [1, 0, 1], [1, 0, 1], [0, 0, 1]], dtype=float
    )
    scores = np.array(
        [[0.1, 0, 1], [0.2, 0, 1], [0.3, 0, 1], [0.4, 0, 1], [0.5, 0, 1], [0.6, 0, 1]]
    )
    result = classification_metrics(targets, scores)
    # Descending positives occur at ranks 2, 3, 5; five of nine positive-negative pairs win.
    assert result.auroc == pytest.approx(5 / 9)
    assert result.auprc == pytest.approx((1 / 2 + 2 / 3 + 3 / 5) / 3)
    assert result.label_count == 1
    with pytest.raises(ValueError, match="No eligible"):
        classification_metrics(targets, scores, min_positives=5)


def test_ties_and_label_threshold() -> None:
    targets = np.array([[0, 1], [1, 0], [0, 1], [1, 1], [0, 1], [1, 1]], dtype=float)
    scores = np.full(targets.shape, 0.5)
    assert classification_metrics(targets, scores).auroc == 0.5
    assert classification_metrics(targets, scores).auprc == pytest.approx((0.5 + 5 / 6) / 2)
    assert classification_metrics(targets, scores, min_positives=5).label_count == 1


def test_ten_sample_equal_mass_ece() -> None:
    targets = np.array([[0], [0], [1], [0], [0], [1], [0], [1], [1], [1]], dtype=float)
    scores = np.arange(1, 11, dtype=float).reshape(-1, 1) / 10
    # Ten singleton errors sum to 3.3; two bins have gaps 0.1 and 0.0.
    assert expected_calibration_error(targets, scores) == pytest.approx(0.33)
    assert expected_calibration_error(targets, scores, n_bins=2) == pytest.approx(0.05)
    bins = reliability_bins(targets, scores, n_bins=3)
    assert [item.count for item in bins] == [4, 3, 3]
    assert sum(item.count for item in bins) == 10
    assert classwise_ece(targets, scores) == pytest.approx((0.33, 1))


def test_correlations_average_ties_and_missing_keller() -> None:
    assert spearman(
        np.array([1.0, 2.0, 2.0, 4.0]), np.array([4.0, 1.0, 1.0, 2.0])
    ) == pytest.approx(-1 / 3)
    assert spearman(np.arange(5.0), -np.arange(5.0)) == pytest.approx(-1)
    assert pearson(None, None) is None
    assert pearson(np.ones(3), np.arange(3.0)) is None
    assert spearman(np.ones(3), np.arange(3.0)) is None


def test_bootstrap_reproducible_paired_and_degenerate_skips() -> None:
    targets = np.array([[0.0], [1.0]])
    result = bootstrap_auroc(targets, targets, config=BootstrapConfig(n_resamples=100))
    assert result == bootstrap_auroc(targets, targets, config=BootstrapConfig(n_resamples=100))
    assert result.lower == result.upper == 1
    assert 0 < result.resamples < 100
    paired = bootstrap_auroc(
        targets, targets, comparison=1 - targets, config=BootstrapConfig(n_resamples=100)
    )
    assert paired.lower == paired.upper == 1
    identical = bootstrap_auroc(
        targets, targets, comparison=targets, config=BootstrapConfig(n_resamples=100)
    )
    assert identical.lower == identical.upper == 0


def test_cluster_bootstrap_preserves_whole_unequal_groups() -> None:
    groups = np.array([10, 10, 20], dtype=np.int64)
    observed_lengths: set[int] = set()
    rng = np.random.default_rng(0)
    for _ in range(30):
        indices = bootstrap_indices(3, rng, groups=groups)
        assert np.count_nonzero(indices == 0) == np.count_nonzero(indices == 1)
        observed_lengths.add(len(indices))
    assert observed_lengths == {2, 3, 4}
    targets = np.array([[0.0], [1.0], [0.0]])
    result = bootstrap_auroc(
        targets, targets, groups=groups, config=BootstrapConfig(n_resamples=30)
    )
    assert result.lower == result.upper == 1


@pytest.mark.parametrize(
    ("targets", "scores", "message"),
    [
        (np.zeros((2, 1)), np.zeros((2, 2)), "matching"),
        (np.array([[0.5], [1.0]]), np.zeros((2, 1)), "binary"),
        (np.array([[0.0], [1.0]]), np.array([[0.0], [np.nan]]), "finite"),
    ],
)
def test_invalid_classification_inputs(
    targets: NDArray[np.float64], scores: NDArray[np.float64], message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        classification_metrics(targets, scores)


def test_invalid_calibration_and_correlation() -> None:
    with pytest.raises(ValueError, match="probabilities"):
        expected_calibration_error(np.array([[0.0], [1.0]]), np.array([[0.0], [2.0]]))
    with pytest.raises(ValueError, match="matching vectors"):
        spearman(np.ones((2, 2)), np.ones((2, 2)))
    with pytest.raises(ValueError, match="finite"):
        spearman(np.array([np.nan, 1.0]), np.arange(2.0))
