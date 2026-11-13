# Written against rdkit 2026.9.1.
from collections.abc import Callable

from rdkit.Chem import Mol

CalcMolFormula: Callable[[Mol], str]
