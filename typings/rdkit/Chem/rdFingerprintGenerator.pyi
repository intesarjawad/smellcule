# Written against rdkit 2026.9.1.
from collections.abc import Callable
from typing import Protocol, TypedDict, Unpack

import numpy as np
from numpy.typing import NDArray
from rdkit.Chem import Mol
from rdkit.DataStructs import ExplicitBitVect

class FingerprintGenerator64:
    GetCountFingerprintAsNumPy: Callable[[Mol], NDArray[np.uint32]]
    GetFingerprint: Callable[[Mol], ExplicitBitVect]

class _MorganOptions(TypedDict):
    radius: int
    fpSize: int
    includeChirality: bool

class _MorganGeneratorFactory(Protocol):
    def __call__(self, **kwargs: Unpack[_MorganOptions]) -> FingerprintGenerator64: ...

GetMorganGenerator: _MorganGeneratorFactory
