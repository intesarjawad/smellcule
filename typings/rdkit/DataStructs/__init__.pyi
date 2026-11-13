# Written against rdkit 2026.9.1.
from collections.abc import Callable, Sequence

class ExplicitBitVect: ...

BulkTanimotoSimilarity: Callable[[ExplicitBitVect, Sequence[ExplicitBitVect]], list[float]]
