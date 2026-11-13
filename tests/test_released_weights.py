import json
from argparse import Namespace
from pathlib import Path

import numpy as np
import pytest
import torch
from safetensors.numpy import load

from smellcule import releases
from smellcule.weights import load_model

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.data
@pytest.mark.skipif(
    releases.RELEASED_REVISIONS["lf"] is None,
    reason=(
        "smellcule-lf has no pinned release: run scripts/publish_hf.py --upload, then pin its "
        "revisions and SHA-256 values in src/smellcule/releases.py"
    ),
)
def test_released_weights_reproduce_the_golden_and_published_predictions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from smellcule.cli.research import prepare_context

    golden = json.loads((ROOT / "tests/golden/released_predictions.json").read_text())
    monkeypatch.setenv("SMELLCULE_CACHE", str(ROOT / ".cache/smellcule"))
    previous_threads = torch.get_num_threads()
    torch.set_num_threads(4)
    try:
        context = prepare_context(
            Namespace(ensemble_size=10, device="cpu", command="evaluate"), ("cluster",)
        )
        prob, spread = load_model("lf").predict(context.lf.dataset, context.device)
    finally:
        torch.set_num_threads(previous_threads)
    ids = [molecule.molecule_id for molecule in context.lf.molecules]
    tolerance = golden["tolerance"]
    assert golden["labels"] == list(context.lf.labels)
    for molecule_id, expected in golden["molecules"].items():
        row = ids.index(molecule_id)
        np.testing.assert_allclose(prob[row], expected["prob"], atol=tolerance)
        np.testing.assert_allclose(spread[row], expected["spread"], atol=tolerance)

    published = load(releases.download("lf", "predictions.safetensors").read_bytes())
    order = sorted(range(len(ids)), key=lambda index: int(ids[index]))
    np.testing.assert_allclose(published["prob"], prob[order], atol=tolerance)
    np.testing.assert_allclose(published["spread"], spread[order], atol=tolerance)
