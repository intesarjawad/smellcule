import math
from collections.abc import Sequence
from pathlib import Path
from typing import TypeGuard
from urllib.parse import urlsplit

import yaml

from smellcule.catalogue import CatalogueRow


def _is_mapping(value: object) -> TypeGuard[dict[object, object]]:
    return isinstance(value, dict)


def _is_list(value: object) -> TypeGuard[list[object]]:
    return isinstance(value, list)


def _has_string_keys(value: dict[object, object]) -> TypeGuard[dict[str, object]]:
    return all(isinstance(key, str) and key.strip() for key in value)


def mapping(value: object) -> dict[str, object]:
    """Reject non-object content at the YAML boundary."""
    if not _is_mapping(value) or not _has_string_keys(value):
        message = "Expected a mapping with nonempty string keys."
        raise ValueError(message)
    return value


def sequence(value: object) -> list[object]:
    """Require a YAML list without coercing strings or mappings."""
    if not _is_list(value):
        message = "Expected a list."
        raise TypeError(message)
    return value


def text(value: object) -> str:
    """Require a nonempty string."""
    if not isinstance(value, str) or not value.strip():
        message = "Expected a nonempty string."
        raise ValueError(message)
    return value


def strings(value: object) -> tuple[str, ...]:
    """Read a list of nonempty strings."""
    return tuple(text(item) for item in sequence(value))


def read_yaml(path: Path) -> dict[str, object]:
    """Read authored content with safe YAML constructors."""
    with path.open(encoding="utf-8") as source:
        document: object = yaml.safe_load(source)
    return mapping(document)


def https_url(value: object) -> str:
    """Require an absolute HTTPS evidence link."""
    url = text(value)
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname:
        message = "Evidence source_url must be an absolute HTTPS URL."
        raise ValueError(message)
    return url


def positive_weight(value: object) -> float:
    """Reject nonnumeric, nonpositive and nonfinite phrase weights."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        message = "Phrase weights must be positive finite numbers."
        raise TypeError(message)
    weight = float(value)
    if not math.isfinite(weight) or weight <= 0:
        message = "Phrase weights must be positive finite numbers."
        raise ValueError(message)
    return weight


def resolve(name: str, rows: Sequence[CatalogueRow]) -> tuple[CatalogueRow, ...]:
    """Resolve all case-insensitive catalogue matches after trimming whitespace."""
    found = tuple(row for row in rows if row.name.strip().casefold() == name.strip().casefold())
    if not found:
        message = f"Catalogue name {name!r} does not resolve."
        raise ValueError(message)
    return found


def descriptors(values: Sequence[str], labels: Sequence[str]) -> None:
    """Reject empty evidence and descriptors absent from the catalogue."""
    if not values or set(values) - set(labels):
        message = f"Unknown or empty descriptor evidence: {list(values)}."
        raise ValueError(message)


def has_evidence(row: CatalogueRow, evidence: Sequence[str], labels: Sequence[str]) -> bool:
    """Test measured labels without using model predictions as content evidence."""
    return any(
        value and label in evidence for label, value in zip(labels, row.measured, strict=True)
    )


def claim_names(name: str, aliases: Sequence[str], used: set[str]) -> None:
    """Reject ambiguous note or phrase aliases before compilation."""
    for value in (name, *aliases):
        key = value.strip().casefold()
        if key in used:
            message = f"Ambiguous name or alias: {value!r}."
            raise ValueError(message)
        used.add(key)
