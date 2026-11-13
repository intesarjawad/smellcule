import json
import os
import shutil
import subprocess
from datetime import date
from pathlib import Path

import pytest

from smellcule.export.bundle import bundle_files
from smellcule.export.bundle_inputs import FIXTURE_EXPORTED_ON, load_fixture
from smellcule.export.bundle_schema import validate_document
from smellcule.export.content import mapping

ROOT = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.leffingwell_fixture


def test_bundle_exported_on_given_date_required_and_fixture_constant(tmp_path: Path) -> None:
    inputs = load_fixture(ROOT)
    exported_on = date(2026, 11, 5)
    files = bundle_files(ROOT, inputs, exported_on, fixtures=True)
    atlas = mapping(json.loads(files["atlas.json"]))
    assert atlas["exportedOn"] == FIXTURE_EXPORTED_ON
    for relative in ("schemas/bundle.schema.json", "config/families.yaml"):
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
    vanillin = next(row for row in inputs.rows if row.name == "Vanillin")
    evidence = next(
        label for label, value in zip(inputs.labels, vanillin.measured, strict=True) if value
    )
    (tmp_path / "config/notes.yaml").write_text(
        f"notes:\n  vanilla:\n    aliases: []\n    evidence: [{evidence}]\n"
        "    molecules: [Vanillin]\narchetypes: []\n",
        encoding="utf-8",
    )
    (tmp_path / "config/phrases.yaml").write_text("{}\n", encoding="utf-8")
    (tmp_path / "config/words.yaml").write_text(
        "referents: {}\ncarriers: []\nqualifiers: []\n", encoding="utf-8"
    )
    atlas = mapping(
        json.loads(bundle_files(tmp_path, inputs, exported_on, fixtures=False)["atlas.json"])
    )
    assert atlas["exportedOn"] == exported_on.isoformat()
    validate_document(atlas, ROOT / "schemas/bundle.schema.json")
    del atlas["exportedOn"]
    with pytest.raises(ValueError, match="required"):
        validate_document(atlas, ROOT / "schemas/bundle.schema.json")


@pytest.mark.parametrize(
    ("instant", "exit_code"),
    [
        ("2026-11-11T23:59:59Z", 0),
        ("2026-11-12T00:00:00Z", 1),
        ("2026-11-12T05:30:00+14:00", 0),
        ("2026-11-13T05:30:00+14:00", 1),
    ],
)
def test_bundle_exported_on_age_uses_utc(tmp_path: Path, instant: str, exit_code: int) -> None:
    atlas = tmp_path / "atlas.json"
    atlas.write_text(json.dumps({"exportedOn": "2026-11-05"}), encoding="utf-8")
    result = subprocess.run(
        ["/bin/sh", "-c", 'exec scripts/check_bundle_age.sh "$SMELLCULE_TEST_PATH"'],
        cwd=ROOT,
        env={
            **os.environ,
            "SMELLCULE_NOW": instant,
            "TZ": "Pacific/Kiritimati",
            "SMELLCULE_TEST_PATH": str(atlas),
        },
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == exit_code
    assert result.stderr == (
        "error: bundle exported on 2026-11-05, more than 6 days ago\n"
        "next: make export, then a patch release\n"
        if exit_code
        else ""
    )
