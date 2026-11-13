from dataclasses import replace
from pathlib import Path

import pytest
import yaml

from smellcule.catalogue import CatalogueRow, read_leffingwell
from smellcule.export.content import mapping, read_yaml, sequence
from smellcule.export.notes import load_notes
from smellcule.export.phrases import load_phrases
from smellcule.export.words import load_words
from smellcule.families import load_families

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/content_catalogue.csv"


@pytest.fixture
def content_catalogue() -> tuple[tuple[str, ...], tuple[CatalogueRow, ...]]:
    return read_leffingwell(FIXTURE)


def save(path: Path, document: object) -> Path:
    path.write_text(yaml.safe_dump(document, allow_unicode=True), encoding="utf-8")
    return path


def test_families_coverage_and_prescribed_colours(
    content_catalogue: tuple[tuple[str, ...], tuple[CatalogueRow, ...]],
) -> None:
    labels, _ = content_catalogue
    families = load_families(ROOT / "config/families.yaml", labels)
    assert len(families) == 13
    assert sum(len(f.labels) for f in families) == len(labels) - 1 == 112
    for family in families:
        channels = [int(family.colour[i : i + 2], 16) / 255 for i in (1, 3, 5)]
        background = [int("16120F"[i : i + 2], 16) / 255 for i in (0, 2, 4)]
        luminances = [
            sum(
                w * (c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
                for w, c in zip((0.2126, 0.7152, 0.0722), rgb, strict=True)
            )
            for rgb in (channels, background)
        ]
        assert (luminances[0] + 0.05) / (luminances[1] + 0.05) >= 4.5


@pytest.mark.parametrize(
    "change", ["duplicate", "missing", "unknown", "odorless", "family", "colour"]
)
def test_families_reject_invalid_coverage(
    tmp_path: Path,
    content_catalogue: tuple[tuple[str, ...], tuple[CatalogueRow, ...]],
    change: str,
) -> None:
    labels, _ = content_catalogue
    document = read_yaml(ROOT / "config/families.yaml")
    citrus = mapping(document["citrus"])
    descriptors = sequence(citrus["labels"])
    if change == "duplicate":
        descriptors.append("green")
    elif change == "missing":
        descriptors.pop()
    elif change in {"unknown", "odorless"}:
        descriptors.append(change)
    elif change == "family":
        del document["green"]
    else:
        citrus["colour"] = "#GGGGGG"
    with pytest.raises(ValueError, match=r"Families|coverage|colour"):
        load_families(save(tmp_path / "families.yaml", document), labels)


def test_notes_resolution_relations_and_archetypes(
    content_catalogue: tuple[tuple[str, ...], tuple[CatalogueRow, ...]],
) -> None:
    labels, rows = content_catalogue
    content = load_notes(ROOT / "tests/fixtures/synthetic-notes.yaml", labels, rows)
    assert len(content.notes) == 42
    assert len(content.archetypes) == 8
    assert all(
        link.relation == "character" and link.source_url is None
        for note in content.notes
        for link in note.molecules
    )
    assert sum(len(note.molecules) for note in content.notes) == 91
    rose = next(note for note in content.notes if note.name == "rose")
    expected = {row.molecule_id for row in rows if row.name.casefold() == "damascone"}
    assert len(expected) > 1
    assert expected <= {link.molecule_id for link in rose.molecules}


@pytest.mark.parametrize(
    "failure",
    ["evidence", "relation", "missing_source", "http", "missing_name", "alias", "archetype"],
)
def test_notes_reject_bad_links(
    tmp_path: Path,
    content_catalogue: tuple[tuple[str, ...], tuple[CatalogueRow, ...]],
    failure: str,
) -> None:
    labels, rows = content_catalogue
    document = read_yaml(ROOT / "tests/fixtures/synthetic-notes.yaml")
    note = mapping(mapping(document["notes"])["vanilla"])
    if failure == "evidence":
        note["evidence"] = ["fishy"]
    elif failure == "alias":
        note["aliases"] = ["rose"]
    elif failure == "archetype":
        mapping(sequence(document["archetypes"])[0])["top"] = ["unknown note"]
    else:
        link: dict[str, object] = {"name": "Vanillin", "relation": "character"}
        if failure == "relation":
            link["relation"] = "ingredient"
        elif failure in {"missing_source", "http"}:
            link["relation"] = "constituent"
            if failure == "http":
                link["source_url"] = "http://example.org/analysis"
        else:
            link["name"] = "unknown molecule"
        note["molecules"] = [link]
    with pytest.raises(
        ValueError, match=r"evidence|relation|requires|HTTPS|resolve|Ambiguous|Archetype"
    ):
        load_notes(save(tmp_path / "notes.yaml", document), labels, rows)


def test_notes_constituent_requires_source_and_character_checks_every_row(
    tmp_path: Path,
    content_catalogue: tuple[tuple[str, ...], tuple[CatalogueRow, ...]],
) -> None:
    labels, rows = content_catalogue
    document: dict[str, object] = {
        "notes": {
            "vanilla": {
                "aliases": [],
                "evidence": ["fishy"],
                "molecules": [
                    {
                        "name": "  vAnIlLiN  ",
                        "relation": "constituent",
                        "source_url": "https://example.org/analysis",
                    }
                ],
            }
        },
        "archetypes": [],
    }
    path = save(tmp_path / "notes.yaml", document)
    assert load_notes(path, labels, rows).notes[0].molecules[0].relation == "constituent"
    original = next(row for row in rows if row.name == "Vanillin")
    bad = replace(original, molecule_id="different", measured=(0,) * len(labels))
    with pytest.raises(ValueError, match="lacks measured evidence"):
        load_notes(ROOT / "tests/fixtures/synthetic-notes.yaml", labels, (*rows, bad))


def test_phrases_exemplar_sources_and_measured_evidence(
    content_catalogue: tuple[tuple[str, ...], tuple[CatalogueRow, ...]],
) -> None:
    labels, rows = content_catalogue
    phrases = load_phrases(ROOT / "tests/fixtures/synthetic-phrases.yaml", labels, rows)
    assert len(phrases) == 82
    exemplars = [phrase for phrase in phrases if phrase.exemplar is not None]
    assert len(exemplars) == 5
    assert all(
        phrase.source_url and phrase.source_url.startswith("https://") for phrase in exemplars
    )
    assert next(p for p in phrases if p.name == "rain").aliases == ("petrichor", "after rain")
    assert all("popcorn" not in p.aliases for p in phrases)


@pytest.mark.parametrize(
    "failure",
    ["source", "http", "evidence", "descriptor", "ambiguous", "unresolved", "alias", "weight"],
)
def test_phrases_reject_invalid_exemplars(
    tmp_path: Path,
    content_catalogue: tuple[tuple[str, ...], tuple[CatalogueRow, ...]],
    failure: str,
) -> None:
    labels, rows = content_catalogue
    document = read_yaml(ROOT / "tests/fixtures/synthetic-phrases.yaml")
    rain = mapping(document["rain"])
    if failure == "source":
        del rain["source_url"]
    elif failure == "http":
        rain["source_url"] = "http://example.org"
    elif failure in {"evidence", "descriptor", "weight"}:
        geosmin = next(row for row in rows if row.name == "Geosmin")
        absent = next(
            label for label, value in zip(labels, geosmin.measured, strict=True) if not value
        )
        rain["weights"] = {
            absent
            if failure == "evidence"
            else "unknown"
            if failure == "descriptor"
            else "earthy": 0 if failure == "weight" else 1
        }
    elif failure == "alias":
        rain["aliases"] = ["popcorn"]
    elif failure == "unresolved":
        rain["exemplar"] = "unknown molecule"
    else:
        original = next(row for row in rows if row.name == "Geosmin")
        rows = (*rows, replace(original, molecule_id="duplicate"))
    with pytest.raises(
        ValueError,
        match=r"requires|HTTPS|evidence|descriptor|exactly one|resolve|Ambiguous|weights",
    ):
        load_phrases(save(tmp_path / "phrases.yaml", document), labels, rows)


def test_words_map_everyday_words_to_measured_descriptors(
    content_catalogue: tuple[tuple[str, ...], tuple[CatalogueRow, ...]],
) -> None:
    labels, rows = content_catalogue
    phrases = load_phrases(ROOT / "tests/fixtures/synthetic-phrases.yaml", labels, rows)
    words = load_words(ROOT / "config/words.yaml", labels, phrases)
    assert words.words["tangerine"] == ("orange",)
    assert words.words["toast"] == ("bread", "roasted")
    assert all(set(targets) <= set(labels) for targets in words.words.values())
    assert "odorless" not in {label for targets in words.words.values() for label in targets}
    assert "chest" in words.carriers
    assert words.qualifiers == ("fresh", "warm")


@pytest.mark.parametrize(
    ("failure", "message"),
    [
        ("unknown", "not a catalogue descriptor"),
        ("odorless", "not a catalogue descriptor"),
        ("label", "already a descriptor"),
        ("phrase", "already a phrase"),
        ("spaces", "one lowercase word"),
        ("carrier", "both a carrier"),
        ("qualifier", "not a catalogue descriptor"),
    ],
)
def test_words_reject_targets_without_a_measured_basis(
    tmp_path: Path,
    content_catalogue: tuple[tuple[str, ...], tuple[CatalogueRow, ...]],
    failure: str,
    message: str,
) -> None:
    labels, rows = content_catalogue
    phrases = load_phrases(ROOT / "tests/fixtures/synthetic-phrases.yaml", labels, rows)
    document = read_yaml(ROOT / "config/words.yaml")
    referents = mapping(document["referents"])
    if failure == "unknown":
        referents["chlorine"] = ["swimming"]
    elif failure == "odorless":
        referents["odorless"] = ["water"]
    elif failure == "label":
        referents["woody"] = ["smoky"]
    elif failure == "phrase":
        referents["woody"] = ["petrichor"]
    elif failure == "spaces":
        referents["woody"] = ["cedar chest"]
    elif failure == "carrier":
        document["carriers"] = ["cedar"]
    else:
        document["qualifiers"] = ["old"]
    with pytest.raises(ValueError, match=message):
        load_words(save(tmp_path / "words.yaml", document), labels, phrases)
