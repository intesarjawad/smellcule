import json
from collections.abc import Mapping
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Literal

import numpy as np
from numpy.typing import NDArray

from smellcule import catalogue
from smellcule.export.bundle_stats import numeric
from smellcule.export.content import mapping, sequence, text
from smellcule.export.keller_rows import LABELS, fixture_rows, measured_rows
from smellcule.export.neighbours import Neighbour
from smellcule.metrics import FloatArray
from smellcule.molecules import Molecule, standardise
from smellcule.splits import Split

BundleSplit = Literal["train", "validation", "held_out", "cross_validated"]
CatalogueName = Literal["leffingwell", "keller"]

FIXTURE_EXPORTED_ON = "2000-01-01"
FIXTURE_CSV = "tests/fixtures/export_catalogue.csv"
FIXTURE_OUTPUTS = "tests/fixtures/fixture_model_outputs.json"


@dataclass(frozen=True)
class BundleInputs:
    """Row-aligned arrays and provenance shared by real and recorded fixture exports."""

    labels: tuple[str, ...]
    rows: tuple[catalogue.CatalogueRow, ...]
    molecules: tuple[Molecule, ...]
    assignments: tuple[BundleSplit, ...]
    nearest: tuple[float | None, ...]
    probabilities: FloatArray
    spread: FloatArray
    positions: NDArray[np.float32]
    neighbours: tuple[tuple[Neighbour, ...], ...]
    stats: dict[str, object]
    model: Mapping[str, str]
    smellcule: dict[str, object]
    catalogue_name: CatalogueName = "leffingwell"


def split_value(value: object) -> Split:
    """Reject unknown recorded assignments instead of silently treating them as training."""
    if value == "train":
        return "train"
    if value == "validation":
        return "validation"
    if value == "held_out":
        return "held_out"
    message = f"Invalid cluster split {value!r}."
    raise ValueError(message)


def read_fixture_rows(root: Path, labels: tuple[str, ...]) -> tuple[catalogue.CatalogueRow, ...]:
    """Retain the full model vocabulary while remapping measured fixture descriptors."""
    local_labels, rows = catalogue.read_leffingwell(root / FIXTURE_CSV)
    if set(local_labels) - set(labels):
        message = "Fixture descriptors are absent from the recorded model vocabulary."
        raise ValueError(message)
    aligned: list[catalogue.CatalogueRow] = []
    for row in rows:
        measured = dict(zip(local_labels, row.measured, strict=True))
        aligned.append(replace(row, measured=tuple(measured.get(label, 0) for label in labels)))
    return tuple(aligned)


def load_fixture(root: Path, catalogue_name: CatalogueName = "leffingwell") -> BundleInputs:
    """Load fixture arrays without accessing weights, source downloads or projection."""
    outputs = (
        "tests/fixtures/keller_fixture_model_outputs.json"
        if catalogue_name == "keller"
        else FIXTURE_OUTPUTS
    )
    document = mapping(json.loads((root / outputs).read_text(encoding="utf-8")))
    labels = tuple(text(v) for v in sequence(document["labels"]))
    if catalogue_name == "keller":
        rows = measured_rows(fixture_rows(root))
    else:
        rows = read_fixture_rows(root, labels)
    saved = mapping(document["molecules"])
    if set(saved) != {row.molecule_id for row in rows}:
        message = "Recorded fixture ids differ from the export fixture CSV."
        raise ValueError(message)
    records = [mapping(saved[row.molecule_id]) for row in rows]
    if catalogue_name == "keller" and (
        labels != LABELS or any(record["split"] != "cross_validated" for record in records)
    ):
        message = "Keller fixture labels or cross-validated assignments differ from the catalogue."
        raise ValueError(message)
    return BundleInputs(
        labels,
        rows,
        tuple(standardise(row) for row in rows),
        ("cross_validated",) * len(records)
        if catalogue_name == "keller"
        else tuple(split_value(record["split"]) for record in records),
        tuple(
            None
            if record["nearestTrainSimilarity"] is None
            else float(numeric(record["nearestTrainSimilarity"]))
            for record in records
        ),
        np.array([sequence(r["prob"]) for r in records], dtype=np.float64),
        np.array([sequence(r["spread"]) for r in records], dtype=np.float64),
        np.array([sequence(r["position"]) for r in records], dtype="<f4"),
        tuple(
            tuple(
                Neighbour(text(n["id"]), float(numeric(n["odour"])), float(numeric(n["structure"])))
                for raw in sequence(r["neighbours"])
                for n in [mapping(raw)]
            )
            for r in records
        ),
        mapping(document["stats"]),
        {key: text(value) for key, value in mapping(document["model"]).items()},
        mapping(document["smellcule"]),
        catalogue_name,
    )
