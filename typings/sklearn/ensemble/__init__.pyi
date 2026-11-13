# Written against scikit-learn 1.9.1.
from typing import Self

import numpy as np
from numpy.typing import NDArray

class RandomForestClassifier:
    classes_: NDArray[np.float64] | list[NDArray[np.float64]]

    def __init__(self, *, n_estimators: int, n_jobs: int, random_state: int) -> None: ...
    def fit(self, x: NDArray[np.uint32], y: NDArray[np.float64], /) -> Self: ...
    def predict_proba(
        self, x: NDArray[np.uint32], /
    ) -> NDArray[np.float64] | list[NDArray[np.float64]]: ...
