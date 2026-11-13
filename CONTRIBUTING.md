# Contributing

Read the [engineering standards](docs/engineering-standards.md).

Use CPython 3.13, uv 0.13.7, Node 26 and gitleaks 8.30.1. From the repository root:

```sh
make setup
make check
uv run smellcule --help
```

Run `make secrets` before submitting a change. Setup installs format, lint, type and secrets hooks. Dependencies are locked; never commit downloaded data, weights or the real bundle. Downloads must use pinned URLs and verified checksums.

Test behaviour with deterministic inputs. Numeric outputs need golden files and explicit tolerances;
model changes also require `make gate` with the pinned data. See [the extension guide](docs/extend.md)
for phrases, notes, sound mappings and prediction submissions. Cite an eligible source for note links.

Prediction submissions use `.github/ISSUE_TEMPLATE/submit-predictions.yml`. See [Submitting predictions](docs/submitting-predictions.md) for split exports, validation and scoring. Submissions may change only `submissions/<slug>/predictions.csv` and `meta.toml`; CSV probabilities are keyed by catalogue InChIKeys and read as data. No submitted code, checkpoints or structures are accepted.

Remote URLs, identity, reporting channels and publishing are pending publication; see the [development notes](docs/development.md). No personal email belongs in repository files.

## We say no to

- No molecule generation or design of any kind: no generative models, no optimisation toward a target smell, no "suggest a molecule", no structure editing. Permanent.
- No toxicity, bioactivity, potency, or any safety or hazard property prediction, display or ranking. Smellcule predicts perception descriptors only. Permanent.
- Predictions only for molecules in the curated fragrance and flavour catalogue (Leffingwell PMP 2001 via Pyrfume, 3,523 entries), or, in the licence fallback (§12), the 478 Keller and Vosshall 2016 stimuli. No arbitrary user-submitted structures: no SMILES box, no file upload, no drawing tool; the CLI and Python API resolve names and CAS numbers inside the catalogue and refuse anything else. `smellcule evaluate --predictions` accepts probabilities keyed by catalogue InChIKeys, never structures. Permanent.
- No mixture model. The decompiler averages single-molecule profiles and says so.
- No claim that the atlas layout or the Synesthesia mapping is scientific; the first is a projection for navigation (its measured trustworthiness is published), the second is authored art.
- No intensity, pleasantness or concentration modelling (sources do not record concentration consistently; the card says so).
- No accounts, analytics, comments, or server.
