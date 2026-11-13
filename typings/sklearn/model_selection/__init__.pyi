# Written against scikit-learn 1.9.1.
from collections.abc import Iterator, Sequence

import numpy as np
from numpy.typing import NDArray

class KFold:
    def __init__(self, *, n_splits: int, shuffle: bool, random_state: int) -> None: ...
    def split(
        self, x: Sequence[object], /
    ) -> Iterator[tuple[NDArray[np.intp], NDArray[np.intp]]]: ...
