import hashlib
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from statistics import mean, median
from typing import Literal

import numpy as np
from rdkit import Chem, DataStructs
from rdkit.Chem import rdFingerprintGenerator
from rdkit.ML.Cluster import Butina
from sklearn.model_selection import KFold

from smellcule.catalogue import GSLFRow
from smellcule.molecules import Molecule

Split = Literal["train", "validation", "held_out"]
MORGAN_RADIUS = 2
MORGAN_BITS = 2048
BUTINA_DISTANCE = 0.6
HELD_OUT_FRACTION = 0.2
VALIDATION_FRACTION = 0.1
GSLF_FOLD_COUNT = 5
RANDOM_PAIR_COUNT = 20_000


@dataclass(frozen=True)
class ClusterSplit:
    """Row-aligned assignments and hash-ordered clusters of source row indices."""

    assignments: tuple[Split, ...]
    clusters: tuple[tuple[int, ...], ...]


@dataclass(frozen=True)
class ConnectivityGroup:
    """Official source membership, including validation rows among training siblings."""

    connectivity_key: str
    train_ids: tuple[str, ...]
    held_out_ids: tuple[str, ...]


@dataclass(frozen=True)
class LeakageReport:
    """Connectivity overlap and measured descriptor agreement, without predictions."""

    multi_member_groups: tuple[ConnectivityGroup, ...]
    crossing_groups: tuple[ConnectivityGroup, ...]
    sibling_agreement_mean: float | None
    sibling_agreement_median: float | None
    sibling_identical_count: int
    random_pair_mean: float | None


@dataclass(frozen=True)
class CrossSourceSet:
    """Offline GS-LF rows projected to shared labels, with original row indices."""

    labels: tuple[str, ...]
    rows: tuple[GSLFRow, ...]
    source_indices: tuple[int, ...]


@dataclass(frozen=True)
class Fold:
    """Source row indices for one GS-LF training and test partition."""

    train_indices: tuple[int, ...]
    test_indices: tuple[int, ...]


def official_split(molecules: Sequence[Molecule]) -> tuple[Split, ...]:
    """Reserve cv0 validation rows only within the official training partition."""
    return tuple(
        "held_out"
        if row.official_split == "held_out"
        else "validation"
        if row.official_cv0 == 0
        else "train"
        for row in molecules
    )


def _validate_connectivity_split(
    molecules: Sequence[Molecule], assignments: Sequence[Split]
) -> None:
    by_key: dict[str, Split] = {}
    for row, assignment in zip(molecules, assignments, strict=True):
        previous = by_key.setdefault(row.connectivity_key, assignment)
        if previous != assignment:
            message = (
                f"Connectivity key {row.connectivity_key} crosses cluster splits "
                f"{previous} and {assignment}."
            )
            raise ValueError(message)


def cluster_split(molecules: Sequence[Molecule]) -> ClusterSplit:
    """Assign whole Butina clusters in SHA-256 order without shuffling source rows.

    The distance cutoff applies to each centroid and its neighbours, rather than
    every pair in a cluster. RDKit's default static neighbour ordering is retained.
    Assignments that put a connectivity key in multiple splits are rejected.
    """
    if not molecules:
        return ClusterSplit((), ())
    generator = rdFingerprintGenerator.GetMorganGenerator(
        radius=MORGAN_RADIUS, fpSize=MORGAN_BITS, includeChirality=False
    )
    fingerprints: list[DataStructs.ExplicitBitVect] = []
    for row in molecules:
        structure = Chem.MolFromSmiles(row.smiles)
        if structure is None:
            message = f"Invalid SMILES for molecule {row.molecule_id!r}: {row.smiles!r}."
            raise ValueError(message)
        fingerprints.append(generator.GetFingerprint(structure))
    distances: list[float] = []
    for index, fingerprint in enumerate(fingerprints):
        distances.extend(
            1 - similarity
            for similarity in DataStructs.BulkTanimotoSimilarity(fingerprint, fingerprints[:index])
        )
    clusters = Butina.ClusterData(
        distances, len(molecules), BUTINA_DISTANCE, isDistData=True, reordering=False
    )

    def cluster_hash(cluster: tuple[int, ...]) -> str:
        smallest = min(molecules[index].inchikey for index in cluster)
        return hashlib.sha256(smallest.encode("utf-8")).hexdigest()

    ordered = tuple(sorted(clusters, key=cluster_hash))
    assignments: list[Split] = ["train"] * len(molecules)
    held_out = validation = 0
    for cluster in ordered:
        split: Split = "train"
        if held_out < len(molecules) * HELD_OUT_FRACTION:
            split = "held_out"
            held_out += len(cluster)
        elif validation < len(molecules) * VALIDATION_FRACTION:
            split = "validation"
            validation += len(cluster)
        for index in cluster:
            assignments[index] = split
    _validate_connectivity_split(molecules, assignments)
    return ClusterSplit(tuple(assignments), ordered)


def _jaccard(left: frozenset[int], right: frozenset[int]) -> float:
    # Two empty measured sets agree exactly; no positive descriptor is implied.
    union = left | right
    return len(left & right) / len(union) if union else 1.0


def _random_agreement(labels: Sequence[frozenset[int]]) -> float | None:
    if len(labels) <= 1:
        return None
    rng = np.random.default_rng(0)
    # Sample ordered distinct-row pairs with replacement across pairs, never self-pairs.
    left = rng.integers(len(labels), size=RANDOM_PAIR_COUNT)
    right = rng.integers(len(labels) - 1, size=RANDOM_PAIR_COUNT)
    right += right >= left
    return mean(_jaccard(labels[int(i)], labels[int(j)]) for i, j in zip(left, right, strict=True))


def leakage_audit(molecules: Sequence[Molecule]) -> LeakageReport:
    """Compare each crossing held-out row with its best official training sibling.

    Empty partitions have absent summary statistics. The random baseline uses
    20,000 distinct-row pairs sampled with default_rng(0).
    """
    grouped: dict[str, list[int]] = defaultdict(list)
    labels = tuple(
        frozenset(i for i, value in enumerate(row.measured) if value) for row in molecules
    )
    for index, row in enumerate(molecules):
        grouped[row.connectivity_key].append(index)
    multi_member: list[ConnectivityGroup] = []
    crossing: list[ConnectivityGroup] = []
    agreement: list[float] = []
    for key, indices in sorted(grouped.items()):
        if len(indices) == 1:
            continue
        train = [i for i in indices if molecules[i].official_split == "train"]
        held_out = [i for i in indices if molecules[i].official_split == "held_out"]
        group = ConnectivityGroup(
            key,
            tuple(molecules[i].molecule_id for i in train),
            tuple(molecules[i].molecule_id for i in held_out),
        )
        multi_member.append(group)
        if train and held_out:
            crossing.append(group)
            agreement.extend(max(_jaccard(labels[i], labels[j]) for j in train) for i in held_out)
    return LeakageReport(
        tuple(multi_member),
        tuple(crossing),
        mean(agreement) if agreement else None,
        median(agreement) if agreement else None,
        agreement.count(1.0),
        _random_agreement(labels),
    )


def cross_source(
    gslf: Sequence[GSLFRow],
    catalogue: Sequence[Molecule],
    gslf_labels: Sequence[str],
    catalogue_labels: Sequence[str],
) -> CrossSourceSet:
    """Exclude every catalogue connectivity key and project to sorted shared labels.

    Source rows retain their order and multiplicity. These targets are for offline
    evaluation and must not be exported as catalogue measurements.
    """
    labels = tuple(sorted(set(gslf_labels) & set(catalogue_labels)))
    columns = tuple(gslf_labels.index(label) for label in labels)
    known = {row.connectivity_key for row in catalogue}
    selected: list[GSLFRow] = []
    indices: list[int] = []
    for index, row in enumerate(gslf):
        structure = Chem.MolFromSmiles(row.smiles)
        if structure is None:
            message = f"Invalid GS-LF SMILES at row {index}: {row.smiles!r}."
            raise ValueError(message)
        if Chem.MolToInchiKey(structure)[:14] not in known:
            selected.append(GSLFRow(row.smiles, tuple(row.measured[column] for column in columns)))
            indices.append(index)
    return CrossSourceSet(labels, tuple(selected), tuple(indices))


def gslf_folds(rows: Sequence[GSLFRow]) -> tuple[Fold, ...]:
    """Use the GS-LF protocol with a different fold assignment from OpenPOM."""
    splitter = KFold(n_splits=GSLF_FOLD_COUNT, shuffle=True, random_state=0)
    return tuple(
        Fold(tuple(int(i) for i in train), tuple(int(i) for i in test))
        for train, test in splitter.split(rows)
    )
