from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np
from numpy.typing import NDArray
from rdkit import DataStructs
from rdkit.Chem.rdFingerprintGenerator import GetMorganGenerator
from sklearn.manifold import trustworthiness

from smellcule import catalogue, sources
from smellcule.cli import read_results
from smellcule.export.content import mapping, sequence
from smellcule.export.neighbours import NEIGHBOUR_COUNT
from smellcule.molecules import source_structures
from smellcule.splits import MORGAN_BITS, MORGAN_RADIUS

if TYPE_CHECKING:
    from smellcule.metrics import FloatArray


def jaccard_means(
    measured: NDArray[np.bool_], neighbours: NDArray[np.int64], held_out: NDArray[np.bool_]
) -> dict[str, float]:
    """Average descriptor overlap over neighbours, then over query molecules."""
    queries = measured[:, None, :]
    others = measured[neighbours]
    intersection = np.count_nonzero(queries & others, axis=2)
    union = np.count_nonzero(queries | others, axis=2)
    # Two empty descriptor sets agree, matching the set Jaccard convention.
    scores = np.divide(intersection, union, out=np.ones_like(union, dtype=float), where=union > 0)
    per_query = scores.mean(axis=1)
    return {"held_out": float(per_query[held_out].mean()), "all_molecules": float(per_query.mean())}


def evaluate_map(bundle: Path, artifact: Path) -> dict[str, object]:
    """Score exported positions and neighbours against aligned source labels and embeddings."""
    atlas = read_results(bundle / "atlas.json")
    labels, rows = catalogue.read_leffingwell(sources.fetch("leffingwell"))
    records = [mapping(row) for row in sequence(atlas["molecules"])]
    ids = [row.molecule_id for row in rows]
    with np.load(artifact, allow_pickle=False) as saved:
        embeddings: FloatArray = np.asarray(saved["embeddings"], dtype=np.float64)
        positions = np.fromfile(bundle / "positions.bin", dtype="<f4").reshape(len(rows), 3)
        if not (
            ids == [row["id"] for row in records] == saved["molecule_id"].tolist()
            and list(labels) == atlas["labels"] == saved["labels"].tolist()
            and np.array_equal(positions, saved["positions"])
        ):
            message = (
                "Map artifact differs from bundle positions, molecule ids or descriptor order."
            )
            raise ValueError(message)
    measured = np.array([row.measured for row in rows], dtype=bool)
    if any(
        record["measured"] != np.flatnonzero(target).tolist()
        for record, target in zip(records, measured, strict=True)
    ):
        message = "Map bundle measured descriptors differ from the source catalogue."
        raise ValueError(message)
    held_out = np.array([row["split"] == "held_out" for row in records])
    if not held_out.any():
        message = "Map evaluation requires held-out query molecules."
        raise ValueError(message)
    indices = {value: index for index, value in enumerate(ids)}
    odour = np.array(
        [[indices[str(mapping(n)["id"])] for n in sequence(row["neighbours"])] for row in records],
        dtype=np.int64,
    )
    if odour.shape != (len(rows), NEIGHBOUR_COUNT) or any(
        len(set(neighbours)) != NEIGHBOUR_COUNT or index in neighbours
        for index, neighbours in enumerate(odour)
    ):
        message = "Map neighbours must contain eight distinct other molecules per query."
        raise ValueError(message)
    generator = GetMorganGenerator(radius=MORGAN_RADIUS, fpSize=MORGAN_BITS, includeChirality=False)
    fingerprints = [
        generator.GetFingerprint(mol) for mol in source_structures([row.smiles for row in rows])
    ]
    structure = np.empty_like(odour)
    random = np.empty_like(odour)
    rng = np.random.default_rng(0)
    candidates = np.arange(len(rows))
    for index, fingerprint in enumerate(fingerprints):
        similarities = np.array(DataStructs.BulkTanimotoSimilarity(fingerprint, fingerprints))
        similarities[index] = -np.inf
        structure[index] = np.argsort(-similarities, kind="stable")[:NEIGHBOUR_COUNT]
        random[index] = rng.choice(candidates[candidates != index], NEIGHBOUR_COUNT, replace=False)
    overlaps = {
        name: jaccard_means(measured, neighbours, held_out)
        for name, neighbours in (("odour", odour), ("tanimoto", structure), ("random", random))
    }
    return {
        "trustworthiness": float(
            trustworthiness(embeddings, positions, n_neighbors=NEIGHBOUR_COUNT, metric="cosine")
        ),
        "held_out": {
            "molecule_count": int(held_out.sum()),
            **{k: v["held_out"] for k, v in overlaps.items()},
        },
        "all_molecules": {
            "molecule_count": len(rows),
            **{k: v["all_molecules"] for k, v in overlaps.items()},
        },
        "neighbour_count": NEIGHBOUR_COUNT,
        "random_seed": 0,
    }
