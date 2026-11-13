import csv
import json
import sys
from pathlib import Path

import pytest
from lookup_fixtures import install

from smellcule import cli, releases
from smellcule.lookup import lookup
from smellcule.releases import ModelName


@pytest.fixture
def local_release(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(releases, "RELEASED_REVISIONS", {"lf": None, "open": None})
    monkeypatch.setattr(releases, "RELEASED_SHA256", {"lf": {}, "open": {}})
    monkeypatch.setattr(
        releases.huggingface_hub, "hf_hub_download", releases.huggingface_hub.hf_hub_download
    )
    monkeypatch.setattr(cli.sources, "fetch", cli.sources.fetch)
    install(Path.cwd(), tmp_path)


@pytest.mark.leffingwell_fixture
@pytest.mark.usefixtures("local_release")
@pytest.mark.parametrize("json_output", [True, False])
def test_cli_output_fixture(
    *, json_output: bool, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("NO_COLOR", "1")
    monkeypatch.setattr(
        sys, "argv", ["smellcule", "lookup", *(["--json"] if json_output else []), "vanillin"]
    )
    cli.main()
    output = capsys.readouterr()
    assert output.err == ""
    assert "\x1b" not in output.out
    if json_output:
        value = json.loads(output.out)
        assert value["matches"][0]["name"].casefold() == "vanillin"
        assert len(value["labels"]) == len(value["matches"][0]["prob"])
        assert output.out == json.dumps(value, sort_keys=True) + "\n"
    else:
        assert "Vanillin" in output.out
        assert all(len(line) <= 80 for line in output.out.splitlines())


@pytest.mark.leffingwell_fixture
@pytest.mark.usefixtures("local_release")
def test_lookup_resolution() -> None:
    result = lookup("VANILLIN")
    assert lookup("vanill").matches == result.matches
    cas = result.matches[0].cas
    assert cas is not None
    assert lookup(cas).matches == result.matches


@pytest.mark.leffingwell_fixture
@pytest.mark.usefixtures("local_release")
def test_lookup_states_a_missing_cas(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    name = "Benzaldehyde ethyl methyl acetal"
    assert lookup(name).matches[0].cas is None
    monkeypatch.setenv("NO_COLOR", "1")
    monkeypatch.setattr(sys, "argv", ["smellcule", "lookup", name])
    cli.main()
    assert "CAS: not listed in the source catalogue" in capsys.readouterr().out
    monkeypatch.setattr(sys, "argv", ["smellcule", "lookup", "--json", name])
    cli.main()
    assert json.loads(capsys.readouterr().out)["matches"][0]["cas"] is None


def test_cli_output_help(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(sys, "argv", ["smellcule"])
    cli.main()
    output = capsys.readouterr().out
    assert "{lookup,fetch,splits,export,train,evaluate,reproduce}" in output
    assert len([line for line in output.splitlines() if line.startswith("  smellcule ")]) == 3


def test_lookup_open_observations_are_separate_from_predictions(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "labels.json").write_text('["sweet", "woody"]')
    with (tmp_path / "catalogue.csv").open("w", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(
            (
                "CID",
                "name",
                "CAS",
                "fold",
                "nearest_train_similarity",
                "measured_sweet",
                "measured_woody",
                "prob_sweet",
                "prob_woody",
                "spread_sweet",
                "spread_woody",
            )
        )
        writer.writerow(
            ("1183", "Vanillin", "121-33-5", "2", "0.7", "0.8", "", "0.6", "0.1", "0.02", "0.03")
        )

    def local_download(_model: ModelName, filename: str) -> Path:
        return tmp_path / filename

    monkeypatch.setattr(releases, "download", local_download)
    result = lookup("vanillin", "open")
    assert result.matches[0].measured == (0.8, None)
    assert result.matches[0].prob == (0.6, 0.1)
    assert result.matches[0].split == "cross_validated:2"
