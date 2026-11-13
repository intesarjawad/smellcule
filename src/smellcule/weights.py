"""Research-only restoration of released seed ensembles."""

import json
import re

from safetensors import SafetensorError
from safetensors.torch import load

from smellcule import releases
from smellcule.ensemble import Ensemble
from smellcule.errors import DataError
from smellcule.lookup import read_labels
from smellcule.model import OdourMPNN
from smellcule.releases import ModelName
from smellcule.training import TrainedModel


def _restore(name: ModelName) -> Ensemble:
    """Restore CPU evaluation members without training or inventing training history."""
    config: dict[str, object] = json.loads(releases.download(name, "config.json").read_text())
    if (
        config["arch"] != "OdourMPNN"
        or config["feature_spec"] != "atom34-bond10-v1"
        or config["version"] != 1
    ):
        message = "unsupported released model configuration"
        raise ValueError(message)
    dimensions: list[int] = []
    for key in ("hidden", "steps", "embed_dim"):
        value = config[key]
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            message = f"invalid model dimension {key}"
            raise ValueError(message)
        dimensions.append(value)
    labels = read_labels(releases.download(name, "labels.json"))
    tensors = load(releases.download(name, "model.safetensors").read_bytes())
    seeds: set[int] = set()
    for key in tensors:
        match = re.fullmatch(r"seed(\d+)\..+", key)
        if match is None:
            message = f"invalid released tensor key {key}"
            raise ValueError(message)
        seeds.add(int(match[1]))
    if not seeds or sorted(seeds) != list(range(len(seeds))):
        message = "released ensemble seeds must be contiguous from zero"
        raise ValueError(message)
    members: list[TrainedModel] = []
    for seed in sorted(seeds):
        model = OdourMPNN(len(labels), *dimensions)
        prefix = f"seed{seed}."
        model.load_state_dict(
            {
                key.removeprefix(prefix): value
                for key, value in tensors.items()
                if key.startswith(prefix)
            }
        )
        model.eval()
        # Release files contain no stopping history or timing measurements.
        members.append(TrainedModel(model, 0, float("nan"), 0.0, ()))
    return Ensemble(tuple(members))


def load_model(name: ModelName) -> Ensemble:
    """Restore released CPU members with unavailable training metadata left unmeasured."""
    try:
        return _restore(name)
    except (OSError, ValueError, TypeError, KeyError, RuntimeError, SafetensorError) as error:
        message = f"could not restore released weights: {error}"
        raise DataError(message, "smellcule lookup --help") from error
