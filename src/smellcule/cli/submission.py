from __future__ import annotations

import csv
import json
import tomllib
from dataclasses import asdict
from typing import TYPE_CHECKING

import numpy as np

from smellcule import catalogue, sources, splits
from smellcule.cli import is_result_object, read_results, update_results
from smellcule.evaluation import classification_summary
from smellcule.metrics import BootstrapConfig, bootstrap_auroc
from smellcule.molecules import Molecule, standardise
from smellcule.submissions import (
    MAX_PREDICTIONS_BYTES,
    SubmissionError,
    SubmissionMetadata,
    validate_metadata,
    validate_predictions,
)

if TYPE_CHECKING:
    import argparse
    from pathlib import Path

    from smellcule.metrics import FloatArray


def load_catalogue() -> tuple[tuple[str, ...], tuple[Molecule, ...]]:
    """Use the hash-checked Leffingwell source independently of the released bundle."""
    labels, rows = catalogue.read_leffingwell(sources.fetch("leffingwell"))
    return labels, tuple(standardise(row) for row in rows)


def _metadata(args: argparse.Namespace) -> SubmissionMetadata:
    flags = {"name": args.name, "licence": args.licence, "source_url": args.source_url}
    if args.meta is None:
        return validate_metadata(flags)
    if any(value is not None for value in flags.values()):
        raise SubmissionError(1, "meta", "use --meta or all three attribution flags, never both")
    try:
        with args.meta.open("rb") as source:
            fields = tomllib.load(source)
    except (tomllib.TOMLDecodeError, UnicodeDecodeError) as error:
        raise SubmissionError(1, "meta", f"invalid TOML: {error}") from error
    return validate_metadata(fields)


def write_splits(args: argparse.Namespace) -> None:
    """Export catalogue-keyed assignments and descriptor order for local submissions."""
    labels, molecules = load_catalogue()
    cluster = splits.cluster_split(molecules)
    args.out.mkdir(parents=True, exist_ok=True)
    for filename, assignments in (
        ("official.csv", splits.official_split(molecules)),
        ("cluster-v1.csv", cluster.assignments),
    ):
        with (args.out / filename).open("w", encoding="utf-8", newline="") as destination:
            writer = csv.writer(destination)
            writer.writerow(("inchikey", "split"))
            writer.writerows(
                (row.inchikey, assignment)
                for row, assignment in zip(molecules, assignments, strict=True)
            )
    (args.out / "labels.json").write_text(json.dumps(labels) + "\n", encoding="utf-8")
    print(f"Splits: {args.out}")


def network_predictions(
    path: Path,
    labels: tuple[str, ...],
    molecules: tuple[Molecule, ...],
    assignments: tuple[splits.Split, ...],
) -> FloatArray:
    """Load saved network probabilities only when their evaluation alignment matches."""
    with np.load(path, allow_pickle=False) as archive:
        if (
            not np.array_equal(archive["molecule_id"], [row.molecule_id for row in molecules])
            or not np.array_equal(archive["labels"], labels)
            or not np.array_equal(archive["split"], assignments)
        ):
            message = f"Network artifact {path} does not match catalogue rows, labels or split."
            raise ValueError(message)
        probabilities = np.asarray(archive["prob"], dtype=np.float64)
    if (
        probabilities.shape != (len(molecules), len(labels))
        or not np.isfinite(probabilities).all()
        or ((probabilities < 0) | (probabilities > 1)).any()
    ):
        message = f"Network artifact {path} must contain a row-by-label probability matrix."
        raise ValueError(message)
    return probabilities


def evaluate_submission(args: argparse.Namespace) -> None:
    """Score validated probabilities and replace only this submitter's named entry."""
    metadata = _metadata(args)
    with args.predictions.open("rb") as source:
        content = source.read(MAX_PREDICTIONS_BYTES + 1)
    if len(content) > MAX_PREDICTIONS_BYTES:
        raise SubmissionError(1, "file", "exceeds the 20 MB limit")
    labels, molecules = load_catalogue()
    cluster = splits.cluster_split(molecules)
    assignments = {
        "official": splits.official_split(molecules),
        "cluster": cluster.assignments,
    }
    selected = (args.split,) if args.split else ("official", "cluster")
    required = {
        molecule.inchikey
        for name in selected
        for molecule, split in zip(molecules, assignments[name], strict=True)
        if split == "held_out"
    }
    predictions = validate_predictions(
        content, labels, {row.inchikey for row in molecules}, required
    )
    groups = np.empty(len(molecules), dtype=np.int64)
    for group, indices in enumerate(cluster.clusters):
        groups[list(indices)] = group
    entry: dict[str, object] = asdict(metadata)
    for name in selected:
        train = [i for i, split in enumerate(assignments[name]) if split == "train"]
        test = [i for i, split in enumerate(assignments[name]) if split == "held_out"]
        targets = np.array([molecules[i].measured for i in test], dtype=np.float64)
        scores = np.array([predictions[molecules[i].inchikey] for i in test], dtype=np.float64)
        sampling_groups = groups[test] if name == "cluster" else None
        summary = classification_summary(targets, scores, sampling_groups)
        network_path = args.artifacts / f"{name}.npz"
        if network_path.exists():
            network = network_predictions(network_path, labels, molecules, assignments[name])[test]
            for support, minimum in (("all_labels", 1), ("stable_labels", 5)):
                supported = summary[support]
                if is_result_object(supported):
                    supported["network_minus_submission_auroc_ci"] = (
                        asdict(
                            bootstrap_auroc(
                                targets,
                                network,
                                comparison=scores,
                                groups=sampling_groups,
                                config=BootstrapConfig(min_positives=minimum),
                            )
                        )
                        if supported["label_count"]
                        else None
                    )
        entry[name] = {
            **summary,
            "molecule_count": len(test),
            "labels": list(labels),
            "train_positive_counts": np.array([molecules[i].measured for i in train])
            .sum(axis=0)
            .tolist(),
            "test_positive_counts": targets.sum(axis=0).tolist(),
            "test_prevalence": targets.mean(axis=0).tolist(),
            "mean_prevalence": float(targets.mean()),
        }
    existing = read_results(args.results).get("submissions", {})
    if not is_result_object(existing):
        message = "Results submissions entry must be a JSON object."
        raise ValueError(message)
    update_results(args.results, {"submissions": {**existing, metadata.name: entry}})
    print(json.dumps({metadata.name: entry}, indent=2, allow_nan=False))
