import json
from argparse import Namespace
from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest
import torch

from smellcule.ensemble import Ensemble, train_ensemble
from smellcule.experiment_data import gslf_validation
from smellcule.features import featurise
from smellcule.keller_training import KellerFitConfig, mean_pearson, train_keller
from smellcule.molecules import source_structures
from smellcule.training import TrainingConfig, TrainingSet


@pytest.fixture
def dataset() -> TrainingSet:
    return TrainingSet(
        tuple(featurise(mol) for mol in source_structures(("CC", "CCO", "CCN", "CCC", "CO", "CN"))),
        torch.tensor([[1, 0], [0, 1], [0, 1], [1, 0], [0, 1], [0, 1]], dtype=torch.float32),
    )


@pytest.fixture
def config() -> TrainingConfig:
    return TrainingConfig(hidden=8, steps=1, embed_dim=4, max_epochs=3, patience=2, batch_size=3)


def test_ensemble_mean_spread_and_concatenated_embeddings(
    dataset: TrainingSet, config: TrainingConfig
) -> None:
    ensemble = train_ensemble(
        dataset, dataset, device=torch.device("cpu"), config=config, seeds=(0, 1)
    )
    predictions = [
        Ensemble((member,)).predict(dataset, torch.device("cpu"))[0] for member in ensemble.members
    ]
    probabilities, spread = ensemble.predict(dataset, torch.device("cpu"))
    np.testing.assert_array_equal(probabilities, np.mean(predictions, axis=0))
    np.testing.assert_array_equal(spread, np.std(predictions, axis=0))
    embedding = ensemble.embed(dataset, torch.device("cpu"))
    assert embedding.shape == (6, 8)
    assert torch.allclose((embedding[:, :4] ** 2).sum(dim=1).sqrt(), torch.ones(6))
    assert torch.allclose((embedding[:, 4:] ** 2).sum(dim=1).sqrt(), torch.ones(6))
    with pytest.raises(ValueError, match="at least one seed"):
        train_ensemble(dataset, dataset, device=torch.device("cpu"), config=config, seeds=())


def test_keller_missing_ratings_do_not_affect_loss_or_parameters(
    dataset: TrainingSet, config: TrainingConfig
) -> None:
    targets = dataset.targets * 0.7 + 0.1
    observed = torch.ones_like(targets, dtype=torch.bool)
    observed[0, 0] = False
    changed = targets.clone()
    changed[0, 0] = 1.0
    options = KellerFitConfig(
        torch.device("cpu"), config, (3,), fixed_epochs=3, train_observed=observed
    )
    rng = torch.get_rng_state().clone()
    first = train_keller(TrainingSet(dataset.graphs, targets), None, options=options)
    second = train_keller(TrainingSet(dataset.graphs, changed), None, options=options)
    assert torch.equal(rng, torch.get_rng_state())
    assert first.members[0].best_epoch == 3
    assert len(first.members[0].history) == 3
    for key, value in first.members[0].model.state_dict().items():
        assert torch.equal(value, second.members[0].model.state_dict()[key])
    assert mean_pearson(targets, targets, observed) == pytest.approx(1.0)


def test_keller_soft_validation_and_stopping_protocol(
    dataset: TrainingSet, config: TrainingConfig
) -> None:
    soft = TrainingSet(dataset.graphs, dataset.targets * 0.7 + 0.1)
    options = KellerFitConfig(torch.device("cpu"), config, (0,))
    result = train_keller(soft, soft, options=options)
    member = result.members[0]
    probabilities, _ = result.predict(soft, torch.device("cpu"))
    assert member.validation_auroc == pytest.approx(
        mean_pearson(soft.targets, torch.tensor(probabilities, dtype=torch.float32))
    )
    with pytest.raises(ValueError, match="Supply validation"):
        train_keller(soft, None, options=options)


def test_gslf_validation_exact_seeded_ten_percent_and_run_aliases() -> None:
    from smellcule.cli.research import selected_runs

    indices = list(range(51))
    train, validation = gslf_validation(indices, 3)
    expected = np.random.default_rng(3).permutation(indices).tolist()
    assert validation == expected[:6]
    assert train == expected[6:]
    assert not set(train) & set(validation)
    assert selected_runs("1,4,11") == ("official", "cluster", "stereo_pairs")
    with pytest.raises(ValueError, match="run separately"):
        selected_runs("9")


@pytest.mark.data
def test_checkpoint_round_trip_and_label_order(tmp_path: Path, config: TrainingConfig) -> None:
    from smellcule.cli.research import load_ensemble, prepare_context, save_ensemble

    context = prepare_context(
        Namespace(ensemble_size=2, device="cpu", command="train"), ("official",)
    )
    context.config = config
    dataset = context.lf.subset(list(range(20)))
    ensemble = train_ensemble(dataset, dataset, device=context.device, config=config, seeds=(0, 1))
    path = tmp_path / "official"
    save_ensemble(path, ensemble, context)
    restored = load_ensemble(path, context)
    for expected, actual in zip(
        ensemble.predict(dataset, context.device),
        restored.predict(dataset, context.device),
        strict=True,
    ):
        np.testing.assert_array_equal(expected, actual)
    assert (path / "labels.json").exists()
    metadata = json.loads((path / "config.json").read_text(encoding="utf-8"))
    assert len(metadata["data_sha256"]) == 64
    assert metadata["hidden"] == config.hidden
    (path / "labels.json").write_text(
        json.dumps(list(reversed(context.lf.labels))), encoding="utf-8"
    )
    with pytest.raises(ValueError, match="descriptor order"):
        load_ensemble(path, context)
    (path / "labels.json").write_text(json.dumps(context.lf.labels), encoding="utf-8")
    context.config = replace(config, hidden=16)
    with pytest.raises(ValueError, match="differs"):
        load_ensemble(path, context)
