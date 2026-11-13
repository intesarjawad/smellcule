import hashlib
from dataclasses import asdict
from datetime import date
from pathlib import Path

import numpy as np

from smellcule import catalogue, sources
from smellcule.cli import read_results
from smellcule.export.bundle import encode_json
from smellcule.export.bundle_inputs import BundleInputs
from smellcule.export.bundle_stats import numeric
from smellcule.export.content import mapping, sequence
from smellcule.export.embeddings import model_embeddings
from smellcule.export.keller_rows import LABELS, fixture_rows, measured_rows
from smellcule.export.neighbours import build_neighbours
from smellcule.export.projection import project
from smellcule.export.smellcule_lock import read_lock, retire_lock
from smellcule.molecules import standardise
from smellcule.resources import resource_path

FIXTURE_OUTPUTS = "tests/fixtures/keller_fixture_model_outputs.json"
MAP_ARTIFACT = "artifacts/keller-map.npz"


def load_real(root: Path, exported_on: date) -> BundleInputs:
    """Use fold-held-out card evidence and the final model's navigation embedding."""
    source_rows = catalogue.read_keller(
        sources.fetch("keller_molecules"),
        sources.fetch("keller_stimuli"),
        sources.fetch("keller_behavior"),
    )
    rows = measured_rows(source_rows)
    molecules = tuple(standardise(row) for row in rows)
    with np.load(root / "artifacts/keller_oof.npz", allow_pickle=False) as saved:
        cids = saved["cid"].tolist()
        if set(cids) != {row.molecule_id for row in rows} or len(cids) != len(rows):
            message = "Keller out-of-fold CIDs differ from the catalogue."
            raise ValueError(message)
        if not np.array_equal(saved["labels"], catalogue.KELLER_DESCRIPTORS):
            message = "Keller out-of-fold labels differ from the catalogue."
            raise ValueError(message)
        indices = [cids.index(row.molecule_id) for row in rows]
        prob = np.asarray(saved["prob"][indices], dtype=np.float64)
        spread = np.asarray(saved["spread"][indices], dtype=np.float64)
        nearest = tuple(float(v) for v in saved["nearest_train_similarity"][indices])
        folds = saved["fold"][indices]
        if not np.isin(folds, np.arange(5)).all():
            message = "Keller out-of-fold assignments must identify one of five folds."
            raise ValueError(message)
    embeddings = model_embeddings(root, rows, catalogue.KELLER_DESCRIPTORS, "smellcule-open")
    positions = project(embeddings)
    np.savez_compressed(
        root / MAP_ARTIFACT,
        molecule_id=np.array([r.molecule_id for r in rows]),
        labels=np.array(LABELS),
        embeddings=embeddings,
        positions=positions,
    )
    results = mapping(read_results(root / "eval/results.json")["keller_cv"])
    counts = read_results(root / "eval/data_counts.json")
    stats: dict[str, object] = {
        "keller_cv.mean_pearson": numeric(results["mean_pearson"]),
        "keller_molecules": numeric(counts["keller_molecules"]),
        "keller_descriptors": numeric(counts["keller_descriptors"]),
        "retiredPuzzles": retire_lock(
            read_lock(resource_path(root, "config/puzzles.lock.json")), exported_on
        ).retired_count,
    }
    with (root / "artifacts/smellcule-open/model.safetensors").open("rb") as source:
        revision = hashlib.file_digest(source, "sha256").hexdigest()
    return BundleInputs(
        LABELS,
        rows,
        molecules,
        ("cross_validated",) * len(rows),
        nearest,
        prob,
        spread,
        positions,
        build_neighbours(molecules, embeddings),
        stats,
        {"id": "smellcule-open", "licence": "CC-BY-4.0", "revision": revision},
        {},
        "keller",
    )


def write_fixture_outputs(root: Path, bundle: Path) -> None:
    """Record real fold evidence and rerank navigation neighbours within the fixture."""
    atlas = read_results(bundle / "atlas.json")
    if atlas["catalogue"] != "keller":
        message = "Keller fixture recording requires a Keller bundle."
        raise ValueError(message)
    if sequence(atlas["labels"]) != list(LABELS):
        message = "Keller bundle labels differ from the catalogue."
        raise ValueError(message)
    rows = measured_rows(fixture_rows(root))
    with np.load(root / MAP_ARTIFACT, allow_pickle=False) as saved:
        ids = saved["molecule_id"].tolist()
        if not np.array_equal(saved["labels"], LABELS) or [str(i) for i in range(len(ids))] != [
            mapping(row)["id"] for row in sequence(atlas["molecules"])
        ]:
            message = "Keller map rows or labels differ from the real bundle."
            raise ValueError(message)
        indices = [ids.index(row.molecule_id) for row in rows]
        embeddings = np.asarray(saved["embeddings"][indices], dtype=np.float64)
        positions = saved["positions"][indices]
    neighbours = build_neighbours(tuple(standardise(row) for row in rows), embeddings)
    with np.load(root / "artifacts/keller_oof.npz", allow_pickle=False) as saved:
        if not np.array_equal(saved["labels"], catalogue.KELLER_DESCRIPTORS):
            message = "Keller out-of-fold labels differ from the catalogue."
            raise ValueError(message)
        cids = saved["cid"].tolist()
        indices = [cids.index(row.molecule_id) for row in rows]
        prob = saved["prob"][indices]
        spread = saved["spread"][indices]
        nearest = saved["nearest_train_similarity"][indices]
    document = {
        "labels": LABELS,
        "model": atlas["model"],
        "stats": atlas["stats"],
        "smellcule": {},
        "molecules": {
            row.molecule_id: {
                "split": "cross_validated",
                "nearestTrainSimilarity": round(float(nearest[i]), 6),
                "prob": prob[i].astype(np.float64).round(6).tolist(),
                "spread": spread[i].astype(np.float64).round(6).tolist(),
                "position": positions[i].astype(np.float64).round(6).tolist(),
                "neighbours": [
                    {
                        key: round(value, 6) if isinstance(value, float) else value
                        for key, value in asdict(n).items()
                    }
                    for n in neighbours[i]
                ],
            }
            for i, row in enumerate(rows)
        },
    }
    (root / FIXTURE_OUTPUTS).write_bytes(encode_json(document))
