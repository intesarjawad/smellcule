import csv
import io
import json
import shutil
from datetime import date
from pathlib import Path

import numpy as np
import pytest

from smellcule import catalogue
from smellcule.export.bundle import bundle_files, write_bundle
from smellcule.export.bundle_inputs import load_fixture
from smellcule.export.bundle_schema import validate_document
from smellcule.export.content import mapping, sequence
from smellcule.export.keller import FIXTURE_OUTPUTS, MAP_ARTIFACT, write_fixture_outputs
from smellcule.export.keller_rows import FIXTURE_CSV, LABELS, measured_rows
from smellcule.families import load_families

ROOT = Path(__file__).resolve().parents[1]


def test_keller_export_fixture_is_offline_and_byte_stable(tmp_path: Path) -> None:
    for relative in (
        FIXTURE_CSV,
        "tests/fixtures/keller_fixture_model_outputs.json",
        "config/families-keller.yaml",
        "schemas/bundle.schema.json",
    ):
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
    inputs = load_fixture(tmp_path, "keller")
    files = bundle_files(tmp_path, inputs, date(2026, 11, 5), fixtures=True)
    assert len(inputs.rows) == 40
    assert inputs.labels == LABELS
    assert set(inputs.assignments) == {"cross_validated"}
    assert all(sum(row.measured) == 3 for row in inputs.rows)
    assert {row.name.casefold() for row in inputs.rows} >= {"vanillin", "eugenol", "guaiacol"}
    assert not {"smellcule.json", "notes.json", "phrases.json"} & files.keys()
    assert not any(name.startswith("splits/") for name in files)
    assert all(b"odor_data" not in value for value in files.values())
    assert b"Keller and Vosshall 2016" in files["LICENSE-DATA.txt"]
    assert b"smellcule-open" in files["LICENSE-DATA.txt"]
    families = load_families(tmp_path / "config/families-keller.yaml", LABELS, ungrouped="edible")
    assert {label for family in families for label in family.labels} == set(LABELS) - {"edible"}
    atlas = mapping(json.loads(files["atlas.json"]))
    records = [mapping(row) for row in sequence(atlas["molecules"])]
    assert [row["id"] for row in records] == [str(i) for i in range(40)]
    csv_rows = list(csv.DictReader(io.StringIO(files["atlas.csv"].decode())))
    for row, record in zip(csv_rows, records, strict=True):
        assert all(row[key] == record[key] for key in ("id", "name", "cas", "formula", "split"))
    write_bundle(files, ROOT / "site/public/keller-fixture-data", check=True)


def test_keller_export_measured_uses_observed_top_three_with_stable_ties() -> None:
    row = catalogue.KellerRow("2", "example", "", "C", (None, 0.0, 0.5, 0.5, 0.2) + (None,) * 15)
    (result,) = measured_rows((row,))
    assert [i for i, value in enumerate(result.measured) if value] == [2, 3, 4]
    tied = catalogue.KellerRow("1", "example", "", "C", (0.5,) * 20)
    (result,) = measured_rows((tied,))
    assert result.measured == (1, 1, 1) + (0,) * 17


@pytest.mark.parametrize("field", ["labels", "split"])
def test_keller_export_rejects_incorrect_recorded_provenance(tmp_path: Path, field: str) -> None:
    target = tmp_path / FIXTURE_CSV
    target.parent.mkdir(parents=True)
    shutil.copyfile(ROOT / FIXTURE_CSV, target)
    relative = "tests/fixtures/keller_fixture_model_outputs.json"
    document = mapping(json.loads((ROOT / relative).read_text()))
    if field == "labels":
        document["labels"] = list(reversed(sequence(document["labels"])))
    else:
        first = next(iter(mapping(document["molecules"]).values()))
        mapping(first)["split"] = "train"
    (tmp_path / relative).write_text(json.dumps(document))
    with pytest.raises(ValueError, match="labels or cross-validated assignments"):
        load_fixture(tmp_path, "keller")


@pytest.mark.parametrize("invalid_labels", [None, "atlas", "map", "fold"])
def test_keller_export_records_rounded_fold_evidence_by_cid(
    tmp_path: Path, invalid_labels: str | None
) -> None:
    inputs = load_fixture(ROOT, "keller")
    target = tmp_path / FIXTURE_CSV
    target.parent.mkdir(parents=True)
    shutil.copyfile(ROOT / FIXTURE_CSV, target)
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    atlas = mapping(json.loads((ROOT / "site/public/keller-fixture-data/atlas.json").read_text()))
    if invalid_labels == "atlas":
        atlas["labels"] = list(reversed(LABELS))
    (bundle / "atlas.json").write_text(json.dumps(atlas))
    (tmp_path / "artifacts").mkdir()
    cids = np.array([row.molecule_id for row in inputs.rows])
    embeddings = np.random.default_rng(0).normal(size=(40, 32))
    probabilities = np.nextafter(inputs.probabilities, 0)
    spread = np.nextafter(inputs.spread, 0)
    nearest = np.nextafter(np.array(inputs.nearest, dtype=np.float64), 0)
    np.savez_compressed(
        tmp_path / MAP_ARTIFACT,
        molecule_id=cids,
        labels=np.array(LABELS[::-1] if invalid_labels == "map" else LABELS),
        embeddings=embeddings,
        positions=inputs.positions,
    )
    np.savez_compressed(
        tmp_path / "artifacts/keller_oof.npz",
        cid=cids[::-1],
        labels=np.array(
            catalogue.KELLER_DESCRIPTORS[::-1]
            if invalid_labels == "fold"
            else catalogue.KELLER_DESCRIPTORS
        ),
        prob=probabilities[::-1],
        spread=spread[::-1],
        nearest_train_similarity=nearest[::-1],
    )
    if invalid_labels is not None:
        with pytest.raises(ValueError, match="labels"):
            write_fixture_outputs(tmp_path, bundle)
        return
    write_fixture_outputs(tmp_path, bundle)
    document = mapping(json.loads((tmp_path / FIXTURE_OUTPUTS).read_text()))
    assert document["labels"] == list(LABELS)
    records = mapping(document["molecules"])
    for i, row in enumerate(inputs.rows):
        record = mapping(records[row.molecule_id])
        assert record["split"] == "cross_validated"
        assert record["prob"] == probabilities[i].round(6).tolist()
        assert record["spread"] == spread[i].round(6).tolist()
        assert record["nearestTrainSimilarity"] == round(float(nearest[i]), 6)
        assert record["position"] == inputs.positions[i].astype(np.float64).round(6).tolist()
        neighbours = [mapping(n) for n in sequence(record["neighbours"])]
        assert len(neighbours) == 8
        assert row.molecule_id not in {n["id"] for n in neighbours}
        assert {n["id"] for n in neighbours} <= set(cids)
        for neighbour in neighbours:
            for key in ("odour", "structure"):
                value = neighbour[key]
                assert isinstance(value, float)
                assert value == round(value, 6)


@pytest.mark.data
def test_keller_export_cards_match_out_of_fold_evidence(tmp_path: Path) -> None:
    from smellcule.export.bundle_real import load_real

    inputs = load_real(ROOT, date(2026, 11, 5), "keller")
    files = bundle_files(ROOT, inputs, date(2026, 11, 5), fixtures=False)
    write_bundle(files, tmp_path / "bundle", check=False)
    atlas = mapping(json.loads(files["atlas.json"]))
    validate_document(atlas, ROOT / "schemas/bundle.schema.json")
    records = [mapping(row) for row in sequence(atlas["molecules"])]
    assert len(records) == 478
    assert len(sequence(atlas["labels"])) == 20
    assert {row["split"] for row in records} == {"cross_validated"}
    assert [int(row.molecule_id) for row in inputs.rows] == sorted(
        int(row.molecule_id) for row in inputs.rows
    )
    with np.load(ROOT / "artifacts/keller_oof.npz", allow_pickle=False) as saved:
        cids = saved["cid"].tolist()
        indices = [cids.index(row.molecule_id) for row in inputs.rows]
        np.testing.assert_array_equal(inputs.probabilities, saved["prob"][indices])
        np.testing.assert_array_equal(inputs.spread, saved["spread"][indices])
        np.testing.assert_array_equal(inputs.nearest, saved["nearest_train_similarity"][indices])
        assert (
            files["predictions.bin"]
            == np.rint(saved["prob"][indices] * 255).astype(np.uint8).tobytes()
        )
        assert (
            files["spread.bin"]
            == np.rint(np.minimum(saved["spread"][indices], 0.5) * 510).astype(np.uint8).tobytes()
        )
        fixture = load_fixture(ROOT, "keller")
        fixture_indices = [cids.index(row.molecule_id) for row in fixture.rows]
        np.testing.assert_array_equal(
            fixture.probabilities, saved["prob"][fixture_indices].round(6)
        )
        np.testing.assert_array_equal(fixture.spread, saved["spread"][fixture_indices].round(6))
        np.testing.assert_array_equal(
            fixture.nearest, saved["nearest_train_similarity"][fixture_indices].round(6)
        )
    assert all(b"odor_data" not in value for value in files.values())
