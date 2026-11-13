from dataclasses import replace
from datetime import timedelta
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np
import pytest

from smellcule.catalogue import read_leffingwell
from smellcule.export.content import strings
from smellcule.export.smellcule import (
    START_DATE,
    Clue,
    Puzzle,
    ScheduleInputs,
    SmellculeError,
    build_schedule,
    distractor_scores,
    filter_distractors,
)
from smellcule.export.smellcule_clues import build_clues
from smellcule.export.smellcule_export import Publication, compile_smellcule, retire_smellcule
from smellcule.export.smellcule_lock import empty_lock
from smellcule.families import Family
from smellcule.molecules import standardise

if TYPE_CHECKING:
    from smellcule.splits import Split


@pytest.fixture
def synthetic_inputs() -> tuple[ScheduleInputs, tuple[Family, ...]]:
    labels = tuple(f"label{i}" for i in range(32))
    _, rows = read_leffingwell(Path(__file__).parent / "fixtures/leffingwell_fixture.csv")
    base = standardise(rows[0])
    rng = np.random.default_rng(14)
    answers = [set(rng.choice(16, 3, replace=False).tolist()) for _ in range(400)]
    molecules = tuple(
        replace(base, molecule_id=str(i), measured=tuple(int(j in answer) for j in range(32)))
        for i, answer in enumerate(answers)
    )
    # Training rows give the other family positive catalogue frequencies.
    training = tuple(
        replace(base, molecule_id=f"train{i}", measured=tuple(int(j == i) for j in range(32)))
        for i in range(16, 32)
    )
    molecules += training
    predictions = np.array([row.measured for row in molecules], dtype=np.float64) * 0.9
    assignments: tuple[Split, ...] = ("held_out",) * 400 + ("train",) * 16
    inputs = ScheduleInputs(molecules, labels, assignments, predictions, (Clue(400, 0.5),) * 416)
    families = (Family("first", "#FFFFFF", labels[:16]), Family("second", "#FFFFFF", labels[16:]))
    return inputs, families


def test_smellcule_seeded_schedule_and_options(
    synthetic_inputs: tuple[ScheduleInputs, tuple[Family, ...]],
) -> None:
    inputs, families = synthetic_inputs
    first = build_schedule(inputs, families)
    assert first == build_schedule(inputs, families)
    assert len(first.schedule.puzzles) == 400
    assert first.schedule.start_date == START_DATE
    by_id = {row.molecule_id: row for row in inputs.molecules}
    for puzzle in first.schedule.puzzles.values():
        assert len(puzzle.options) == len(set(puzzle.options)) == 12
        assert len(puzzle.answer) == 3
        assert set(puzzle.answer) <= set(puzzle.options)
        assert puzzle.answer == tuple(
            i for i, value in enumerate(by_id[puzzle.molecule_id].measured) if value
        )
    # Half-share options leak this synthetic answer; widening the share removes the shortcut.
    assert first.counts["smellcule_all_same_family"] is True
    assert first.counts["smellcule_dropped_three"] == []
    assert first.counts["smellcule_dropped_two"] == []


def test_smellcule_eligibility_uses_cluster_split_and_excludes_odorless(
    synthetic_inputs: tuple[ScheduleInputs, tuple[Family, ...]],
) -> None:
    inputs, families = synthetic_inputs
    labels = (*inputs.labels, "odorless")
    molecules = tuple(replace(row, measured=(*row.measured, 0)) for row in inputs.molecules)
    molecules = (replace(molecules[0], measured=(*molecules[0].measured[:-1], 1)), *molecules[1:])
    molecules = (molecules[0], replace(molecules[1], measured=(1, 1, *((0,) * 31))), *molecules[2:])
    changed = replace(
        inputs,
        labels=labels,
        molecules=molecules,
        predictions=np.column_stack((inputs.predictions, np.zeros(416))),
    )
    result = build_schedule(changed, families)
    ids = {p.molecule_id for p in result.schedule.puzzles.values()}
    assert "0" not in ids
    assert "1" not in ids
    assert len(ids) == 398
    assert all(not name.startswith("train") for name in ids)


def puzzles_with_hits(hits: int, count: int, prefix: str) -> list[Puzzle]:
    answers = {0: (9, 10, 11), 2: (0, 1, 11), 3: (0, 1, 2)}
    return [
        Puzzle(f"{prefix}{i}", tuple(range(12)), answers[hits], Clue(0, 0.5)) for i in range(count)
    ]


def test_smellcule_distractor_exact_random_mean_and_rarest_family_ties() -> None:
    puzzle = Puzzle("one", tuple(range(12)), (0, 1, 2, 12), Clue(0, 0.5))
    scores = distractor_scores([puzzle], tuple(range(1, 14)), dict.fromkeys(range(13), "same"))
    assert scores.strategy == (3,)
    assert scores.random_mean == 0.75
    assert not scores.passes
    families = {i: "rare" if i < 6 else "common" for i in range(13)}
    assert distractor_scores([puzzle], tuple(range(1, 14)), families).strategy == (3,)


@pytest.mark.parametrize("two_count", [0, 800])
def test_smellcule_distractor_fallback_drops_three_then_two(two_count: int) -> None:
    labels = tuple(f"label{i}" for i in range(36))
    _, rows = read_leffingwell(Path(__file__).parent / "fixtures/leffingwell_fixture.csv")
    base = standardise(rows[0])
    groups = (
        ("good", 400, {0, 1, 2}),
        ("three", 400, {12, 13, 14}),
        ("two", two_count, {24, 25, 35}),
        ("train", 900, {*range(15, 24), *range(26, 36)}),
        ("rare", 1, set(range(3, 12))),
    )
    molecules = tuple(
        replace(
            base, molecule_id=f"{prefix}{i}", measured=tuple(int(j in answer) for j in range(36))
        )
        for prefix, count, answer in groups
        for i in range(count)
    )
    held_out = 800 + two_count
    assignments: tuple[Split, ...] = ("held_out",) * held_out + ("train",) * 901
    inputs = ScheduleInputs(
        molecules,
        labels,
        assignments,
        np.array([row.measured for row in molecules], dtype=np.float64) * 0.9,
        (Clue(held_out, 0.5),) * len(molecules),
    )
    families = tuple(Family(str(i), "#FFFFFF", labels[i : i + 12]) for i in (0, 12, 24))
    result = build_schedule(inputs, families)
    assert len(result.schedule.puzzles) == 400
    assert sorted(strings(result.counts["smellcule_dropped_three"])) == sorted(
        f"three{i}" for i in range(400)
    )
    assert sorted(strings(result.counts["smellcule_dropped_two"])) == sorted(
        f"two{i}" for i in range(two_count)
    )
    assert result.counts["smellcule_all_same_family"] is True
    assert result.counts["smellcule_strategy_mean"] == 0
    assert result.counts["smellcule_random_mean"] == 0.75


def test_smellcule_distractor_failure_contract_and_locked_puzzles() -> None:
    puzzles = puzzles_with_hits(3, 400, "locked")
    with pytest.raises(
        SmellculeError, match=r"strategy mean 3\.000000, random 0\.750000, 400 puzzles left"
    ) as error:
        filter_distractors(
            puzzles,
            tuple(range(1, 13)),
            dict.fromkeys(range(12), "same"),
            frozenset(p.molecule_id for p in puzzles),
        )
    assert error.value.exit_code == 1
    assert str(error.value).splitlines()[1] == (
        "next: ship Smellcule with the remaining puzzles, or edit config/families.yaml"
    )
    with pytest.raises(SmellculeError):
        filter_distractors(
            puzzles_with_hits(0, 364, "short"),
            tuple(range(1, 13)),
            dict.fromkeys(range(12), "same"),
        )


def test_smellcule_clues_choose_training_structure_and_stable_ties() -> None:
    _, rows = read_leffingwell(Path(__file__).parent / "fixtures/leffingwell_fixture.csv")
    base = standardise(rows[0])
    molecules = (base, replace(base, molecule_id="identical"), standardise(rows[1]))
    clues = build_clues(molecules, ("held_out", "train", "train"))
    assert clues[0] == Clue(1, 1.0)
    assert clues[2] == Clue(2, 1.0)
    with pytest.raises(ValueError, match="training"):
        build_clues(molecules, ("held_out",) * 3)


def test_smellcule_export_lifecycle(
    synthetic_inputs: tuple[ScheduleInputs, tuple[Family, ...]],
) -> None:
    inputs, families = synthetic_inputs
    publication = Publication(empty_lock(), None, (), START_DATE - timedelta(days=10))
    first = compile_smellcule(inputs, families, publication)
    assert first.lock.puzzles == {}
    assert first.schedule is not None
    early_keller = retire_smellcule(
        replace(publication, deployed=first.schedule, deployed_molecules=inputs.molecules)
    )
    assert early_keller.schedule is None
    assert early_keller.lock.puzzles == {}
    assert early_keller.counts["retiredPuzzles"] == 0
    later = Publication(
        first.lock, first.schedule, inputs.molecules, START_DATE + timedelta(days=19)
    )
    second = compile_smellcule(inputs, families, later)
    assert second.schedule is not None
    assert len(second.lock.puzzles) == 27
    for number in range(1, 28):
        assert (
            second.schedule.puzzles[number].canonical_json()
            == first.schedule.puzzles[number].canonical_json()
        )
    keller = retire_smellcule(replace(later, exported_on=START_DATE + timedelta(days=11)))
    assert keller.schedule is None
    assert keller.counts["retiredPuzzles"] == 19


@pytest.mark.parametrize(
    "bad_clue", [Clue(-1, 0.5), Clue(0, 0.5), Clue(400, float("nan")), Clue(400, 1.1)]
)
def test_smellcule_rejects_invalid_clues(
    synthetic_inputs: tuple[ScheduleInputs, tuple[Family, ...]],
    bad_clue: Clue,
) -> None:
    inputs, families = synthetic_inputs
    with pytest.raises(ValueError, match="clues must identify training"):
        build_schedule(replace(inputs, clues=(bad_clue, *inputs.clues[1:])), families)
