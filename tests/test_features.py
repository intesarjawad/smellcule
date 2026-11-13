from collections import Counter
from pathlib import Path

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from rdkit import Chem

from smellcule.catalogue import read_leffingwell
from smellcule.features import featurise

FIXTURE = Path(__file__).parent / "fixtures" / "leffingwell_fixture.csv"


def molecule(smiles: str) -> Chem.Mol:
    result = Chem.MolFromSmiles(smiles)
    assert result is not None
    return result


@pytest.mark.leffingwell_fixture
def test_features_vanillin_golden() -> None:
    _, rows = read_leffingwell(FIXTURE)
    vanillin = next(row for row in rows if row.name == "Vanillin")
    graph = featurise(molecule(vanillin.smiles))
    # Active columns are specified independently, in the feature order the model was trained on.
    atom_columns = (
        (0, 12, 18, 23, 27, 33),
        (2, 13, 18, 20, 26, 33),
        (0, 14, 18, 20, 26, 29, 30, 33),
        (0, 13, 18, 21, 26, 29, 30, 33),
        (0, 14, 18, 20, 26, 29, 30, 33),
        (0, 13, 18, 21, 26, 33),
        (2, 12, 18, 20, 26, 33),
        (0, 13, 18, 21, 26, 29, 30, 33),
        (0, 13, 18, 21, 26, 29, 30, 33),
        (0, 14, 18, 20, 26, 29, 30, 33),
        (2, 12, 18, 21, 26, 33),
    )
    expected_atoms = np.zeros((11, 34), dtype=np.float32)
    for index, columns in enumerate(atom_columns):
        expected_atoms[index, list(columns)] = 1
    bond_columns = (
        (0, 8),
        (0, 4, 8),
        (3, 4, 5, 8),
        (3, 4, 5, 8),
        (0, 4, 8),
        (1, 4, 8),
        (3, 4, 5, 8),
        (3, 4, 5, 8),
        (3, 4, 5, 8),
        (0, 4, 8),
        (3, 4, 5, 8),
    )
    expected_edges = np.zeros((22, 10), dtype=np.float32)
    for index, columns in enumerate(bond_columns):
        expected_edges[2 * index : 2 * index + 2, list(columns)] = 1
    undirected = (
        (0, 1),
        (1, 2),
        (2, 3),
        (3, 4),
        (4, 5),
        (5, 6),
        (4, 7),
        (7, 8),
        (8, 9),
        (9, 10),
        (9, 2),
    )
    expected_index = np.array(
        [edge for left, right in undirected for edge in ((left, right), (right, left))],
        dtype=np.int64,
    ).T
    np.testing.assert_array_equal(graph.atom_features, expected_atoms)
    np.testing.assert_array_equal(graph.edge_features, expected_edges)
    np.testing.assert_array_equal(graph.edge_index, expected_index)
    assert graph.atom_features.dtype == graph.edge_features.dtype == np.float32
    assert graph.edge_index.dtype == np.int64


@pytest.mark.leffingwell_fixture
@settings(deadline=None)
@given(st.data())
def test_features_atom_renumbering(data: st.DataObject) -> None:
    _, rows = read_leffingwell(FIXTURE)
    selected = [
        row
        for row in rows
        if row.name == "Vanillin" or any(marker in row.smiles for marker in ("@", "/", "\\"))
    ]
    assert len(selected) == 6
    for row in selected:
        original = molecule(row.smiles)
        order = data.draw(st.permutations(tuple(range(original.GetNumAtoms()))), label=row.name)
        before = featurise(original)
        after = featurise(Chem.RenumberAtoms(original, order))
        np.testing.assert_array_equal(after.atom_features, before.atom_features[list(order)])
        # Map both directed endpoints back to their original indices as well.
        before_edges = Counter(
            (int(edge[0]), int(edge[1]), tuple(features))
            for edge, features in zip(before.edge_index.T, before.edge_features, strict=True)
        )
        after_edges = Counter(
            (order[int(edge[0])], order[int(edge[1])], tuple(features))
            for edge, features in zip(after.edge_index.T, after.edge_features, strict=True)
        )
        assert before_edges == after_edges


@pytest.mark.parametrize(
    ("smiles", "index", "expected"),
    [
        ("N[C@H](C)C(=O)O", 1, (1, 0, 0)),
        ("N[C@@H](C)C(=O)O", 1, (0, 1, 0)),
        ("OC[C@H](O)[C@H](O)[C@H](O)CO", 4, (0, 1, 0)),
        ("OC[C@H](O)[C@@H](O)[C@H](O)CO", 4, (1, 0, 0)),
        ("NC(C)C(=O)O", 1, (0, 0, 1)),
    ],
)
def test_features_cip_atom_labels(smiles: str, index: int, expected: tuple[int, ...]) -> None:
    structure = molecule(smiles)
    properties = [atom.HasProp("_CIPCode") for atom in structure.GetAtoms()]
    graph = featurise(structure)
    np.testing.assert_array_equal(graph.atom_features[index, 31:], expected)
    assert [atom.HasProp("_CIPCode") for atom in structure.GetAtoms()] == properties


@pytest.mark.parametrize(
    ("smiles", "expected"),
    [("C/C=C/C", (1, 0, 0, 0)), ("C/C=C\\C", (0, 1, 0, 0)), ("CC=CC", (0, 0, 1, 0))],
)
def test_features_cip_bond_labels(smiles: str, expected: tuple[int, ...]) -> None:
    structure = molecule(smiles)
    graph = featurise(structure)
    np.testing.assert_array_equal(graph.edge_features[2:4, 6:], [expected, expected])
    assert not any(bond.HasProp("_CIPCode") for bond in structure.GetBonds())


@pytest.mark.parametrize("smiles", ["", "[He]", "C.C", "[NH4+]", "[O-]", "C#N"])
def test_features_empty_and_unbonded_shapes(smiles: str) -> None:
    structure = molecule(smiles)
    graph = featurise(structure)
    assert graph.atom_features.shape == (structure.GetNumAtoms(), 34)
    assert graph.edge_index.shape == (2, 2 * len(structure.GetBonds()))
    assert graph.edge_features.shape == (2 * len(structure.GetBonds()), 10)
    assert np.isfinite(graph.atom_features).all()


@pytest.mark.parametrize(
    ("smiles", "expected"),
    [
        ("[Fe-3]", (1, 0, 0)),
        ("[O-2]", (1, 0, 0)),
        ("[O-]", (1, 0, 0)),
        ("O", (0, 1, 0)),
        ("[NH4+]", (0, 0, 1)),
        ("[Ca+2]", (0, 0, 1)),
        ("[Fe+3]", (0, 0, 1)),
    ],
)
def test_features_saturates_charge_in_fixed_vocabulary(
    smiles: str, expected: tuple[int, ...]
) -> None:
    graph = featurise(molecule(smiles))
    np.testing.assert_array_equal(graph.atom_features[0, 17:20], expected)
