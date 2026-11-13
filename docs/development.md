# Development

From the repository root:

```sh
make setup
make check
```

`make check` runs Ruff formatting and lint, strict Pyright, offline Python tests,
Biome, TypeScript, and the site's Vitest suite. Python correctness properties
have no elapsed-time deadline. The t-SNE projection bounds native thread pools
to one thread during fitting, then restores the caller's settings.

`make gate` runs checks requiring pinned datasets and released weights.
`make gate-site` checks a staged real bundle, browser journeys and bundle budgets.
Browser tests are separate from `make check`.

## Fixtures

The Leffingwell-format fixtures contain synthetic descriptors and seeded numeric
outputs, not Leffingwell measurements or predictions. Regenerate them with:

```sh
uv run python scripts/generate_fixtures.py
uv run smellcule export --fixtures --out site/public/fixture-data
uv run smellcule export --fixtures --out site/public/fixture-data --check
```

The generator also writes the unpublished puzzle lock from the schedule's
`START_DATE` (2026-11-13). It refuses to overwrite a lock with published entries.
Do not reset an already published schedule. See [fixture provenance](../tests/fixtures/README.md).

## Installed resources

Runtime defaults in `src/smellcule/_resources/` mirror `config/` and `schemas/`.
After editing either directory, run `uv run python scripts/package_resources.py`.
A regression test checks byte equality. The wheel includes those defaults and
`LICENSE`; explicit working-directory configuration takes precedence for exports.
Source fetching always uses the packaged manifest unless a caller supplies a path.
Research commands still need the research extra and locally fetched inputs or
model artefacts. Fixture export additionally needs the repository's fixture files.

Build and check a wheel outside the checkout:

```sh
uv build --wheel
uv run python scripts/check_wheel.py dist/smellcule-0.1.0-py3-none-any.whl
```

## Hooks and publication

`make setup` installs pre-commit hooks unless `core.hooksPath` is managed externally.
Make uses repository-local caches for uv, npm, pre-commit and Playwright.

Before publication, enable GitHub private reporting, resolve the Leffingwell
redistribution question for any real derived release, and complete the release
and deployment prerequisites before setting `SMELLCULE_RELEASE_READY` or
`SMELLCULE_DEPLOY_READY`. The fixture replacement does not clear real bundles,
model releases or historical Git objects for redistribution. Hosted workflows
and the human listening check require their own verification.
