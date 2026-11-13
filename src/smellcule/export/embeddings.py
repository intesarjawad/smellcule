import json
from dataclasses import asdict
from pathlib import Path

import numpy as np
import torch
from safetensors.torch import load

from smellcule import catalogue
from smellcule.cli import read_results
from smellcule.ensemble import Ensemble, model_from_config
from smellcule.experiment_data import prepare
from smellcule.export.bundle_stats import numeric
from smellcule.export.content import mapping, sequence
from smellcule.metrics import FloatArray
from smellcule.training import TrainedModel, TrainingConfig


def model_embeddings(
    root: Path,
    rows: tuple[catalogue.CatalogueRow, ...],
    labels: tuple[str, ...],
    checkpoint_name: str = "cluster",
) -> FloatArray:
    """Concatenate per-seed embeddings from the named saved ensemble."""
    checkpoint = root / "artifacts" / checkpoint_name
    metadata = read_results(checkpoint / "config.json")
    config = TrainingConfig()
    if metadata["config"] != asdict(config):
        message = "Export checkpoint differs from the pinned training configuration."
        raise ValueError(message)
    if json.loads((checkpoint / "labels.json").read_text(encoding="utf-8")) != list(labels):
        message = "Export checkpoint labels differ from the catalogue."
        raise ValueError(message)
    tensors = load((checkpoint / "model.safetensors").read_bytes())
    members: list[TrainedModel] = []
    for seed, raw in enumerate(sequence(metadata["members"])):
        record = mapping(raw)
        model = model_from_config(len(labels), config)
        prefix = f"seed{seed}."
        model.load_state_dict(
            {
                key.removeprefix(prefix): value
                for key, value in tensors.items()
                if key.startswith(prefix)
            }
        )
        model.eval()
        members.append(
            TrainedModel(
                model,
                int(numeric(record["best_epoch"])),
                float(numeric(record["validation_score"])),
                float(numeric(record["wall_time_s"])),
                (),
            )
        )
    torch.set_num_threads(4)
    return (
        Ensemble(tuple(members))
        .embed(prepare(rows, labels).dataset, torch.device("cpu"))
        .numpy()
        .astype(np.float64)
    )
