import sys
from pathlib import Path

import numpy as np
import pytest
from rdkit import Chem

from smellcule.baseline import count_fingerprints, fit_random_forest
from smellcule.catalogue import read_leffingwell
from smellcule.metrics import classification_metrics
from smellcule.sources import fetch


def test_count_morgan_counts_and_no_chirality() -> None:
    molecules = [Chem.MolFromSmiles(smiles) for smiles in ("CCC", "C[C@H](O)CC", "C[C@@H](O)CC")]
    assert all(molecule is not None for molecule in molecules)
    fingerprints = count_fingerprints([molecule for molecule in molecules if molecule is not None])
    assert fingerprints.shape == (3, 2048)
    assert fingerprints.dtype == np.uint32
    assert fingerprints[0].max() > 1
    np.testing.assert_array_equal(fingerprints[1], fingerprints[2])


def test_forest_preserves_column_order_and_constant_labels() -> None:
    fingerprints = np.zeros((6, 2048), dtype=np.uint32)
    fingerprints[:, 0] = np.arange(6)
    targets = np.array([[0, 1, 0, 1], [1, 1, 0, 0]] * 3, dtype=float)
    first = fit_random_forest(fingerprints, targets).predict_probabilities(fingerprints)
    second = fit_random_forest(fingerprints, targets).predict_probabilities(fingerprints)
    np.testing.assert_array_equal(first, second)
    np.testing.assert_array_equal(first[:, 1], np.ones(6))
    np.testing.assert_array_equal(first[:, 2], np.zeros(6))
    np.testing.assert_allclose(first[:, 0], 1 - first[:, 3])
    assert np.all((first >= 0) & (first <= 1))
    for column in (0, 1, 2):
        single = fit_random_forest(fingerprints, targets[:, [column]])
        assert single.predict_probabilities(fingerprints).shape == (6, 1)
        if column:
            np.testing.assert_array_equal(
                single.predict_probabilities(fingerprints)[:, 0], targets[:, column]
            )


def test_baseline_rejects_empty_and_misaligned_inputs() -> None:
    with pytest.raises(ValueError, match="at least one"):
        count_fingerprints([])
    with pytest.raises(ValueError, match="2048"):
        fit_random_forest(np.zeros((3, 2), dtype=np.uint32), np.ones((3, 1)))
    with pytest.raises(ValueError, match="row-aligned"):
        fit_random_forest(np.zeros((3, 2048), dtype=np.uint32), np.ones((2, 1)))


@pytest.mark.data
def test_official_random_forest() -> None:
    labels, rows = read_leffingwell(fetch("leffingwell", cache_dir=Path(".cache/smellcule")))
    molecules: list[Chem.Mol] = []
    for row in rows:
        molecule = Chem.MolFromSmiles(row.smiles)
        assert molecule is not None
        molecules.append(molecule)
    fingerprints = count_fingerprints(molecules)
    targets = np.array([row.measured for row in rows], dtype=float)
    train = np.array([row.official_split == "train" and row.official_cv0 != 0 for row in rows])
    held_out = np.array([row.official_split == "held_out" for row in rows])
    assert len(labels) == 113
    assert train.sum() == 2246
    assert held_out.sum() == 722
    forest = fit_random_forest(fingerprints[train], targets[train])
    result = classification_metrics(
        targets[held_out], forest.predict_probabilities(fingerprints[held_out])
    )
    sys.stdout.write(f"RF official mean AUROC: {result.auroc:.9f} ({result.label_count} labels)\n")
    assert abs(result.auroc - 0.867) < 0.03
