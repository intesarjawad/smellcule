import csv
import io
import json
import shutil
from dataclasses import replace
from datetime import date
from pathlib import Path
from xml.parsers.expat import ParserCreate

import numpy as np
import pytest

from smellcule.cli import read_results
from smellcule.export.bundle import bundle_files, write_bundle
from smellcule.export.bundle_inputs import (
    FIXTURE_CSV,
    FIXTURE_OUTPUTS,
    BundleInputs,
    load_fixture,
)
from smellcule.export.bundle_schema import validate_document
from smellcule.export.bundle_stats import collect_stats
from smellcule.export.content import mapping, sequence
from smellcule.export.structures import minify_structure, render_structure
from smellcule.families import load_families

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "schemas/bundle.schema.json"
pytestmark = pytest.mark.leffingwell_fixture


@pytest.fixture
def inputs() -> BundleInputs:
    return load_fixture(ROOT)


@pytest.fixture
def files(inputs: BundleInputs) -> dict[str, bytes]:
    return bundle_files(ROOT, inputs, date(2026, 11, 5), fixtures=True)


def test_bundle_atlas_csv_agrees_with_json_and_model_arrays(
    inputs: BundleInputs, files: dict[str, bytes]
) -> None:
    atlas = mapping(json.loads(files["atlas.json"]))
    records = [mapping(r) for r in sequence(atlas["molecules"])]
    csv_rows = list(csv.DictReader(io.StringIO(files["atlas.csv"].decode())))
    assert len(csv_rows) == len(records) == len(inputs.molecules)
    for i, (row, record) in enumerate(zip(csv_rows, records, strict=True)):
        for key in ("id", "name", "formula", "split"):
            assert row[key] == record[key]
        assert row["cas"] == (record["cas"] or "")
        assert row["measured"] == ";".join(
            inputs.labels[j] for j in range(len(inputs.labels)) if inputs.molecules[i].measured[j]
        )
        top = sorted(range(len(inputs.labels)), key=lambda j: (-inputs.probabilities[i, j], j))[:10]
        assert row["predicted_top10"] == ";".join(
            f"{inputs.labels[j]}:{inputs.probabilities[i, j]:.2f}" for j in top
        )
    assert (
        files["predictions.bin"] == np.rint(inputs.probabilities * 255).astype(np.uint8).tobytes()
    )
    assert (
        files["spread.bin"]
        == np.rint(np.minimum(inputs.spread, 0.5) * 510).astype(np.uint8).tobytes()
    )
    assert np.array_equal(
        np.frombuffer(files["positions.bin"], dtype="<f4").reshape(-1, 3), inputs.positions
    )
    for filename in ("official", "cluster-v1"):
        rows = list(csv.DictReader(io.StringIO(files[f"splits/{filename}.csv"].decode())))
        assert [r["inchikey"] for r in rows] == [m.inchikey for m in inputs.molecules]
    assert all(b"odor_data" not in value for value in files.values())


def test_bundle_fixture_coverage_for_named_site_flows(
    inputs: BundleInputs, files: dict[str, bytes]
) -> None:
    assert len(inputs.molecules) == 11
    assert [row.name for row in inputs.rows if row.cas is None] == [
        "Benzaldehyde ethyl methyl acetal"
    ]
    assert {"Geosmin", "Limonene", "Vanillin", "Guaiacol", "Furfuryl mercaptan"} <= {
        row.name for row in inputs.rows
    }
    assert set(inputs.assignments) == {"train", "validation", "held_out"}
    measured = {
        label
        for row in inputs.rows
        for label, value in zip(inputs.labels, row.measured, strict=True)
        if value
    }
    assert all(
        set(f.labels) & measured
        for f in load_families(ROOT / "config/families.yaml", inputs.labels)
    )
    assert len(inputs.labels) == 113
    notes = mapping(json.loads(files["notes.json"]))
    assert {mapping(a)["name"] for a in sequence(notes["archetypes"])} >= {"chypre-style"}
    phrases = [mapping(p) for p in sequence(json.loads(files["phrases.json"]))]
    assert {p["name"] for p in phrases if p["exemplar"] is not None} >= {
        "rain",
        "coffee shop",
        "campfire",
    }
    puzzles = sequence(inputs.smellcule["puzzles"])
    assert puzzles
    for raw in puzzles:
        puzzle = mapping(raw)
        index = next(i for i, r in enumerate(inputs.rows) if r.molecule_id == puzzle["moleculeId"])
        assert inputs.assignments[index] == "held_out"
        assert sum(inputs.rows[index].measured) >= 3
    geosmin = next(i for i, row in enumerate(inputs.rows) if row.name == "Geosmin")
    assert any(n.structure < 0.3 for n in inputs.neighbours[geosmin])


@pytest.mark.parametrize("kind", ["remove", "change", "extra"])
def test_bundle_check_rejects_any_path_or_byte_difference(
    tmp_path: Path, files: dict[str, bytes], kind: str
) -> None:
    target = tmp_path / "bundle"
    write_bundle(files, target, check=False)
    write_bundle(files, target, check=True)
    if kind == "remove":
        (target / "positions.bin").unlink()
    elif kind == "change":
        (target / "positions.bin").write_bytes(b"different")
    else:
        (target / "unexpected").write_bytes(b"extra")
    with pytest.raises(ValueError, match="Bundle differs"):
        write_bundle(files, target, check=True)


def test_bundle_fixture_needs_no_results_weights_or_downloads(tmp_path: Path) -> None:
    for relative in (
        FIXTURE_CSV,
        FIXTURE_OUTPUTS,
        "schemas/bundle.schema.json",
        "config/families.yaml",
        "tests/fixtures/synthetic-notes.yaml",
        "tests/fixtures/synthetic-phrases.yaml",
        "config/words.yaml",
    ):
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
    files = bundle_files(tmp_path, load_fixture(tmp_path), date(2026, 11, 5), fixtures=True)
    write_bundle(files, ROOT / "site/public/fixture-data", check=True)


def test_bundle_stats_carry_the_map_trustworthiness() -> None:
    results = read_results(ROOT / "eval/results.json")
    stats = collect_stats(results, read_results(ROOT / "eval/data_counts.json"))
    measured = mapping(results["map"])
    assert stats["map.trustworthiness"] == measured["trustworthiness"]
    assert stats["map.neighbour_count"] == measured["neighbour_count"]


def test_bundle_missing_results_statistic_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from smellcule.export.bundle_real import load_real

    def source_path(key: str) -> Path:
        assert key == "leffingwell"
        return ROOT / FIXTURE_CSV

    results = read_results(ROOT / "eval/results.json")
    del mapping(mapping(mapping(results["cluster"])["mpnn"])["stable_labels"])["auroc"]
    with pytest.raises(KeyError, match="auroc"):
        collect_stats(results, read_results(ROOT / "eval/data_counts.json"))
    (tmp_path / "eval").mkdir()
    (tmp_path / "eval/results.json").write_text(json.dumps(results), encoding="utf-8")
    shutil.copyfile(ROOT / "eval/data_counts.json", tmp_path / "eval/data_counts.json")
    monkeypatch.setattr("smellcule.sources.fetch", source_path)
    with pytest.raises(KeyError, match="auroc"):
        load_real(tmp_path, date(2026, 11, 5))
    assert not (tmp_path / "dist").exists()


@pytest.mark.parametrize("problem", ["nan", "alignment", "probability", "neighbours"])
def test_bundle_rejects_misaligned_or_invalid_arrays(inputs: BundleInputs, problem: str) -> None:
    prob = inputs.probabilities.copy()
    if problem == "nan":
        prob[0, 0] = np.nan
    elif problem == "probability":
        prob[0, 0] = 1.01
    elif problem == "alignment":
        prob = prob[:-1]
    else:
        inputs = replace(inputs, neighbours=(inputs.neighbours[0][:7], *inputs.neighbours[1:]))
    with pytest.raises(ValueError, match=r"finite|align|probabilities|neighbour"):
        bundle_files(ROOT, replace(inputs, probabilities=prob), date(2026, 11, 5), fixtures=True)


def svg_elements(svg: str) -> list[tuple[str, dict[str, str]]]:
    elements: list[tuple[str, dict[str, str]]] = []
    parser = ParserCreate()
    parser.StartElementHandler = lambda tag, attrs: elements.append((tag, attrs))
    is_final = True
    parser.Parse(svg, is_final)
    return elements


def test_bundle_minified_structures_preserve_geometry_and_parse(inputs: BundleInputs) -> None:
    for row in inputs.molecules:
        raw = render_structure(row)
        compact = minify_structure(raw)
        assert len(compact) < len(raw)
        elements = svg_elements(compact)
        assert not any(tag == "rect" and "fill" in attrs for tag, attrs in elements)
        assert "metadata" not in compact
        assert "<defs" not in compact
        paths = [attrs["d"] for tag, attrs in elements if tag == "path"]
        original = [attrs["d"] for tag, attrs in svg_elements(raw) if tag == "path"]
        assert [" ".join(d.split()) for d in original] == paths


def test_bundle_schema_rejects_wrong_catalogue_and_cross_validated(files: dict[str, bytes]) -> None:
    atlas = mapping(json.loads(files["atlas.json"]))
    atlas["labels"] = sequence(atlas["labels"])[:20]
    with pytest.raises(ValueError, match="minItems"):
        validate_document(atlas, SCHEMA)
    atlas = mapping(json.loads(files["atlas.json"]))
    mapping(sequence(atlas["molecules"])[0])["split"] = "cross_validated"
    with pytest.raises(ValueError, match="enum"):
        validate_document(atlas, SCHEMA)


def test_bundle_writes_a_missing_cas_as_null_and_rejects_an_empty_one(
    files: dict[str, bytes],
) -> None:
    atlas = mapping(json.loads(files["atlas.json"]))
    records = [mapping(r) for r in sequence(atlas["molecules"])]
    missing = next(r for r in records if r["name"] == "Benzaldehyde ethyl methyl acetal")
    assert missing["cas"] is None
    csv_row = next(
        row
        for row in csv.DictReader(io.StringIO(files["atlas.csv"].decode()))
        if row["id"] == missing["id"]
    )
    assert csv_row["cas"] == ""
    missing["cas"] = ""
    with pytest.raises(ValueError, match="none of the permitted schemas"):
        validate_document(atlas, SCHEMA)


def test_bundle_flags_a_cas_that_fails_its_check_digit_without_altering_it(
    inputs: BundleInputs, caplog: pytest.LogCaptureFixture
) -> None:
    changes: dict[str, dict[str, str | None]] = {
        "Vanillin": {"cas": "102-22-70"},
        "Guaiacol": {"cas": None, "cas_annotation": "Note*"},
    }
    molecules = tuple(replace(row, **changes.get(row.name, {})) for row in inputs.molecules)
    files = bundle_files(
        ROOT, replace(inputs, molecules=molecules), date(2026, 11, 5), fixtures=True
    )
    records = {
        r["name"]: r
        for r in map(mapping, sequence(mapping(json.loads(files["atlas.json"]))["molecules"]))
    }
    assert (records["Vanillin"]["cas"], records["Vanillin"]["casCheckDigit"]) == (
        "102-22-70",
        "fails",
    )
    assert records["Geosmin"]["casCheckDigit"] == "passes"
    assert records["Benzaldehyde ethyl methyl acetal"]["casCheckDigit"] == "unlisted"
    assert "1 CAS number fails the check digit" in caplog.text
    # Geosmin's fixture row carries the source's asterisk.
    assert "marks from 2 CAS fields; 1 held only a note" in caplog.text


def test_bundle_structure_minifier_removes_metadata_and_unused_definitions() -> None:
    raw = (
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg">'
        "<!-- drawing metadata --><metadata><source>private</source></metadata>"
        '<defs><path id="unused" d="M 0 0 L 1 1"/></defs>'
        '<path d="M 0 0\n  L 2 2" style="fill: none; stroke: #F1E9DC;"/></svg>'
    )
    result = minify_structure(raw, title="Test structure")
    elements = svg_elements(result)
    assert [tag for tag, _ in elements] == ["svg", "title", "path"]
    assert "private" not in result
    assert "unused" not in result
    assert "<!--" not in result
    assert elements[-1][1] == {"d": "M 0 0 L 2 2", "style": "fill:none;stroke:#F1E9DC"}


def test_real_leffingwell_outputs_cannot_replace_synthetic_fixtures(tmp_path: Path) -> None:
    from smellcule.export.bundle_real import write_fixture_outputs

    with pytest.raises(ValueError, match="Leffingwell fixture recording is disabled"):
        write_fixture_outputs(tmp_path, tmp_path / "real-bundle")
    assert not (tmp_path / FIXTURE_OUTPUTS).exists()
