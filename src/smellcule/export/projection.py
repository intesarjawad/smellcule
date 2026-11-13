import numpy as np
from numpy.typing import NDArray
from sklearn.manifold import TSNE
from threadpoolctl import threadpool_limits

from smellcule.metrics import MATRIX_DIMENSIONS, FloatArray

PROJECTION_DIMENSIONS = 3
PERPLEXITY = 30
RADIUS_PERCENTILE = 98
MAP_RADIUS = 100.0


def project(embeddings: FloatArray) -> NDArray[np.float32]:
    """Project row-aligned ensemble embeddings into centred map units, as little-endian f32."""
    if (
        embeddings.ndim != MATRIX_DIMENSIONS
        or embeddings.shape[0] <= PERPLEXITY
        or embeddings.shape[1] < PROJECTION_DIMENSIONS
        or not np.isfinite(embeddings).all()
    ):
        message = "Projection embeddings must be finite N x D with N > 30 and D >= 3."
        raise ValueError(message)
    norms = np.linalg.norm(embeddings, axis=1)
    if not np.isfinite(norms).all() or np.any(norms == 0):
        message = "Projection embeddings must have finite, nonzero norms for cosine distance."
        raise ValueError(message)
    # Avoid native-thread oversubscription on shared hosts.
    with threadpool_limits(limits=1):
        positions = (
            TSNE(
                n_components=PROJECTION_DIMENSIONS,
                perplexity=PERPLEXITY,
                init="pca",
                metric="cosine",
                random_state=0,
                method="barnes_hut",
            )
            .fit_transform(embeddings)
            .astype(np.float64)
        )
    positions -= positions.mean(axis=0)
    radius = float(np.percentile(np.linalg.norm(positions, axis=1), RADIUS_PERCENTILE))
    if not np.isfinite(positions).all() or not np.isfinite(radius) or radius <= 0:
        message = "Projection has no finite, positive radius; inspect the source embeddings."
        raise ValueError(message)
    return (positions * (MAP_RADIUS / radius)).astype("<f4")
