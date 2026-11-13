import csv
import io
import json
import logging
import shutil
from dataclasses import asdict
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np

from smellcule import splits
from smellcule.catalogue import cas_check_digit_passes
from smellcule.export.bundle_content import compile_content
from smellcule.export.bundle_inputs import FIXTURE_EXPORTED_ON, BundleInputs
from smellcule.export.bundle_schema import validate_document
from smellcule.export.content import mapping, sequence
from smellcule.export.neighbours import NEIGHBOUR_COUNT
from smellcule.export.structures import minify_structure, render_structure
from smellcule.families import load_families
from smellcule.resources import resource_path

LOGGER = logging.getLogger(__name__)

DATA_LICENCE = (
    "Leffingwell-derived names, CAS numbers, structures, measured labels and splits: "
    "CC-BY-NC, version not stated by the source. John Leffingwell, "
    "Sanchez-Lengeling et al. and Pyrfume. Source: https://zenodo.org/records/4085098\n\n"
    "Scent additions (predictions, spread, positions, neighbours and puzzles): "
    "CC-BY-NC-4.0. https://creativecommons.org/licenses/by-nc/4.0/\n"
)


SYNTHETIC_LICENCE = (
    "Synthetic test data, seed 20261113: CC BY 4.0. Not measured odours or model predictions.\n"
    "Molecule identity/structure provenance: tests/fixtures/README.md.\n"
)


KELLER_LICENCE = (
    "Keller and Vosshall 2016, via Pyrfume: CC BY 4.0.\n"
    "https://doi.org/10.1186/s12868-016-0287-2\n"
    "smellcule-open predictions, spread, positions and neighbours: CC-BY-4.0.\n"
    "https://creativecommons.org/licenses/by/4.0/\n"
)


def encode_json(value: object) -> bytes:
    """Encode stable JSON without machine-dependent timestamps or nonfinite values."""
    return (
        json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    ).encode("utf-8")


def _csv(fields: tuple[str, ...], rows: list[tuple[object, ...]]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(fields)
    writer.writerows(rows)
    return output.getvalue().encode("utf-8")


def _validate_inputs(inputs: BundleInputs) -> None:
    count, labels = len(inputs.molecules), len(inputs.labels)
    if (
        count != len(inputs.rows)
        or count != len(inputs.assignments)
        or count != len(inputs.nearest)
        or count != len(inputs.neighbours)
        or inputs.probabilities.shape != (count, labels)
        or inputs.spread.shape != (count, labels)
        or inputs.positions.shape != (count, 3)
    ):
        message = "Bundle arrays and records must align by molecule and descriptor."
        raise ValueError(message)
    for array in (inputs.probabilities, inputs.spread, inputs.positions):
        if not np.isfinite(array).all():
            message = "Bundle arrays must be finite."
            raise ValueError(message)
    if np.any((inputs.probabilities < 0) | (inputs.probabilities > 1)) or np.any(inputs.spread < 0):
        message = "Bundle probabilities must be in [0, 1] and spread must be nonnegative."
        raise ValueError(message)
    ids = {row.molecule_id for row in inputs.molecules}
    if len(ids) != count:
        message = "Bundle molecule ids must be unique."
        raise ValueError(message)
    for row, assignment, nearest, neighbours in zip(
        inputs.molecules, inputs.assignments, inputs.nearest, inputs.neighbours, strict=True
    ):
        if (assignment == "train") != (nearest is None):
            message = "Nearest-train similarity must be null exactly for training molecules."
            raise ValueError(message)
        if (
            len(row.measured) != labels
            or len({n.id for n in neighbours}) != NEIGHBOUR_COUNT
            or any(n.id not in ids or n.id == row.molecule_id for n in neighbours)
        ):
            message = "Measured labels or neighbour ids differ from the bundle catalogue."
            raise ValueError(message)


def _cas_check_digit(cas: str | None) -> str:
    if cas is None:
        return "unlisted"
    return "passes" if cas_check_digit_passes(cas) else "fails"


def bundle_files(
    root: Path, inputs: BundleInputs, exported_on: date, *, fixtures: bool
) -> dict[str, bytes]:
    """Build and validate every bundle component before replacing any destination files."""
    _validate_inputs(inputs)
    labels = inputs.labels
    keller = inputs.catalogue_name == "keller"
    families = load_families(
        resource_path(root, "config/families-keller.yaml" if keller else "config/families.yaml"),
        labels,
        ungrouped="edible" if keller else "odorless",
    )
    ids = {
        row.molecule_id: str(i) if keller else row.molecule_id
        for i, row in enumerate(inputs.molecules)
    }
    records: list[dict[str, object]] = []
    csv_rows: list[tuple[object, ...]] = []
    for index, row in enumerate(inputs.molecules):
        measured = [i for i, value in enumerate(row.measured) if value]
        record: dict[str, object] = {
            "id": ids[row.molecule_id],
            "name": row.name,
            "cas": row.cas,
            "casCheckDigit": _cas_check_digit(row.cas),
            "formula": row.formula,
            "split": inputs.assignments[index],
            "nearestTrainSimilarity": inputs.nearest[index],
            "measured": measured,
            "neighbours": [{**asdict(n), "id": ids[n.id]} for n in inputs.neighbours[index]],
        }
        records.append(record)
        top = sorted(range(len(labels)), key=lambda i: (-inputs.probabilities[index, i], i))[:10]
        csv_rows.append(
            (
                ids[row.molecule_id],
                row.name,
                row.cas,
                row.formula,
                inputs.assignments[index],
                ";".join(labels[i] for i in measured),
                ";".join(f"{labels[i]}:{inputs.probabilities[index, i]:.2f}" for i in top),
            )
        )
    annotated = [row for row in inputs.molecules if row.cas_annotation is not None]
    if annotated:
        LOGGER.warning(
            "Removed source annotation marks from %d CAS fields; %d held only a note and are"
            " exported as not listed.",
            len(annotated),
            sum(row.cas is None for row in annotated),
        )
    failing = sum(record["casCheckDigit"] == "fails" for record in records)
    if failing:
        LOGGER.warning(
            "%d CAS number%s the check digit; exported as listed in the source and flagged.",
            failing,
            " fails" if failing == 1 else "s fail",
        )
    atlas: dict[str, object] = {
        "version": "0.1.0",
        "exportedOn": FIXTURE_EXPORTED_ON if fixtures else exported_on.isoformat(),
        "catalogue": inputs.catalogue_name,
        "model": dict(inputs.model),
        "attribution": "Synthetic fixture; molecule identities via Pyrfume"
        if fixtures and not keller
        else "Keller and Vosshall 2016; Pyrfume"
        if keller
        else "John Leffingwell; Sanchez-Lengeling et al.; Pyrfume (Zenodo 4085098)",
        "dataLicence": "CC BY 4.0" if fixtures or keller else "CC-BY-NC",
        "stats": inputs.stats,
        "labels": labels,
        "families": [asdict(f) for f in families],
        "molecules": records,
    }
    documents: dict[str, object] = {"atlas": atlas}
    if not keller:
        notes, phrases, words = compile_content(root, labels, inputs.rows, fixtures=fixtures)
        documents.update(
            {
                "smellcule": inputs.smellcule,
                "notes": asdict(notes),
                "phrases": [asdict(p) for p in phrases],
                "words": asdict(words),
            }
        )
        _validate_puzzles(inputs)
    # Serialisation converts tuple-backed domain records to JSON arrays before validation.
    for definition, document in documents.items():
        validate_document(
            json.loads(encode_json(document)),
            resource_path(root, "schemas/bundle.schema.json"),
            definition,
        )
    files = {f"{name}.json": encode_json(document) for name, document in documents.items()}
    files.update(
        {
            "atlas.csv": _csv(
                ("id", "name", "cas", "formula", "split", "measured", "predicted_top10"), csv_rows
            ),
            "predictions.bin": np.rint(inputs.probabilities * 255).astype(np.uint8).tobytes(),
            "spread.bin": np.rint(np.minimum(inputs.spread, 0.5) * 510).astype(np.uint8).tobytes(),
            "positions.bin": inputs.positions.astype("<f4").tobytes(),
            "LICENSE-DATA.txt": (
                SYNTHETIC_LICENCE
                if fixtures and not keller
                else KELLER_LICENCE
                if keller
                else DATA_LICENCE
            ).encode("utf-8"),
        }
    )
    if not keller:
        for name, assignments in (
            ("official", splits.official_split(inputs.molecules)),
            ("cluster-v1", inputs.assignments),
        ):
            files[f"splits/{name}.csv"] = _csv(
                ("inchikey", "split"),
                [
                    (row.inchikey, assignment)
                    for row, assignment in zip(inputs.molecules, assignments, strict=True)
                ],
            )
    for row in inputs.molecules:
        files[f"structures/{ids[row.molecule_id]}.svg"] = minify_structure(
            render_structure(row), title=f"{row.name} structure"
        ).encode("utf-8")
    return files


def _validate_puzzles(inputs: BundleInputs) -> None:
    by_id = {row.molecule_id: row for row in inputs.molecules}
    for raw in sequence(inputs.smellcule["puzzles"]):
        puzzle = mapping(raw)
        answer = sequence(puzzle["answer"])
        row = by_id[str(puzzle["moleculeId"])]
        if answer != [i for i, value in enumerate(row.measured) if value] or not set(answer) & set(
            sequence(puzzle["options"])
        ):
            message = "Puzzle answers must match measured catalogue descriptors."
            raise ValueError(message)
        clue = puzzle["clueId"]
        if (
            not isinstance(clue, int)
            or not 0 <= clue < len(inputs.molecules)
            or inputs.assignments[clue] != "train"
        ):
            message = "Puzzle clues must identify a cluster training molecule."
            raise ValueError(message)
        if any(
            not isinstance(i, int) or not 0 <= i < len(inputs.labels)
            for i in sequence(puzzle["options"])
        ):
            message = "Puzzle options must identify bundle descriptors."
            raise ValueError(message)


def write_bundle(files: dict[str, bytes], destination: Path, *, check: bool) -> None:
    """Stage a complete bundle and compare every path and byte in check mode."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=destination.parent) as directory:
        staging = Path(directory) / "bundle"
        for name, content in files.items():
            target = staging / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        if check:
            actual = {
                str(path.relative_to(destination)): path.read_bytes()
                for path in destination.rglob("*")
                if path.is_file()
            }
            if actual != files:
                changed = sorted(
                    name
                    for name in files.keys() | actual.keys()
                    if files.get(name) != actual.get(name)
                )
                message = f"Bundle differs: {', '.join(changed)}. Rebuild without --check."
                raise ValueError(message)
        else:
            if destination.exists():
                shutil.rmtree(destination)
            staging.replace(destination)
