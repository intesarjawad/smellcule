from __future__ import annotations

import json
import logging
import platform
from dataclasses import asdict
from importlib.metadata import version
from pathlib import Path
from time import perf_counter
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import argparse
    from collections.abc import Iterator

import numpy as np
import torch
from safetensors.torch import load, save

from smellcule import catalogue, sources
from smellcule.cli import is_result_object, read_results, update_results
from smellcule.cli.submission import evaluate_submission, write_splits
from smellcule.cross_validation import cross_validation
from smellcule.ensemble import Ensemble, model_from_config
from smellcule.experiment_data import prepare
from smellcule.experiments import RUNS, RunContext, RunOutput, binary_runs
from smellcule.map_evaluation import evaluate_map
from smellcule.report import write_report
from smellcule.training import TrainedModel, TrainingConfig


def selected_runs(value: str) -> tuple[str, ...]:
    """Validate named runs and numeric aliases before loading source data."""
    aliases: dict[str, str] = dict(
        zip(("1", "2", "3", "4", "5", "6", "7", "8", "11"), RUNS, strict=True)
    )
    selected = (
        RUNS
        if value == "all"
        else tuple(aliases.get(item.strip(), item.strip()) for item in value.split(","))
    )
    unknown = set(selected) - set(RUNS)
    if unknown:
        message = (
            f"Unknown runs: {', '.join(sorted(unknown))}. Map (9) and Chemprop (10) run separately."
        )
        raise ValueError(message)
    return tuple(run for run in RUNS if run in selected)


def prepare_context(args: argparse.Namespace, requested: tuple[str, ...]) -> RunContext:
    """Fetch pinned sources and construct row-aligned research inputs."""
    paths = {key: sources.fetch(key) for key in sources.load_sources()}
    labels, rows = catalogue.read_leffingwell(paths["leffingwell"])
    lf = prepare(rows, labels)
    labels, gslf_rows = catalogue.read_gslf(paths["gslf"])
    gslf = prepare(
        tuple(
            catalogue.CatalogueRow(str(i), "", "", row.smiles, row.measured, "train", 1)
            for i, row in enumerate(gslf_rows)
        ),
        labels,
    )
    keller_rows = catalogue.read_keller(
        paths["keller_molecules"], paths["keller_stimuli"], paths["keller_behavior"]
    )
    observed = np.array(
        [[value is not None for value in row.measured] for row in keller_rows], dtype=bool
    )
    keller = prepare(
        tuple(
            catalogue.CatalogueRow(
                row.molecule_id,
                row.name,
                row.cas,
                row.smiles,
                (0,) * len(catalogue.KELLER_DESCRIPTORS),
                "train",
                1,
            )
            for row in keller_rows
        ),
        catalogue.KELLER_DESCRIPTORS,
        [[0.0 if value is None else value for value in row.measured] for row in keller_rows],
    )
    return RunContext(
        lf,
        gslf,
        keller,
        observed,
        requested,
        args.ensemble_size,
        torch.device(args.device),
        TrainingConfig(),
        evaluate=args.command != "train",
    )


def save_ensemble(path: Path, ensemble: Ensemble, context: RunContext) -> None:
    """Save members, configuration and descriptor order for local evaluation."""
    path.mkdir(parents=True, exist_ok=True)
    (path / "model.safetensors").write_bytes(
        save(
            {
                f"seed{seed}.{key}": value.cpu().contiguous()
                for seed, member in enumerate(ensemble.members)
                for key, value in member.model.state_dict().items()
            }
        )
    )
    source_hashes = {key: value.sha256 for key, value in sources.load_sources().items()}
    source = (
        "keller_behavior"
        if path.name == "smellcule-open" or "keller_cv" in path.parts
        else "gslf"
        if "gslf_cv" in path.parts
        else "leffingwell"
    )
    metadata = {
        "arch": "OdourMPNN",
        "version": 1,
        "feature_spec": "atom34-bond10-v1",
        "labels_file": "labels.json",
        "training_split": "cluster-v1" if path.name == "cluster" else path.name,
        "rdkit": version("rdkit"),
        "data_sha256": source_hashes[source],
        "source_sha256": source_hashes,
        "hidden": context.config.hidden,
        "steps": context.config.steps,
        "embed_dim": context.config.embed_dim,
        "dropout": context.config.dropout,
        "config": asdict(context.config),
        "ensemble_size": len(ensemble.members),
        "members": [
            {
                "best_epoch": member.best_epoch,
                "validation_score": member.validation_auroc,
                "wall_time_s": member.wall_time_s,
            }
            for member in ensemble.members
        ],
        "n_labels": ensemble.members[0].model.head.linear.out_features,
    }
    (path / "config.json").write_text(
        json.dumps(metadata, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )
    labels = (
        context.keller.labels
        if path.name == "smellcule-open" or "keller_cv" in path.parts
        else context.gslf.labels
        if "gslf_cv" in path.parts
        else context.lf.labels
    )
    (path / "labels.json").write_text(json.dumps(labels) + "\n", encoding="utf-8")


def load_ensemble(path: Path, context: RunContext) -> Ensemble:
    """Restore local members strictly, rejecting mismatched experiment settings."""
    metadata = json.loads((path / "config.json").read_text(encoding="utf-8"))
    labels = (
        context.keller.labels
        if path.name == "smellcule-open" or "keller_cv" in path.parts
        else context.gslf.labels
        if "gslf_cv" in path.parts
        else context.lf.labels
    )
    saved_labels = json.loads((path / "labels.json").read_text(encoding="utf-8"))
    if saved_labels != list(labels) or metadata["n_labels"] != len(labels):
        message = f"Checkpoint descriptor order differs at {path}; run smellcule train again."
        raise ValueError(message)
    if metadata["ensemble_size"] != context.ensemble_size or metadata["config"] != asdict(
        context.config
    ):
        message = (
            f"Checkpoint configuration differs at {path}; "
            "run smellcule train with matching options."
        )
        raise ValueError(message)
    tensors = load((path / "model.safetensors").read_bytes())
    members: list[TrainedModel] = []
    for seed, record in enumerate(metadata["members"]):
        model = model_from_config(metadata["n_labels"], context.config).to(context.device)
        prefix = f"seed{seed}."
        model.load_state_dict(
            {
                key.removeprefix(prefix): value
                for key, value in tensors.items()
                if key.startswith(prefix)
            }
        )
        model.eval()
        members.append(
            TrainedModel(
                model, record["best_epoch"], record["validation_score"], record["wall_time_s"], ()
            )
        )
    return Ensemble(tuple(members))


def _checkpoint_names(requested: tuple[str, ...]) -> list[str]:
    names: list[str] = []
    if set(requested) & {"official", "official_minus_leaked"}:
        names.append("official")
    if set(requested) & {"cluster", "cross_source", "calibration", "domain", "stereo_pairs"}:
        names.append("cluster")
    for run in ("gslf_cv", "keller_cv"):
        if run in requested:
            names.extend(f"{run}/fold{fold}" for fold in range(5))
    if "keller_cv" in requested:
        names.append("smellcule-open")
    return names


def _outputs(context: RunContext) -> Iterator[RunOutput]:

    yield from binary_runs(context)
    for run in ("gslf_cv", "keller_cv"):
        if run in context.requested:
            yield from cross_validation(context, run)


def _versions() -> dict[str, str]:
    return {
        "python": platform.python_version(),
        **{package: version(package) for package in ("numpy", "torch", "rdkit", "scikit-learn")},
    }


def _warn_versions(path: Path) -> None:
    if not path.exists():
        return
    for entry in read_results(path).values():
        if not is_result_object(entry):
            continue
        recorded = entry.get("versions")
        if is_result_object(recorded):
            for package, installed in _versions().items():
                if package in recorded and installed != recorded[package]:
                    print(
                        f"warning: {package} {installed} differs from {recorded[package]}; "
                        "numbers may differ in the third decimal"
                    )
                    print("next: uv sync --locked")
            break


def _validate_device(args: argparse.Namespace) -> None:
    if args.ensemble_size < 1 or args.threads < 1:
        message = "Ensemble size and thread count must be positive."
        raise ValueError(message)
    if args.device == "mps" and not torch.backends.mps.is_available():
        message = "MPS is unavailable; use --device cpu."
        raise ValueError(message)
    if args.device == "cuda" and not torch.cuda.is_available():
        message = "CUDA is unavailable; use --device cpu."
        raise ValueError(message)


def run_map(args: argparse.Namespace) -> None:
    """Evaluate the exported map without training or replacing other experiment results."""
    started = perf_counter()
    result = evaluate_map(args.bundle, args.artifacts / "atlas-map.npz")
    metadata = read_results(args.artifacts / "cluster/config.json")
    result.update(
        wall_time_s=perf_counter() - started,
        ensemble_size=metadata["ensemble_size"],
        machine=platform.platform(),
        versions=_versions(),
    )
    update_results(args.results, {"map": result})
    write_report(read_results(args.results), args.report)
    print(f"Results: {args.results}")


def run_research(args: argparse.Namespace) -> None:
    """Run requested experiments and persist only completed stage evidence."""
    if args.command == "splits":
        write_splits(args)
        return
    if args.command == "evaluate" and args.predictions is not None:
        evaluate_submission(args)
        return
    _validate_device(args)
    torch.set_num_threads(args.threads)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    requested = selected_runs(args.run or args.runs)
    _warn_versions(args.results if args.results.exists() else Path("eval/results.json"))
    context = prepare_context(args, requested)
    if args.command == "evaluate":
        context.checkpoints = {
            name: load_ensemble(args.artifacts / name, context)
            for name in _checkpoint_names(requested)
        }
    saved: set[str] = set()
    for output in _outputs(context):
        for name, ensemble in output.ensembles.items():
            if name not in saved and args.command != "evaluate":
                save_ensemble(args.artifacts / name, ensemble, context)
                saved.add(name)
        args.artifacts.mkdir(parents=True, exist_ok=True)
        for name, arrays in output.arrays.items():
            np.savez_compressed(args.artifacts / f"{name}.npz", allow_pickle=False, **arrays)
        if output.name and args.command != "train":
            output.result.update(
                machine=platform.platform(),
                versions=_versions(),
                device=args.device,
                threads=args.threads,
            )
            update_results(args.results, {output.name: output.result})
    if args.command != "train":
        write_report(read_results(args.results), args.report)
        print(f"Results: {args.results}")
