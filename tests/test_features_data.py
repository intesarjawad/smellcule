from pathlib import Path

import numpy as np
import pytest
from test_features import molecule

from smellcule import catalogue, sources
from smellcule.features import featurise


@pytest.mark.data
@pytest.mark.parametrize(
    ("source", "expected_count"), [("leffingwell", 3523), ("gslf", 4983), ("keller", 478)]
)
def test_features_full_source_coverage(source: str, expected_count: int) -> None:
    cache = Path(__file__).resolve().parents[1] / ".cache" / "smellcule"
    if source == "leffingwell":
        _, rows = catalogue.read_leffingwell(sources.fetch(source, cache_dir=cache))
        smiles = [row.smiles for row in rows]
    elif source == "gslf":
        _, gslf = catalogue.read_gslf(sources.fetch(source, cache_dir=cache))
        smiles = [row.smiles for row in gslf]
    else:
        keller = catalogue.read_keller(
            sources.fetch("keller_molecules", cache_dir=cache),
            sources.fetch("keller_stimuli", cache_dir=cache),
            sources.fetch("keller_behavior", cache_dir=cache),
        )
        smiles = [row.smiles for row in keller]
    assert len(smiles) == expected_count
    for index, text in enumerate(smiles):
        structure = molecule(text)
        graph = featurise(structure)
        context = f"{source} row {index}: {text}"
        assert graph.atom_features.shape == (structure.GetNumAtoms(), 34), context
        assert graph.edge_index.shape == (2, 2 * len(structure.GetBonds())), context
        assert graph.edge_features.shape == (2 * len(structure.GetBonds()), 10), context
        assert np.isfinite(graph.atom_features).all(), context
        assert np.isfinite(graph.edge_features).all(), context
