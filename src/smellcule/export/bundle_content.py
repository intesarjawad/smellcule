import logging
from pathlib import Path
from tempfile import TemporaryDirectory

import yaml

from smellcule.catalogue import CatalogueRow
from smellcule.export.content import mapping, read_yaml, sequence, text
from smellcule.export.notes import Notes, load_notes
from smellcule.export.phrases import Phrase, load_phrases
from smellcule.export.words import Words, load_words
from smellcule.resources import resource_path

LOGGER = logging.getLogger(__name__)


def compile_content(
    root: Path, labels: tuple[str, ...], rows: tuple[CatalogueRow, ...], *, fixtures: bool
) -> tuple[Notes, tuple[Phrase, ...], Words]:
    """Filter unavailable fixture links before applying the ordinary content validators."""
    if not fixtures:
        phrases = load_phrases(resource_path(root, "config/phrases.yaml"), labels, rows)
        return (
            load_notes(resource_path(root, "config/notes.yaml"), labels, rows),
            phrases,
            load_words(resource_path(root, "config/words.yaml"), labels, phrases),
        )
    available = {row.name.strip().casefold() for row in rows}
    document = read_yaml(root / "tests/fixtures/synthetic-notes.yaml")
    notes = mapping(document["notes"])
    for name, raw in list(notes.items()):
        entry = mapping(raw)
        kept: list[object] = []
        for link in sequence(entry["molecules"]):
            molecule = text(link) if isinstance(link, str) else text(mapping(link)["name"])
            if molecule.strip().casefold() in available:
                kept.append(link)
            else:
                LOGGER.warning("Fixture drops note link %s: %s", name, molecule)
        if kept:
            entry["molecules"] = kept
        else:
            del notes[name]
            LOGGER.warning("Fixture drops note: %s", name)
    archetypes: list[object] = []
    for raw in sequence(document["archetypes"]):
        entry = mapping(raw)
        if all(
            note in notes for tier in ("top", "heart", "base") for note in sequence(entry[tier])
        ):
            archetypes.append(entry)
        else:
            LOGGER.warning("Fixture drops archetype: %s", entry["name"])
    document["archetypes"] = archetypes
    phrase_document = read_yaml(root / "tests/fixtures/synthetic-phrases.yaml")
    for name, raw in list(phrase_document.items()):
        exemplar = mapping(raw)["exemplar"]
        if exemplar is not None and text(exemplar).strip().casefold() not in available:
            del phrase_document[name]
            LOGGER.warning("Fixture drops phrase: %s", name)
    with TemporaryDirectory() as directory:
        path = Path(directory)
        (path / "notes.yaml").write_text(yaml.safe_dump(document), encoding="utf-8")
        (path / "phrases.yaml").write_text(
            yaml.safe_dump(phrase_document, sort_keys=False), encoding="utf-8"
        )
        phrases = load_phrases(path / "phrases.yaml", labels, rows)
        # Words name descriptors, not molecules, so the fixture keeps every entry.
        return (
            load_notes(path / "notes.yaml", labels, rows),
            phrases,
            load_words(resource_path(root, "config/words.yaml"), labels, phrases),
        )
