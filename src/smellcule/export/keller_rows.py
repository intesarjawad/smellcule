import csv
from pathlib import Path

from smellcule.catalogue import KELLER_DESCRIPTORS, CatalogueRow, KellerRow

FIXTURE_CSV = "tests/fixtures/keller_fixture.csv"
LABELS = tuple(label.lower() for label in KELLER_DESCRIPTORS)
TOP_RATINGS = 3


def measured_rows(rows: tuple[KellerRow, ...]) -> tuple[CatalogueRow, ...]:
    """Rank observed means only; missing ratings never become measured zeroes."""
    result: list[CatalogueRow] = []
    for row in rows:
        observed = [(i, value) for i, value in enumerate(row.measured) if value is not None]
        if len(observed) < TOP_RATINGS:
            message = f"Keller CID {row.molecule_id} has fewer than three observed ratings."
            raise ValueError(message)
        top = {i for i, _ in sorted(observed, key=lambda pair: (-pair[1], pair[0]))[:TOP_RATINGS]}
        result.append(
            CatalogueRow(
                row.molecule_id,
                row.name,
                row.cas,
                row.smiles,
                tuple(int(i in top) for i in range(len(LABELS))),
                "train",
                1,
            )
        )
    return tuple(sorted(result, key=lambda row: int(row.molecule_id)))


def fixture_rows(root: Path) -> tuple[KellerRow, ...]:
    """Read the reconciled source means without source downloads or model artifacts."""
    with (root / FIXTURE_CSV).open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        expected = ["CID", "OdorName", "CAS", "CanonicalSMILES", *KELLER_DESCRIPTORS]
        if reader.fieldnames != expected:
            message = "Keller fixture columns differ from the descriptor vocabulary."
            raise ValueError(message)
        return tuple(
            KellerRow(
                row["CID"],
                row["OdorName"],
                row["CAS"],
                row["CanonicalSMILES"],
                tuple(float(row[label]) if row[label] else None for label in KELLER_DESCRIPTORS),
            )
            for row in reader
        )
