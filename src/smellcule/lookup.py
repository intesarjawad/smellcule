"""Catalogue-only perception lookup without research dependencies."""

import csv
import json
import math
from collections.abc import Sequence
from dataclasses import dataclass
from difflib import get_close_matches
from pathlib import Path
from typing import TypeGuard

import numpy as np
from safetensors import SafetensorError
from safetensors.numpy import load

from smellcule import DEFAULT_MODEL, catalogue, releases, sources
from smellcule.errors import DataError, NotInCatalogue, SmellculeError
from smellcule.releases import ModelName


@dataclass(frozen=True)
class LookupMatch:
    """One catalogue identity with aligned observations and released predictions."""

    molecule_id: str
    name: str
    cas: str | None
    measured: tuple[float | None, ...]
    prob: tuple[float, ...]
    spread: tuple[float, ...]
    split: str
    nearest_train_similarity: float | None


@dataclass(frozen=True)
class LookupResult:
    """All matches, with shared label order and release provenance."""

    model: ModelName
    revision: str | None
    labels: tuple[str, ...]
    matches: tuple[LookupMatch, ...]


def resolve(query: str, matches: Sequence[LookupMatch]) -> tuple[LookupMatch, ...]:
    """Prefer exact names and CAS, then return every matching name prefix."""
    normal = query.strip().casefold()
    exact = tuple(
        row
        for row in matches
        if normal == row.name.casefold() or (row.cas is not None and normal == row.cas.casefold())
    )
    if normal and exact:
        return exact
    prefix = tuple(row for row in matches if row.name.casefold().startswith(normal))
    if normal and prefix:
        return prefix
    names = {row.name.casefold(): row.name for row in matches}
    close = get_close_matches(normal, sorted(names), n=3)
    next_step = (
        "; ".join(f'smellcule lookup "{names[name]}"' for name in close)
        if close
        else "smellcule --help to see catalogue lookup usage; Browse URL pending publication"
    )
    message = (
        "not in the catalogue: Smellcule v1 predicts only for "
        "catalogued fragrance and flavour molecules"
    )
    raise NotInCatalogue(
        message,
        next_step,
    )


def _is_list(value: object) -> TypeGuard[list[object]]:
    return isinstance(value, list)


def read_labels(path: Path) -> tuple[str, ...]:
    """Validate the released descriptor ordering."""
    value: object = json.loads(path.read_text(encoding="utf-8"))
    if not _is_list(value):
        message = "labels.json must contain a nonempty list of unique strings"
        raise ValueError(message)
    items: list[object] = value
    labels = tuple(item for item in items if isinstance(item, str) and item.strip())
    if not labels or len(labels) != len(items) or len(set(labels)) != len(labels):
        message = "labels.json must contain a nonempty list of unique strings"
        raise ValueError(message)
    return labels


def _unit(text: str) -> float:
    value = float(text)
    if not math.isfinite(value) or not 0 <= value <= 1:
        message = "expected a finite value between zero and one"
        raise ValueError(message)
    return value


def _lf(labels: tuple[str, ...]) -> tuple[LookupMatch, ...]:
    local_labels, rows = catalogue.read_leffingwell(sources.fetch("leffingwell"))
    if set(local_labels) - set(labels):
        message = "source descriptors differ from release labels"
        raise ValueError(message)
    predictions = load(releases.download("lf", "predictions.safetensors").read_bytes())
    shape = (len(rows), len(labels))
    for key in ("prob", "spread"):
        array = predictions[key]
        if (
            array.shape != shape
            or array.dtype != np.float32
            or not np.isfinite(array).all()
            or np.any(array < 0)
            or np.any(array > 1)
        ):
            message = f"invalid released {key} tensor"
            raise ValueError(message)
    with releases.download("lf", "split.csv").open(newline="", encoding="utf-8") as source:
        splits = list(csv.DictReader(source))
    ordered = sorted(rows, key=lambda row: int(row.molecule_id))
    if [row["molecule_id"] for row in splits] != [row.molecule_id for row in ordered]:
        message = "split.csv identities differ from the catalogue row order"
        raise ValueError(message)
    result: list[LookupMatch] = []
    for index, (row, split) in enumerate(zip(ordered, splits, strict=True)):
        if split["split"] not in {"train", "validation", "held_out"}:
            message = "invalid released split"
            raise ValueError(message)
        measured = dict(zip(local_labels, row.measured, strict=True))
        result.append(
            LookupMatch(
                row.molecule_id,
                row.name,
                row.cas,
                tuple(float(measured.get(label, 0)) for label in labels),
                tuple(float(v) for v in predictions["prob"][index]),
                tuple(float(v) for v in predictions["spread"][index]),
                split["split"],
                _unit(split["nearest_train_similarity"])
                if split["nearest_train_similarity"]
                else None,
            )
        )
    return tuple(result)


def _open(labels: tuple[str, ...]) -> tuple[LookupMatch, ...]:
    with releases.download("open", "catalogue.csv").open(newline="", encoding="utf-8") as source:
        return tuple(
            LookupMatch(
                row["CID"],
                row["name"],
                row["CAS"],
                tuple(
                    _unit(row[f"measured_{label}"]) if row[f"measured_{label}"] else None
                    for label in labels
                ),
                tuple(_unit(row[f"prob_{label}"]) for label in labels),
                tuple(_unit(row[f"spread_{label}"]) for label in labels),
                f"cross_validated:{int(row['fold'])}",
                _unit(row["nearest_train_similarity"]) if row["nearest_train_similarity"] else None,
            )
            for row in csv.DictReader(source)
        )


def lookup(query: str, model: ModelName = DEFAULT_MODEL) -> LookupResult:
    """Resolve catalogue names or CAS against verified released outputs."""
    try:
        labels = read_labels(releases.download(model, "labels.json"))
        matches = _lf(labels) if model == "lf" else _open(labels)
    except SmellculeError:
        raise
    except (ValueError, TypeError, OSError, KeyError, SafetensorError) as error:
        message = f"could not read catalogue outputs: {error}"
        raise DataError(message, "smellcule lookup --help") from error
    return LookupResult(model, releases.RELEASED_REVISIONS[model], labels, resolve(query, matches))
