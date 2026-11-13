import csv
import json
import sys
from pathlib import Path

import pytest

from smellcule import catalogue, sources, splits
from smellcule.cli import main
from smellcule.molecules import standardise

FIXTURE = Path(__file__).parent / "fixtures" / "leffingwell_fixture.csv"


@pytest.mark.leffingwell_fixture
def test_splits_command_exports_fixture_assignments_and_label_order(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fetched: list[str] = []

    def fetch(key: str) -> Path:
        fetched.append(key)
        return FIXTURE

    monkeypatch.setattr(sources, "fetch", fetch)
    labels, rows = catalogue.read_leffingwell(FIXTURE)
    molecules = tuple(standardise(row) for row in rows)
    output = tmp_path / "splits"
    monkeypatch.setattr(sys, "argv", ["smellcule", "splits", "--out", str(output)])
    main()
    expected = {
        "official.csv": splits.official_split(molecules),
        "cluster-v1.csv": splits.cluster_split(molecules).assignments,
    }
    before = {path.name: path.read_bytes() for path in output.iterdir()}
    main()
    assert fetched == ["leffingwell", "leffingwell"]
    assert {path.name: path.read_bytes() for path in output.iterdir()} == before
    assert json.loads((output / "labels.json").read_text()) == list(labels)
    for filename, assignments in expected.items():
        with (output / filename).open(newline="") as source:
            records = list(csv.reader(source))
        assert records == [
            ["inchikey", "split"],
            *[[row.inchikey, split] for row, split in zip(molecules, assignments, strict=True)],
        ]
