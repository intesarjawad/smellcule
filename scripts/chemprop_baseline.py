from __future__ import annotations

import csv
import json
import os
import platform
import subprocess
import tempfile
from pathlib import Path
from time import perf_counter
from typing import TYPE_CHECKING

from smellcule import splits
from smellcule.cli import is_result_object, read_results, update_results
from smellcule.cli.submission import load_catalogue
from smellcule.submissions import validate_predictions

if TYPE_CHECKING:
    from collections.abc import Sequence

    from smellcule.molecules import Molecule

NAME = "Chemprop 2.3.1 (D-MPNN, 10-model ensemble)"
SOURCE_URL = "https://chemprop.readthedocs.io/en/v2.3.1/"
ENSEMBLE_SIZE = 10
EPOCHS = 100
CHEMPROP = ("uv", "run", "--isolated", "--with", "chemprop==2.3.1", "chemprop")


def run(command: Sequence[str], log: Path) -> float:
    """Keep verbose training output local while surfacing failed commands."""
    started = perf_counter()
    print(f"Running: {' '.join(command)}; log={log}", flush=True)
    with log.open("w", encoding="utf-8") as destination:
        process = os.posix_spawnp(
            command[0],
            list(command),
            os.environ,
            file_actions=[
                (os.POSIX_SPAWN_DUP2, destination.fileno(), 1),
                (os.POSIX_SPAWN_DUP2, destination.fileno(), 2),
            ],
        )
        _, status = os.waitpid(process, 0)
    exit_code = os.waitstatus_to_exitcode(status)
    if exit_code:
        print(log.read_text(encoding="utf-8")[-8000:], flush=True)
        raise subprocess.CalledProcessError(exit_code, command)
    return perf_counter() - started


def write_inputs(
    directory: Path,
    labels: Sequence[str],
    molecules: Sequence[Molecule],
    assignments: Sequence[splits.Split],
) -> tuple[Path, ...]:
    """Export the committed split assignments without another random split."""
    paths: list[Path] = []
    for split in ("train", "validation", "held_out"):
        path = directory / f"{split}.csv"
        with path.open("w", encoding="utf-8", newline="") as destination:
            writer = csv.writer(destination)
            writer.writerow(("smiles", *labels))
            writer.writerows(
                (row.smiles, *row.measured)
                for row, assignment in zip(molecules, assignments, strict=True)
                if assignment == split
            )
        paths.append(path)
    return tuple(paths)


def export_predictions(
    source: Path, destination: Path, labels: Sequence[str], held_out: Sequence[Molecule]
) -> None:
    """Reject changed row alignment before associating probabilities with identities."""
    with source.open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != ["smiles", *labels]:
            message = "Chemprop prediction columns differ from the input descriptor order."
            raise ValueError(message)
        rows = list(reader)
    if len(rows) != len(held_out) or any(
        prediction["smiles"] != molecule.smiles
        for prediction, molecule in zip(rows, held_out, strict=True)
    ):
        message = "Chemprop predictions differ from held-out input row order."
        raise ValueError(message)
    with destination.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(("inchikey", *labels))
        writer.writerows(
            (molecule.inchikey, *(prediction[label] for label in labels))
            for prediction, molecule in zip(rows, held_out, strict=True)
        )
    keys = {row.inchikey for row in held_out}
    validate_predictions(destination.read_bytes(), labels, keys, keys)


def baseline_split(
    directory: Path,
    name: str,
    labels: Sequence[str],
    molecules: Sequence[Molecule],
    assignments: Sequence[splits.Split],
) -> dict[str, object]:
    """Train all members, predict with their best validation checkpoints, and score."""
    directory.mkdir()
    inputs = write_inputs(directory, labels, molecules, assignments)
    models = directory / "models"
    train_s = run(
        [
            *CHEMPROP,
            "train",
            "--data-path",
            *(str(path) for path in inputs),
            "--task-type",
            "classification",
            "--ensemble-size",
            str(ENSEMBLE_SIZE),
            "--epochs",
            str(EPOCHS),
            "--accelerator",
            "cpu",
            "--devices",
            "1",
            "--data-seed",
            "0",
            "--pytorch-seed",
            "0",
            "--num-workers",
            "0",
            "--output-dir",
            str(models),
        ],
        directory / "train.log",
    )
    checkpoints = sorted(models.rglob("best.pt"))
    if len(checkpoints) != ENSEMBLE_SIZE:
        message = f"Expected {ENSEMBLE_SIZE} best checkpoints, found {len(checkpoints)}."
        raise ValueError(message)
    raw = directory / "predictions.csv"
    predict_s = run(
        [
            *CHEMPROP,
            "predict",
            "--test-path",
            str(inputs[2]),
            "--model-paths",
            *(str(path) for path in checkpoints),
            "--preds-path",
            str(raw),
            "--accelerator",
            "cpu",
            "--devices",
            "1",
            "--num-workers",
            "0",
        ],
        directory / "predict.log",
    )
    predictions = Path("artifacts") / f"chemprop-{name}.csv"
    held_out = [
        row for row, split in zip(molecules, assignments, strict=True) if split == "held_out"
    ]
    export_predictions(raw, predictions, labels, held_out)
    scored = directory / "results.json"
    evaluate_s = run(
        [
            "uv",
            "run",
            "smellcule",
            "evaluate",
            "--predictions",
            str(predictions),
            "--split",
            name,
            "--name",
            NAME,
            "--licence",
            "MIT",
            "--source-url",
            SOURCE_URL,
            "--results",
            str(scored),
        ],
        directory / "evaluate.log",
    )
    submissions = read_results(scored)["submissions"]
    if not is_result_object(submissions):
        message = "Evaluator did not return a named submission."
        raise ValueError(message)
    entry = submissions[NAME]
    if not is_result_object(entry):
        message = "Evaluator did not return a named submission."
        raise ValueError(message)
    result = entry[name]
    if not is_result_object(result):
        message = "Evaluator did not return split metrics."
        raise ValueError(message)
    result.update(
        ensemble_size=ENSEMBLE_SIZE,
        epochs=EPOCHS,
        accelerator="cpu",
        data_seed=0,
        pytorch_seed=0,
        train_wall_time_s=train_s,
        predict_wall_time_s=predict_s,
        evaluate_wall_time_s=evaluate_s,
        wall_time_s=train_s + predict_s + evaluate_s,
        machine=platform.platform(),
    )
    return entry


def main() -> None:
    """Run the pinned CPU baseline on both catalogue splits through submissions."""
    os.environ.setdefault("OMP_NUM_THREADS", "4")
    os.environ.setdefault("MKL_NUM_THREADS", "4")
    labels, molecules = load_catalogue()
    Path("artifacts").mkdir(exist_ok=True)
    results = Path("eval/results.json")
    with tempfile.TemporaryDirectory(
        prefix="smellcule-chemprop-", dir=os.environ.get("TMPDIR")
    ) as tmp:
        version_log = Path(tmp) / "versions.log"
        run(
            [
                *CHEMPROP[:-1],
                "python",
                "-c",
                (
                    "import importlib.metadata,json,platform; "
                    "print(json.dumps({'python':platform.python_version(), "
                    "**{p:importlib.metadata.version(p) for p in "
                    "('chemprop','numpy','torch','rdkit','scikit-learn')}}))"
                ),
            ],
            version_log,
        )
        versions: object = json.loads(version_log.read_text(encoding="utf-8").splitlines()[-1])
        if not is_result_object(versions):
            message = "Chemprop environment did not report package versions."
            raise ValueError(message)
        entry: dict[str, object] = {"versions": versions}
        for name, assignments in (
            ("official", splits.official_split(molecules)),
            ("cluster", splits.cluster_split(molecules).assignments),
        ):
            entry.update(baseline_split(Path(tmp) / name, name, labels, molecules, assignments))
            submissions = read_results(results).get("submissions", {})
            if not is_result_object(submissions):
                message = "Results submissions entry must be an object."
                raise ValueError(message)
            update_results(results, {"submissions": {**submissions, NAME: entry}})
            print(json.dumps({name: entry[name]}, allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
