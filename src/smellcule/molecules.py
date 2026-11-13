from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

import numpy as np
from rdkit import Chem, DataStructs
from rdkit.Chem import rdMolDescriptors
from rdkit.Chem.rdFingerprintGenerator import GetMorganGenerator

from smellcule.catalogue import CatalogueRow
from smellcule.metrics import FloatArray


@dataclass(frozen=True)
class Molecule:
    """Source structure with stereo-aware identity and unchanged catalogue targets."""

    molecule_id: str
    name: str
    cas: str | None
    smiles: str
    inchikey: str
    connectivity_key: str
    formula: str
    measured: tuple[int, ...]
    official_split: Literal["train", "held_out"]
    official_cv0: int
    cas_annotation: str | None = None


def standardise(row: CatalogueRow) -> Molecule:
    """Compute identity and formula without neutralising, stripping salts or tautomerising."""
    molecule = Chem.MolFromSmiles(row.smiles)
    if molecule is None:
        message = f"Invalid SMILES for molecule {row.molecule_id!r}: {row.smiles!r}."
        raise ValueError(message)
    inchikey = Chem.MolToInchiKey(molecule)
    return Molecule(
        molecule_id=row.molecule_id,
        name=row.name,
        cas=row.cas,
        smiles=row.smiles,
        inchikey=inchikey,
        connectivity_key=inchikey[:14],
        formula=rdMolDescriptors.CalcMolFormula(molecule),
        measured=row.measured,
        official_split=row.official_split,
        official_cv0=row.official_cv0,
        cas_annotation=row.cas_annotation,
    )


def source_structures(smiles: Sequence[str]) -> list[Chem.Mol]:
    """Parse source structures, rejecting invalid rows before training."""
    molecules: list[Chem.Mol] = []
    for value in smiles:
        molecule = Chem.MolFromSmiles(value)
        if molecule is None:
            message = f"Invalid source SMILES: {value!r}."
            raise ValueError(message)
        molecules.append(molecule)
    return molecules


def nearest_similarity(molecules: Sequence[Molecule], train: Sequence[Molecule]) -> FloatArray:
    """Use achiral binary Morgan Tanimoto, matching the cluster split."""
    generator = GetMorganGenerator(radius=2, fpSize=2048, includeChirality=False)
    reference = [
        generator.GetFingerprint(molecule)
        for molecule in source_structures([row.smiles for row in train])
    ]
    return np.array(
        [
            max(DataStructs.BulkTanimotoSimilarity(generator.GetFingerprint(molecule), reference))
            for molecule in source_structures([row.smiles for row in molecules])
        ],
        dtype=np.float64,
    )
