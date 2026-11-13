import json
import sys
from argparse import Namespace
from pathlib import Path

import numpy as np
import pytest
import torch

from smellcule import cli, ensemble
from smellcule.catalogue import CatalogueRow
from smellcule.cli import main
from smellcule.experiment_data import prepare
from smellcule.experiments import RunContext
from smellcule.training import TrainedModel, TrainingConfig


@pytest.mark.parametrize("command", ["train", "evaluate", "reproduce", "splits"])
@pytest.mark.parametrize("dependency", ["torch", "rdkit", "sklearn", "yaml"])
def test_missing_research_dependency_recommends_pipx(
    command: str,
    dependency: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    def missing_dependency(_args: Namespace) -> None:
        raise ModuleNotFoundError(name=dependency)

    monkeypatch.setattr(cli, "_run_command", missing_dependency)
    options = ["--out", "splits"] if command == "splits" else []
    monkeypatch.setattr(sys, "argv", ["smellcule", command, *options])
    with pytest.raises(SystemExit) as error:
        main()
    assert error.value.code == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == (
        f"error: smellcule {command} needs the research extra (PyTorch, RDKit, scikit-learn)\n"
        'next: pipx install --force "smellcule[research]"'
        + (
            ' --pip-args="--extra-index-url https://download.pytorch.org/whl/cpu"'
            if sys.platform == "linux"
            else ""
        )
        + "\n"
    )


def test_train_then_evaluate_restores_weights_and_preserves_other_runs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from smellcule.cli import research

    smiles = ("C", "CC", "CCC", "CCO", "CN", "CO")
    data = prepare(
        tuple(
            CatalogueRow(
                str(i),
                "",
                "",
                value,
                (i % 2, 1 - i % 2),
                "held_out" if i >= 4 else "train",
                -1 if i >= 4 else 0 if i >= 2 else 1,
            )
            for i, value in enumerate(smiles)
        ),
        ("a", "b"),
    )
    config = TrainingConfig(hidden=8, steps=1, embed_dim=4, max_epochs=3)

    def context(args: Namespace, requested: tuple[str, ...]) -> RunContext:
        return RunContext(
            data,
            data,
            data,
            np.ones((6, 2), dtype=bool),
            requested,
            args.ensemble_size,
            torch.device("cpu"),
            config,
            evaluate=args.command != "train",
        )

    monkeypatch.setattr(research, "prepare_context", context)
    results = tmp_path / "results.json"
    results.write_text('{"map": {"versions": {"numpy": "0.0"}}}', encoding="utf-8")
    before_results = results.read_bytes()
    artifacts = tmp_path / "artifacts"
    options = [
        "--runs",
        "official",
        "--ensemble-size",
        "2",
        "--artifacts",
        str(artifacts),
        "--results",
        str(results),
        "--report",
        str(tmp_path / "evaluation.md"),
    ]
    monkeypatch.setattr(sys, "argv", ["smellcule", "train", *options])
    main()
    assert results.read_bytes() == before_results
    checkpoint = artifacts / "official" / "model.safetensors"
    weights = checkpoint.read_bytes()
    output = capsys.readouterr().out
    assert "differs from 0.0" in output
    assert "next: uv sync --locked" in output

    def forbid_training(*_args: object, **_kwargs: object) -> TrainedModel:
        message = "evaluate must restore the saved MPNN, not train again"
        raise AssertionError(message)

    monkeypatch.setattr(ensemble, "train_one_seed", forbid_training)
    monkeypatch.setattr(sys, "argv", ["smellcule", "evaluate", *options])
    main()
    assert checkpoint.read_bytes() == weights
    document = json.loads(results.read_text(encoding="utf-8"))
    assert document["official"]["ensemble_size"] == 2
    assert document["official"]["mpnn"]["all_labels"]["label_count"] == 2
    assert document["official"]["mpnn"]["stable_labels"]["label_count"] == 0
    assert document["map"] == {"versions": {"numpy": "0.0"}}
    assert "run 9" in (tmp_path / "evaluation.md").read_text(encoding="utf-8")
