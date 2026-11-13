import json
import runpy
import sys
from pathlib import Path

import pytest


def run_check(root: Path, monkeypatch: pytest.MonkeyPatch) -> int:
    monkeypatch.setattr(sys, "argv", ["check_numbers.py", "--root", str(root)])
    with pytest.raises(SystemExit) as caught:
        runpy.run_path("scripts/check_numbers.py", run_name="__main__")
    assert isinstance(caught.value.code, int)
    return caught.value.code


@pytest.fixture
def claim_root(tmp_path: Path) -> Path:
    (tmp_path / "eval").mkdir()
    (tmp_path / "scripts").mkdir()
    (tmp_path / "docs/figures").mkdir(parents=True)
    (tmp_path / "eval/results.json").write_text(json.dumps({"count": 1644, "rate": 0.25}))
    (tmp_path / "eval/data_counts.json").write_text(json.dumps({"count": 12345}))
    (tmp_path / "scripts/number_allowlist.txt").write_text("2026  # source year\n")
    return tmp_path


def test_accepts_evidence_allowlist_and_exclusions(
    claim_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (claim_root / "README.md").write_text(
        "AUROC 0.913000 over 1,644 molecules; 25% positive. Year 2026; 12,345 rows.\n"
        "`0.456` and https://example.org/1234/0.123\n"
        "```python\nvalue = 99.99\n```\n"
        "~~~text\n88%\n~~~\n"
    )
    (claim_root / "docs/figures/test.svg").write_text(
        '<svg width="999"><text>0.913000</text></svg>'
    )
    assert run_check(claim_root, monkeypatch) == 0


def test_rejects_decimal_integer_and_percentage(
    claim_root: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    (claim_root / "README.md").write_text(
        "Invented: 0.456789, 987654, 67%, -0.456, 1e-6, .567891, 5 %, 0.25%."
    )
    (claim_root / "docs/figures/test.svg").write_text("<svg><text>987654</text></svg>")
    assert run_check(claim_root, monkeypatch) == 1
    stderr = capsys.readouterr().err
    for number in ("0.456789", "987654", "67%", "-0.456", "1e-6", ".567891", "5 %", "0.25%"):
        assert f"unsupported number {number}" in stderr
    assert "docs/figures/test.svg:" in stderr


def test_allowlist_requires_reason(claim_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (claim_root / "scripts/number_allowlist.txt").write_text("2026\n")
    with pytest.raises(ValueError, match="require a reason"):
        run_check(claim_root, monkeypatch)
