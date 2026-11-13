import numpy as np
import pytest
import torch
from numpy.typing import NDArray

from smellcule import cross_validation
from smellcule.catalogue import CatalogueRow
from smellcule.ensemble import Ensemble, model_from_config
from smellcule.evaluation import classification_summary, interval
from smellcule.experiment_data import ExperimentData, prepare
from smellcule.experiments import RunContext
from smellcule.keller_training import KellerFitConfig
from smellcule.splits import ClusterSplit
from smellcule.training import TrainedModel, TrainingConfig, TrainingSet


def test_classification_support_and_paired_ci() -> None:
    targets = np.array(
        [[1, 0, 0], [1, 1, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0], [0, 0, 0]], dtype=np.float64
    )
    probabilities = targets * 0.8 + 0.1
    result = classification_summary(targets, probabilities, comparison=probabilities)
    all_labels = result["all_labels"]
    stable = result["stable_labels"]
    assert isinstance(all_labels, dict)
    assert isinstance(stable, dict)
    assert all_labels["label_count"] == 2
    assert stable["label_count"] == 1
    assert all_labels["auroc"] == 1.0
    # The remaining 86 seeded resamples have no label with both classes.
    assert all_labels["paired_auroc_difference_ci"] == {
        "lower": 0.0,
        "upper": 0.0,
        "resamples": 914,
    }


def test_scalar_ci_resamples_whole_clusters() -> None:
    groups = np.array([0, 0, 0, 0, 1], dtype=np.int64)
    values = np.array([0, 0, 0, 0, 1], dtype=np.float64)

    def average(indices: NDArray[np.int64]) -> float:
        assert len(indices) in {2, 5, 8}
        return float(values[indices].mean())

    assert interval(5, average, groups) == {"lower": 0.0, "upper": 1.0, "resamples": 1000}


def test_keller_folds_hold_out_test_and_next_fold_validation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    smiles = ("C", "CC", "CCC", "CCCC", "O", "CO", "CCO", "N", "CN", "CCN")
    rows = tuple(
        CatalogueRow(str(i), "", "", value, (0, 0), "train", 1) for i, value in enumerate(smiles)
    )
    data = prepare(rows, ("a", "b"), [[i / 10, (9 - i) / 10] for i in range(10)])
    config = TrainingConfig(hidden=8, steps=1, embed_dim=4, max_epochs=3)
    observed = np.ones((10, 2), dtype=bool)
    context = RunContext(
        data, data, data, observed, ("keller_cv",), 2, torch.device("cpu"), config, evaluate=False
    )
    calls: list[tuple[TrainingSet, TrainingSet | None, KellerFitConfig]] = []

    def partition(_data: ExperimentData) -> tuple[ClusterSplit, NDArray[np.int64]]:
        return ClusterSplit(("train",) * 10, tuple((i,) for i in range(10))), np.arange(
            10, dtype=np.int64
        )

    def train(
        train: TrainingSet, validation: TrainingSet | None, *, options: KellerFitConfig
    ) -> Ensemble:
        calls.append((train, validation, options))
        return Ensemble(
            tuple(
                TrainedModel(model_from_config(2, config), seed + 1, 0.5, 0.1, ())
                for seed in options.seeds
            )
        )

    monkeypatch.setattr(cross_validation, "cluster_ids", partition)
    monkeypatch.setattr(cross_validation, "train_keller", train)
    outputs = list(cross_validation.cross_validation(context, "keller_cv"))
    assert len(calls) == 6
    for fold, (training, validation, options) in enumerate(calls[:5]):
        assert validation is not None
        train_rows = [i for i in range(10) if i % 5 not in {fold, (fold + 1) % 5}]
        validation_rows = [i for i in range(10) if i % 5 == (fold + 1) % 5]
        assert np.array_equal(training.targets.numpy(), data.targets[train_rows])
        assert np.array_equal(validation.targets.numpy(), data.targets[validation_rows])
        assert options.fixed_epochs is None
    assert calls[-1][1] is None
    assert len(calls[-1][0].graphs) == 10
    assert calls[-1][2].fixed_epochs == 1
    assert outputs[-1].result["final_epochs"] == 1
    assert outputs[-1].arrays["keller_oof"]["fold"].tolist() == [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]
