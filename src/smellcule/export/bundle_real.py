import hashlib
import json
from datetime import date
from pathlib import Path

import numpy as np

from smellcule import catalogue, sources, splits
from smellcule.cli import read_results
from smellcule.export import keller
from smellcule.export.bundle_inputs import (
    BundleInputs,
    CatalogueName,
)
from smellcule.export.bundle_stats import collect_stats
from smellcule.export.embeddings import model_embeddings
from smellcule.export.neighbours import build_neighbours, nearest_train_similarities
from smellcule.export.projection import project
from smellcule.export.smellcule import ScheduleInputs
from smellcule.export.smellcule_clues import build_clues
from smellcule.export.smellcule_export import Publication, compile_smellcule
from smellcule.export.smellcule_lock import read_lock
from smellcule.families import load_families
from smellcule.molecules import standardise
from smellcule.resources import resource_path


def load_real(
    root: Path, exported_on: date, catalogue_name: CatalogueName = "leffingwell"
) -> BundleInputs:
    """Read aligned evaluation outputs and project embeddings from the saved cluster ensemble."""
    if catalogue_name == "keller":
        return keller.load_real(root, exported_on)
    labels, rows = catalogue.read_leffingwell(sources.fetch("leffingwell"))
    molecules = tuple(standardise(row) for row in rows)
    assignments = splits.cluster_split(molecules).assignments
    stats = collect_stats(
        read_results(root / "eval/results.json"), read_results(root / "eval/data_counts.json")
    )
    with np.load(root / "artifacts/cluster.npz", allow_pickle=False) as saved:
        if not (
            np.array_equal(saved["molecule_id"], [row.molecule_id for row in rows])
            and np.array_equal(saved["labels"], labels)
            and np.array_equal(saved["split"], assignments)
        ):
            message = "Cluster predictions differ from catalogue row, label or split order."
            raise ValueError(message)
        prob = np.asarray(saved["prob"], dtype=np.float64)
        spread = np.asarray(saved["spread"], dtype=np.float64)
    embeddings = model_embeddings(root, rows, labels)
    positions = project(embeddings)
    families = load_families(resource_path(root, "config/families.yaml"), labels)
    result = compile_smellcule(
        ScheduleInputs(molecules, labels, assignments, prob, build_clues(molecules, assignments)),
        families,
        Publication(
            read_lock(resource_path(root, "config/puzzles.lock.json")), None, (), exported_on
        ),
    )
    smellcule: dict[str, object] = {
        "startDate": result.lock.start_date.isoformat(),
        "puzzles": [json.loads(p.canonical_json()) for p in result.schedule.puzzles.values()]
        if result.schedule
        else [],
    }
    stats["retiredPuzzles"] = result.lock.retired_count
    with (root / "artifacts/cluster/model.safetensors").open("rb") as source:
        revision = hashlib.file_digest(source, "sha256").hexdigest()
    np.savez_compressed(
        root / "artifacts/atlas-map.npz",
        molecule_id=np.array([r.molecule_id for r in rows]),
        labels=np.array(labels),
        embeddings=embeddings,
        positions=positions,
    )
    return BundleInputs(
        labels,
        rows,
        molecules,
        assignments,
        nearest_train_similarities(molecules, assignments),
        prob,
        spread,
        positions,
        build_neighbours(molecules, embeddings),
        stats,
        {"id": "smellcule-lf", "licence": "CC-BY-NC-4.0", "revision": revision},
        smellcule,
    )


def write_fixture_outputs(
    root: Path, bundle: Path, catalogue_name: CatalogueName = "leffingwell"
) -> None:
    """Record the permissively licensed Keller fixture only."""
    if catalogue_name == "keller":
        keller.write_fixture_outputs(root, bundle)
        return
    message = "Leffingwell fixture recording is disabled; run scripts/generate_fixtures.py."
    raise ValueError(message)
