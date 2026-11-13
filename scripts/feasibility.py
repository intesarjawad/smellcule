import argparse
import json
import logging
import platform
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path
from time import perf_counter

import numpy as np
import torch
from rdkit import Chem
from safetensors.torch import save

from smellcule import catalogue, sources, splits
from smellcule.features import GraphArrays, featurise
from smellcule.molecules import standardise
from smellcule.training import (
    TrainingConfig,
    TrainingSet,
    macro_auroc,
    predict_probabilities,
    train_one_seed,
)

GATE_AUROC = 0.86
GS_LF_BUDGET_S = 4 * 60 * 60


def main() -> None:
    """Measure the official-split feasibility gate without running an ensemble."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", choices=("cpu", "mps", "cuda"), default="cpu")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--retry", action="store_true", help="Use the prescribed larger network.")
    parser.add_argument("--out", type=Path, default=Path("eval/feasibility-default.json"))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
    device = torch.device(args.device)
    if device.type == "mps" and not torch.backends.mps.is_available():
        parser.error("MPS is unavailable in this session; run with --device cpu.")
    if device.type == "cuda" and not torch.cuda.is_available():
        parser.error("CUDA is unavailable; run --device cpu or use a CUDA host.")
    torch.set_num_threads(args.threads)
    config = TrainingConfig(hidden=256, steps=5, dropout=0.2) if args.retry else TrainingConfig()
    started = perf_counter()
    source = sources.fetch("leffingwell", cache_dir=Path(".cache/smellcule"))
    labels, rows = catalogue.read_leffingwell(source)
    molecules = tuple(standardise(row) for row in rows)
    assignments = splits.official_split(molecules)
    graphs: list[GraphArrays] = []
    for row in rows:
        structure = Chem.MolFromSmiles(row.smiles)
        if structure is None:
            message = f"Invalid SMILES for source row {row.molecule_id}; inspect the pinned source."
            raise ValueError(message)
        graphs.append(featurise(structure))
    datasets = {
        split: TrainingSet(
            tuple(
                graph
                for graph, assigned in zip(graphs, assignments, strict=True)
                if assigned == split
            ),
            torch.tensor(
                [
                    row.measured
                    for row, assigned in zip(rows, assignments, strict=True)
                    if assigned == split
                ],
                dtype=torch.float32,
            ),
        )
        for split in ("train", "validation", "held_out")
    }
    print(f"device={device} threads={torch.get_num_threads()} config={asdict(config)}", flush=True)
    trained = train_one_seed(
        datasets["train"],
        datasets["validation"],
        seed=args.seed,
        device=device,
        config=config,
    )
    held_out = datasets["held_out"]
    probabilities = predict_probabilities(trained.model, held_out, device, config.batch_size)
    score, eligible = macro_auroc(held_out.targets, probabilities)
    total_s = perf_counter() - started
    # These are workload-scaled estimates, not measurements of the later runs.
    official_rows = len(datasets["train"].graphs) + len(datasets["validation"].graphs)
    counts: dict[str, int] = json.loads(Path("eval/data_counts.json").read_text(encoding="utf-8"))
    gslf_seed_s = trained.wall_time_s * (counts["gslf_molecules"] * 0.8) / official_rows
    ensemble_size = next(
        (size for size in (10, 5, 1) if 5 * size * gslf_seed_s <= GS_LF_BUDGET_S), 1
    )
    projections = {
        "official_10_s": 10 * trained.wall_time_s,
        "cluster_10_s": 10
        * trained.wall_time_s
        * (counts["cluster_train"] + counts["cluster_validation"])
        / official_rows,
        "gslf_cv_10_s": 50 * gslf_seed_s,
        "gslf_cv_5_s": 25 * gslf_seed_s,
        "gslf_cv_1_s": 5 * gslf_seed_s,
        "gslf_ensemble_size": ensemble_size,
        "gslf_cv_selected_s": 5 * ensemble_size * gslf_seed_s,
        "keller_cv_10_s": 50
        * trained.wall_time_s
        * counts["keller_molecules"]
        * 0.8
        / official_rows,
        "keller_final_10_s": 10 * trained.wall_time_s * counts["keller_molecules"] / official_rows,
    }
    record = {
        "date_utc": datetime.now(UTC).isoformat(),
        "machine": platform.platform(),
        "python": platform.python_version(),
        "versions": {
            package: version(package) for package in ("numpy", "torch", "rdkit", "scikit-learn")
        },
        "source_sha256": sources.load_sources()["leffingwell"].sha256,
        "device": str(device),
        "mps_available": torch.backends.mps.is_available(),
        "threads": torch.get_num_threads(),
        "seed": args.seed,
        "config": asdict(config),
        "counts": {split: len(data.graphs) for split, data in datasets.items()},
        "n_labels": len(labels),
        "held_out_eligible_labels": eligible,
        "held_out_macro_auroc": score,
        "validation_macro_auroc": trained.validation_auroc,
        "best_epoch": trained.best_epoch,
        "epochs_run": len(trained.history),
        "seed_wall_time_s": trained.wall_time_s,
        "total_wall_time_s": total_s,
        "history": [asdict(epoch) for epoch in trained.history],
        "projections": projections,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(record, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    artifacts = Path("artifacts") / args.out.stem
    artifacts.mkdir(parents=True, exist_ok=True)
    (artifacts / "model.safetensors").write_bytes(
        save({key: value.cpu().contiguous() for key, value in trained.model.state_dict().items()})
    )
    np.savez_compressed(
        artifacts / "held_out.npz",
        targets=held_out.targets.numpy(),
        probabilities=probabilities.numpy(),
        labels=np.asarray(labels),
        molecule_ids=np.asarray(
            [
                row.molecule_id
                for row, split in zip(rows, assignments, strict=True)
                if split == "held_out"
            ]
        ),
    )
    print(
        f"held_out_macro_auroc: {score:.9f} labels={eligible} "
        f"seed_wall_time_s={trained.wall_time_s:.1f} total_wall_time_s={total_s:.1f}",
        flush=True,
    )
    print(f"result={args.out} artifacts={artifacts} gate_passed={score >= GATE_AUROC}", flush=True)


if __name__ == "__main__":
    main()
