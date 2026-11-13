from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest

from smellcule.catalogue import read_leffingwell
from smellcule.export.neighbours import build_neighbours, nearest_train_similarities
from smellcule.metrics import FloatArray
from smellcule.molecules import Molecule, standardise


@pytest.fixture
def molecules() -> tuple[Molecule, ...]:
    _, rows = read_leffingwell(Path(__file__).parent / "fixtures/leffingwell_fixture.csv")
    return tuple(standardise(row) for row in rows[:10])


def test_neighbours_rank_full_embedding_cosine_and_preserve_row_ids(
    molecules: tuple[Molecule, ...],
) -> None:
    angles = np.arange(len(molecules)) / len(molecules)
    embeddings = np.column_stack((np.cos(angles), np.sin(angles)))
    embeddings *= np.arange(1, len(molecules) + 1)[:, None]
    neighbours = build_neighbours(molecules, embeddings)
    for index, row in enumerate(neighbours):
        expected = sorted(
            (other for other in range(len(molecules)) if other != index),
            key=lambda other: abs(angles[index] - angles[other]),
        )[:8]
        assert len(row) == len({item.id for item in row}) == 8
        assert molecules[index].molecule_id not in {item.id for item in row}
        # Symmetric angles can differ by floating point rounding; compare the scores.
        np.testing.assert_allclose(
            [item.odour for item in row], np.cos(angles[index] - angles[expected])
        )
        assert all(-1 <= item.odour <= 1 and 0 <= item.structure <= 1 for item in row)
    assert [item.id for item in neighbours[0]] == [row.molecule_id for row in molecules[1:9]]
    assert neighbours[0][0].odour == pytest.approx(np.cos(0.1))
    # The first two source fingerprints share 9 of 25 distinct bits.
    assert neighbours[0][0].structure == pytest.approx(9 / 25)


def test_neighbours_ties_exclude_self_and_use_catalogue_order(
    molecules: tuple[Molecule, ...],
) -> None:
    neighbours = build_neighbours(molecules, np.ones((len(molecules), 4)))
    for index, row in enumerate(neighbours):
        expected = [mol.molecule_id for i, mol in enumerate(molecules) if i != index][:8]
        assert [item.id for item in row] == expected
        assert [item.odour for item in row] == pytest.approx([1] * 8)


def test_neighbours_structure_is_achiral_binary_morgan(
    molecules: tuple[Molecule, ...],
) -> None:
    molecules = (
        replace(molecules[0], smiles="C[C@H](O)CC"),
        replace(molecules[1], smiles="C[C@@H](O)CC"),
        *molecules[2:],
    )
    embeddings = np.ones((len(molecules), 4))
    embeddings[1] *= -1
    neighbours = build_neighbours(molecules[:9], embeddings[:9])
    pair = next(item for item in neighbours[0] if item.id == molecules[1].molecule_id)
    assert pair.odour == pytest.approx(-1)
    assert pair.structure == 1
    assert any(item.structure < 1 for item in neighbours[0])


def test_neighbours_nearest_train_similarity_keeps_train_null(
    molecules: tuple[Molecule, ...],
) -> None:
    rows = (
        molecules[0],
        molecules[1],
        replace(molecules[2], smiles=molecules[1].smiles),
        molecules[3],
    )
    similarities = nearest_train_similarities(rows, ("train", "train", "validation", "held_out"))
    assert similarities[:2] == (None, None)
    assert similarities[2] == 1
    assert similarities[3] is not None
    assert 0 <= similarities[3] < 1
    assert nearest_train_similarities(rows, ("train",) * 4) == (None,) * 4
    with pytest.raises(ValueError, match="training molecule"):
        nearest_train_similarities(rows, ("held_out",) * 4)
    with pytest.raises(ValueError, match="row"):
        nearest_train_similarities(rows, ("train",))


@pytest.mark.parametrize(
    "embeddings",
    [
        np.ones((9, 3)),
        np.ones(10),
        np.ones((10, 0)),
        np.zeros((10, 3)),
        np.full((10, 3), np.nan),
        np.full((10, 3), np.inf),
    ],
)
def test_neighbours_reject_invalid_embeddings(
    molecules: tuple[Molecule, ...], embeddings: FloatArray
) -> None:
    with pytest.raises(ValueError, match="embeddings"):
        build_neighbours(molecules, embeddings)


def test_neighbours_reject_short_catalogue_and_duplicate_ids(
    molecules: tuple[Molecule, ...],
) -> None:
    with pytest.raises(ValueError, match="at least 9"):
        build_neighbours(molecules[:8], np.ones((8, 3)))
    with pytest.raises(ValueError, match="unique"):
        build_neighbours((molecules[0], *molecules[1:9], molecules[0]), np.ones((10, 3)))
