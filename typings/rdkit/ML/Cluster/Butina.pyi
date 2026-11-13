# Written against rdkit 2026.9.1.
from collections.abc import Sequence
from typing import Protocol, TypedDict, Unpack

class _ClusterOptions(TypedDict):
    isDistData: bool
    reordering: bool

class _ClusterData(Protocol):
    def __call__(
        self, data: Sequence[float], count: int, cutoff: float, /, **kwargs: Unpack[_ClusterOptions]
    ) -> tuple[tuple[int, ...], ...]: ...

ClusterData: _ClusterData
