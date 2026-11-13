import hashlib
import json
import math
import random
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date

import numpy as np

from smellcule.families import Family
from smellcule.metrics import FloatArray
from smellcule.molecules import Molecule
from smellcule.splits import Split

SEED = 20261201
OPTION_COUNT = 12
MEASURED_CAP = 6
PICK_COUNT = 3
MIN_PUZZLES = 365
MAX_STRATEGY_ADVANTAGE = 0.3
START_DATE = date(2026, 11, 13)


class SmellculeError(ValueError):
    """An export failure that must leave existing bundle files untouched."""

    exit_code = 1


@dataclass(frozen=True)
class Clue:
    """Catalogue row index and Morgan similarity of the nearest training structure."""

    molecule_index: int
    similarity: float


@dataclass(frozen=True)
class Puzzle:
    """Stable catalogue identifiers, descriptor indices and the complete measured answer."""

    molecule_id: str
    options: tuple[int, ...]
    answer: tuple[int, ...]
    clue: Clue

    def canonical_json(self) -> bytes:
        """Encode options, answer and clue with deterministic JSON separators and key order."""
        return json.dumps(
            {
                "moleculeId": self.molecule_id,
                "options": self.options,
                "answer": self.answer,
                "clueId": self.clue.molecule_index,
                "clueSimilarity": self.clue.similarity,
            },
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")

    @property
    def sha256(self) -> str:
        """Hash the complete playable puzzle, including the measured answer."""
        return hashlib.sha256(self.canonical_json()).hexdigest()


@dataclass(frozen=True)
class Schedule:
    """Numbered puzzles with holes reserved for retired numbers."""

    start_date: date
    puzzles: Mapping[int, Puzzle]


@dataclass(frozen=True)
class DistractorScores:
    """Family strategy and exact uniform three-pick expectations per puzzle."""

    strategy: tuple[int, ...]
    uniform: tuple[float, ...]

    @property
    def strategy_mean(self) -> float:
        """Return the observed measured-pick mean."""
        return math.fsum(self.strategy) / len(self.strategy) if self.strategy else 0.0

    @property
    def random_mean(self) -> float:
        """Return the analytical uniform measured-pick mean."""
        return math.fsum(self.uniform) / len(self.uniform) if self.uniform else 0.0

    @property
    def passes(self) -> bool:
        """Allow at most the specified advantage over uniform random choice."""
        return self.strategy_mean <= self.random_mean + MAX_STRATEGY_ADVANTAGE


@dataclass(frozen=True)
class ScheduleResult:
    """An accepted schedule and its decoy audit, ready for atomic bundle writing."""

    schedule: Schedule
    counts: Mapping[str, object]


def label_frequencies(molecules: Sequence[Molecule], labels: Sequence[str]) -> tuple[int, ...]:
    """Count source-row occurrences in the full catalogue, including training rows."""
    return tuple(sum(row.measured[i] for row in molecules) for i in range(len(labels)))


def family_indices(families: Sequence[Family], labels: Sequence[str]) -> dict[int, str]:
    """Associate descriptor indices with their unique family."""
    by_label = {label: family.name for family in families for label in family.labels}
    return {
        i: by_label[label] if label != "odorless" else "odorless" for i, label in enumerate(labels)
    }


def distractor_scores(
    puzzles: Sequence[Puzzle], frequencies: Sequence[int], families: Mapping[int, str]
) -> DistractorScores:
    """Pick the three rarest options in the largest family, breaking family ties by rarity."""
    strategy: list[int] = []
    uniform: list[float] = []
    for puzzle in puzzles:
        groups: dict[str, list[int]] = {}
        for option in puzzle.options:
            groups.setdefault(families[option], []).append(option)
        ranked = [sorted(group, key=lambda i: (frequencies[i], i)) for group in groups.values()]
        largest = min(ranked, key=lambda group: (-len(group), [(frequencies[i], i) for i in group]))
        picks = (
            largest + sorted(set(puzzle.options) - set(largest), key=lambda i: (frequencies[i], i))
        )[:PICK_COUNT]
        strategy.append(len(set(picks) & set(puzzle.answer)))
        uniform.append(PICK_COUNT * len(set(puzzle.options) & set(puzzle.answer)) / OPTION_COUNT)
    return DistractorScores(tuple(strategy), tuple(uniform))


def _draw(pool: list[int], count: int, frequencies: Sequence[int], rng: random.Random) -> list[int]:
    chosen: list[int] = []
    for _ in range(min(count, len(pool))):
        option = rng.choices(pool, weights=[frequencies[i] for i in pool], k=1)[0]
        chosen.append(option)
        pool.remove(option)
    return chosen


@dataclass(frozen=True)
class DescriptorPool:
    """Catalogue frequencies and the descriptor-to-family lookup."""

    frequencies: Sequence[int]
    families: Mapping[int, str]


@dataclass(frozen=True)
class ScheduleInputs:
    """Row-aligned catalogue, cluster assignments, predictions and structure clues."""

    molecules: Sequence[Molecule]
    labels: Sequence[str]
    assignments: Sequence[Split]
    predictions: FloatArray
    clues: Sequence[Clue]


def _options(
    answer: tuple[int, ...],
    top: Sequence[int],
    pool_data: DescriptorPool,
    rng: random.Random,
    *,
    all_same: bool,
) -> tuple[int, ...]:
    frequencies, families = pool_data.frequencies, pool_data.families
    selected = list(
        dict.fromkeys((*sorted(answer, key=lambda i: (frequencies[i], i))[:MEASURED_CAP], *top))
    )
    needed = OPTION_COUNT - len(selected)
    present = {families[i] for i in answer}
    pool = [
        i
        for i in families
        if i not in answer
        and i not in selected
        and frequencies[i] > 0
        and families[i] != "odorless"
    ]
    same = [i for i in pool if families[i] in present]
    other = [i for i in pool if families[i] not in present]
    same_count = needed if all_same else needed // 2
    selected += _draw(same, same_count, frequencies, rng)
    selected += _draw(other, needed - same_count, frequencies, rng)
    # Small families may not supply their quota; use the remaining eligible descriptors.
    selected += _draw(
        sorted(set(pool) - set(selected)), OPTION_COUNT - len(selected), frequencies, rng
    )
    if len(selected) != OPTION_COUNT:
        message = "Smellcule needs twelve distinct options."
        raise ValueError(message)
    rng.shuffle(selected)
    return tuple(selected)


def _audit(
    puzzles: Sequence[Puzzle],
    frequencies: Sequence[int],
    families: Mapping[int, str],
    dropped: Mapping[int, Sequence[str]],
    *,
    all_same: bool,
) -> ScheduleResult:
    scores = distractor_scores(puzzles, frequencies, families)
    if not scores.passes or len(puzzles) < MIN_PUZZLES:
        message = (
            "error: Smellcule decoys still reveal the answer "
            f"(strategy mean {scores.strategy_mean:.6f}, random {scores.random_mean:.6f}, "
            f"{len(puzzles)} puzzles left)\n"
            "next: ship Smellcule with the remaining puzzles, "
            "or edit config/families.yaml"
        )
        raise SmellculeError(message)
    return ScheduleResult(
        Schedule(START_DATE, dict(enumerate(puzzles, start=1))),
        {
            "smellcule_puzzles": len(puzzles),
            "smellcule_strategy_mean": scores.strategy_mean,
            "smellcule_random_mean": scores.random_mean,
            "smellcule_all_same_family": all_same,
            "smellcule_dropped_three": list(dropped.get(PICK_COUNT, ())),
            "smellcule_dropped_two": list(dropped.get(PICK_COUNT - 1, ())),
        },
    )


def filter_distractors(
    puzzles: Sequence[Puzzle],
    frequencies: Sequence[int],
    families: Mapping[int, str],
    locked_ids: frozenset[str] = frozenset(),
) -> ScheduleResult:
    """Drop only unlocked perfect, then two-pick family solves, retaining a full year."""
    kept = list(puzzles)
    dropped: dict[int, list[str]] = {PICK_COUNT: [], PICK_COUNT - 1: []}
    for score in (PICK_COUNT, PICK_COUNT - 1):
        scores = distractor_scores(kept, frequencies, families)
        if scores.passes:
            break
        candidates = [
            p
            for p, hits in zip(kept, scores.strategy, strict=True)
            if hits == score and p.molecule_id not in locked_ids
        ]
        if len(kept) - len(candidates) < MIN_PUZZLES:
            break
        dropped[score] = [p.molecule_id for p in candidates]
        kept = [p for p in kept if p not in candidates]
    return _audit(kept, frequencies, families, dropped, all_same=True)


def build_schedule(
    inputs: ScheduleInputs,
    families: Sequence[Family],
    locked: Mapping[int, Puzzle] | None = None,
    *,
    rng_factory: Callable[[int], random.Random] = random.Random,
) -> ScheduleResult:
    """Build and audit seeded options, copying date-locked puzzles without alteration."""
    molecules, labels = inputs.molecules, inputs.labels
    assignments, predictions, clues = inputs.assignments, inputs.predictions, inputs.clues
    if (
        len(molecules) != len(assignments)
        or len(molecules) != len(clues)
        or predictions.shape != (len(molecules), len(labels))
        or not np.isfinite(predictions).all()
        or np.any((predictions < 0) | (predictions > 1))
    ):
        message = "Smellcule rows, splits, probabilities and clues must align."
        raise ValueError(message)
    if any(
        not 0 <= clue.molecule_index < len(molecules)
        or assignments[clue.molecule_index] != "train"
        or not math.isfinite(clue.similarity)
        or not 0 <= clue.similarity <= 1
        for clue in clues
    ):
        message = "Smellcule clues must identify training rows with finite similarities in [0, 1]."
        raise ValueError(message)
    locked = {} if locked is None else locked
    locked_ids = frozenset(p.molecule_id for p in locked.values())
    frequencies = label_frequencies(molecules, labels)
    family_map = family_indices(families, labels)
    rows = {row.molecule_id: i for i, row in enumerate(molecules)}
    if len(rows) != len(molecules):
        message = "Smellcule molecule ids must be unique."
        raise ValueError(message)
    eligible = sorted(
        row.molecule_id
        for row, split in zip(molecules, assignments, strict=True)
        if split == "held_out"
        and sum(row.measured) >= PICK_COUNT
        and not ("odorless" in labels and row.measured[labels.index("odorless")])
    )
    for all_same in (False, True):
        rng = rng_factory(SEED)
        order = eligible.copy()
        rng.shuffle(order)
        order = [molecule_id for molecule_id in order if molecule_id not in locked_ids]
        puzzles = list(locked.values())
        for molecule_id in order:
            index = rows[molecule_id]
            answer = tuple(i for i, value in enumerate(molecules[index].measured) if value)
            top = sorted(family_map, key=lambda i: (-predictions[index, i], i))[:PICK_COUNT]
            puzzles.append(
                Puzzle(
                    molecule_id,
                    _options(
                        answer, top, DescriptorPool(frequencies, family_map), rng, all_same=all_same
                    ),
                    answer,
                    clues[index],
                )
            )
        if distractor_scores(puzzles, frequencies, family_map).passes:
            return _audit(puzzles, frequencies, family_map, {}, all_same=all_same)
    return filter_distractors(puzzles, frequencies, family_map, locked_ids)
