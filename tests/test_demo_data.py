from argparse import Namespace
from collections.abc import Callable
from pathlib import Path
from xml.parsers.expat import ParserCreate

import numpy as np
import pytest
import torch

from smellcule.experiment_data import ExperimentData
from smellcule.export.neighbours import build_neighbours
from smellcule.export.projection import project
from smellcule.export.structures import render_structure
from smellcule.metrics import FloatArray


@pytest.fixture(scope="module")
def catalogue_embeddings() -> tuple[ExperimentData, FloatArray]:
    from smellcule.cli.research import load_ensemble, prepare_context

    root = Path(__file__).resolve().parents[1]
    previous_threads = torch.get_num_threads()
    torch.set_num_threads(4)
    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setenv("SMELLCULE_CACHE", str(root / ".cache/smellcule"))
        try:
            context = prepare_context(
                Namespace(ensemble_size=10, device="cpu", command="evaluate"), ("cluster",)
            )
            ensemble = load_ensemble(root / "artifacts/cluster", context)
            embeddings = (
                ensemble.embed(context.lf.dataset, context.device).numpy().astype(np.float64)
            )
        finally:
            torch.set_num_threads(previous_threads)
    assert embeddings.shape == (len(context.lf.molecules), 2560)
    return context.lf, embeddings


@pytest.mark.data
def test_geosmin_neighbours(
    catalogue_embeddings: tuple[ExperimentData, FloatArray],
    record_property: Callable[[str, object], None],
) -> None:
    data, embeddings = catalogue_embeddings
    neighbours = build_neighbours(data.molecules, embeddings)
    for molecule, row in zip(data.molecules, neighbours, strict=True):
        assert len(row) == len({item.id for item in row}) == 8
        assert molecule.molecule_id not in {item.id for item in row}
    geosmin = next(i for i, mol in enumerate(data.molecules) if mol.name == "Geosmin")
    lowest_structure_similarity = min(item.structure for item in neighbours[geosmin])
    record_property("geosmin_lowest_neighbour_tanimoto", lowest_structure_similarity)
    assert lowest_structure_similarity < 0.30


@pytest.mark.data
def test_projection_full_catalogue(
    catalogue_embeddings: tuple[ExperimentData, FloatArray],
    record_property: Callable[[str, object], None],
) -> None:
    data, embeddings = catalogue_embeddings
    positions = project(embeddings)
    assert positions.shape == (len(data.molecules), 3)
    assert np.isfinite(positions).all()
    np.testing.assert_allclose(positions.mean(axis=0), 0, atol=1e-5)
    radius = float(np.percentile(np.linalg.norm(positions, axis=1), 98))
    record_property("radius_98th_percentile", radius)
    assert radius == pytest.approx(100, abs=1)


@pytest.mark.data
def test_structures_full_catalogue(
    catalogue_embeddings: tuple[ExperimentData, FloatArray],
) -> None:
    data, _ = catalogue_embeddings
    for molecule in data.molecules:
        svg = render_structure(molecule)
        is_final = True
        assert ParserCreate().Parse(svg, is_final) == 1
        assert "<rect" not in svg
