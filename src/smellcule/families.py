from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from smellcule.export.content import mapping, read_yaml, strings, text

HEX_COLOUR_LENGTH = 7
FAMILY_NAMES = (
    "citrus",
    "green",
    "floral",
    "fruity",
    "sweet",
    "woody",
    "musky",
    "earthy",
    "spicy",
    "fresh",
    "roasted",
    "savory",
    "waxy",
)


@dataclass(frozen=True)
class Family:
    """A display colour and a disjoint set of catalogue descriptors."""

    name: str
    colour: str
    labels: tuple[str, ...]


def load_families(
    path: Path, labels: Sequence[str], *, ungrouped: str = "odorless"
) -> tuple[Family, ...]:
    """Require the catalogue families to cover every descriptor except the ungrouped label once."""
    document = read_yaml(path)
    expected_names = set(FAMILY_NAMES) - ({"citrus", "earthy"} if ungrouped == "edible" else set())
    if set(document) != expected_names:
        message = "Families must contain exactly the catalogue's named families."
        raise ValueError(message)
    families: list[Family] = []
    for name, value in document.items():
        entry = mapping(value)
        colour = text(entry["colour"])
        if (
            len(colour) != HEX_COLOUR_LENGTH
            or colour[0] != "#"
            or any(char not in "0123456789abcdefABCDEF" for char in colour[1:])
        ):
            message = f"Invalid family colour for {name}."
            raise ValueError(message)
        families.append(Family(name, colour, strings(entry["labels"])))
    actual = Counter(label for family in families for label in family.labels)
    expected = Counter(label for label in labels if label != ungrouped)
    if actual != expected:
        message = (
            f"Family coverage differs: missing {expected - actual}; extra {actual - expected}."
        )
        raise ValueError(message)
    return tuple(families)
