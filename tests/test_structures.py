import re
from dataclasses import replace
from pathlib import Path
from xml.parsers.expat import ParserCreate

import pytest

from smellcule.catalogue import read_leffingwell
from smellcule.export.structures import STRUCTURE_INK, render_structure
from smellcule.molecules import standardise


def parse_svg(svg: str) -> list[tuple[str, dict[str, str]]]:
    elements: list[tuple[str, dict[str, str]]] = []
    parser = ParserCreate(namespace_separator="}")

    def collect_element(tag: str, attrs: dict[str, str]) -> None:
        elements.append((tag, attrs))

    parser.StartElementHandler = collect_element
    is_final = True
    assert parser.Parse(svg, is_final) == 1
    return elements


def test_structures_are_transparent_monochrome_xml_at_export_dimensions() -> None:
    _, rows = read_leffingwell(Path(__file__).parent / "fixtures/leffingwell_fixture.csv")
    for row in rows:
        molecule = standardise(row)
        svg = render_structure(molecule)
        elements = parse_svg(svg)
        tag, attrs = elements[0]
        assert tag == "http://www.w3.org/2000/svg}svg"
        assert attrs["width"] == "240px"
        assert attrs["height"] == "180px"
        assert not any(tag.endswith("}rect") for tag, _ in elements)
        colours = set(re.findall(r"#[0-9A-Fa-f]{6}", svg))
        assert colours == {STRUCTURE_INK}
        assert any(tag.endswith("}path") for tag, _ in elements)
        assert render_structure(molecule) == svg


def test_structures_reject_invalid_source_structure() -> None:
    _, rows = read_leffingwell(Path(__file__).parent / "fixtures/leffingwell_fixture.csv")
    molecule = replace(standardise(rows[0]), smiles="invalid")
    with pytest.raises(ValueError, match="Invalid source SMILES"):
        render_structure(molecule)
