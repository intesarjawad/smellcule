import json
import sys
from pathlib import Path

import pytest

from smellcule.cli import main

type JsonValue = bool | int | float | str | list[JsonValue] | dict[str, JsonValue] | None


def rounded(value: JsonValue) -> JsonValue:
    if isinstance(value, dict):
        return {
            key: rounded(item)
            for key, item in value.items()
            if key not in {"machine", "wall_time_s"}
        }
    if isinstance(value, list):
        return [rounded(item) for item in value]
    return round(value, 3) if isinstance(value, float) else value


@pytest.mark.data
def test_reproduce_determinism(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    records: list[JsonValue] = []
    for attempt in range(2):
        directory = tmp_path / str(attempt)
        result = directory / "results.json"
        monkeypatch.setenv(
            "SMELLCULE_CACHE", str(Path(__file__).resolve().parents[1] / ".cache/smellcule")
        )
        monkeypatch.setattr(
            sys,
            "argv",
            [
                "smellcule",
                "reproduce",
                "--runs",
                "official",
                "--ensemble-size",
                "2",
                "--results",
                str(result),
                "--report",
                str(directory / "evaluation.md"),
                "--artifacts",
                str(directory / "artifacts"),
            ],
        )
        main()
        document = json.loads(result.read_text(encoding="utf-8"))
        assert document["official"]["ensemble_size"] == 2
        assert document["official"]["mpnn"]["all_labels"]["label_count"] == 113
        assert document["official"]["mpnn"]["stable_labels"]["label_count"] == 105
        records.append(rounded(document))
    assert records[0] == records[1]
