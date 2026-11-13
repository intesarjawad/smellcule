from __future__ import annotations

import argparse
import json
import re
import sys
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path

from smellcule.report import PUBLISHED

NUMBER = re.compile(
    r"(?<![\w.])[-+]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)"
    r"(?:[eE][-+]?\d+)?(?:[ \t]*%)?(?![\w])"
)
IGNORED = re.compile(
    r"(?ms)^\s*(`{3,}|~{3,})[^\n]*\n.*?^\s*\1\s*$|"
    r"(?s:`+[^`]*`+)|https?://[^\s<>\])]+"
)
MIN_INTEGER_CLAIM = 10


class SvgText(HTMLParser):
    """Collect visible SVG text without interpreting XML entities or geometry."""

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.text_depth = 0

    def handle_starttag(self, tag: str, _attrs: list[tuple[str, str | None]]) -> None:
        """Include accessible labels and visible text, excluding styles and geometry."""
        if tag in {"text", "tspan", "textpath", "title", "desc"}:
            self.text_depth += 1

    def handle_endtag(self, tag: str) -> None:
        """Close a visible or accessible text element."""
        if tag in {"text", "tspan", "textpath", "title", "desc"}:
            self.text_depth -= 1

    def handle_data(self, data: str) -> None:
        """Retain text nodes for the numeric claim scan."""
        if self.text_depth > 0:
            self.parts.append(data)


def numbers_in(value: object) -> set[Decimal]:
    """Collect numeric leaves and their documented display precision."""
    if isinstance(value, bool):
        return set()
    if isinstance(value, (int, float)):
        numeric = Decimal(str(value))
        return {numeric, Decimal(f"{value:.6f}")}
    if isinstance(value, dict):
        mapping: dict[str, object] = value
        return {number for item in mapping.values() for number in numbers_in(item)}
    if isinstance(value, (list, tuple)):
        items: list[object] | tuple[object, ...] = value
        return {number for item in items for number in numbers_in(item)}
    return set()


def read_allowlist(path: Path) -> set[Decimal]:
    """Require a reason for each permitted non-claim number."""
    allowed: set[Decimal] = set()
    if not path.exists():
        return allowed
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        token, separator, reason = line.partition("#")
        if not separator or not reason.strip():
            message = f"{path}: allowlist entries require a reason: {line}"
            raise ValueError(message)
        allowed.add(Decimal(token.strip().replace(",", "")))
    return allowed


def violations(content: str, allowed: set[Decimal], *, svg: bool = False) -> list[str]:
    """Reject unsupported claims, excluding code, URLs and SVG geometry."""
    if svg:
        parser = SvgText()
        parser.feed(content)
        content = " ".join(parser.parts)
    else:
        content = IGNORED.sub(lambda match: "\n" * match.group().count("\n"), content)
    failures: list[str] = []
    for match in NUMBER.finditer(content):
        token = match.group()
        percent = token.endswith("%")
        numeric = Decimal(token.rstrip("%").replace(",", ""))
        if (
            not percent
            and "." not in token
            and "e" not in token.lower()
            and abs(numeric) < MIN_INTEGER_CLAIM
        ):
            continue
        candidates = {numeric / 100} if percent else {numeric}
        if not candidates & allowed:
            line = content.count("\n", 0, match.start()) + 1
            failures.append(f"{line}: unsupported number {token}")
    return failures


def check(root: Path) -> list[str]:
    """Scan the public claim surfaces against committed numeric evidence."""
    allowed = numbers_in(PUBLISHED) | read_allowlist(root / "scripts/number_allowlist.txt")
    for relative in ("eval/results.json", "eval/data_counts.json"):
        allowed |= numbers_in(json.loads((root / relative).read_text(encoding="utf-8")))
    paths = [
        root / name
        for name in ("README.md", "docs/evaluation.md", "docs/data.md", "docs/extend.md")
    ]
    paths.extend(sorted((root / "docs/figures").glob("*.svg")))
    return [
        f"{path.relative_to(root)}:{failure}"
        for path in paths
        if path.exists()
        for failure in violations(
            path.read_text(encoding="utf-8"), allowed, svg=path.suffix == ".svg"
        )
    ]


def main() -> int:
    """Exit unsuccessfully with file and line diagnostics for unsupported claims."""
    parser = argparse.ArgumentParser(description="Check public numbers against recorded evidence.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    failures = check(args.root)
    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    print("Public numbers match recorded evidence or the reasoned allowlist.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
