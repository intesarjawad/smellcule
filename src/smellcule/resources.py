from pathlib import Path

RESOURCE_ROOT = Path(__file__).parent / "_resources"


def resource_path(root: Path, relative: str) -> Path:
    """Prefer explicit workspace configuration, falling back to installed defaults."""
    local = root / relative
    return local if local.is_file() else RESOURCE_ROOT / relative
