import csv
import json
import sys
from collections.abc import Sequence
from dataclasses import asdict, replace
from pathlib import Path

import numpy as np
import pytest

from smellcule import catalogue, splits
from smellcule.cli import main, submission
from smellcule.metrics import BootstrapConfig, bootstrap_auroc
from smellcule.molecules import Molecule, standardise


@pytest.fixture
def predictions(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.chdir(tmp_path)
    molecules = tuple(
        standardise(
            catalogue.CatalogueRow(
                str(i),
                "",
                "",
                smiles,
                (i % 2, 1 - i % 2),
                "held_out" if i >= 4 else "train",
                -1 if i >= 4 else 0 if i >= 2 else 1,
            )
        )
        for i, smiles in enumerate(("C", "CC", "CCC", "CCO", "CN", "CO"))
    )
    monkeypatch.setattr(submission, "load_catalogue", lambda: (("a", "b"), molecules))
    path = tmp_path / "predictions.csv"
    with path.open("w", newline="") as destination:
        writer = csv.writer(destination)
        writer.writerow(["inchikey", "a", "b"])
        writer.writerows([row.inchikey, *row.measured] for row in molecules)
    return path


def test_scores_both_splits_with_meta_and_preserves_other_entries(
    predictions: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    results = tmp_path / "results.json"
    results.write_text('{"map": {"score": 0.5}, "submissions": {"other": {"keep": true}}}')
    meta = tmp_path / "meta.toml"
    meta.write_text('name="forest"\nlicence="MIT"\nsource_url="https://example.org/model"\n')
    seen_groups: list[bool] = []
    real_summary = submission.classification_summary

    def summary(
        targets: np.ndarray[tuple[int, ...], np.dtype[np.float64]],
        scores: np.ndarray[tuple[int, ...], np.dtype[np.float64]],
        groups: np.ndarray[tuple[int, ...], np.dtype[np.int64]] | None,
    ) -> dict[str, object]:
        seen_groups.append(groups is not None)
        return real_summary(targets, scores, groups)

    monkeypatch.setattr(submission, "classification_summary", summary)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "smellcule",
            "evaluate",
            "--predictions",
            str(predictions),
            "--meta",
            str(meta),
            "--results",
            str(results),
        ],
    )
    main()
    document = json.loads(results.read_text())
    assert seen_groups == [False, True]
    assert document["map"] == {"score": 0.5}
    assert document["submissions"]["other"] == {"keep": True}
    entry = document["submissions"]["forest"]
    assert entry["licence"] == "MIT"
    assert entry["source_url"] == "https://example.org/model"
    _, molecules = submission.load_catalogue()
    for name, assignments in (
        ("official", splits.official_split(molecules)),
        ("cluster", splits.cluster_split(molecules).assignments),
    ):
        assert entry[name]["molecule_count"] == assignments.count("held_out")
        assert entry[name]["all_labels"]["auroc"] == 1
        assert entry[name]["all_labels"]["auprc"] == 1
        assert entry[name]["stable_labels"]["label_count"] == 0
    meta.write_text(
        'name="forest"\nlicence="BSD-3-Clause"\nsource_url="https://example.org/model"\n'
    )
    main()
    assert json.loads(results.read_text())["submissions"]["forest"]["licence"] == "BSD-3-Clause"


@pytest.mark.parametrize(
    "mode", ["missing_flags", "mixed", "bad_csv", "bad_toml", "missing_coverage"]
)
def test_invalid_submission_exits_two_without_changing_results(
    predictions: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    mode: str,
) -> None:
    results = tmp_path / "results.json"
    original = b'{"official": {"keep": true}}\n'
    results.write_bytes(original)
    meta = tmp_path / "meta.toml"
    meta.write_text('name="forest"\nlicence="MIT"\nsource_url="https://example.org/model"\n')
    options = ["--meta", str(meta)]
    if mode == "missing_flags":
        options = ["--name", "forest"]
    elif mode == "mixed":
        options += ["--name", "forest"]
    elif mode == "bad_csv":
        predictions.write_text("wrong header\n")
    elif mode == "bad_toml":
        meta.write_text("not toml")
    else:
        predictions.write_text("inchikey,a,b\n")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "smellcule",
            "evaluate",
            "--predictions",
            str(predictions),
            *options,
            "--results",
            str(results),
        ],
    )
    with pytest.raises(SystemExit) as error:
        main()
    assert error.value.code == 2
    assert results.read_bytes() == original
    lines = capsys.readouterr().err.splitlines()
    assert len(lines) == 2
    assert lines[0].startswith("error: row ")
    assert lines[1].startswith("next: smellcule splits --out")


def test_flags_and_single_split_do_not_require_other_split_coverage(
    predictions: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, molecules = submission.load_catalogue()
    with predictions.open("w", newline="") as destination:
        writer = csv.writer(destination)
        writer.writerow(["inchikey", "a", "b"])
        writer.writerows(
            [row.inchikey, *row.measured] for row in molecules if row.official_split == "held_out"
        )
    results = tmp_path / "results.json"
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "smellcule",
            "evaluate",
            "--predictions",
            str(predictions),
            "--name",
            "forest",
            "--licence",
            "MIT",
            "--source-url",
            "https://example.org/model",
            "--split",
            "official",
            "--results",
            str(results),
        ],
    )
    main()
    entry = json.loads(results.read_text())["submissions"]["forest"]
    assert "official" in entry
    assert "cluster" not in entry


def test_network_minus_submission_intervals_for_both_splits_and_supports(
    predictions: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, original = submission.load_catalogue()
    molecules = tuple(
        replace(
            original[0],
            molecule_id=str(i),
            inchikey=f"{'A' * 13}{chr(65 + i)}-{'A' * 10}-A",
            measured=(i % 2, int(i % 12 < 2)),
            official_split="held_out" if i >= 12 else "train",
            official_cv0=-1 if i >= 12 else 1,
        )
        for i in range(24)
    )
    monkeypatch.setattr(submission, "load_catalogue", lambda: (("a", "b"), molecules))
    cluster = splits.ClusterSplit(
        tuple("held_out" if i < 12 else "train" for i in range(24)),
        tuple(tuple(range(i, i + 3)) for i in range(0, 24, 3)),
    )

    def cluster_split(_molecules: Sequence[Molecule]) -> splits.ClusterSplit:
        return cluster

    monkeypatch.setattr(splits, "cluster_split", cluster_split)
    targets = np.array([row.measured for row in molecules], dtype=np.float64)
    network = targets * 0.8 + 0.1
    scores = np.random.default_rng(42).random(targets.shape)
    with predictions.open("w", newline="") as destination:
        writer = csv.writer(destination)
        writer.writerow(["inchikey", "a", "b"])
        writer.writerows(
            [row.inchikey, *score] for row, score in zip(molecules, scores, strict=True)
        )
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir()
    assignments = {"official": splits.official_split(molecules), "cluster": cluster.assignments}
    for name, assignment in assignments.items():
        np.savez_compressed(
            artifacts / f"{name}.npz",
            prob=network,
            molecule_id=np.array([row.molecule_id for row in molecules]),
            labels=np.array(["a", "b"]),
            split=np.array(assignment),
        )
    results = tmp_path / "results.json"
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "smellcule",
            "evaluate",
            "--predictions",
            str(predictions),
            "--name",
            "Chemprop 2.3.1 (D-MPNN, 10-model ensemble)",
            "--licence",
            "MIT",
            "--source-url",
            "https://example.org/model",
            "--artifacts",
            str(artifacts),
            "--results",
            str(results),
        ],
    )
    main()
    entry = json.loads(results.read_text())["submissions"][
        "Chemprop 2.3.1 (D-MPNN, 10-model ensemble)"
    ]
    for name, assignment in assignments.items():
        test = np.array([i for i, split in enumerate(assignment) if split == "held_out"])
        groups = test // 3 if name == "cluster" else None
        for support, minimum in (("all_labels", 1), ("stable_labels", 5)):
            expected = asdict(
                bootstrap_auroc(
                    targets[test],
                    network[test],
                    comparison=scores[test],
                    groups=groups,
                    config=BootstrapConfig(min_positives=minimum),
                )
            )
            assert entry[name][support]["network_minus_submission_auroc_ci"] == expected
            assert expected["lower"] >= 0


@pytest.mark.parametrize("invalid", ["rows", "labels", "split", "shape", "nan", "range"])
@pytest.mark.usefixtures("predictions")
def test_network_artifact_rejects_misaligned_or_invalid_probabilities(
    tmp_path: Path, invalid: str
) -> None:
    labels, molecules = submission.load_catalogue()
    assignments = splits.official_split(molecules)
    ids = np.array([row.molecule_id for row in molecules])
    descriptor_order = np.array(labels)
    saved_split = np.array(assignments)
    probabilities = np.full((len(molecules), len(labels)), 0.5)
    if invalid == "rows":
        ids = ids[::-1]
    elif invalid == "labels":
        descriptor_order = descriptor_order[::-1]
    elif invalid == "split":
        saved_split = saved_split[::-1]
    elif invalid == "shape":
        probabilities = probabilities[:-1]
    elif invalid == "nan":
        probabilities[0, 0] = np.nan
    else:
        probabilities[0, 0] = 1.1
    path = tmp_path / "official.npz"
    np.savez_compressed(
        path, prob=probabilities, molecule_id=ids, labels=descriptor_order, split=saved_split
    )
    with pytest.raises(ValueError, match="Network artifact"):
        submission.network_predictions(path, labels, molecules, assignments)
