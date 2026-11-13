# Written against scikit-learn 1.9.1.
from typing import Literal

import numpy as np
from numpy.typing import NDArray

def roc_auc_score(
    y_true: NDArray[np.generic], y_score: NDArray[np.generic], *, average: Literal["macro"]
) -> float: ...
