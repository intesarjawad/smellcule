# Written against rdkit 2026.9.1.
from collections.abc import Callable

from rdkit.Chem import Mol

class MolDraw2DSVG:
    def __init__(self, width: int, height: int) -> None: ...
    DrawMolecule: Callable[[Mol], None]
    FinishDrawing: Callable[[], None]
    GetDrawingText: Callable[[], str]

SetMonochromeMode: Callable[
    [MolDraw2DSVG, tuple[float, float, float], tuple[float, float, float]], None
]
UpdateDrawerParamsFromJSON: Callable[[MolDraw2DSVG, str], None]
