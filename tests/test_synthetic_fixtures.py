# ruff: noqa: S603
# The subprocess runs only the committed generator copied to an isolated test workspace.
import json
import shutil
import subprocess
import sys
from pathlib import Path

from smellcule.catalogue import read_leffingwell
from smellcule.export.bundle_inputs import load_fixture
from smellcule.export.smellcule import START_DATE
from smellcule.export.smellcule_lock import read_lock

ROOT = Path(__file__).resolve().parents[1]


def test_synthetic_fixtures_regenerate_without_source_targets_or_weights(tmp_path: Path) -> None:
    inputs = (
        "scripts/generate_fixtures.py",
        "tests/fixtures/molecule_identities.csv",
        "config/families.yaml",
        "config/notes.yaml",
        "config/phrases.yaml",
        "config/puzzles.lock.json",
        "eval/results.json",
        "eval/data_counts.json",
    )
    for relative in inputs:
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
    for _ in range(2):
        subprocess.run(
            [sys.executable, str(tmp_path / "scripts/generate_fixtures.py")],
            cwd=tmp_path,
            check=True,
        )
        for name in (
            "leffingwell_fixture.csv",
            "content_catalogue.csv",
            "export_catalogue.csv",
            "fixture_model_outputs.json",
            "synthetic-notes.yaml",
            "synthetic-phrases.yaml",
        ):
            assert (tmp_path / "tests/fixtures" / name).read_bytes() == (
                ROOT / "tests/fixtures" / name
            ).read_bytes()
    assert read_lock(tmp_path / "config/puzzles.lock.json").start_date == START_DATE
    bundle = load_fixture(tmp_path)
    assert bundle.smellcule["startDate"] == "2026-11-13"
    assert bundle.model["id"] == "synthetic-fixture"
    labels, rows = read_leffingwell(tmp_path / "tests/fixtures/content_catalogue.csv")
    assert len(labels) == 113
    assert all(sum(row.measured) >= 5 for row in rows)
    assert len(read_leffingwell(tmp_path / "tests/fixtures/leffingwell_fixture.csv")[1]) == 70
    lock = tmp_path / "config/puzzles.lock.json"
    lock.write_text(json.dumps({"startDate": "2026-11-13", "puzzles": {"1": {"retired": True}}}))
    result = subprocess.run(
        [sys.executable, str(tmp_path / "scripts/generate_fixtures.py")],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert "Refusing to reset a published puzzle lock" in result.stderr
