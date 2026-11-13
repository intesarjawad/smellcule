"""Build local release files from recorded outputs without research imports."""

import csv
import hashlib
import json
from pathlib import Path

import numpy as np
from safetensors.numpy import save

from smellcule import releases, sources
from smellcule.catalogue import read_leffingwell


def install(root: Path, destination: Path) -> None:
    """Redirect the release transport while retaining checksum verification."""
    destination.mkdir(parents=True, exist_ok=True)
    document = json.loads((root / "tests/fixtures/fixture_model_outputs.json").read_text())
    labels = document["labels"]
    (destination / "labels.json").write_text(json.dumps(labels))
    source = root / "tests/fixtures/export_catalogue.csv"
    _, rows = read_leffingwell(source)
    ordered = sorted(rows, key=lambda row: int(row.molecule_id))
    records = [document["molecules"][row.molecule_id] for row in ordered]
    (destination / "predictions.safetensors").write_bytes(
        save(
            {
                key: np.array([record[key] for record in records], dtype=np.float32)
                for key in ("prob", "spread")
            },
        )
    )
    with (destination / "split.csv").open("w", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(("molecule_id", "inchikey", "split", "nearest_train_similarity"))
        for row, record in zip(ordered, records, strict=True):
            writer.writerow(
                (row.molecule_id, "", record["split"], record["nearestTrainSimilarity"])
            )
    releases.RELEASED_REVISIONS["lf"] = "a" * 40
    releases.RELEASED_SHA256["lf"] = {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in destination.iterdir()
    }

    def local_download(*, repo_id: str, filename: str, revision: str) -> str:
        assert repo_id == "intesarjawad/smellcule-lf"
        assert revision == "a" * 40
        return str(destination / filename)

    def local_source(key: str) -> Path:
        assert key == "leffingwell"
        return source

    releases.huggingface_hub.hf_hub_download = local_download
    sources.fetch = local_source
