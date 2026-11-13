from pathlib import Path

from smellcule import sources
from smellcule.resources import RESOURCE_ROOT, resource_path

ROOT = Path(__file__).resolve().parents[1]


def test_packaged_defaults_match_canonical_resources() -> None:
    expected = {
        str(p.relative_to(ROOT)): p.read_bytes()
        for directory in ("config", "schemas")
        for p in (ROOT / directory).iterdir()
        if p.is_file()
    }
    actual = {
        str(p.relative_to(RESOURCE_ROOT)): p.read_bytes()
        for p in RESOURCE_ROOT.rglob("*")
        if p.is_file()
    }
    assert actual == expected, "Run uv run python scripts/package_resources.py"
    assert sources.load_sources() == sources.load_sources(ROOT / "config/sources.toml")


def test_resource_resolution_uses_installed_defaults_and_explicit_overrides(tmp_path: Path) -> None:
    relative = "config/families.yaml"
    assert resource_path(tmp_path, relative) == RESOURCE_ROOT / relative
    local = tmp_path / relative
    local.parent.mkdir()
    local.write_text("custom families")
    assert resource_path(tmp_path, relative) == local
