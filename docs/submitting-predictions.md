# Submitting predictions

Smellcule scores perception descriptor probabilities for the pinned Leffingwell
catalogue. It accepts catalogue InChIKeys and probabilities only.

Install the research extra and export the splits from your own hash-checked
Pyrfume fetch:

```sh
uv sync --all-extras --locked
uv run smellcule splits --out splits
```

This writes `official.csv` and `cluster-v1.csv`, each with the header
`inchikey,split` and assignments `train`, `validation` or `held_out`. It also
writes `labels.json` in the exact descriptor order. The export uses the pinned
source independently of the released bundle, including when the site uses
the Keller fallback. Leffingwell bundles also carry the split CSVs under the
data licence described in `DATA_LICENSES.md`.

Write a UTF-8 CSV with header `inchikey,<labels in labels.json order>`.
Include one row per molecule being scored, with a finite probability in
`[0, 1]` for every descriptor. Header spelling and order must match exactly.
Every key must match `^[A-Z]{14}-[A-Z]{10}-[A-Z]$`, belong to the catalogue,
and occur only once. The file must be at most 20 MB (20,000,000 bytes).
Every held-out molecule of each requested split must be present. Extra
catalogue rows are validated and ignored when scoring.

For local scoring, supply attribution flags:

```sh
uv run smellcule evaluate --predictions predictions.csv \
  --name 'My model' --licence MIT --source-url https://example.org/model \
  --results smellcule-results/results.json
```

The default scores both splits. Use `--split official` or `--split cluster`
to score just one. Each result reports macro AUROC and AUPRC, label counts,
seeded bootstrap intervals, positive counts and prevalence. Both the
nondegenerate-label average and the average over labels with at least five
positives are reported. Official intervals resample molecules; cluster
intervals resample whole Butina clusters. Training and validation rows are
excluded from scores.

Alternatively, pass `--meta meta.toml` in place of all three attribution flags.
The TOML file contains exactly these fields:

```toml
name = "My model"
licence = "MIT"
source_url = "https://example.org/model"
```

Use a single SPDX licence identifier and an absolute HTTP or HTTPS source URL.
The scorer checks identifier syntax; the contributor must supply the correct
SPDX identifier for the model. Names and URLs are stored as supplied attribution.
No submission content is imported or executed. Invalid input exits with code
2 and reports the row, column and reason. Results are written only after all
validation and scoring succeeds. The named entry under `submissions` is
replaced atomically; other submissions and experiment entries are retained.

To submit for review, change exactly these two files in a pull request:

```text
submissions/my-model/predictions.csv
submissions/my-model/meta.toml
```

The slug must contain only lowercase ASCII letters, digits and hyphens, and
be between one and forty characters long. Both files must be regular files.
Code, structures, checkpoints, config changes and other files are rejected.
The submission workflow validates the diff before installing or scoring,
uses the base commit's scorer, has a read-only token and receives no secrets.
Its scored table appears in the workflow summary. Merged submissions are
rescored for the next release; workflow results do not change committed scores.

The repository remote and submission URL are pending publication of the
repository. The issue template is
`.github/ISSUE_TEMPLATE/submit-predictions.yml`.
