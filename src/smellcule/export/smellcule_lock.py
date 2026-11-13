import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from smellcule.export.content import mapping, text
from smellcule.export.smellcule import START_DATE, Puzzle, Schedule, SmellculeError
from smellcule.molecules import Molecule

DEPLOY_BUFFER_DAYS = 7


@dataclass(frozen=True)
class LockedPuzzle:
    """Identity and content digest for a published puzzle number."""

    molecule_id: str
    inchikey: str
    sha256: str


@dataclass(frozen=True)
class RetiredPuzzle:
    """A reserved puzzle number without retained catalogue data."""


@dataclass(frozen=True)
class PuzzleLock:
    """Date-anchored published identities and retired number reservations."""

    start_date: date
    puzzles: Mapping[int, LockedPuzzle | RetiredPuzzle]

    @property
    def retired_count(self) -> int:
        """Count the reserved numbers for the bundle's retiredPuzzles statistic."""
        return sum(isinstance(entry, RetiredPuzzle) for entry in self.puzzles.values())

    def to_json(self) -> str:
        """Encode the committed lock without molecule fields on retired entries."""
        puzzles = {
            str(number): {"retired": True}
            if isinstance(entry, RetiredPuzzle)
            else {
                "molecule_id": entry.molecule_id,
                "inchikey": entry.inchikey,
                "sha256": entry.sha256,
            }
            for number, entry in sorted(self.puzzles.items())
        }
        return (
            json.dumps({"startDate": self.start_date.isoformat(), "puzzles": puzzles}, indent=2)
            + "\n"
        )


def read_lock(path: Path) -> PuzzleLock:
    """Validate puzzle numbers, dates, identities and digests before merging a lock."""
    document: object = json.loads(path.read_text(encoding="utf-8"))
    root = mapping(document)
    if root.keys() != {"startDate", "puzzles"}:
        message = "Puzzle lock requires startDate and puzzles."
        raise ValueError(message)
    start_date = date.fromisoformat(text(root["startDate"]))
    entries: dict[int, LockedPuzzle | RetiredPuzzle] = {}
    for key, value in mapping(root["puzzles"]).items():
        if not re.fullmatch(r"[1-9][0-9]*", key):
            message = f"Invalid puzzle number {key!r}."
            raise ValueError(message)
        entry = mapping(value)
        if entry == {"retired": True} and entry["retired"] is True:
            entries[int(key)] = RetiredPuzzle()
            continue
        if entry.keys() != {"molecule_id", "inchikey", "sha256"}:
            message = f"Invalid puzzle lock entry {key}."
            raise ValueError(message)
        molecule_id = text(entry["molecule_id"])
        inchikey = text(entry["inchikey"])
        sha256 = text(entry["sha256"])
        if re.fullmatch(r"[0-9a-f]{64}", sha256) is None:
            message = f"Invalid puzzle digest {key}."
            raise ValueError(message)
        entries[int(key)] = LockedPuzzle(molecule_id, inchikey, sha256)
    return PuzzleLock(start_date, entries)


def _changed(number: int) -> SmellculeError:
    return SmellculeError(
        f"error: puzzle {number} is locked and its molecule changed\n"
        "next: restore the pinned data or keep the locked puzzle"
    )


def merge_deployed_lock(
    committed: PuzzleLock,
    deployed: Schedule | None,
    deployed_molecules: Sequence[Molecule],
    exported_on: date,
) -> PuzzleLock:
    """Lock every deployed puzzle dated through the single export date plus seven days."""
    if deployed is None:
        return committed
    if deployed.start_date != committed.start_date:
        message = "Cannot change startDate after publication."
        raise SmellculeError(message)
    by_id = {row.molecule_id: row for row in deployed_molecules}
    merged = dict(committed.puzzles)
    last_number = (exported_on - deployed.start_date).days + DEPLOY_BUFFER_DAYS + 1
    for number, puzzle in deployed.puzzles.items():
        if number > last_number:
            continue
        if puzzle.molecule_id not in by_id:
            raise _changed(number)
        entry = LockedPuzzle(puzzle.molecule_id, by_id[puzzle.molecule_id].inchikey, puzzle.sha256)
        if number in merged and merged[number] != entry:
            raise _changed(number)
        merged[number] = entry
    return PuzzleLock(committed.start_date, merged)


def locked_puzzles(
    lock: PuzzleLock, deployed: Schedule | None, molecules: Sequence[Molecule]
) -> dict[int, Puzzle]:
    """Recover exact published bytes and reject missing or changed source rows."""
    by_id = {row.molecule_id: row for row in molecules}
    result: dict[int, Puzzle] = {}
    for number, entry in lock.puzzles.items():
        if isinstance(entry, RetiredPuzzle):
            continue
        if deployed is None or number not in deployed.puzzles or entry.molecule_id not in by_id:
            raise _changed(number)
        puzzle = deployed.puzzles[number]
        molecule = by_id[entry.molecule_id]
        answer = tuple(i for i, value in enumerate(molecule.measured) if value)
        if (
            puzzle.molecule_id != entry.molecule_id
            or puzzle.sha256 != entry.sha256
            or molecule.inchikey != entry.inchikey
            or answer != puzzle.answer
        ):
            raise _changed(number)
        result[number] = puzzle
    return result


def retire_lock(lock: PuzzleLock, exported_on: date) -> PuzzleLock:
    """Remove future numbers and all catalogue fields when switching to Keller."""
    last_number = (exported_on - lock.start_date).days + DEPLOY_BUFFER_DAYS + 1
    return PuzzleLock(
        lock.start_date,
        {number: RetiredPuzzle() for number in lock.puzzles if number <= last_number},
    )


def number_schedule(candidate: Schedule, lock: PuzzleLock) -> Schedule:
    """Preserve active numbers and continue new puzzles after every reserved number."""
    by_id = {puzzle.molecule_id: puzzle for puzzle in candidate.puzzles.values()}
    kept: dict[int, Puzzle] = {}
    used: set[str] = set()
    for number, entry in sorted(lock.puzzles.items()):
        if isinstance(entry, LockedPuzzle):
            if entry.molecule_id not in by_id or by_id[entry.molecule_id].sha256 != entry.sha256:
                raise _changed(number)
            kept[number] = by_id[entry.molecule_id]
            used.add(entry.molecule_id)
    next_number = max(lock.puzzles, default=0) + 1
    for puzzle in candidate.puzzles.values():
        if puzzle.molecule_id not in used:
            kept[next_number] = puzzle
            next_number += 1
    return Schedule(lock.start_date, dict(sorted(kept.items())))


def empty_lock() -> PuzzleLock:
    """Start an unpublished schedule with no reserved numbers."""
    return PuzzleLock(START_DATE, {})
