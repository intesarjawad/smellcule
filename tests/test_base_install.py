import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.leffingwell_fixture
def test_base_install_blocks_research_imports(tmp_path: Path) -> None:
    script = """
import importlib.abc
import json
import sys
from pathlib import Path
class BlockResearch(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in {'torch', 'rdkit', 'sklearn', 'yaml'}:
            raise ModuleNotFoundError(name=fullname)
sys.meta_path.insert(0, BlockResearch())
from lookup_fixtures import install
install(Path.cwd(), Path(sys.argv[1]))
from smellcule.lookup import lookup
result = lookup('vanillin')
assert result.matches[0].name.casefold() == 'vanillin'
assert lookup(result.matches[0].cas).matches == result.matches
from smellcule.cli import main
sys.argv = ['smellcule', 'reproduce']
main()
"""
    result = subprocess.run(
        ["/bin/sh", "-c", 'exec "$SMELLCULE_TEST_PYTHON" - "$SMELLCULE_TEST_RELEASE"'],
        cwd=ROOT,
        env={
            **os.environ,
            "PYTHONPATH": str(ROOT / "tests"),
            "SMELLCULE_TEST_PYTHON": sys.executable,
            "SMELLCULE_TEST_RELEASE": str(tmp_path / "release"),
        },
        input=script,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 2, result.stderr
    assert result.stdout == ""
    assert result.stderr.startswith("error: smellcule reproduce needs the research extra")
    assert result.stderr.splitlines()[1].startswith("next: pipx install --force")
    assert len(result.stderr.splitlines()) == 2
