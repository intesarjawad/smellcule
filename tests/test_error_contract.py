import sys
from pathlib import Path

import pytest
from lookup_fixtures import install

from smellcule import cli, errors, releases
from smellcule.lookup import lookup


@pytest.mark.parametrize("kind", errors.SmellculeError.__subclasses__())
def test_error_contract_subclasses(
    kind: type[errors.SmellculeError],
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    error = kind("a description\ncontinued", "smellcule --help")
    assert error.what == "a description continued"
    assert error.next_step.startswith("smellcule ")

    def failing_lookup(_query: str, _model: str) -> None:
        raise error

    monkeypatch.setattr(cli, "lookup", failing_lookup)
    monkeypatch.setattr(sys, "argv", ["smellcule", "lookup", "vanillin"])
    with pytest.raises(SystemExit) as caught:
        cli.main()
    assert caught.value.code == error.exit_code
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err == "error: a description continued\nnext: smellcule --help\n"


@pytest.mark.parametrize("query", ["CCO", "unlisted molecule", ""])
@pytest.mark.leffingwell_fixture
def test_error_contract_unknown(
    query: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    with monkeypatch.context():
        # Restore all redirects after exercising the command boundary.
        monkeypatch.setattr(releases, "RELEASED_REVISIONS", {"lf": None, "open": None})
        monkeypatch.setattr(releases, "RELEASED_SHA256", {"lf": {}, "open": {}})
        monkeypatch.setattr(
            releases.huggingface_hub, "hf_hub_download", releases.huggingface_hub.hf_hub_download
        )
        monkeypatch.setattr(cli.sources, "fetch", cli.sources.fetch)
        install(Path.cwd(), tmp_path)
        monkeypatch.setattr(sys, "argv", ["smellcule", "lookup", query])
        with pytest.raises(SystemExit) as caught:
            cli.main()
        assert caught.value.code == 2
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err.splitlines()[0].startswith("error: not in the catalogue:")
    assert output.err.splitlines()[1].startswith("next: smellcule ")
    assert len(output.err.splitlines()) == 2


def test_error_contract_unpublished(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(releases.RELEASED_REVISIONS, "lf", None)
    with pytest.raises(errors.ModelNotPublished, match="smellcule-lf is not published"):
        lookup("vanillin")


@pytest.mark.parametrize("model", ["lf", "open"])
def test_unpublished_model_does_not_suggest_unpublished_fallback(
    model: releases.ModelName, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(releases, "RELEASED_REVISIONS", {"lf": None, "open": None})
    with pytest.raises(errors.ModelNotPublished) as caught:
        releases.download(model, "labels.json")
    assert caught.value.next_step == "smellcule --help"


def test_unpublished_default_suggests_published_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(releases, "RELEASED_REVISIONS", {"lf": None, "open": "a" * 40})
    with pytest.raises(errors.ModelNotPublished) as caught:
        releases.download("lf", "labels.json")
    assert caught.value.next_step == "smellcule lookup --model open <query>"


def test_error_contract_bug_keeps_traceback(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(_query: str, _model: str) -> None:
        message = "unexpected bug"
        raise RuntimeError(message)

    monkeypatch.setattr(cli, "lookup", broken)
    monkeypatch.setattr(sys, "argv", ["smellcule", "lookup", "vanillin"])
    with pytest.raises(RuntimeError, match="unexpected bug"):
        cli.main()


def test_error_contract_checksum(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    path = tmp_path / "labels.json"
    path.write_text("changed")
    monkeypatch.setitem(releases.RELEASED_REVISIONS, "lf", "a" * 40)
    monkeypatch.setitem(releases.RELEASED_SHA256, "lf", {"labels.json": "b" * 64})

    def changed_file(**_kwargs: object) -> str:
        return str(path)

    monkeypatch.setattr(releases.huggingface_hub, "hf_hub_download", changed_file)
    with pytest.raises(errors.ReleaseError, match="nothing was used") as caught:
        releases.download("lf", "labels.json")
    assert caught.value.exit_code == 1
