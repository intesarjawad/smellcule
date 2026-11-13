import json
from pathlib import Path
from xml.parsers.expat import ParserCreate

import pytest

from smellcule.cli import read_results
from smellcule.report import render_figures, render_markdown, ship_gate, write_report

FIXTURE = Path(__file__).parent / "fixtures/report_results.json"
GOLDEN = Path(__file__).parent / "golden"


def test_markdown_and_svg_goldens(tmp_path: Path) -> None:
    results = read_results(FIXTURE)
    destination = tmp_path / "evaluation.md"
    write_report(results, destination)
    assert destination.read_text() == (GOLDEN / "evaluation.md").read_text()
    for name, content in render_figures(results).items():
        is_final = True
        assert ParserCreate().Parse(content, is_final) == 1
        assert content == (GOLDEN / name).read_text()
        assert content == (tmp_path / "figures" / name).read_text()
    assert "138 descriptors" in render_markdown(results)
    assert render_markdown(results).index("held_out") < render_markdown(results).index("all_groups")


@pytest.mark.parametrize(("score", "expected"), [(0.81, "FAIL"), (0.7, "FAIL"), (0.84, "PASS")])
def test_gate_uses_stable_point_estimate_not_ci(score: float, expected: str) -> None:
    results = json.loads(FIXTURE.read_text())
    results["cluster"]["mpnn"]["stable_labels"]["auroc"] = score
    assert expected in ship_gate(results)
    assert "[-0.020000, 0.080000]" in ship_gate(results)


def test_partial_report_and_descriptor_validation() -> None:
    assert "not evaluated" in ship_gate({})
    assert "Map (run 9)" in render_markdown({})
    with pytest.raises(ValueError, match="must match labels"):
        render_markdown({"official": {"labels": ["green"], "test_prevalence": []}})
    with pytest.raises(ValueError, match="finite"):
        render_markdown({"official": {"wall_time_s": float("nan")}})


def test_empty_domain_bin_is_unavailable() -> None:
    figures = render_figures(
        {"domain": {"bins": [{"lower": 0.3, "upper": 0.5, "molecule_count": 0, "metrics": None}]}}
    )
    assert "not available" in figures["domain.svg"]
