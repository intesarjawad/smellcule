from collections.abc import Sequence

from rdkit import DataStructs
from rdkit.Chem.rdFingerprintGenerator import GetMorganGenerator

from smellcule.export.smellcule import Clue
from smellcule.molecules import Molecule, source_structures
from smellcule.splits import MORGAN_BITS, MORGAN_RADIUS, Split


def build_clues(molecules: Sequence[Molecule], assignments: Sequence[Split]) -> tuple[Clue, ...]:
    """Find the nearest cluster-training structure by achiral binary Morgan Tanimoto."""
    if len(molecules) != len(assignments) or "train" not in assignments:
        message = "Structure clues require aligned splits and at least one training row."
        raise ValueError(message)
    train = [i for i, split in enumerate(assignments) if split == "train"]
    generator = GetMorganGenerator(radius=MORGAN_RADIUS, fpSize=MORGAN_BITS, includeChirality=False)
    fingerprints = [
        generator.GetFingerprint(molecule)
        for molecule in source_structures([row.smiles for row in molecules])
    ]
    reference = [fingerprints[i] for i in train]
    clues: list[Clue] = []
    for fingerprint in fingerprints:
        scores = DataStructs.BulkTanimotoSimilarity(fingerprint, reference)
        closest = max(range(len(train)), key=lambda i: scores[i])
        clues.append(Clue(train[closest], scores[closest]))
    return tuple(clues)
