import csv
import json
from collections import Counter
from pathlib import Path

import pytest

from smellcule import catalogue, sources
from smellcule.molecules import standardise

FIXTURE = Path(__file__).parent / "fixtures" / "leffingwell_fixture.csv"
DEMO_NAMES = {
    "Geosmin",
    "Vanillin",
    "Limonene",
    "Cedrol",
    "Muscone",
    "Eugenol",
    "Furfuryl mercaptan",
    "Calone®",
}


def write_csv(path: Path, fields: list[str], rows: list[list[str]]) -> Path:
    with path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.writer(destination)
        writer.writerow(fields)
        writer.writerows(rows)
    return path


@pytest.mark.leffingwell_fixture
def test_catalogue_fixture_labels_splits_and_identity(tmp_path: Path) -> None:
    labels, rows = catalogue.read_leffingwell(FIXTURE)
    assert len(rows) == 70
    assert labels == tuple(sorted(set(labels)))
    assert {row.name for row in rows} >= DEMO_NAMES
    assert rows[0].molecule_id == "0"
    assert rows[10].molecule_id == "11"
    assert rows[0].official_split == "held_out"
    assert rows[0].official_cv0 == -1
    assert rows[1].official_split == "train"
    assert rows[1].official_cv0 == 1
    assert {label for label, value in zip(labels, rows[0].measured, strict=True) if value} == {
        "alcoholic",
        "camphoreous",
        "potato",
        "savory",
        "sweet",
        "winey",
    }
    output = tmp_path / "labels.json"
    catalogue.write_labels(labels, output)
    assert json.loads(output.read_text()) == list(labels)
    assert "odor_data" not in FIXTURE.read_text(encoding="utf-8")
    vanillin = standardise(next(row for row in rows if row.name == "Vanillin"))
    assert vanillin.formula == "C8H8O3"
    assert vanillin.inchikey == "MWOOGOJBHIARFG-UHFFFAOYSA-N"
    assert vanillin.connectivity_key == vanillin.inchikey[:14]


@pytest.mark.parametrize(
    ("source", "expected"), [("", None), ("   ", None), (" 564-20-5", "564-20-5")]
)
def test_catalogue_reads_a_blank_cas_as_missing(
    tmp_path: Path, source: str, expected: str | None
) -> None:
    path = tmp_path / "blank-cas.csv"
    path.write_text(FIXTURE.read_text(encoding="utf-8").replace(",105-57-7,", f",{source},", 1))
    _, rows = catalogue.read_leffingwell(path)
    assert rows[0].cas == expected


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("19700-21-1*", "19700-21-1"),
        ("1755-54-0??", "1755-54-0"),
        ("Note*", None),
        ("102-22-70", "102-22-70"),
    ],
)
def test_catalogue_removes_source_annotation_marks_from_cas(
    tmp_path: Path, source: str, expected: str | None
) -> None:
    path = tmp_path / "annotated-cas.csv"
    path.write_text(FIXTURE.read_text(encoding="utf-8").replace(",105-57-7,", f",{source},", 1))
    _, rows = catalogue.read_leffingwell(path)
    assert rows[0].cas == expected
    assert rows[0].cas_annotation == {
        "19700-21-1*": "*",
        "1755-54-0??": "??",
        "Note*": "Note*",
    }.get(source)


@pytest.mark.parametrize(
    ("cas", "passes"),
    [
        ("105-57-7", True),
        ("19700-21-1", True),
        ("7732-18-5", True),
        ("7732-18-4", False),
        ("102-22-70", False),
        ("1-22-3", False),
    ],
)
def test_catalogue_cas_check_digit(cas: str, *, passes: bool) -> None:
    assert catalogue.cas_check_digit_passes(cas) is passes


@pytest.mark.parametrize("value", ["('green',)", "[1]", "{'green': 1}", "__import__('os')"])
def test_catalogue_rejects_non_string_label_lists(tmp_path: Path, value: str) -> None:
    text = FIXTURE.read_text(encoding="utf-8")
    path = tmp_path / "invalid.csv"
    with FIXTURE.open(newline="") as source:
        original = next(csv.DictReader(source))["odor_labels_filtered"]
    path.write_text(text.replace(original, value, 1))
    with pytest.raises(ValueError, match="Python-literal list of strings"):
        catalogue.read_leffingwell(path)


@pytest.mark.parametrize(
    ("original", "replacement", "message"),
    [
        ("0.0,-1.0", "0.5,-1.0", "Invalid split code"),
        ("0.0,-1.0", "0.0,1.0", "Inconsistent official splits"),
        ("0.0,-1.0", "-1.0,-1.0", "Inconsistent official splits"),
    ],
)
def test_catalogue_rejects_invalid_splits(
    tmp_path: Path,
    original: str,
    replacement: str,
    message: str,
) -> None:
    path = tmp_path / "invalid.csv"
    path.write_text(FIXTURE.read_text().replace(original, replacement, 1))
    with pytest.raises(ValueError, match=message):
        catalogue.read_leffingwell(path)


def test_catalogue_gslf_labels_align_with_binary_columns(tmp_path: Path) -> None:
    path = write_csv(
        tmp_path / "gslf.csv",
        ["nonStereoSMILES", "descriptors", "woody", "green"],
        [["CO", "green", "0", "1"]],
    )
    labels, rows = catalogue.read_gslf(path)
    assert labels == ("green", "woody")
    assert rows == (catalogue.GSLFRow("CO", (1, 0)),)
    path.write_text(path.read_text().replace(",0,1", ",0,2"))
    with pytest.raises(ValueError, match="0 or 1"):
        catalogue.read_gslf(path)


def test_catalogue_keller_filters_and_reconciles(tmp_path: Path) -> None:
    molecules = write_csv(
        tmp_path / "molecules.csv",
        ["CID", "CAS", "OdorName", "CanonicalSMILES"],
        [
            ["1", "11-11-1", "first", "CO"],
            ["1", "11-11-1", "duplicate", "CO"],
            ["8038", "109-19-0", "missing", "NA"],
        ],
    )
    stimuli = write_csv(
        tmp_path / "stimuli.csv",
        ["Stimulus", "CIDs", "Concentration"],
        [["low", "1", "1e-5"], ["high", "1", "0.001"], ["drop", "109-19-0", "0.001"]],
    )
    ratings = [
        [stimulus, subject, descriptor, value]
        for stimulus, subject, value in [
            ("low", "a", "100"),
            ("high", "a", "20"),
            ("high", "b", "60"),
            ("high", "c", "100"),
            ("high", "d", "NA"),
        ]
        for descriptor in catalogue.KELLER_DESCRIPTORS
    ]
    # Place eligibility after ratings to exercise order independence.
    ratings.extend(
        [
            ["high", subject, "CAN OR CAN'T SMELL", "I smell something"]
            for subject in ("a", "b", "d")
        ]
    )
    ratings.extend(
        [
            ["low", "a", "CAN OR CAN'T SMELL", "I smell something"],
            ["high", "c", "CAN OR CAN'T SMELL", "I can't smell anything"],
        ]
    )
    behavior = write_csv(
        tmp_path / "behavior.csv", ["Stimulus", "Subject", "MeasurementValue", "Value"], ratings
    )
    rows = catalogue.read_keller(molecules, stimuli, behavior)
    assert len(rows) == 1
    assert rows[0].molecule_id == "1"
    assert rows[0].name == "first"
    assert rows[0].smiles == "CO"
    assert rows[0].measured == (0.4,) * 20


def test_catalogue_keller_absent_measurement_serializes_as_null(tmp_path: Path) -> None:
    molecules = write_csv(
        tmp_path / "molecules.csv",
        ["CID", "CAS", "OdorName", "CanonicalSMILES"],
        [["61005", "", "fixture", "CO"]],
    )
    stimuli = write_csv(
        tmp_path / "stimuli.csv",
        ["Stimulus", "CIDs", "Concentration"],
        [["51", "61005", "0.001"]],
    )
    behavior = write_csv(
        tmp_path / "behavior.csv",
        ["Stimulus", "Subject", "MeasurementValue", "Value"],
        [
            ["51", "a", "CAN OR CAN'T SMELL", "I smell something"],
            ["51", "a", "BAKERY", "NA"],
            ["51", "a", "EDIBLE", "0"],
            ["51", "b", "CAN OR CAN'T SMELL", "I can't smell anything"],
            ["51", "b", "BAKERY", "100"],
        ],
    )
    (row,) = catalogue.read_keller(molecules, stimuli, behavior)
    bakery = catalogue.KELLER_DESCRIPTORS.index("BAKERY")
    edible = catalogue.KELLER_DESCRIPTORS.index("EDIBLE")
    assert row.measured[bakery] is None
    assert row.measured[edible] == 0.0
    serialized = json.dumps(row.measured, allow_nan=False)
    assert json.loads(serialized)[bakery] is None
    assert "null" in serialized


def test_catalogue_standardise_preserves_stereo_and_salts() -> None:
    def row(smiles: str) -> catalogue.CatalogueRow:
        return catalogue.CatalogueRow("0", "fixture", "", smiles, (1,), "train", 1)

    left = standardise(row("N[C@H](C)C(=O)O"))
    right = standardise(row("N[C@@H](C)C(=O)O"))
    assert left.inchikey != right.inchikey
    assert left.connectivity_key == right.connectivity_key
    salt = standardise(row("[Na+].CC(=O)[O-]"))
    assert salt.smiles == "[Na+].CC(=O)[O-]"
    assert salt.formula == "C2H3NaO2"
    with pytest.raises(ValueError, match="Invalid SMILES for molecule '0'"):
        standardise(row("invalid"))


@pytest.mark.parametrize(
    "malformed",
    [
        ["high", "a", "CAN OR CAN'T SMELL", "I smell something", "extra"],
        ["high", "a", "BAKERY", "20", "extra"],
        ["excluded", "a", "BAKERY", "20", "extra"],
        ["high", "a", "BAKERY"],
    ],
)
def test_catalogue_keller_rejects_malformed_behavior_rows(
    tmp_path: Path, malformed: list[str]
) -> None:
    molecules = write_csv(
        tmp_path / "molecules.csv",
        ["CID", "CAS", "OdorName", "CanonicalSMILES"],
        [["1", "", "fixture", "CO"]],
    )
    stimuli = write_csv(
        tmp_path / "stimuli.csv",
        ["Stimulus", "CIDs", "Concentration"],
        [["high", "1", "0.001"]],
    )
    behavior = write_csv(
        tmp_path / "behavior.csv",
        ["Stimulus", "Subject", "MeasurementValue", "Value"],
        [["high", "a", "CAN OR CAN'T SMELL", "I smell something"], malformed],
    )
    with pytest.raises(ValueError, match="malformed CSV row 3") as error:
        catalogue.read_keller(molecules, stimuli, behavior)
    assert str(error.value) == f"{behavior}: malformed CSV row 3."


@pytest.mark.data
def test_catalogue_full_sources(tmp_path: Path) -> None:
    cache = Path(__file__).resolve().parents[1] / ".cache" / "smellcule"
    paths = {key: sources.fetch(key, cache_dir=cache) for key in sources.load_sources()}
    labels, rows = catalogue.read_leffingwell(paths["leffingwell"])
    assert len(rows) == 3523
    assert len(labels) == 113
    assert Counter(row.official_split for row in rows) == {"train": 2801, "held_out": 722}
    assert Counter(row.official_cv0 for row in rows) == {1: 2246, 0: 555, -1: 722}
    assert len({row.molecule_id for row in rows}) == 3523
    assert all(standardise(row).inchikey for row in rows)
    catalogue.write_labels(labels, tmp_path / "labels.json")
    with paths["leffingwell"].open(encoding="utf-8", newline="") as source:
        full = list(csv.DictReader(source))
    # Fixture descriptors and splits are synthetic; only public identities are retained.
    with FIXTURE.open(encoding="utf-8", newline="") as source:
        fixture_rows = list(csv.DictReader(source))
    by_id = {row["database_id"]: row for row in full}
    for row in fixture_rows:
        assert {key: row[key] for key in ("database_id", "chemical_name", "cas", "smiles")} == {
            key: by_id[row["database_id"]][key]
            for key in ("database_id", "chemical_name", "cas", "smiles")
        }
    gslf_labels, gslf_rows = catalogue.read_gslf(paths["gslf"])
    assert len(gslf_rows) == 4983
    assert len(gslf_labels) == 138
    keller = catalogue.read_keller(
        paths["keller_molecules"], paths["keller_stimuli"], paths["keller_behavior"]
    )
    assert len(keller) == 478
    assert len({row.molecule_id for row in keller}) == 478
    assert len(catalogue.KELLER_DESCRIPTORS) == 20
    assert {"8038", "1549778"}.isdisjoint(row.molecule_id for row in keller)
    assert sum(row.molecule_id == "5315892" for row in keller) == 1
    absent = sum(value is None for row in keller for value in row.measured)
    assert absent == 120
    assert sum(any(value is None for value in row.measured) for row in keller) == 76
    stimulus_51 = next(row for row in keller if row.molecule_id == "61005")
    assert stimulus_51.measured[catalogue.KELLER_DESCRIPTORS.index("BAKERY")] is None
    counts_path = Path(__file__).resolve().parents[1] / "eval" / "data_counts.json"
    counts_path.parent.mkdir(exist_ok=True)
    counts: dict[str, object] = (
        json.loads(counts_path.read_text(encoding="utf-8")) if counts_path.exists() else {}
    )
    counts.update(
        keller_molecules=len(keller), keller_descriptors=len(catalogue.KELLER_DESCRIPTORS)
    )
    counts_path.write_text(json.dumps(counts, indent=2) + "\n", encoding="utf-8")
