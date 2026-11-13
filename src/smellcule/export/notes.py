from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from smellcule.catalogue import CatalogueRow
from smellcule.export.content import (
    claim_names,
    descriptors,
    has_evidence,
    https_url,
    mapping,
    read_yaml,
    resolve,
    sequence,
    strings,
    text,
)


@dataclass(frozen=True)
class NoteMolecule:
    """A resolved character or sourced constituent relationship."""

    molecule_id: str
    relation: Literal["character", "constituent"]
    source_url: str | None


@dataclass(frozen=True)
class Note:
    """Measured evidence and resolved links for a perfume note."""

    name: str
    aliases: tuple[str, ...]
    evidence: tuple[str, ...]
    molecules: tuple[NoteMolecule, ...]


@dataclass(frozen=True)
class Archetype:
    """A three-tier example whose names all resolve to authored notes."""

    name: str
    top: tuple[str, ...]
    heart: tuple[str, ...]
    base: tuple[str, ...]


@dataclass(frozen=True)
class Notes:
    """Validated notes and their example tier lists."""

    notes: tuple[Note, ...]
    archetypes: tuple[Archetype, ...]


def _links(
    value: object, evidence: tuple[str, ...], labels: Sequence[str], rows: Sequence[CatalogueRow]
) -> tuple[NoteMolecule, ...]:
    links: list[NoteMolecule] = []
    for item in sequence(value):
        entry = {"name": item, "relation": "character"} if isinstance(item, str) else mapping(item)
        name = text(entry["name"])
        raw_relation = entry.get("relation")
        if raw_relation not in {"character", "constituent"}:
            message = f"Invalid relation for {name!r}; expected character or constituent."
            raise ValueError(message)
        relation: Literal["character", "constituent"] = (
            "character" if raw_relation == "character" else "constituent"
        )
        source = https_url(entry["source_url"]) if "source_url" in entry else None
        if relation == "constituent" and source is None:
            message = f"Constituent {name!r} requires an HTTPS source_url."
            raise ValueError(message)
        for row in resolve(name, rows):
            if relation == "character" and not has_evidence(row, evidence, labels):
                message = f"Character {name!r} row {row.molecule_id} lacks measured evidence."
                raise ValueError(message)
            links.append(NoteMolecule(row.molecule_id, relation, source))
    if not links or len({link.molecule_id for link in links}) != len(links):
        message = "Note molecules must be nonempty and distinct."
        raise ValueError(message)
    return tuple(links)


def load_notes(path: Path, labels: Sequence[str], rows: Sequence[CatalogueRow]) -> Notes:
    """Compile notes only after every link and archetype passes its evidence rule."""
    document = read_yaml(path)
    notes: list[Note] = []
    used: set[str] = set()
    for name, value in mapping(document["notes"]).items():
        entry = mapping(value)
        aliases = strings(entry["aliases"])
        claim_names(name, aliases, used)
        evidence = strings(entry["evidence"])
        descriptors(evidence, labels)
        notes.append(
            Note(name, aliases, evidence, _links(entry["molecules"], evidence, labels, rows))
        )
    archetypes: list[Archetype] = []
    names: set[str] = set()
    for item in sequence(document["archetypes"]):
        entry = mapping(item)
        name = text(entry["name"])
        claim_names(name, (), names)
        tiers = [strings(entry[tier]) for tier in ("top", "heart", "base")]
        if any(
            not tier or any(note not in {n.name for n in notes} for note in tier) for tier in tiers
        ):
            message = f"Archetype {name!r} has an empty tier or an unknown note."
            raise ValueError(message)
        archetypes.append(Archetype(name, tiers[0], tiers[1], tiers[2]))
    return Notes(tuple(notes), tuple(archetypes))
