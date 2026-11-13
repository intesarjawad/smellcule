from argparse import Namespace
from pathlib import Path

import numpy as np
import pytest
import torch

from smellcule import catalogue, sources
from smellcule.cli import update_results
from smellcule.export.notes import load_notes
from smellcule.export.phrases import load_phrases
from smellcule.export.smellcule import (
    ScheduleInputs,
    build_schedule,
    distractor_scores,
    family_indices,
    label_frequencies,
)
from smellcule.export.smellcule_clues import build_clues
from smellcule.families import load_families
from smellcule.splits import cluster_split

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.data
def test_notes_phrases_families_real_catalogue() -> None:
    labels, rows = catalogue.read_leffingwell(
        sources.fetch("leffingwell", cache_dir=ROOT / ".cache/smellcule")
    )
    assert len(load_families(ROOT / "config/families.yaml", labels)) == 13
    notes = load_notes(ROOT / "config/notes.yaml", labels, rows)
    assert len(notes.notes) == 42
    assert sum(len(note.molecules) for note in notes.notes) == 91
    phrases = load_phrases(ROOT / "config/phrases.yaml", labels, rows)
    assert len(phrases) == 82
    assert len([phrase for phrase in phrases if phrase.exemplar]) == 5


@pytest.mark.data
def test_smellcule_real_schedule_and_distractors(monkeypatch: pytest.MonkeyPatch) -> None:
    from smellcule.cli.research import load_ensemble, prepare_context

    monkeypatch.setenv("SMELLCULE_CACHE", str(ROOT / ".cache/smellcule"))
    previous_threads = torch.get_num_threads()
    torch.set_num_threads(4)
    try:
        context = prepare_context(
            Namespace(ensemble_size=10, device="cpu", command="evaluate"), ("cluster",)
        )
        data = context.lf
        assignments = cluster_split(data.molecules).assignments
        predictions, _ = load_ensemble(ROOT / "artifacts/cluster", context).predict(
            data.dataset, context.device
        )
        clues = build_clues(data.molecules, assignments)
        families = load_families(ROOT / "config/families.yaml", data.labels)
        result = build_schedule(
            ScheduleInputs(data.molecules, data.labels, assignments, predictions, clues), families
        )
    finally:
        torch.set_num_threads(previous_threads)
    puzzles = tuple(result.schedule.puzzles.values())
    assert len(puzzles) >= 365
    assert len({p.molecule_id for p in puzzles}) == len(puzzles)
    by_id = {row.molecule_id: i for i, row in enumerate(data.molecules)}
    frequencies = label_frequencies(data.molecules, data.labels)
    scores = distractor_scores(puzzles, frequencies, family_indices(families, data.labels))
    assert scores.strategy_mean <= scores.random_mean + 0.3
    for puzzle in puzzles:
        index = by_id[puzzle.molecule_id]
        assert assignments[index] == "held_out"
        assert len(puzzle.answer) >= 3
        assert len(set(puzzle.options)) == 12
        rarest = sorted(puzzle.answer, key=lambda i: (frequencies[i], i))[:6]
        top = np.argsort(-predictions[index], kind="stable")[:3].tolist()
        assert set(rarest + top) <= set(puzzle.options)
        assert set(puzzle.options) & set(puzzle.answer) <= set(rarest + top)
        assert assignments[puzzle.clue.molecule_index] == "train"
        assert 0 <= puzzle.clue.similarity <= 1
    update_results(ROOT / "eval/data_counts.json", dict(result.counts))
