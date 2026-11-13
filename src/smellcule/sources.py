import hashlib
import os
import re
import tempfile
import tomllib
from dataclasses import dataclass
from http.client import HTTPException, HTTPResponse
from pathlib import Path
from typing import TypeGuard
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import build_opener

from smellcule.errors import SourceChecksumError, SourceDownloadError
from smellcule.resources import RESOURCE_ROOT

CONFIG_PATH = RESOURCE_ROOT / "config" / "sources.toml"
CHUNK_BYTES = 1024 * 1024
# Bound socket waits so a stalled source does not hang the command indefinitely.
NETWORK_TIMEOUT_SECONDS = 30


@dataclass(frozen=True)
class Source:
    """A pinned dataset and its permitted use, read from the source manifest."""

    url: str
    sha256: str
    licence: str


class ChecksumError(SourceChecksumError):
    """A source's bytes differ from the pinned SHA-256 digest."""

    def __init__(
        self, key: str, expected: str, actual: str, cache_path: Path | None = None
    ) -> None:
        self.key = key
        self.expected = expected
        self.actual = actual
        super().__init__(
            f"{key} does not match its pinned SHA-256 "
            f"(expected {expected}, got {actual}); nothing was used",
            f"rm {cache_path} && smellcule fetch {key}" if cache_path else f"smellcule fetch {key}",
        )


def _is_table(value: object) -> TypeGuard[dict[str, object]]:
    # tomllib guarantees string keys; values still require validation.
    return isinstance(value, dict)


def _parse_source(key: str, value: object) -> Source:
    if re.fullmatch(r"[a-z][a-z0-9_]*", key) is None:
        message = f"Invalid source key {key!r}; use lowercase letters, digits and underscores."
        raise ValueError(message)
    if not _is_table(value):
        message = f"Source {key!r} must be a TOML table."
        raise TypeError(message)
    table = value
    required_fields = {"url", "sha256", "licence"}
    if table.keys() != required_fields:
        missing = sorted(required_fields - table.keys())
        unexpected = sorted(table.keys() - required_fields)
        message = f"Source {key!r}: missing fields {missing}; unexpected fields {unexpected}."
        raise ValueError(message)
    fields: dict[str, str] = {}
    for field, content in table.items():
        if not isinstance(content, str) or not content.strip():
            message = f"Source {key!r}: {field} must be a non-empty string."
            raise ValueError(message)
        fields[field] = content
    url = fields["url"]
    parsed_url = urlsplit(url)
    if parsed_url.scheme not in {"https", "http"} or not parsed_url.hostname:
        message = f"Source {key!r}: url must be an absolute HTTP or HTTPS URL, got {url!r}."
        raise ValueError(message)
    sha256 = fields["sha256"]
    if re.fullmatch(r"[0-9a-f]{64}", sha256) is None:
        message = f"Source {key!r}: sha256 must contain exactly 64 lowercase hexadecimal digits."
        raise ValueError(message)
    return Source(url=url, sha256=sha256, licence=fields["licence"])


def _parse_manifest(document: dict[str, object]) -> dict[str, Source]:
    if not document:
        message = "At least one source table is required."
        raise ValueError(message)
    return {key: _parse_source(key, value) for key, value in document.items()}


def load_sources(path: Path | None = None) -> dict[str, Source]:
    """Read and validate the manifest before any download or cache mutation."""
    config_path = CONFIG_PATH if path is None else path
    try:
        with config_path.open("rb") as manifest:
            document: dict[str, object] = tomllib.load(manifest)
        return _parse_manifest(document)
    except (ValueError, TypeError) as error:
        message = f"Invalid source configuration {config_path}: {error}"
        raise ValueError(message) from error


def fetch(
    key: str,
    *,
    config_path: Path | None = None,
    cache_dir: Path | None = None,
) -> Path:
    """Return verified cached bytes, downloading and atomically replacing them when needed.

    SMELLCULE_CACHE overrides ~/.cache/smellcule. Invalid cached bytes are discarded.
    Downloads use a single attempt; neither a failed download nor a hash mismatch is cached.
    """
    manifest = load_sources(config_path)
    if key not in manifest:
        message = f"Unknown source {key!r}. Choose from: {', '.join(manifest)}."
        raise ValueError(message)
    source = manifest[key]
    if cache_dir is None:
        cache_dir = Path(os.environ.get("SMELLCULE_CACHE", "~/.cache/smellcule")).expanduser()
    destination = cache_dir / f"{key}.csv"
    if destination.exists():
        with destination.open("rb") as cached:
            if hashlib.file_digest(cached, "sha256").hexdigest() == source.sha256:
                return destination
        destination.unlink()
    cache_dir.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(dir=cache_dir, prefix=f".{key}.", suffix=".tmp")
    temporary_path = Path(temporary_name)
    digest = hashlib.sha256()
    try:
        with os.fdopen(descriptor, "wb") as temporary:
            response: HTTPResponse = build_opener().open(
                source.url, timeout=NETWORK_TIMEOUT_SECONDS
            )
            with response:
                while chunk := response.read(CHUNK_BYTES):
                    temporary.write(chunk)
                    digest.update(chunk)
        actual = digest.hexdigest()
        if actual != source.sha256:
            raise ChecksumError(key, source.sha256, actual, destination)
        temporary_path.replace(destination)
    except (URLError, OSError, HTTPException) as error:
        message = f"could not download {key} from {source.url}: {error}"
        raise SourceDownloadError(message, f"smellcule fetch {key}") from error
    finally:
        temporary_path.unlink(missing_ok=True)
    return destination
