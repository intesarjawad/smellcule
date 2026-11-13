# Written against scikit-learn 1.9.1.
from typing import Literal

import numpy as np
from numpy.typing import NDArray

class TSNE:
    def __init__(
        self,
        n_components: int = 2,
        *,
        perplexity: float = 30.0,
        init: Literal["pca", "random"] = "pca",
        metric: str = "euclidean",
        random_state: int | None = None,
        method: Literal["barnes_hut", "exact"] = "barnes_hut",
    ) -> None: ...
    def fit_transform(self, x: NDArray[np.float64], /) -> NDArray[np.float32]: ...

def trustworthiness(
    x: NDArray[np.float64],
    x_embedded: NDArray[np.float32] | NDArray[np.float64],
    /,
    *,
    n_neighbors: int = 5,
    metric: str = "euclidean",
) -> float: ...
