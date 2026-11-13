# Synthetic Leffingwell-format fixtures

The three CSVs `leffingwell_fixture.csv`, `content_catalogue.csv` and
`export_catalogue.csv` use the parser's source column names, but **all descriptor
assignments and split codes are synthetic**. They are not measurements of these
molecules. `fixture_model_outputs.json` contains seeded random probabilities,
spread, positions and embedding neighbours, not trained model outputs.
`synthetic-notes.yaml` and `synthetic-phrases.yaml` supply synthetic evidence for
content validation; their associations are not odour claims.

`molecule_identities.csv` retains only identifiers, names, CAS fields, structures
and selection flags, selected via the public Pyrfume archive at revision
`8054ea98ed675005ec10e67359902f500e4911b0`. It has no descriptors, measurements,
source split membership or predictions. These metadata preserve parser cases,
stereoisomers, the CAS annotation case, named navigation paths and structure
rendering. Identity/structure lookup: https://pubchem.ncbi.nlm.nih.gov/ .
The historical database IDs are retained solely for stable test routes.

Generate the fixtures without downloaded datasets or weights:

```sh
uv run python scripts/generate_fixtures.py
uv run python scripts/package_resources.py
uv run smellcule export --fixtures --out site/public/fixture-data
uv run smellcule export --fixtures --out site/public/fixture-data --check
```

The generator draws from the vocabulary in `config/families.yaml` plus `odorless`
with seed `20261113`. It assigns random evidence to authored note names and
phrase exemplars and adds that evidence to the corresponding synthetic rows.
Vocabulary coverage is intentional; no source descriptor assignments are read.
The bundle uses fixed export date `2000-01-01` and a synthetic model identifier.
Synthetic values are CC BY 4.0, attribution “Smellcule synthetic fixtures,
seed 20261113”. Aggregate statistics are copied from evaluation records for
presentation tests and retain their own provenance; they do not describe the
synthetic rows. Structure similarities are recomputed from public structures.

The generator writes the unpublished puzzle lock using the schedule's
`START_DATE`; published entries prevent resetting it. Leffingwell
`--write-fixture-outputs` is disabled to prevent recording restricted outputs
back into Git. Real Leffingwell sources and real predictions still require
separate redistribution clearance.

## Keller bundle fixture

`keller_fixture.csv` contains reconciled mean ratings for the lowest CIDs in
numeric order, retaining Vanillin, Eugenol and Guaiacol to complete a selection
of 40 molecules. Missing means remain empty fields. Its columns retain source
CID, name, CAS and canonical structure, followed by the Keller descriptor order.
The bundle uses the three highest observed means, breaking ties in descriptor
order. Exported IDs are zero-based positions in numeric CID order.

Source: Keller and Vosshall 2016, CC BY 4.0, via Pyrfume's `keller_2016`
`molecules.csv`, `stimuli.csv` and `behavior.csv` at revision
`8054ea98ed675005ec10e67359902f500e4911b0`. Checksums are pinned in
`config/sources.toml`.

`keller_fixture_model_outputs.json` records out-of-fold probabilities, spread
and fold-training similarities from `artifacts/keller_oof.npz`. Navigation
positions use the final `smellcule-open` ensemble; neighbours are reranked within
the fixture using its full embeddings. All assignments are `cross_validated`.
Family colours reuse the existing palette; `edible` is ungrouped.

Regenerate after a real Keller export with
`uv run smellcule export --catalogue keller --write-fixture-outputs --out dist/keller-bundle`,
then run `uv run smellcule export --catalogue keller --fixtures --out site/public/keller-fixture-data`.
Add `--check` for a byte comparison. Fixture export reads only the fixture CSV,
recorded JSON, family configuration and bundle schema; it needs no model
checkpoint, evaluation results or source download. Its fixed date is `2000-01-01`.
