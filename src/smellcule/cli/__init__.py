from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import NoReturn, TypeGuard

from smellcule import DEFAULT_MODEL, sources
from smellcule.cli.lookup_output import render
from smellcule.errors import DataError, MissingResearchExtra, SmellculeError
from smellcule.lookup import lookup


def is_result_object(value: object) -> TypeGuard[dict[str, object]]:
    """Recognise object values from decoded JSON."""
    # JSON guarantees string keys; individual result values still need validation.
    return isinstance(value, dict)


def read_results(path: Path) -> dict[str, object]:
    """Load a result object, rejecting malformed roots before any replacement."""
    document: object = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    if not is_result_object(document):
        message = f"Results at {path} must contain a JSON object."
        raise ValueError(message)
    return document


def update_results(path: Path, entries: dict[str, object]) -> None:
    """Atomically replace owned top-level entries, preserving other writers' results."""
    document = read_results(path)
    document.update(entries)
    encoded = json.dumps(document, indent=2, sort_keys=True, allow_nan=False) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as destination:
            destination.write(encoded)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


class CommandParser(argparse.ArgumentParser):
    """Keep argument failures within the command error contract."""

    def error(self, message: str) -> NoReturn:
        """Provide help as the actionable next step for invalid arguments."""
        raise SmellculeError(message, f"{self.prog} --help")


def _research_arguments(parser: argparse.ArgumentParser, command: str) -> None:
    parser.add_argument("--runs", default="all", help="Comma-separated run names or numbers.")
    parser.add_argument("--run", help="Single run name or number, alias for --runs.")
    parser.add_argument("--ensemble-size", type=int, default=10)
    parser.add_argument("--results", type=Path, default=Path("smellcule-results/results.json"))
    parser.add_argument("--report", type=Path, default=Path("smellcule-results/evaluation.md"))
    parser.add_argument("--artifacts", type=Path, default=Path("artifacts"))
    parser.add_argument("--device", choices=("cpu", "mps", "cuda"), default="cpu")
    parser.add_argument("--threads", type=int, default=4)
    if command == "evaluate":
        parser.add_argument("--bundle", type=Path, default=Path("dist/bundle"))
        parser.add_argument("--predictions", type=Path)
        parser.add_argument("--meta", type=Path)
        parser.add_argument("--name")
        parser.add_argument("--licence")
        parser.add_argument("--source-url")
        parser.add_argument("--split", choices=("official", "cluster"))


def _run_command(args: argparse.Namespace) -> None:
    if args.command == "export":
        from smellcule.cli.export import run_export

        run_export(args)
        return
    from smellcule.cli.research import run_map, run_research

    if (
        args.command == "evaluate"
        and args.predictions is None
        and any(
            getattr(args, flag) is not None
            for flag in ("meta", "name", "licence", "source_url", "split")
        )
    ):
        message = "Submission options require --predictions."
        raise ValueError(message)
    if args.command == "evaluate" and (args.run or args.runs) in {"map", "9"}:
        run_map(args)
    else:
        run_research(args)


def _main() -> None:
    """Run the catalogue perception command line interface."""
    parser = CommandParser(
        description="A map of how molecules smell, with a daily guessing game.",
        epilog=(
            "Examples:\n  smellcule lookup vanillin\n  smellcule lookup --json geosmin\n"
            "  smellcule lookup --model open vanillin"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subcommands = parser.add_subparsers(dest="command")
    lookup_parser = subcommands.add_parser(
        "lookup", help="Look up catalogued perception descriptors."
    )
    lookup_parser.add_argument("query")
    lookup_parser.add_argument("--model", choices=("lf", "open"), default=DEFAULT_MODEL)
    lookup_parser.add_argument("--json", action="store_true")
    fetch_parser = subcommands.add_parser("fetch", help="Fetch and verify pinned source datasets.")
    fetch_parser.add_argument(
        "keys", nargs="*", metavar="key", help="Source keys; defaults to all."
    )
    splits_parser = subcommands.add_parser("splits", help="Export pinned catalogue splits.")
    splits_parser.add_argument("--out", type=Path, required=True)
    export_parser = subcommands.add_parser("export", help="Write a validated perception bundle.")
    # Keep research imports out of the base command's startup path.
    export_parser.add_argument("--out", type=Path, default=Path("dist/bundle"))
    export_parser.add_argument(
        "--catalogue", choices=("leffingwell", "keller"), default="leffingwell"
    )
    export_parser.add_argument("--fixtures", action="store_true")
    export_parser.add_argument("--check", action="store_true")
    export_parser.add_argument("--write-fixture-outputs", action="store_true")
    export_parser.add_argument("--exported-on")
    for command in ("train", "evaluate", "reproduce"):
        research_parser = subcommands.add_parser(
            command, help=f"{command.capitalize()} pinned perception experiments."
        )
        _research_arguments(research_parser, command)
    args = parser.parse_args()
    _dispatch(args, parser)


def _dispatch(
    args: argparse.Namespace,
    parser: argparse.ArgumentParser,
) -> None:
    if args.command is None:
        parser.print_help()
    elif args.command == "lookup":
        result = lookup(args.query, args.model)
        print(
            json.dumps(asdict(result), sort_keys=True, allow_nan=False)
            if args.json
            else render(result)
        )
    elif args.command == "fetch":
        _fetch(args)
    elif args.command in ("train", "evaluate", "reproduce", "splits", "export"):
        try:
            _run_command(args)
        except ModuleNotFoundError as error:
            if error.name and error.name.split(".")[0] in {"torch", "rdkit", "sklearn", "yaml"}:
                message = (
                    f"smellcule {args.command} needs the research extra "
                    "(PyTorch, RDKit, scikit-learn)"
                )
                raise MissingResearchExtra(
                    message,
                    'pipx install --force "smellcule[research]"'
                    + (
                        ' --pip-args="--extra-index-url https://download.pytorch.org/whl/cpu"'
                        if sys.platform == "linux"
                        else ""
                    ),
                ) from error
            raise
        except SmellculeError:
            raise
        except OSError as error:
            raise DataError(str(error), f"smellcule {args.command} --help") from error
        except ValueError as error:
            next_step = (
                "smellcule splits --out splits; see docs/submitting-predictions.md"
                if args.command == "evaluate" and args.predictions is not None
                else f"smellcule {args.command} --help"
            )
            raise SmellculeError(str(error), next_step) from error


def _fetch_sources(args: argparse.Namespace) -> None:
    manifest = sources.load_sources()
    keys: list[str] = args.keys or list(manifest)
    unknown = [key for key in keys if key not in manifest]
    if unknown:
        message = f"Unknown sources: {', '.join(unknown)}. Choose from: {', '.join(manifest)}."
        raise SmellculeError(message, "smellcule fetch --help")
    for key in keys:
        print(f"{key}: {sources.fetch(key)}")


def _fetch(args: argparse.Namespace) -> None:
    try:
        _fetch_sources(args)
    except SmellculeError:
        raise
    except (ValueError, OSError) as error:
        raise DataError(str(error), "smellcule fetch --help") from error


def main() -> None:
    """Print actionable failures while leaving unexpected bugs visible."""
    try:
        _main()
    except SmellculeError as error:
        print(f"error: {error.what}\nnext: {error.next_step}", file=sys.stderr)
        raise SystemExit(error.exit_code) from error
