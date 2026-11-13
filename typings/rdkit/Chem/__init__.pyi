# Written against rdkit 2026.9.1.
from collections.abc import Callable, Sequence
from typing import Protocol

class HybridizationType: ...
class BondType: ...

class Atom:
    GetSymbol: Callable[[], str]
    GetDegree: Callable[[], int]
    GetFormalCharge: Callable[[], int]
    GetTotalNumHs: Callable[[], int]
    GetHybridization: Callable[[], HybridizationType]
    GetIsAromatic: Callable[[], bool]
    IsInRing: Callable[[], bool]
    HasProp: Callable[[str], int]
    GetProp: Callable[[str], str]

class Bond:
    GetBondType: Callable[[], BondType]
    GetIsConjugated: Callable[[], bool]
    IsInRing: Callable[[], bool]
    HasProp: Callable[[str], int]
    GetProp: Callable[[str], str]
    GetBeginAtomIdx: Callable[[], int]
    GetEndAtomIdx: Callable[[], int]

class Mol:
    def __init__(self, other: Mol) -> None: ...
    GetAtoms: Callable[[], Sequence[Atom]]
    GetBonds: Callable[[], Sequence[Bond]]
    GetNumAtoms: Callable[[], int]

class _SmilesParser(Protocol):
    def __call__(self, smiles: str, /, sanitize: bool = True) -> Mol | None: ...

MolFromSmiles: _SmilesParser
MolToInchiKey: Callable[[Mol], str]
RenumberAtoms: Callable[[Mol, Sequence[int]], Mol]
