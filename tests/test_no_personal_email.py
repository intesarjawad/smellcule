import re
import subprocess
from pathlib import Path

import pytest

EMAIL = re.compile(
    rb"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})"
)
ALLOWED_DOMAINS = {b"noreply.github.com", b"example.com", b"example.org", b"example.net"}
ROOT = Path(__file__).resolve().parents[1]


def test_no_personal_email_in_repository() -> None:
    result = subprocess.run(
        ["/usr/bin/git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    violations: list[str] = []
    for filename in result.stdout.split(b"\0"):
        if not filename:
            continue
        path = ROOT / filename.decode()
        if not path.is_file():
            continue
        content = path.read_bytes()
        if b"\0" in content:
            continue
        for line_number, line in enumerate(content.splitlines(), start=1):
            for match in EMAIL.finditer(line):
                domain = match.group(1).lower()
                fixture = path.is_relative_to(ROOT / "tests")
                allowed = domain == b"noreply.github.com" or (fixture and domain in ALLOWED_DOMAINS)
                if not allowed:
                    violations.append(f"{filename.decode()}:{line_number}")
    assert not violations, "Personal email addresses found: " + ", ".join(violations)


@pytest.mark.parametrize("address", [b"contributor@example.org", b"123@noreply.github.com"])
def test_email_pattern_recognises_addresses(address: bytes) -> None:
    assert EMAIL.fullmatch(address) is not None


@pytest.mark.parametrize("reference", [b"@biomejs/biome", b"actions/checkout@v7.0.1"])
def test_email_pattern_allows_package_and_action_references(reference: bytes) -> None:
    assert EMAIL.search(reference) is None
