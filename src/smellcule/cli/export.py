from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from pathlib import Path
from typing import TYPE_CHECKING

from smellcule.export.bundle import bundle_files, write_bundle
from smellcule.export.bundle_inputs import FIXTURE_EXPORTED_ON, load_fixture

if TYPE_CHECKING:
    import argparse


def run_export(args: argparse.Namespace) -> None:
    """Export locally without publishing or training a model."""
    root = Path.cwd()
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    if args.write_fixture_outputs:
        if args.fixtures or args.check:
            message = "--write-fixture-outputs cannot be combined with --fixtures or --check."
            raise ValueError(message)
        from smellcule.export.bundle_real import write_fixture_outputs

        write_fixture_outputs(root, args.out, args.catalogue)
        return
    if args.check and not args.fixtures:
        message = "--check requires --fixtures; real projections are platform dependent."
        raise ValueError(message)
    if args.fixtures:
        inputs = load_fixture(root, args.catalogue)
        exported_on = date.fromisoformat(FIXTURE_EXPORTED_ON)
    else:
        from smellcule.export.bundle_real import load_real

        exported_on = (
            date.fromisoformat(args.exported_on) if args.exported_on else datetime.now(UTC).date()
        )
        inputs = load_real(root, exported_on, args.catalogue)
    write_bundle(
        bundle_files(root, inputs, exported_on, fixtures=args.fixtures), args.out, check=args.check
    )
    print(f"Bundle {'verified' if args.check else 'written'}: {args.out}")
