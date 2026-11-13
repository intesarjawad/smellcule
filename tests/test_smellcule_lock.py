import json
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

import pytest

from smellcule.catalogue import read_leffingwell
from smellcule.export.smellcule import START_DATE, Clue, Puzzle, Schedule, SmellculeError
from smellcule.export.smellcule_lock import (
    DEPLOY_BUFFER_DAYS,
    LockedPuzzle,
    PuzzleLock,
    RetiredPuzzle,
    empty_lock,
    locked_puzzles,
    merge_deployed_lock,
    number_schedule,
    read_lock,
    retire_lock,
)
from smellcule.molecules import Molecule, standardise


@pytest.fixture
def published() -> tuple[Schedule, tuple[Molecule, ...]]:
    _, rows = read_leffingwell(Path(__file__).parent / "fixtures/leffingwell_fixture.csv")
    base = standardise(rows[0])
    molecules = tuple(
        replace(base, molecule_id=str(i), measured=(1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0))
        for i in range(40)
    )
    puzzles = {
        i + 1: Puzzle(row.molecule_id, tuple(range(12)), (0, 1, 2), Clue(0, 0.5))
        for i, row in enumerate(molecules)
    }
    return Schedule(START_DATE, puzzles), molecules


def test_smellcule_lock_a_mid_schedule_release_copies_through_buffer(
    published: tuple[Schedule, tuple[Molecule, ...]],
    tmp_path: Path,
) -> None:
    deployed, molecules = published
    committed = merge_deployed_lock(
        empty_lock(), deployed, molecules, START_DATE + timedelta(days=2)
    )
    assert len(committed.puzzles) == 10
    lock = merge_deployed_lock(committed, deployed, molecules, START_DATE + timedelta(days=19))
    assert len(lock.puzzles) == 27
    changed = tuple(
        replace(row, measured=(0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0))
        if row.molecule_id == "35"
        else row
        for row in molecules
        if row.molecule_id != "30"
    )
    preserved = locked_puzzles(lock, deployed, changed)
    later = dict(preserved)
    for number in range(28, 41):
        puzzle = deployed.puzzles[number]
        if puzzle.molecule_id != "30":
            later[number] = replace(puzzle, options=tuple(reversed(puzzle.options)))
    result = number_schedule(Schedule(START_DATE, later), lock)
    for number in range(1, 28):
        assert result.puzzles[number].canonical_json() == deployed.puzzles[number].canonical_json()
        entry = lock.puzzles[number]
        assert isinstance(entry, LockedPuzzle)
        assert result.puzzles[number].sha256 == entry.sha256
    assert result.puzzles[28].canonical_json() != deployed.puzzles[28].canonical_json()
    path = tmp_path / "lock.json"
    path.write_text(lock.to_json(), encoding="utf-8")
    assert read_lock(path) == lock


@pytest.mark.parametrize("change", ["labels", "identity", "missing", "options", "clue", "digest"])
def test_smellcule_lock_b_rejects_changes(
    published: tuple[Schedule, tuple[Molecule, ...]],
    change: str,
) -> None:
    deployed, molecules = published
    lock = merge_deployed_lock(empty_lock(), deployed, molecules, START_DATE)
    if change == "labels":
        molecules = (
            replace(molecules[0], measured=(1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0)),
            *molecules[1:],
        )
    elif change == "identity":
        molecules = (replace(molecules[0], inchikey="changed"), *molecules[1:])
    elif change == "missing":
        molecules = molecules[1:]
    elif change == "digest":
        entry = lock.puzzles[1]
        assert isinstance(entry, LockedPuzzle)
        lock = replace(lock, puzzles={**lock.puzzles, 1: replace(entry, sha256="0" * 64)})
    else:
        puzzle = deployed.puzzles[1]
        puzzle = (
            replace(puzzle, options=tuple(reversed(puzzle.options)))
            if change == "options"
            else replace(puzzle, clue=Clue(0, 0.4))
        )
        deployed = replace(deployed, puzzles={**deployed.puzzles, 1: puzzle})
    with pytest.raises(SmellculeError) as error:
        locked_puzzles(lock, deployed, molecules)
    assert error.value.exit_code == 1
    assert str(error.value) == (
        "error: puzzle 1 is locked and its molecule changed\n"
        "next: restore the pinned data or keep the locked puzzle"
    )


def test_smellcule_lock_c_retirement_after_launch_removes_molecule_fields(
    published: tuple[Schedule, tuple[Molecule, ...]],
) -> None:
    deployed, molecules = published
    lock = merge_deployed_lock(empty_lock(), deployed, molecules, START_DATE + timedelta(days=17))
    assert len(lock.puzzles) == 25
    retired = retire_lock(lock, START_DATE + timedelta(days=11))
    assert retired.retired_count == 19
    assert json.loads(retired.to_json()) == {
        "startDate": START_DATE.isoformat(),
        "puzzles": {str(i): {"retired": True} for i in range(1, 20)},
    }
    assert all(word not in retired.to_json() for word in ("molecule_id", "inchikey", "sha256"))


def test_smellcule_lock_d_retirement_before_launch(
    published: tuple[Schedule, tuple[Molecule, ...]],
) -> None:
    deployed, molecules = published
    exported_on = START_DATE - timedelta(days=DEPLOY_BUFFER_DAYS + 1)
    assert retire_lock(empty_lock(), exported_on).puzzles == {}
    merged = merge_deployed_lock(empty_lock(), deployed, molecules, exported_on)
    retired = retire_lock(merged, exported_on)
    assert retired.puzzles == {}
    assert retired.retired_count == 0


def test_smellcule_lock_first_export_and_reinstatement(
    published: tuple[Schedule, tuple[Molecule, ...]],
) -> None:
    deployed, molecules = published
    assert read_lock(Path("config/puzzles.lock.json")) == empty_lock()
    assert merge_deployed_lock(empty_lock(), None, (), START_DATE) == empty_lock()
    assert locked_puzzles(empty_lock(), None, molecules) == {}
    retired = PuzzleLock(START_DATE, {1: RetiredPuzzle(), 2: RetiredPuzzle()})
    continued = number_schedule(deployed, retired)
    assert min(continued.puzzles) == 3
    assert max(continued.puzzles) == 42
    assert continued.puzzles[3] == deployed.puzzles[1]


def test_smellcule_lock_rejects_start_date_changes(
    published: tuple[Schedule, tuple[Molecule, ...]],
) -> None:
    deployed, molecules = published
    with pytest.raises(SmellculeError, match="startDate"):
        merge_deployed_lock(
            empty_lock(), replace(deployed, start_date=date(2027, 1, 1)), molecules, START_DATE
        )


@pytest.mark.parametrize(
    "entry", [{"retired": 1}, {"retired": True, "molecule_id": "old"}, {"sha256": "bad"}]
)
def test_smellcule_lock_rejects_malformed_entries(tmp_path: Path, entry: object) -> None:
    path = tmp_path / "lock.json"
    path.write_text(
        json.dumps({"startDate": "2026-12-01", "puzzles": {"1": entry}}), encoding="utf-8"
    )
    with pytest.raises(ValueError, match="entry"):
        read_lock(path)
