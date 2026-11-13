import ast
import csv
import json
import math
import re
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypeGuard

CAS_SHAPE = re.compile(r"\d{2,7}-\d{2}-\d")

# Keller ratings use the source's 0 to 100 response scale.
KELLER_RATING_MAX = 100
KELLER_DESCRIPTORS = (
    "EDIBLE",
    "BAKERY",
    "SWEET",
    "FRUIT",
    "FISH",
    "GARLIC",
    "SPICES",
    "COLD",
    "SOUR",
    "BURNT",
    "ACID",
    "WARM",
    "MUSKY",
    "SWEATY",
    "AMMONIA/URINOUS",
    "DECAYED",
    "WOOD",
    "GRASS",
    "FLOWER",
    "CHEMICAL",
)


@dataclass(frozen=True)
class CatalogueRow:
    """A source-stable Leffingwell row with binary targets in catalogue label order."""

    molecule_id: str
    name: str
    cas: str | None
    smiles: str
    measured: tuple[int, ...]
    official_split: Literal["train", "held_out"]
    official_cv0: int
    # Marks the source appended to its CAS field ("*", "??") or a whole note ("Note*"),
    # removed from `cas` and kept here so the export can count them.
    cas_annotation: str | None = None


@dataclass(frozen=True)
class KellerRow:
    """A structured CID with optional means in KELLER_DESCRIPTORS order.

    None denotes no eligible observations, never a measured zero.
    """

    molecule_id: str
    name: str
    cas: str
    smiles: str
    measured: tuple[float | None, ...]


@dataclass(frozen=True)
class GSLFRow:
    """An evaluation row with binary targets in GS-LF label order."""

    smiles: str
    measured: tuple[int, ...]


def _validated_csv_rows(reader: csv.DictReader[str], path: Path) -> Iterator[dict[str, str]]:
    for number, row in enumerate(reader, start=2):
        if None in row or any(value is None for value in row.values()):
            message = f"{path}: malformed CSV row {number}."
            raise ValueError(message)
        yield row


def _read_csv(path: Path, required: set[str]) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        missing = required - set(reader.fieldnames or ())
        if missing:
            message = f"{path}: missing columns {sorted(missing)}."
            raise ValueError(message)
        return list(_validated_csv_rows(reader, path))


def _is_list(value: object) -> TypeGuard[list[object]]:
    return isinstance(value, list)


def _is_string_list(value: object) -> TypeGuard[list[str]]:
    return _is_list(value) and all(isinstance(item, str) for item in value)


def _labels(text: str) -> tuple[str, ...]:
    try:
        value: object = ast.literal_eval(text)
    except (ValueError, SyntaxError) as error:
        message = "odor_labels_filtered must be a Python-literal list of strings."
        raise ValueError(message) from error
    if not _is_string_list(value):
        message = "odor_labels_filtered must be a Python-literal list of strings."
        raise ValueError(message)
    return tuple(value)


def _split_code(text: str) -> int:
    codes = {"1.0": 1, "0.0": 0, "-1.0": -1}
    if text not in codes:
        message = f"Invalid split code {text!r}; expected 1.0, 0.0 or -1.0."
        raise ValueError(message)
    return codes[text]


def cas_check_digit_passes(cas: str) -> bool:
    """Whether a CAS number has the registry's shape and a matching check digit."""
    if CAS_SHAPE.fullmatch(cas) is None:
        return False
    digits = cas.replace("-", "")
    body = digits[-2::-1]
    return sum(int(digit) * weight for weight, digit in enumerate(body, start=1)) % 10 == int(
        digits[-1]
    )


def _source_cas(text: str) -> tuple[str | None, str | None]:
    """Split the source's CAS field into the number and any trailing annotation marks."""
    value = text.strip()
    plain = value.rstrip("*?")
    if not any(character.isdigit() for character in plain):
        return None, value or None
    return plain, value[len(plain) :] or None


def read_leffingwell(path: Path) -> tuple[tuple[str, ...], tuple[CatalogueRow, ...]]:
    """Read binary descriptors and official splits without retaining odor_data."""
    raw = _read_csv(
        path,
        {
            "database_id",
            "chemical_name",
            "cas",
            "smiles",
            "odor_labels_filtered",
            "labels_train/test",
            "labels_cv0",
        },
    )
    measured = [_labels(row["odor_labels_filtered"]) for row in raw]
    labels = tuple(sorted({label for values in measured for label in values}))
    rows: list[CatalogueRow] = []
    seen: set[str] = set()
    for row, values in zip(raw, measured, strict=True):
        molecule_id = row["database_id"]
        cas, annotation = _source_cas(row["cas"])
        if molecule_id in seen:
            message = f"Duplicate Leffingwell database_id {molecule_id!r}."
            raise ValueError(message)
        seen.add(molecule_id)
        split = _split_code(row["labels_train/test"])
        cv0 = _split_code(row["labels_cv0"])
        if split == -1 or (split == 0) != (cv0 == -1):
            message = f"Inconsistent official splits for Leffingwell row {molecule_id!r}."
            raise ValueError(message)
        rows.append(
            CatalogueRow(
                molecule_id=molecule_id,
                name=row["chemical_name"],
                cas=cas,
                smiles=row["smiles"],
                measured=tuple(int(label in values) for label in labels),
                official_split="train" if split == 1 else "held_out",
                official_cv0=cv0,
                cas_annotation=annotation,
            )
        )
    return labels, tuple(rows)


def write_labels(labels: tuple[str, ...], path: Path) -> None:
    """Persist the descriptor order used by measured target vectors."""
    path.write_text(json.dumps(labels, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_gslf(path: Path) -> tuple[tuple[str, ...], tuple[GSLFRow, ...]]:
    """Read the GS-LF binary label columns for evaluation only."""
    raw = _read_csv(path, {"nonStereoSMILES", "descriptors"})
    if not raw:
        message = f"{path}: GS-LF contains no rows."
        raise ValueError(message)
    labels = tuple(sorted(raw[0].keys() - {"nonStereoSMILES", "descriptors"}))
    rows: list[GSLFRow] = []
    for row in raw:
        if any(row[label] not in {"0", "1"} for label in labels):
            message = f"{path}: GS-LF label columns must contain 0 or 1."
            raise ValueError(message)
        rows.append(GSLFRow(row["nonStereoSMILES"], tuple(int(row[label]) for label in labels)))
    return labels, tuple(rows)


def _keller_structures(path: Path) -> dict[str, dict[str, str]]:
    raw = _read_csv(path, {"CID", "CAS", "OdorName", "CanonicalSMILES"})
    structures: dict[str, dict[str, str]] = {}
    for row in raw:
        cid = row["CID"]
        if cid in structures and structures[cid]["CanonicalSMILES"] != row["CanonicalSMILES"]:
            message = f"Conflicting Keller structures for CID {cid}."
            raise ValueError(message)
        if row["CanonicalSMILES"] not in {"", "NA"}:
            structures.setdefault(cid, row)
    return structures


def _keller_stimuli(path: Path) -> dict[str, str]:
    raw = _read_csv(path, {"Stimulus", "CIDs", "Concentration"})
    selected: dict[str, tuple[float, str]] = {}
    for row in raw:
        concentration = float(row["Concentration"])
        if not math.isfinite(concentration) or concentration < 0:
            message = f"Invalid Keller concentration {row['Concentration']!r}."
            raise ValueError(message)
        cid = row["CIDs"]
        if cid not in selected or concentration > selected[cid][0]:
            selected[cid] = (concentration, row["Stimulus"])
    return {stimulus: cid for cid, (_, stimulus) in selected.items()}


def _keller_ratings(path: Path, stimuli: set[str]) -> dict[tuple[str, str], list[float]]:
    # Smell responses can follow descriptor rows, so eligibility needs its own pass.
    eligible: set[tuple[str, str]] = set()
    with path.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        required = {"Stimulus", "Subject", "MeasurementValue", "Value"}
        if not required <= set(reader.fieldnames or ()):
            message = f"{path}: missing Keller behavior columns."
            raise ValueError(message)
        for row in _validated_csv_rows(reader, path):
            if (
                row["Stimulus"] in stimuli
                and row["MeasurementValue"] == "CAN OR CAN'T SMELL"
                and row["Value"] == "I smell something"
            ):
                eligible.add((row["Stimulus"], row["Subject"]))
        source.seek(0)
        ratings: dict[tuple[str, str], list[float]] = {}
        for row in _validated_csv_rows(csv.DictReader(source), path):
            descriptor = row["MeasurementValue"]
            if (
                descriptor not in KELLER_DESCRIPTORS
                or row["Value"] == "NA"
                or (row["Stimulus"], row["Subject"]) not in eligible
            ):
                continue
            value = float(row["Value"])
            if not math.isfinite(value) or not 0 <= value <= KELLER_RATING_MAX:
                message = f"Invalid Keller rating {row['Value']!r} for {descriptor}."
                raise ValueError(message)
            ratings.setdefault((row["Stimulus"], descriptor), []).append(value)
    return ratings


def read_keller(molecules: Path, stimuli: Path, behavior: Path) -> tuple[KellerRow, ...]:
    """Reconcile structured CIDs and average smell-eligible high-concentration ratings.

    CanonicalSMILES in this source do not encode stereochemistry. The two CAS-valued
    stimuli without structures are excluded; duplicate CIDs retain their first name.
    """
    structures = _keller_structures(molecules)
    selected = _keller_stimuli(stimuli)
    selected = {stimulus: cid for stimulus, cid in selected.items() if cid in structures}
    ratings = _keller_ratings(behavior, set(selected))
    rows: list[KellerRow] = []
    for stimulus, cid in selected.items():
        measured: list[float | None] = []
        for descriptor in KELLER_DESCRIPTORS:
            values = ratings.get((stimulus, descriptor), [])
            measured.append(math.fsum(values) / len(values) / KELLER_RATING_MAX if values else None)
        row = structures[cid]
        rows.append(
            KellerRow(cid, row["OdorName"], row["CAS"], row["CanonicalSMILES"], tuple(measured))
        )
    return tuple(rows)
