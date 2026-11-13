from pathlib import Path

import pytest
import torch
from hypothesis import given, settings
from hypothesis import strategies as st
from rdkit import Chem
from test_features import molecule

from smellcule.batching import batch_graphs
from smellcule.catalogue import read_leffingwell
from smellcule.features import featurise
from smellcule.model import MessageStep, OdourMPNN, StableLinear
from smellcule.torch_api import manual_seed

FIXTURE = Path(__file__).parent / "fixtures" / "leffingwell_fixture.csv"


def test_model_shapes_embedding_and_gradients() -> None:
    manual_seed(0)
    batch = batch_graphs([featurise(molecule(smiles)) for smiles in ("CCO", "C.C", "[He]")])
    model = OdourMPNN(113)
    model.eval()
    embedding = model.embed(batch)
    logits = model.forward(batch)
    assert embedding.shape == (3, 256)
    assert logits.shape == (3, 113)
    torch.testing.assert_close(logits, model.head(embedding), atol=0, rtol=0)
    assert bool((embedding >= 0).all())
    gradients = torch.autograd.grad(logits.square().mean(), tuple(model.parameters()))
    for (name, _), gradient in zip(model.named_parameters(), gradients, strict=True):
        assert bool(torch.isfinite(gradient).all()), name
        assert bool((gradient != 0).any()), name


def test_model_empty_graph_rejected() -> None:
    batch = batch_graphs([featurise(molecule("CC")), featurise(molecule(""))])
    with pytest.raises(ValueError, match="empty molecular graph"):
        OdourMPNN(2).forward(batch)


def test_model_batch_members_do_not_exchange_messages() -> None:
    manual_seed(4)
    graphs = [featurise(molecule(smiles)) for smiles in ("CCC", "CCO", "C.C", "c1ccccc1")]
    model = OdourMPNN(5).eval()
    with torch.no_grad():
        together = model.forward(batch_graphs(graphs))
        apart = torch.cat([model.forward(batch_graphs([graph])) for graph in graphs])
    torch.testing.assert_close(together, apart, atol=1e-6, rtol=0)


def test_model_message_step_matches_residual_neighbour_sum() -> None:
    batch = batch_graphs([featurise(molecule("CCO"))])
    step = MessageStep(3)
    with torch.no_grad():
        step.edge_encoder.linear.weight.zero_()
        step.edge_encoder.linear.bias.copy_(torch.tensor([0.0, 1.0, -1.0]))
        for layer in step.mlp:
            if isinstance(layer, StableLinear):
                layer.linear.weight.copy_(torch.eye(3))
                layer.linear.bias.zero_()
    atoms = torch.tensor([[1.0, 2.0, -1.0], [2.0, -1.0, 3.0], [-1.0, 4.0, 2.0]])
    # C-C-O has neighbour sets {1}, {0, 2}, {1}; edge encoding precedes ReLU.
    neighbours = torch.tensor([[2.0, 0.0, 2.0], [1.0, 8.0, 1.0], [2.0, 0.0, 2.0]])
    residual = atoms + torch.relu(atoms + neighbours)
    expected = torch.nn.functional.layer_norm(residual, (3,))
    torch.testing.assert_close(step.forward(atoms, batch), expected)


@pytest.mark.leffingwell_fixture
@given(st.data())
# A forward pass is slower than the default deadline on a loaded machine; the property is the point.
@settings(deadline=None)
def test_model_atom_renumbering(data: st.DataObject) -> None:
    _, rows = read_leffingwell(FIXTURE)
    selected = [
        row
        for row in rows
        if row.name == "Vanillin" or any(marker in row.smiles for marker in ("@", "/", "\\"))
    ]
    assert len(selected) == 6
    manual_seed(0)
    model = OdourMPNN(113).eval()
    for row in selected:
        original = molecule(row.smiles)
        order = data.draw(st.permutations(tuple(range(original.GetNumAtoms()))), label=row.name)
        before = batch_graphs([featurise(original)])
        after = batch_graphs([featurise(Chem.RenumberAtoms(original, order))])
        with torch.no_grad():
            torch.testing.assert_close(
                model.forward(before), model.forward(after), atol=1e-6, rtol=0
            )
