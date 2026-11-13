"""Refresh installed defaults from the repository's canonical config and schema files."""

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    """Copy only public runtime resources, without data or build artefacts."""
    for directory in ("config", "schemas"):
        for source in (ROOT / directory).iterdir():
            if source.is_file():
                target = ROOT / "src/smellcule/_resources" / directory / source.name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)


if __name__ == "__main__":
    main()
