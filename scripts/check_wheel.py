"""Exercise a built wheel in a new environment and workspace outside the checkout."""

# ruff: noqa: S101, S603
# Executables and argument arrays below are local build tools and fixed smoke checks.
import argparse
import json
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
INVALID_COMMAND_EXIT_CODE = 2


def main() -> None:
    """Check installed defaults without relying on checkout config, schemas or imports."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("wheel", type=Path)
    wheel = parser.parse_args().wheel.resolve()
    uv = shutil.which("uv")
    if uv is None:
        message = "uv is required for the isolated wheel check."
        raise RuntimeError(message)
    with ZipFile(wheel) as archive:
        metadata = archive.read("smellcule-0.1.0.dist-info/METADATA").decode()
        assert "Author: Intesar Jawad" in metadata
        assert "License-File: LICENSE" in metadata
        assert (
            archive.read("smellcule-0.1.0.dist-info/licenses/LICENSE")
            == (ROOT / "LICENSE").read_bytes()
        )
    with TemporaryDirectory(prefix="smellcule-wheel-") as directory:
        work = Path(directory)
        venv = work / "venv"
        subprocess.run([uv, "venv", str(venv)], cwd=work, check=True)
        python = venv / "bin/python"
        subprocess.run(
            [uv, "pip", "install", "--python", str(python), f"{wheel}[research]"],
            cwd=work,
            check=True,
        )
        command = str(venv / "bin/smellcule")
        subprocess.run([command, "fetch", "leffingwell", "--help"], cwd=work, check=True)
        result = subprocess.run(
            [command, "fetch", "unknown"], cwd=work, capture_output=True, text=True, check=False
        )
        assert result.returncode == INVALID_COMMAND_EXIT_CODE
        assert "Choose from: leffingwell" in result.stderr
        shutil.copytree(ROOT / "tests/fixtures", work / "tests/fixtures")
        for catalogue in ("leffingwell", "keller"):
            subprocess.run(
                [
                    command,
                    "export",
                    "--fixtures",
                    "--catalogue",
                    catalogue,
                    "--out",
                    str(work / catalogue),
                ],
                cwd=work,
                check=True,
            )
            atlas = json.loads((work / catalogue / "atlas.json").read_text())
            assert atlas["catalogue"] == catalogue
            assert atlas["molecules"]
        script = """
import sys
from pathlib import Path
import smellcule
from smellcule import sources
from smellcule.cli import main
from smellcule.export.smellcule_lock import read_lock
from smellcule.resources import RESOURCE_ROOT
assert not Path(smellcule.__file__).resolve().is_relative_to(Path(sys.argv[1]))
assert len(sources.load_sources()) == 5
assert read_lock(RESOURCE_ROOT / 'config/puzzles.lock.json').start_date.isoformat() == '2026-11-13'
sources.fetch = lambda key: Path('tests/fixtures/leffingwell_fixture.csv')
sys.argv = ['smellcule', 'splits', '--out', 'splits']
main()
assert Path('splits/cluster-v1.csv').is_file()
"""
        subprocess.run([str(python), "-c", script, str(ROOT)], cwd=work, check=True)
    print("Wheel smoke checks passed outside the checkout.")


if __name__ == "__main__":
    main()
