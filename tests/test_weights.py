import json
from pathlib import Path

import pytest
import torch
from safetensors.torch import save

from smellcule import releases
from smellcule.model import OdourMPNN
from smellcule.releases import ModelName
from smellcule.weights import load_model


def test_released_weights_restore_all_seed_parameters(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    models = (OdourMPNN(2, 8, 1, 4), OdourMPNN(2, 8, 1, 4))
    (tmp_path / "model.safetensors").write_bytes(
        save(
            {
                f"seed{seed}.{key}": value
                for seed, model in enumerate(models)
                for key, value in model.state_dict().items()
            }
        )
    )
    (tmp_path / "labels.json").write_text('["sweet", "woody"]')
    (tmp_path / "config.json").write_text(
        json.dumps(
            {
                "arch": "OdourMPNN",
                "version": 1,
                "feature_spec": "atom34-bond10-v1",
                "hidden": 8,
                "steps": 1,
                "embed_dim": 4,
            }
        )
    )

    def local_download(name: ModelName, filename: str) -> Path:
        assert name == "lf"
        return tmp_path / filename

    monkeypatch.setattr(releases, "download", local_download)
    ensemble = load_model("lf")
    assert len(ensemble.members) == 2
    for expected, member in zip(models, ensemble.members, strict=True):
        assert not member.model.training
        for key, value in expected.state_dict().items():
            assert torch.equal(value, member.model.state_dict()[key])
