from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date

from smellcule.export.smellcule import Schedule, ScheduleInputs, build_schedule
from smellcule.export.smellcule_lock import (
    PuzzleLock,
    locked_puzzles,
    merge_deployed_lock,
    number_schedule,
    retire_lock,
)
from smellcule.families import Family
from smellcule.molecules import Molecule


@dataclass(frozen=True)
class Publication:
    """Committed and deployed state with one explicit export date."""

    lock: PuzzleLock
    deployed: Schedule | None
    deployed_molecules: Sequence[Molecule]
    exported_on: date


@dataclass(frozen=True)
class SmellculeExport:
    """Validated schedule, lock and statistics to write together with the bundle."""

    schedule: Schedule | None
    lock: PuzzleLock
    counts: Mapping[str, object]


def compile_smellcule(
    inputs: ScheduleInputs, families: Sequence[Family], publication: Publication
) -> SmellculeExport:
    """Validate the complete Leffingwell schedule before returning any writable content."""
    lock = merge_deployed_lock(
        publication.lock,
        publication.deployed,
        publication.deployed_molecules,
        publication.exported_on,
    )
    preserved = locked_puzzles(lock, publication.deployed, inputs.molecules)
    result = build_schedule(inputs, families, preserved)
    schedule = number_schedule(result.schedule, lock)
    return SmellculeExport(schedule, lock, {**result.counts, "retiredPuzzles": lock.retired_count})


def retire_smellcule(publication: Publication) -> SmellculeExport:
    """Return no schedule and only date-eligible retired numbers for a Keller bundle."""
    merged = merge_deployed_lock(
        publication.lock,
        publication.deployed,
        publication.deployed_molecules,
        publication.exported_on,
    )
    lock = retire_lock(merged, publication.exported_on)
    return SmellculeExport(None, lock, {"retiredPuzzles": lock.retired_count})
