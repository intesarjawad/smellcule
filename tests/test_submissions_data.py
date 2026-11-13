import csv
import json
import sys
from pathlib import Path

import numpy as np
import pytest

from smellcule import catalogue, sources, splits
from smellcule.baseline import count_fingerprints, fit_random_forest
from smellcule.cli import main
from smellcule.metrics import classification_metrics
from smellcule.molecules import source_structures, standardise


@pytest.mark.data
def test_rf_csv_reproduces_committed_official_auroc(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    labels, rows = catalogue.read_leffingwell(sources.fetch("leffingwell"))
    molecules = tuple(standardise(row) for row in rows)
    assignments = splits.official_split(molecules)
    train = [i for i, split in enumerate(assignments) if split == "train"]
    test = [i for i, split in enumerate(assignments) if split == "held_out"]
    fingerprints = count_fingerprints(source_structures([row.smiles for row in rows]))
    targets = np.array([row.measured for row in rows], dtype=np.float64)
    forest = fit_random_forest(fingerprints[train], targets[train])
    probabilities = forest.predict_probabilities(fingerprints)
    path = tmp_path / "predictions.csv"
    with path.open("w", newline="") as destination:
        writer = csv.writer(destination)
        writer.writerow(["inchikey", *labels])
        writer.writerows(
            [row.inchikey, *scores] for row, scores in zip(molecules, probabilities, strict=True)
        )
    results = tmp_path / "results.json"
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "smellcule",
            "evaluate",
            "--predictions",
            str(path),
            "--split",
            "official",
            "--name",
            "RF self-score",
            "--licence",
            "MIT",
            "--source-url",
            "https://example.org/rf",
            "--results",
            str(results),
        ],
    )
    main()
    result = json.loads(results.read_text())["submissions"]["RF self-score"]["official"]
    expected = json.loads(Path("eval/results.json").read_text())["official"]["rf"]
    for support, minimum in (("all_labels", 1), ("stable_labels", 5)):
        direct = classification_metrics(targets[test], probabilities[test], min_positives=minimum)
        assert result[support]["auroc"] == pytest.approx(direct.auroc, abs=1e-9, rel=0)
        assert result[support]["auroc"] == pytest.approx(
            expected[support]["auroc"], abs=1e-9, rel=0
        )
