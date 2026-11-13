# Sources and catalogue parsing

`config/sources.toml` pins URLs, revisions, SHA-256 digests and licence labels for
Leffingwell, GS-LF, and the three Keller source files. The manifest is also
packaged in installed distributions. Fetch and verify sources locally:

```sh
uv run smellcule fetch
```

`SMELLCULE_CACHE` overrides the default `~/.cache/smellcule` download directory.
Fetching does not grant redistribution permission; see [data licences](../DATA_LICENSES.md).

## Fetch behaviour

`fetch(key)` returns a verified `Path`. Optional `config_path` and `cache_dir`
arguments isolate callers and tests. Manifest parsing validates keys, required
fields, URL schemes and SHA-256 digests before cache mutation. Each cache hit is
hashed; corrupt cached bytes are discarded. Downloads stream to unique temporary
files in the destination directory and replace the cache atomically after checksum
verification. Failed downloads leave no partial file. Socket waits are bounded;
there is no total download deadline or automatic retry.

The CLI validates all requested keys before downloading. Unknown keys, checksum
mismatches and network failures exit with status two and an actionable next step.
Local HTTP tests exercise streaming, cache reuse and repair, interruptions and
incorrect hashes without external network access:

```sh
uv run pytest tests/test_sources.py
```

## Catalogue behaviour

`read_leffingwell(path)` returns sorted labels and immutable rows with binary
targets. `write_labels` writes that order explicitly. `read_gslf` reads sorted
binary label columns. `read_keller` reconciles high-concentration stimuli and
eligible subject ratings in `KELLER_DESCRIPTORS` order; missing observations are
`None`, not zero. Molecule standardisation computes stereo-aware InChIKeys and
formulae while retaining source structures and target values.

Full-data tests verify the pinned catalogue sizes, splits, structure parsing and
Keller reconciliation. Counts and exclusions are documented in [data](data.md).
Run them after fetching inputs with `uv run pytest -m data -k catalogue`.

Offline parser, model and exporter tests use synthetic Leffingwell-format
fixtures. Their identities and structures are separate from the generated label
assignments. They are deliberately not checked for equality with source
measurements. The Keller fixture retains its CC BY 4.0 source ratings. See
[fixture provenance and regeneration](../tests/fixtures/README.md).

`smellcule export` builds schema-validated JSON, binary arrays, structure SVGs,
splits and notices; `--fixtures --check` compares the committed fixture bundle
byte for byte. The site's unit suite exercises that bundle. `make check` runs
both Python and site unit tests; [development](development.md) lists the separate
real-data and browser gates.
