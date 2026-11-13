from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from smellcule.catalogue import CatalogueRow
from smellcule.export.content import (
    claim_names,
    descriptors,
    has_evidence,
    https_url,
    mapping,
    positive_weight,
    read_yaml,
    resolve,
    strings,
    text,
)


@dataclass(frozen=True)
class Phrase:
    """Descriptor weights with an optional, sourced catalogue example."""

    name: str
    aliases: tuple[str, ...]
    weights: dict[str, float]
    exemplar: str | None
    source_url: str | None


def load_phrases(
    path: Path, labels: Sequence[str], rows: Sequence[CatalogueRow]
) -> tuple[Phrase, ...]:
    """Resolve unique exemplars and verify their strongest descriptors against measurements."""
    phrases: list[Phrase] = []
    used = set(labels)
    for name, value in read_yaml(path).items():
        entry = mapping(value)
        aliases = strings(entry["aliases"])
        # A phrase can itself be a descriptor, but aliases must remain unambiguous.
        if name in labels:
            used.remove(name)
        claim_names(name, aliases, used)
        weights = {label: positive_weight(w) for label, w in mapping(entry["weights"]).items()}
        descriptors(tuple(weights), labels)
        exemplar = entry["exemplar"]
        source = https_url(entry["source_url"]) if "source_url" in entry else None
        molecule_id: str | None = None
        if exemplar is not None:
            if source is None:
                message = f"Phrase {name!r} exemplar requires an HTTPS source_url."
                raise ValueError(message)
            matches = resolve(text(exemplar), rows)
            if len(matches) != 1:
                message = f"Phrase {name!r} exemplar must resolve to exactly one catalogue row."
                raise ValueError(message)
            strongest = tuple(
                label for label, weight in weights.items() if weight == max(weights.values())
            )
            if not all(has_evidence(matches[0], (label,), labels) for label in strongest):
                message = f"Phrase {name!r} exemplar lacks its highest-weight measured evidence."
                raise ValueError(message)
            molecule_id = matches[0].molecule_id
        phrases.append(Phrase(name, aliases, weights, molecule_id, source))
    return tuple(phrases)
