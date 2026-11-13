import hashlib
from collections import Counter
from dataclasses import replace
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from smellcule import catalogue, splits
from smellcule.molecules import Molecule, standardise

FIXTURE = Path(__file__).parent / "fixtures" / "leffingwell_fixture.csv"
STRUCTURES = (
    "N[C@H](C)C(=O)O",
    "N[C@@H](C)C(=O)O",
    "CCO",
    "CCCCCCCC",
    "c1ccccc1",
    "CC(=O)O",
)


def molecule(index: int, smiles: str, measured: tuple[int, ...] = (1, 0, 0)) -> Molecule:
    return standardise(
        catalogue.CatalogueRow(str(index), "fixture", "", smiles, measured, "train", 1)
    )


def test_splits_official_uses_validation_only_inside_train() -> None:
    _, rows = catalogue.read_leffingwell(FIXTURE)
    molecules = tuple(standardise(row) for row in rows)
    assignments = splits.official_split(molecules)
    assert len(assignments) == len(molecules)
    for row, assignment in zip(molecules, assignments, strict=True):
        expected = (
            "held_out"
            if row.official_split == "held_out"
            else "validation"
            if row.official_cv0 == 0
            else "train"
        )
        assert assignment == expected


@settings(deadline=None)
@given(st.lists(st.sampled_from(STRUCTURES), min_size=1, max_size=35))
def test_splits_clusters_keep_every_connectivity_key_in_one_split(smiles: list[str]) -> None:
    molecules = tuple(molecule(index, value) for index, value in enumerate(smiles))
    result = splits.cluster_split(molecules)
    by_key: dict[str, set[str]] = {}
    for row, assignment in zip(molecules, result.assignments, strict=True):
        by_key.setdefault(row.connectivity_key, set()).add(assignment)
    assert all(len(assignments) == 1 for assignments in by_key.values())
    indices = [index for cluster in result.clusters for index in cluster]
    assert sorted(indices) == list(range(len(molecules)))
    assert result == splits.cluster_split(molecules)


def test_splits_cluster_hash_order_and_whole_cluster_thresholds() -> None:
    molecules = tuple(molecule(index, value) for index, value in enumerate(STRUCTURES))
    result = splits.cluster_split(molecules)
    hashes = [
        hashlib.sha256(min(molecules[index].inchikey for index in cluster).encode()).hexdigest()
        for cluster in result.clusters
    ]
    assert hashes == sorted(hashes)
    counts: Counter[str] = Counter()
    for cluster in result.clusters:
        expected = (
            "held_out"
            if counts["held_out"] < len(molecules) * 0.2
            else "validation"
            if counts["validation"] < len(molecules) * 0.1
            else "train"
        )
        assert {result.assignments[index] for index in cluster} == {expected}
        counts[expected] += len(cluster)
    assert any({0, 1} <= set(cluster) for cluster in result.clusters)
    assert splits.cluster_split(()) == splits.ClusterSplit((), ())


def test_splits_rejects_crossing_tautomer_connectivity_key() -> None:
    molecules = (molecule(0, "O=c1cccc[nH]1"), molecule(1, "Oc1ccccn1"))
    assert {row.connectivity_key for row in molecules} == {"UBQKCCHYAOITMY"}
    with pytest.raises(ValueError, match=r"UBQKCCHYAOITMY.*validation.*held_out"):
        splits.cluster_split(molecules)


def test_splits_leakage_uses_best_official_training_sibling() -> None:
    molecules = (
        molecule(0, STRUCTURES[0], (1, 0, 0)),
        replace(molecule(1, STRUCTURES[1], (1, 1, 0)), official_cv0=0),
        replace(molecule(2, STRUCTURES[0], (1, 1, 0)), official_split="held_out", official_cv0=-1),
        molecule(3, "CCO", (0, 0, 1)),
    )
    report = splits.leakage_audit(molecules)
    assert len(report.multi_member_groups) == 1
    assert len(report.crossing_groups) == 1
    assert report.crossing_groups[0].train_ids == ("0", "1")
    assert report.crossing_groups[0].held_out_ids == ("2",)
    assert report.sibling_agreement_mean == 1.0
    assert report.sibling_agreement_median == 1.0
    assert report.sibling_identical_count == 1
    assert report == splits.leakage_audit(molecules)


def test_splits_leakage_without_crossing_groups_or_random_pairs() -> None:
    row = molecule(0, "CCO")
    report = splits.leakage_audit((row, replace(row, molecule_id="1")))
    assert len(report.multi_member_groups) == 1
    assert report.crossing_groups == ()
    assert report.sibling_agreement_mean is None
    assert report.sibling_agreement_median is None
    assert report.sibling_identical_count == 0
    assert report.random_pair_mean == 1.0
    assert splits.leakage_audit((row,)).random_pair_mean is None
    assert splits.leakage_audit(()).multi_member_groups == ()


def test_splits_cross_source_excludes_connectivity_and_reorders_shared_targets() -> None:
    gslf = (
        catalogue.GSLFRow(STRUCTURES[1], (1, 0, 1)),
        catalogue.GSLFRow("CCO", (0, 1, 0)),
        catalogue.GSLFRow("CCO", (1, 0, 0)),
    )
    result = splits.cross_source(
        gslf,
        (molecule(0, STRUCTURES[0]),),
        ("woody", "green", "gslf_only"),
        ("bread", "green", "woody"),
    )
    assert result.labels == ("green", "woody")
    assert result.source_indices == (1, 2)
    assert result.rows == (
        catalogue.GSLFRow("CCO", (1, 0)),
        catalogue.GSLFRow("CCO", (0, 1)),
    )
    with pytest.raises(ValueError, match="Invalid GS-LF SMILES at row 0"):
        splits.cross_source((catalogue.GSLFRow("invalid", (1,)),), (), ("green",), ("green",))


def test_splits_gslf_folds_match_seeded_kfold() -> None:
    rows = tuple(catalogue.GSLFRow("CCO", (1,)) for _ in range(10))
    folds = splits.gslf_folds(rows)
    assert tuple(fold.test_indices for fold in folds) == ((2, 8), (4, 9), (1, 6), (3, 7), (0, 5))
    for fold in folds:
        assert set(fold.train_indices).isdisjoint(fold.test_indices)
        assert sorted((*fold.train_indices, *fold.test_indices)) == list(range(10))
    assert folds == splits.gslf_folds(rows)
