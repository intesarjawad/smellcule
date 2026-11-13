from dataclasses import replace

import pytest
import torch
from test_features import molecule
from torch import Tensor

from smellcule import training
from smellcule.features import featurise
from smellcule.model import OdourMPNN
from smellcule.training import (
    TrainingConfig,
    TrainingSet,
    macro_auroc,
    predict_probabilities,
    train_one_seed,
)


@pytest.fixture
def dataset() -> TrainingSet:
    return TrainingSet(
        tuple(featurise(molecule(smiles)) for smiles in ("CC", "CCO", "CCN", "CCC", "CO", "CN")),
        torch.tensor([[1, 0], [0, 1], [0, 1], [1, 0], [0, 1], [0, 1]], dtype=torch.float32),
    )


@pytest.fixture
def config() -> TrainingConfig:
    return TrainingConfig(hidden=16, steps=1, embed_dim=8, max_epochs=8, patience=3, batch_size=4)


def test_training_auroc_hand_computed_and_degenerate_columns() -> None:
    targets = torch.tensor([[0, 0, 0, 1], [0, 1, 0, 1], [1, 0, 0, 1], [1, 1, 0, 1]])
    scores = torch.tensor(
        [[0.1, 0.2, 0.0, 0.1], [0.2, 0.2, 0.0, 0.1], [0.3, 0.8, 0.0, 0.1], [0.4, 0.8, 0.0, 0.1]]
    )
    # Label one is perfect; label two has two tied pairs and one of each ordering.
    score, count = macro_auroc(targets, scores)
    assert score == pytest.approx(0.75)
    assert count == 2


@pytest.mark.parametrize(
    ("targets", "scores", "message"),
    [
        (torch.zeros((3, 2)), torch.zeros((3, 2)), "no eligible"),
        (torch.tensor([[0.1], [0.9]]), torch.zeros((2, 1)), "binary targets"),
        (torch.tensor([[0], [1]]), torch.tensor([[0.0], [torch.nan]]), "finite"),
        (torch.ones((3, 2)), torch.ones((3, 1)), "matching"),
    ],
)
def test_training_auroc_rejects_invalid_input(
    targets: Tensor, scores: Tensor, message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        macro_auroc(targets, scores)


def test_training_seed_determinism_and_rng_restoration(
    dataset: TrainingSet, config: TrainingConfig
) -> None:
    initial_rng = torch.get_rng_state().clone()
    initial_determinism = torch.are_deterministic_algorithms_enabled()
    first = train_one_seed(dataset, dataset, seed=7, device=torch.device("cpu"), config=config)
    second = train_one_seed(dataset, dataset, seed=7, device=torch.device("cpu"), config=config)
    assert torch.equal(torch.get_rng_state(), initial_rng)
    assert torch.are_deterministic_algorithms_enabled() == initial_determinism
    assert first.best_epoch == second.best_epoch
    assert first.validation_auroc == second.validation_auroc
    assert [epoch.loss for epoch in first.history] == [epoch.loss for epoch in second.history]
    for name, parameter in first.model.state_dict().items():
        assert torch.equal(parameter, second.model.state_dict()[name]), name
    assert first.wall_time_s > 0
    assert first.wall_time_s >= first.history[-1].elapsed_s
    assert not first.model.training
    score, _ = macro_auroc(
        dataset.targets, predict_probabilities(first.model, dataset, torch.device("cpu"))
    )
    assert score == first.validation_auroc


def test_training_stops_after_patience_and_restores_best_checkpoint(
    dataset: TrainingSet, config: TrainingConfig, monkeypatch: pytest.MonkeyPatch
) -> None:
    observed: list[dict[str, Tensor]] = []
    scores = iter((0.5, 0.9, 0.8, 0.7, 0.6))
    original_predict = training.predict_probabilities

    def record_prediction(
        model: OdourMPNN, data: TrainingSet, device: torch.device, batch_size: int
    ) -> Tensor:
        observed.append({name: tensor.clone() for name, tensor in model.state_dict().items()})
        return original_predict(model, data, device, batch_size)

    def validation_score(_targets: Tensor, _probabilities: Tensor) -> tuple[float, int]:
        return next(scores), 2

    monkeypatch.setattr(training, "predict_probabilities", record_prediction)
    monkeypatch.setattr(training, "macro_auroc", validation_score)
    result = train_one_seed(dataset, dataset, seed=3, device=torch.device("cpu"), config=config)
    assert result.best_epoch == 1
    assert result.validation_auroc == 0.9
    assert len(result.history) == 4
    assert any(not torch.equal(observed[0][name], tensor) for name, tensor in observed[-1].items())
    for name, parameter in result.model.state_dict().items():
        assert torch.equal(parameter, observed[0][name]), name


def test_training_config_and_dataset_validation(
    dataset: TrainingSet, config: TrainingConfig
) -> None:
    with pytest.raises(ValueError, match="max_epochs"):
        replace(config, max_epochs=201)
    with pytest.raises(ValueError, match="row-aligned"):
        TrainingSet(dataset.graphs, dataset.targets[:1])
    with pytest.raises(ValueError, match="finite values"):
        TrainingSet(dataset.graphs, torch.full_like(dataset.targets, torch.nan))
    with pytest.raises(ValueError, match="descriptor order"):
        train_one_seed(
            dataset,
            TrainingSet(dataset.graphs, dataset.targets[:, :1]),
            seed=0,
            device=torch.device("cpu"),
            config=config,
        )
