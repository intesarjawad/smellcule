import json
import sys
from pathlib import Path

import numpy as np
import pytest

from smellcule.cli import main, read_results
from smellcule.map_evaluation import jaccard_means
from smellcule.report import render_markdown


def test_jaccard_averages_neighbours_and_keeps_held_out_separate() -> None:
    measured = np.array([[1, 0], [1, 1], [0, 1]], dtype=bool)
    neighbours = np.array([[1, 2], [0, 2], [0, 1]], dtype=np.int64)
    result = jaccard_means(measured, neighbours, np.array([False, True, False]))
    assert result["held_out"] == 0.5
    assert result["all_molecules"] == pytest.approx(1 / 3)


@pytest.mark.parametrize("run", ["map", "9"])
def test_map_command_preserves_results_and_regenerates_report(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, run: str
) -> None:
    from smellcule.cli import research

    bundle = tmp_path / "bundle"
    artifacts = tmp_path / "artifacts"
    (artifacts / "cluster").mkdir(parents=True)
    (artifacts / "cluster/config.json").write_text('{"ensemble_size": 10}')
    results = tmp_path / "results.json"
    results.write_text('{"official": {"keep": 0.5}, "submissions": {"keep": 0.7}}')
    report = tmp_path / "evaluation.md"

    def score(bundle_path: Path, artifact: Path) -> dict[str, object]:
        assert bundle_path == bundle
        assert artifact == artifacts / "atlas-map.npz"
        return {"all_molecules": {"odour": 0.5}, "held_out": {"odour": 0.3}}

    monkeypatch.setattr(research, "evaluate_map", score)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "smellcule",
            "evaluate",
            "--run",
            run,
            "--bundle",
            str(bundle),
            "--artifacts",
            str(artifacts),
            "--results",
            str(results),
            "--report",
            str(report),
        ],
    )
    main()
    document = read_results(results)
    assert document["official"] == {"keep": 0.5}
    assert document["submissions"] == {"keep": 0.7}
    assert json.loads(results.read_text())["map"]["ensemble_size"] == 10
    assert report.read_text() == render_markdown(document)
    map_section = report.read_text().split("## Map quality")[1]
    assert map_section.index("held_out") < map_section.index("all_molecules")
