from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from rdkit import Chem
from rdkit.Chem import rdCIPLabeler

ATOM_FEATURE_DIM = 34
EDGE_FEATURE_DIM = 10
ELEMENTS = ("C", "N", "O", "S", "F", "Cl", "Br", "I", "P", "Si")
HYBRIDISATIONS = ("SP", "SP2", "SP3")
BOND_TYPES = ("SINGLE", "DOUBLE", "TRIPLE", "AROMATIC")


@dataclass(frozen=True)
class GraphArrays:
    """Atom rows and paired directed edges in the fixed feature order."""

    atom_features: NDArray[np.float32]
    edge_index: NDArray[np.int64]
    edge_features: NDArray[np.float32]


def _one_hot(index: int, width: int) -> list[float]:
    if not 0 <= index < width:
        message = f"Feature category index {index} is outside the supported range 0..{width - 1}."
        raise ValueError(message)
    return [float(column == index) for column in range(width)]


def _atom_row(atom: Chem.Atom) -> list[float]:
    element = atom.GetSymbol()
    hybridisation = str(atom.GetHybridization())
    cip = atom.GetProp("_CIPCode").upper() if atom.HasProp("_CIPCode") else ""
    return [
        *_one_hot(ELEMENTS.index(element) if element in ELEMENTS else len(ELEMENTS), 11),
        *_one_hot(atom.GetDegree(), 6),
        # Saturation preserves the three charge slots for multivalent ions.
        *_one_hot(max(-1, min(atom.GetFormalCharge(), 1)) + 1, 3),
        *_one_hot(atom.GetTotalNumHs(), 5),
        *_one_hot(
            HYBRIDISATIONS.index(hybridisation)
            if hybridisation in HYBRIDISATIONS
            else len(HYBRIDISATIONS),
            4,
        ),
        float(atom.GetIsAromatic()),
        float(atom.IsInRing()),
        *_one_hot(("R", "S").index(cip) if cip in {"R", "S"} else 2, 3),
    ]


def _bond_row(bond: Chem.Bond) -> list[float]:
    bond_type = str(bond.GetBondType())
    if bond_type not in BOND_TYPES:
        message = f"Unsupported bond type {bond_type!r}; expected one of {BOND_TYPES}."
        raise ValueError(message)
    cip = bond.GetProp("_CIPCode") if bond.HasProp("_CIPCode") else ""
    return [
        *_one_hot(BOND_TYPES.index(bond_type), 4),
        float(bond.GetIsConjugated()),
        float(bond.IsInRing()),
        *_one_hot(("E", "Z", "").index(cip) if cip in {"E", "Z", ""} else 3, 4),
    ]


def featurise(molecule: Chem.Mol) -> GraphArrays:
    """Encode a molecule without changing its properties or atom ordering."""
    labelled = Chem.Mol(molecule)
    rdCIPLabeler.AssignCIPLabels(labelled)
    atoms = [_atom_row(atom) for atom in labelled.GetAtoms()]
    edges: list[tuple[int, int]] = []
    bonds: list[list[float]] = []
    for bond in labelled.GetBonds():
        source, target = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        edges.extend(((source, target), (target, source)))
        row = _bond_row(bond)
        bonds.extend((row, row))
    return GraphArrays(
        np.asarray(atoms, dtype=np.float32).reshape(-1, ATOM_FEATURE_DIM),
        np.asarray(edges, dtype=np.int64).reshape(-1, 2).T.copy(),
        np.asarray(bonds, dtype=np.float32).reshape(-1, EDGE_FEATURE_DIM),
    )
