import json
import re
from xml.parsers.expat import ParserCreate
from xml.sax.saxutils import escape, quoteattr

from rdkit.Chem.Draw.rdMolDraw2D import (
    MolDraw2DSVG,
    SetMonochromeMode,
    UpdateDrawerParamsFromJSON,
)

from smellcule.molecules import Molecule, source_structures

# Initial ink colour, until the text colour is chosen.
STRUCTURE_INK = "#F1E9DC"
STRUCTURE_WIDTH_PX = 240
STRUCTURE_HEIGHT_PX = 180


def render_structure(molecule: Molecule) -> str:
    """Draw a catalogued molecule as transparent, monochrome SVG without filesystem I/O."""
    structure = source_structures([molecule.smiles])[0]
    drawer = MolDraw2DSVG(STRUCTURE_WIDTH_PX, STRUCTURE_HEIGHT_PX)
    red, green, blue = bytes.fromhex(STRUCTURE_INK[1:])
    SetMonochromeMode(drawer, (red / 255, green / 255, blue / 255), (1.0, 1.0, 1.0))
    UpdateDrawerParamsFromJSON(drawer, json.dumps({"clearBackground": False}))
    drawer.DrawMolecule(structure)
    drawer.FinishDrawing()
    return drawer.GetDrawingText()


def _compact_attribute(key: str, value: str) -> str:
    compact = re.sub(r"\s+", " ", value).strip()
    if key == "style":
        compact = re.sub(r"\s*([:;])\s*", r"\1", compact).rstrip(";")
    return f" {key}={quoteattr(compact)}"


def minify_structure(svg: str, *, title: str = "Molecular structure") -> str:
    """Remove drawing metadata and insignificant whitespace without rounding geometry."""
    parts: list[str] = []
    skipped = 0
    referenced_defs = "url(" in svg or "href=" in svg
    parser = ParserCreate()

    def start(tag: str, attrs: dict[str, str]) -> None:
        nonlocal skipped
        if (
            skipped
            or tag.rsplit(":", maxsplit=1)[-1] == "metadata"
            or (tag == "defs" and not referenced_defs)
        ):
            skipped += 1
            return
        attributes = "".join(_compact_attribute(key, value) for key, value in attrs.items())
        parts.append(f"<{tag}{attributes}>")
        if tag == "svg":
            parts.append(f"<title>{escape(title)}</title>")

    def end(tag: str) -> None:
        nonlocal skipped
        if skipped:
            skipped -= 1
        elif parts[-1].startswith(f"<{tag} ") or parts[-1] == f"<{tag}>":
            parts[-1] = parts[-1][:-1] + "/>"
        else:
            parts.append(f"</{tag}>")

    def data(value: str) -> None:
        if not skipped and value.strip():
            # RDKit labels are paths; preserve text if a later renderer emits it.
            parts.append(escape(value))

    parser.StartElementHandler = start
    parser.EndElementHandler = end
    parser.CharacterDataHandler = data
    is_final = True
    parser.Parse(svg, is_final)
    return "".join(parts) + "\n"
