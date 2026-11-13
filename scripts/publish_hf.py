"""Stage the two released model repositories and upload them only when asked.

Without --upload nothing leaves the machine: the repository files, model cards and the
prediction golden are written to a staging directory and their SHA-256 pins are printed.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
from importlib.metadata import version
from pathlib import Path

import huggingface_hub
import numpy as np
from huggingface_hub.errors import HfHubHTTPError
from safetensors.numpy import save

from smellcule import catalogue, sources
from smellcule.cli import read_results
from smellcule.errors import DataError, ReleaseError, SmellculeError
from smellcule.molecules import standardise
from smellcule.report import render_markdown

OWNER = "intesarjawad"
LICENCES = {"lf": "cc-by-nc-4.0", "open": "cc-by-4.0"}
WEIGHT_FILES = ("model.safetensors", "labels.json")
# The eight Synesthesia demo molecules; with Smellcule puzzles 1 and 2 they form the golden.
DEMO_NAMES = (
    "Geosmin",
    "Vanillin",
    "Limonene",
    "Cedrol",
    "Muscone",
    "Eugenol",
    "Furfuryl mercaptan",
    "Calone®",
)
GOLDEN_PUZZLES = 2
GOLDEN_TOLERANCE = 1e-5
GOLDEN_PATH = "tests/golden/released_predictions.json"
SCOPE = (
    "Perception only. The model predicts which odour descriptors describe molecules in its "
    "curated fragrance and flavour catalogue. It does not generate, design or rank new "
    "molecules, accepts no arbitrary structures, and makes no claim about safety, toxicity "
    "or biological activity."
)
DATA = {
    "lf": (
        "Trained on the Leffingwell catalogue (John Leffingwell; Sanchez-Lengeling et al.; "
        "distributed by Pyrfume). That data is licensed for non-commercial use only, so these "
        "weights and outputs are non-commercial too."
    ),
    "open": (
        "Trained on the mean perceptual ratings of Keller and Vosshall 2016 (CC BY 4.0), "
        "attributed to its authors."
    ),
}
SPLITS = {
    "lf": (
        "Cluster-held-out split `cluster-v1`: whole structural clusters are held out, so a "
        "held-out molecule is structurally far from training data. `split.csv` gives each "
        "molecule's split and its nearest training similarity; `predictions.safetensors` holds "
        "the ensemble's probabilities and spread for every catalogue molecule, in "
        "`molecule_id` order."
    ),
    "open": (
        "Five-fold cluster cross-validation. `catalogue.csv` gives each molecule's measured "
        "ratings and the prediction from the fold model that never saw it. The weights are "
        "the final fit on every Keller molecule."
    ),
}


def sha256(path: Path) -> str:
    """Hash a staged file exactly as the release download verifies it."""
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def repository_url(root: Path) -> str:
    """Read the public repository URL from the citation file, its single source."""
    text = (root / "CITATION.cff").read_text(encoding="utf-8")
    match = re.search(r'^repository-code:\s*"?([^"\n]+)"?\s*$', text, re.MULTILINE)
    if match is None:
        message = "CITATION.cff has no repository-code URL"
        raise DataError(message, "add repository-code to CITATION.cff")
    return match[1]


def model_card(name: str, results: dict[str, object], repository: str) -> str:
    """Render the Hugging Face README with every number taken from the results file."""
    evaluation = [
        f"#{line}" if line.startswith("#") else line
        for line in render_markdown(results).splitlines()
    ]
    return "\n".join(
        [
            "---",
            f"license: {LICENCES[name]}",
            "tags: [chemistry, olfaction]",
            "---",
            "",
            f"# smellcule-{name}",
            "",
            "## Scope",
            "",
            SCOPE,
            "",
            "## Data and licence",
            "",
            DATA[name],
            "",
            "## Splits",
            "",
            SPLITS[name],
            "",
            *evaluation,
            "",
            "## Contact",
            "",
            f"Questions and issues: {repository}",
            "",
        ]
    )


def _copy_weights(source: Path, destination: Path) -> tuple[str, ...]:
    for file in WEIGHT_FILES:
        shutil.copyfile(source / file, destination / file)
    # The release keeps the architecture keys at the top level, where weights.py reads them.
    config: dict[str, object] = json.loads((source / "config.json").read_text(encoding="utf-8"))
    nested = config.pop("config")
    if not isinstance(nested, dict):
        message = f"{source / 'config.json'} has no training configuration"
        raise TypeError(message)
    (destination / "config.json").write_text(json.dumps({**config, **nested}, indent=2) + "\n")
    labels: object = json.loads((source / "labels.json").read_text(encoding="utf-8"))
    if not isinstance(labels, list) or not all(isinstance(label, str) for label in labels):
        message = f"{source / 'labels.json'} must be a list of descriptor names"
        raise TypeError(message)
    return tuple(str(label) for label in labels)


def _unit_array(array: np.ndarray, shape: tuple[int, int], what: str) -> np.ndarray:
    values = np.asarray(array, dtype=np.float32)
    if (
        values.shape != shape
        or not np.isfinite(values).all()
        or values.min() < 0
        or values.max() > 1
    ):
        message = f"{what} must be finite values in [0, 1] with shape {shape}"
        raise ValueError(message)
    return values


def stage_lf(root: Path, destination: Path) -> dict[str, object]:
    """Write the five smellcule-lf files and return the golden rows for the demo molecules."""
    labels, rows = catalogue.read_leffingwell(sources.fetch("leffingwell"))
    if _copy_weights(root / "artifacts/cluster", destination) != labels:
        message = "artifacts/cluster/labels.json differs from the catalogue descriptors"
        raise ValueError(message)
    with np.load(root / "artifacts/cluster.npz", allow_pickle=False) as saved:
        if (
            saved["molecule_id"].tolist() != [row.molecule_id for row in rows]
            or tuple(saved["labels"].tolist()) != labels
        ):
            message = "artifacts/cluster.npz differs from the catalogue row or label order"
            raise ValueError(message)
        order = sorted(range(len(rows)), key=lambda index: int(rows[index].molecule_id))
        shape = (len(rows), len(labels))
        prob = _unit_array(saved["prob"], shape, "cluster probabilities")[order]
        spread = _unit_array(saved["spread"], shape, "cluster spread")[order]
        split = saved["split"][order].tolist()
        nearest = saved["nearest_train_similarity"][order].tolist()
    (destination / "predictions.safetensors").write_bytes(save({"prob": prob, "spread": spread}))
    ordered = [rows[index] for index in order]
    with (destination / "split.csv").open("w", newline="", encoding="utf-8") as output:
        writer = csv.writer(output)
        writer.writerow(("molecule_id", "inchikey", "split", "nearest_train_similarity"))
        for row, assignment, similarity in zip(ordered, split, nearest, strict=True):
            writer.writerow((row.molecule_id, standardise(row).inchikey, assignment, similarity))

    puzzles = json.loads((root / "dist/bundle/smellcule.json").read_text(encoding="utf-8"))
    golden_ids = [row.molecule_id for name in DEMO_NAMES for row in ordered if row.name == name]
    if len(golden_ids) != len(DEMO_NAMES):
        message = "a Synesthesia demo molecule is missing from the catalogue"
        raise ValueError(message)
    golden_ids += [puzzle["moleculeId"] for puzzle in puzzles["puzzles"][:GOLDEN_PUZZLES]]
    position = {row.molecule_id: index for index, row in enumerate(ordered)}
    return {
        "model": "smellcule-lf",
        "tolerance": GOLDEN_TOLERANCE,
        "labels": list(labels),
        "molecules": {
            molecule_id: {
                "prob": prob[position[molecule_id]].tolist(),
                "spread": spread[position[molecule_id]].tolist(),
            }
            for molecule_id in golden_ids
        },
    }


def stage_open(root: Path, destination: Path) -> None:
    """Write the four smellcule-open files, with out-of-fold predictions in the catalogue."""
    labels = _copy_weights(root / "artifacts/smellcule-open", destination)
    rows = catalogue.read_keller(
        sources.fetch("keller_molecules"),
        sources.fetch("keller_stimuli"),
        sources.fetch("keller_behavior"),
    )
    with np.load(root / "artifacts/keller_oof.npz", allow_pickle=False) as saved:
        cids = saved["cid"].tolist()
        if labels != catalogue.KELLER_DESCRIPTORS or tuple(saved["labels"].tolist()) != labels:
            message = "Keller labels differ between the catalogue, labels.json and keller_oof.npz"
            raise ValueError(message)
        if sorted(cids) != sorted(row.molecule_id for row in rows):
            message = "keller_oof.npz CIDs differ from the Keller catalogue"
            raise ValueError(message)
        shape = (len(cids), len(labels))
        prob = _unit_array(saved["prob"], shape, "Keller out-of-fold probabilities")
        spread = _unit_array(saved["spread"], shape, "Keller out-of-fold spread")
        folds = saved["fold"].tolist()
        nearest = saved["nearest_train_similarity"].tolist()
    position = {cid: index for index, cid in enumerate(cids)}
    with (destination / "catalogue.csv").open("w", newline="", encoding="utf-8") as output:
        writer = csv.writer(output)
        writer.writerow(
            (
                "CID",
                "name",
                "CAS",
                *(f"measured_{label}" for label in labels),
                *(f"prob_{label}" for label in labels),
                *(f"spread_{label}" for label in labels),
                "fold",
                "nearest_train_similarity",
            )
        )
        for row in sorted(rows, key=lambda item: int(item.molecule_id)):
            index = position[row.molecule_id]
            writer.writerow(
                (
                    row.molecule_id,
                    row.name,
                    row.cas,
                    *("" if value is None else value for value in row.measured),
                    *prob[index].tolist(),
                    *spread[index].tolist(),
                    folds[index],
                    nearest[index],
                )
            )


def stage(root: Path, out: Path) -> dict[str, object]:
    """Write both repositories under out/<name>/ and return the golden predictions."""
    results = read_results(root / "eval/results.json")
    repository = repository_url(root)
    for name in LICENCES:
        (out / name).mkdir(parents=True, exist_ok=True)
        (out / name / "README.md").write_text(model_card(name, results, repository))
    golden = stage_lf(root, out / "lf")
    stage_open(root, out / "open")
    (out / "released_predictions.json").write_text(json.dumps(golden, indent=2) + "\n")
    return golden


def pins(out: Path) -> dict[str, dict[str, str]]:
    """Hash every released file the package downloads; the model card is not pinned."""
    return {
        name: {
            path.name: sha256(path)
            for path in sorted((out / name).iterdir())
            if path.name != "README.md"
        }
        for name in LICENCES
    }


def upload(out: Path) -> dict[str, str]:
    """Create both repositories private, upload them and return each commit hash."""
    api = huggingface_hub.HfApi()
    commit_message = f"Release smellcule {version('smellcule')}"
    revisions: dict[str, str] = {}
    for name in LICENCES:
        repo_id = f"{OWNER}/smellcule-{name}"
        try:
            api.create_repo(repo_id, private=True, exist_ok=True)
            commit = api.upload_folder(
                repo_id=repo_id, folder_path=out / name, commit_message=commit_message
            )
        except HfHubHTTPError as error:
            message = f"could not upload {repo_id}: {error}"
            raise ReleaseError(
                message, "uv run python scripts/publish_hf.py --upload again; it reuses both repos"
            ) from error
        revisions[name] = commit.oid
    return revisions


def release(root: Path, out: Path, *, upload_to_hub: bool) -> None:
    """Stage and print the pins; with upload_to_hub, also write the golden and upload."""
    if upload_to_hub and not os.environ.get("HF_TOKEN"):
        message = "HF_TOKEN is not set, so nothing can be uploaded"
        raise ReleaseError(
            message, "HF_TOKEN=<write token> uv run python scripts/publish_hf.py --upload"
        )
    try:
        golden = stage(root, out)
    except (OSError, KeyError, TypeError, ValueError) as error:
        message = f"could not stage the release from local artifacts: {error}"
        raise DataError(message, "make reproduce && make export, then run this again") from error
    hashes = pins(out)
    for name, files in hashes.items():
        print(out / name)
        for file, digest in files.items():
            print(f"  {digest}  {file}")
    if not upload_to_hub:
        print(f"Dry run: nothing uploaded. Review {out}, then rerun with --upload.")
        return
    # The golden is committed together with the pins of the upload it describes.
    (root / GOLDEN_PATH).write_text(json.dumps(golden, indent=2) + "\n")
    revisions = upload(out)
    print(f"Uploaded both repositories private and wrote {GOLDEN_PATH}.")
    print("Pin them in src/smellcule/releases.py:")
    print(f"RELEASED_REVISIONS = {json.dumps(revisions)}")
    print(f"RELEASED_SHA256 = {json.dumps(hashes, indent=4)}")


def main(argv: list[str] | None = None) -> int:
    """Stage by default; upload only with --upload and a Hugging Face token."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--out", type=Path, help="staging directory (default: a new temp dir)")
    parser.add_argument(
        "--upload", action="store_true", help="create both repos private and upload them"
    )
    args = parser.parse_args(argv)
    out: Path = args.out or Path(tempfile.mkdtemp(prefix="smellcule-release-"))
    try:
        release(args.root, out, upload_to_hub=args.upload)
    except SmellculeError as error:
        print(f"error: {error.what}\nnext: {error.next_step}", file=sys.stderr)
        return error.exit_code
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
