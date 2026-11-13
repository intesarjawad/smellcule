import json
from pathlib import Path

import pytest

from smellcule.cli import update_results


def test_results_merge_preserves_other_writers_and_replaces_owned_key(tmp_path: Path) -> None:
    path = tmp_path / "results.json"
    original = {
        "submissions": {"forest": {"official": 0.8}},
        "map": {"jaccard": [0.2, 0.3]},
        "official": {"old": True},
    }
    path.write_text(json.dumps(original), encoding="utf-8")
    preserved = {
        key: json.dumps(original[key], sort_keys=True).encode() for key in ("map", "submissions")
    }
    update_results(path, {"official": {"mpnn": 0.9}})
    result = json.loads(path.read_text(encoding="utf-8"))
    assert result["official"] == {"mpnn": 0.9}
    for key, expected in preserved.items():
        assert json.dumps(result[key], sort_keys=True).encode() == expected
    before = path.read_bytes()
    with pytest.raises(ValueError, match="JSON compliant"):
        update_results(path, {"cluster": float("nan")})
    assert path.read_bytes() == before
    assert not list(tmp_path.glob("*.tmp"))


@pytest.mark.parametrize("source", ["[]", "null", "1"])
def test_results_rejects_non_object_without_replacing_file(tmp_path: Path, source: str) -> None:
    path = tmp_path / "results.json"
    path.write_text(source, encoding="utf-8")
    with pytest.raises(ValueError, match="JSON object"):
        update_results(path, {"official": {"auroc": 0.9}})
    assert path.read_text(encoding="utf-8") == source
