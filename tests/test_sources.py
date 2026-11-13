import hashlib
import threading
from collections.abc import Iterator
from functools import partial
from http.client import HTTPResponse, IncompleteRead
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from smellcule import cli, sources

PAYLOAD = b"name,descriptor\nfixture,floral\n"
PAYLOAD_SHA256 = hashlib.sha256(PAYLOAD).hexdigest()


@pytest.fixture
def source_server(tmp_path: Path) -> Iterator[tuple[str, Path]]:
    document_root = tmp_path / "http"
    document_root.mkdir()
    (document_root / "source.csv").write_bytes(PAYLOAD)
    handler = partial(SimpleHTTPRequestHandler, directory=str(document_root))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", document_root
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.fixture
def source_config(source_server: tuple[str, Path], tmp_path: Path) -> Path:
    base_url, _ = source_server
    path = tmp_path / "sources.toml"
    path.write_text(
        f'[fixture]\nurl = "{base_url}/source.csv"\n'
        f'sha256 = "{PAYLOAD_SHA256}"\nlicence = "CC BY 4.0"\n',
        encoding="utf-8",
    )
    return path


def test_sources_fetch_verifies_bytes_and_reuses_valid_cache(
    source_config: Path,
    source_server: tuple[str, Path],
    tmp_path: Path,
) -> None:
    cache_dir = tmp_path / "cache"
    result = sources.fetch("fixture", config_path=source_config, cache_dir=cache_dir)

    assert result == cache_dir / "fixture.csv"
    assert result.read_bytes() == PAYLOAD
    assert list(cache_dir.iterdir()) == [result]

    _, document_root = source_server
    (document_root / "source.csv").unlink()
    assert sources.fetch("fixture", config_path=source_config, cache_dir=cache_dir) == result


def test_sources_checksum_failure_leaves_no_file(source_config: Path, tmp_path: Path) -> None:
    wrong_sha256 = "0" * 64
    source_config.write_text(
        source_config.read_text(encoding="utf-8").replace(PAYLOAD_SHA256, wrong_sha256),
        encoding="utf-8",
    )
    cache_dir = tmp_path / "cache"

    with pytest.raises(sources.ChecksumError) as caught:
        sources.fetch("fixture", config_path=source_config, cache_dir=cache_dir)

    assert caught.value.key == "fixture"
    assert caught.value.expected == wrong_sha256
    assert caught.value.actual == PAYLOAD_SHA256
    assert wrong_sha256 in str(caught.value)
    assert PAYLOAD_SHA256 in str(caught.value)
    assert "fixture" in str(caught.value)
    assert not list(cache_dir.iterdir())


def test_sources_fetches_large_response(
    source_config: Path,
    source_server: tuple[str, Path],
    tmp_path: Path,
) -> None:
    payload = b"fixture,floral\n" * 100_000
    expected = hashlib.sha256(payload).hexdigest()
    _, document_root = source_server
    (document_root / "source.csv").write_bytes(payload)
    source_config.write_text(
        source_config.read_text(encoding="utf-8").replace(PAYLOAD_SHA256, expected),
        encoding="utf-8",
    )

    result = sources.fetch("fixture", config_path=source_config, cache_dir=tmp_path / "cache")

    assert result.read_bytes() == payload


def test_sources_interrupted_response_names_url_and_cleans_up(
    source_config: Path,
    source_server: tuple[str, Path],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def interrupted_read(_response: HTTPResponse, _amount: int | None = None) -> bytes:
        partial_payload = b"partial"
        raise IncompleteRead(partial_payload, len(PAYLOAD))

    monkeypatch.setattr(HTTPResponse, "read", interrupted_read)
    base_url, _ = source_server
    cache_dir = tmp_path / "cache"

    with pytest.raises(OSError, match=f"{base_url}/source.csv") as caught:
        sources.fetch("fixture", config_path=source_config, cache_dir=cache_dir)

    assert isinstance(caught.value.__cause__, IncompleteRead)
    assert not list(cache_dir.iterdir())


def test_sources_repairs_corrupt_cache(source_config: Path, tmp_path: Path) -> None:
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    destination = cache_dir / "fixture.csv"
    destination.write_bytes(b"corrupt cache")

    assert sources.fetch("fixture", config_path=source_config, cache_dir=cache_dir) == destination
    assert destination.read_bytes() == PAYLOAD


def test_sources_network_error_names_url_and_cleans_up(
    source_config: Path,
    source_server: tuple[str, Path],
    tmp_path: Path,
) -> None:
    base_url, document_root = source_server
    (document_root / "source.csv").unlink()
    cache_dir = tmp_path / "cache"

    with pytest.raises(OSError, match=f"{base_url}/source.csv"):
        sources.fetch("fixture", config_path=source_config, cache_dir=cache_dir)

    assert not list(cache_dir.iterdir())


def test_sources_unknown_key_does_not_create_cache(source_config: Path, tmp_path: Path) -> None:
    cache_dir = tmp_path / "cache"
    with pytest.raises(ValueError, match=r"Unknown source 'missing'.*fixture"):
        sources.fetch("missing", config_path=source_config, cache_dir=cache_dir)
    assert not cache_dir.exists()


def test_sources_cache_environment_override(
    source_config: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cache_dir = tmp_path / "custom-cache"
    monkeypatch.setenv("SMELLCULE_CACHE", str(cache_dir))
    assert sources.fetch("fixture", config_path=source_config) == cache_dir / "fixture.csv"


@pytest.mark.parametrize(
    ("old", "new", "message"),
    [
        ("[fixture]", "[../fixture]", "Invalid source configuration"),
        ("[fixture]", 'fixture = "not a table"\n[other]', "TOML table"),
        ("[fixture]", '["../fixture"]', "source key"),
        (PAYLOAD_SHA256, "not-a-checksum", "sha256"),
        ('licence = "CC BY 4.0"', "licence = 42", "licence"),
        ('licence = "CC BY 4.0"', 'licence = ""', "licence"),
        ('licence = "CC BY 4.0"', "", "licence"),
        ('licence = "CC BY 4.0"', 'licence = "CC BY 4.0"\nsha265 = "typo"', "sha265"),
        ('url = "http://127.0.0.1', 'url = "file://127.0.0.1', "url"),
    ],
)
def test_sources_rejects_invalid_config(
    source_config: Path,
    old: str,
    new: str,
    message: str,
) -> None:
    source_config.write_text(
        source_config.read_text(encoding="utf-8").replace(old, new),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match=message):
        sources.load_sources(source_config)


def test_sources_rejects_empty_manifest(tmp_path: Path) -> None:
    path = tmp_path / "empty.toml"
    path.write_text("", encoding="utf-8")
    with pytest.raises(ValueError, match="At least one source table"):
        sources.load_sources(path)


def test_sources_pinned_manifest() -> None:
    manifest = sources.load_sources()
    assert set(manifest) == {
        "leffingwell",
        "keller_molecules",
        "keller_stimuli",
        "keller_behavior",
        "gslf",
    }
    for source in manifest.values():
        assert source.url.startswith("https://raw.githubusercontent.com/")
        assert len(source.sha256) == 64
        assert source.licence


@pytest.mark.parametrize("keys", [[], ["fixture"]])
def test_sources_cli_fetch(
    source_config: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    keys: list[str],
) -> None:
    monkeypatch.setattr(sources, "CONFIG_PATH", source_config)
    monkeypatch.setenv("SMELLCULE_CACHE", str(tmp_path / "cache"))
    monkeypatch.setattr("sys.argv", ["smellcule", "fetch", *keys])

    cli.main()

    assert (tmp_path / "cache" / "fixture.csv").read_bytes() == PAYLOAD
    assert "fixture" in capsys.readouterr().out


def test_sources_cli_rejects_unknown_key_before_fetching(
    source_config: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(sources, "CONFIG_PATH", source_config)
    monkeypatch.setenv("SMELLCULE_CACHE", str(tmp_path / "cache"))
    monkeypatch.setattr("sys.argv", ["smellcule", "fetch", "fixture", "missing"])

    with pytest.raises(SystemExit) as caught:
        cli.main()

    assert caught.value.code == 2
    assert "missing" in capsys.readouterr().err
    assert not (tmp_path / "cache").exists()
