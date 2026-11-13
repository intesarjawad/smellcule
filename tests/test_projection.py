import numpy as np
import pytest
from sklearn.manifold import TSNE
from threadpoolctl import threadpool_info, threadpool_limits

from smellcule.export.projection import project
from smellcule.metrics import FloatArray


def test_projection_is_finite_centred_scaled_and_repeatable() -> None:
    embeddings = np.random.default_rng(0).normal(size=(40, 2560))
    positions = project(embeddings)
    assert positions.shape == (40, 3)
    assert positions.dtype == np.dtype("<f4")
    assert np.isfinite(positions).all()
    np.testing.assert_allclose(positions.mean(axis=0), 0, atol=1e-5)
    radii = np.linalg.norm(positions, axis=1)
    assert np.percentile(radii, 98) == pytest.approx(100, abs=1)
    np.testing.assert_array_equal(project(embeddings), positions)
    restored = np.frombuffer(positions.tobytes(), dtype="<f4").reshape(-1, 3)
    np.testing.assert_array_equal(restored, positions)


@pytest.mark.parametrize(
    "embeddings",
    [
        np.ones(40),
        np.ones((30, 4)),
        np.ones((40, 2)),
        np.zeros((40, 4)),
        np.full((40, 4), np.nan),
        np.full((40, 4), np.inf),
    ],
)
def test_projection_rejects_invalid_embeddings(embeddings: FloatArray) -> None:
    with pytest.raises(ValueError, match="embeddings"):
        project(embeddings)


def test_projection_bounds_native_threads_and_restores_the_caller(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original = TSNE.fit_transform
    observed: list[object] = []

    def fit(
        self: TSNE, embeddings: FloatArray
    ) -> np.ndarray[tuple[int, ...], np.dtype[np.float32]]:
        pools = threadpool_info()
        assert pools
        observed.extend(pool["num_threads"] for pool in pools)
        assert all(pool["num_threads"] == 1 for pool in pools)
        return original(self, embeddings)

    monkeypatch.setattr(TSNE, "fit_transform", fit)
    with threadpool_limits(limits=2):
        before = threadpool_info()
        project(np.random.default_rng(1).normal(size=(40, 8)))
        assert threadpool_info() == before
    assert observed
