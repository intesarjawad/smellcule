import re
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from smellcule.export.content import mapping, read_yaml, strings
from smellcule.export.phrases import Phrase

WORD = re.compile(r"[a-z]+")
# Leffingwell's "odorless" records an absence of smell, so no everyday word can name it.
NO_SMELL = "odorless"


@dataclass(frozen=True)
class Words:
    """Everyday words mapped to the measured descriptors search reads them as."""

    words: dict[str, tuple[str, ...]]
    carriers: tuple[str, ...]
    qualifiers: tuple[str, ...]


def _word(value: str, kind: str) -> str:
    if WORD.fullmatch(value) is None:
        message = f"{kind} {value!r} must be one lowercase word."
        raise ValueError(message)
    return value


def _descriptor(value: str, labels: Sequence[str]) -> str:
    if value == NO_SMELL or value not in labels:
        message = f"{value!r} is not a catalogue descriptor; list only measured descriptors."
        raise ValueError(message)
    return value


def load_words(path: Path, labels: Sequence[str], phrases: Sequence[Phrase]) -> Words:
    """Invert the referent table and check every target is a measured catalogue descriptor."""
    document = read_yaml(path)
    phrase_names = {
        name.casefold() for phrase in phrases for name in (phrase.name, *phrase.aliases)
    }
    words: dict[str, list[str]] = {}
    for descriptor, referents in mapping(document["referents"]).items():
        target = _descriptor(descriptor, labels)
        for word in strings(referents):
            _word(word, "Word")
            if word in labels:
                message = f"Word {word!r} is already a descriptor; it needs no entry."
                raise ValueError(message)
            if word in phrase_names:
                message = f"Word {word!r} is already a phrase name or alias."
                raise ValueError(message)
            words.setdefault(word, []).append(target)
    carriers = tuple(_word(word, "Carrier") for word in strings(document["carriers"]))
    both = sorted(set(carriers) & set(words))
    if both:
        message = f"{both} cannot be both a carrier and a referent."
        raise ValueError(message)
    qualifiers = tuple(_descriptor(word, labels) for word in strings(document["qualifiers"]))
    return Words(
        {word: tuple(sorted(targets)) for word, targets in sorted(words.items())},
        carriers,
        qualifiers,
    )
