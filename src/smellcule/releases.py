"""Pinned, checksum-verified release downloads."""

import hashlib
import re
from pathlib import Path
from typing import Literal

import huggingface_hub
from huggingface_hub.errors import HfHubHTTPError, LocalEntryNotFoundError

from smellcule.errors import ModelNotPublished, ReleaseError

ModelName = Literal["lf", "open"]
RELEASED_REVISIONS: dict[ModelName, str | None] = {"lf": None, "open": None}
RELEASED_SHA256: dict[ModelName, dict[str, str]] = {"lf": {}, "open": {}}


def download(name: ModelName, filename: str) -> Path:
    """Download only pinned files, verifying cached bytes on every access."""
    revision = RELEASED_REVISIONS[name]
    if revision is None:
        message = f"smellcule-{name} is not published"
        next_step = (
            "smellcule lookup --model open <query>"
            if name == "lf" and RELEASED_REVISIONS["open"] is not None
            else "smellcule --help"
        )
        raise ModelNotPublished(message, next_step)
    expected = RELEASED_SHA256[name].get(filename, "")
    if not re.fullmatch(r"[0-9a-f]{40}", revision) or not re.fullmatch(r"[0-9a-f]{64}", expected):
        message = "release pins are missing or invalid"
        raise ReleaseError(message, "smellcule --help")
    repo = f"intesarjawad/smellcule-{name}"
    try:
        path = Path(
            huggingface_hub.hf_hub_download(repo_id=repo, filename=filename, revision=revision)
        )
        with path.open("rb") as source:
            actual = hashlib.file_digest(source, "sha256").hexdigest()
    except (HfHubHTTPError, LocalEntryNotFoundError, OSError) as error:
        message = f"could not download {filename} from {repo} at {revision}: {error}"
        raise ReleaseError(
            message,
            "smellcule lookup <query> again when online; "
            "HF_HUB_OFFLINE=1 smellcule lookup <query> after one successful download",
        ) from error
    if actual != expected:
        message = (
            f"{filename} does not match its pinned SHA-256 "
            f"(expected {expected}, got {actual}); nothing was used"
        )
        raise ReleaseError(
            message,
            f"rm {path} && smellcule lookup <query>",
        )
    return path
