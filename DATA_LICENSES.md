# Data licences

The MIT licence covers repository code. It does not relicense upstream data.

The committed Leffingwell-format CSVs and `site/public/fixture-data/` contain
synthetic descriptor assignments and seeded numeric outputs. They contain no
Leffingwell measurements or model predictions. Synthetic fixture data is offered
under CC BY 4.0; attribution is “Smellcule synthetic fixtures, seed 20261113”.
Molecule identities and structures are public metadata selected via Pyrfume;
provenance and exact generation commands are in [the fixture README](tests/fixtures/README.md).

The Keller CSV and `site/public/keller-fixture-data/` retain Keller and Vosshall
2016 measurements and derived outputs under CC BY 4.0, via Pyrfume. Notices ship
with that bundle. Aggregate evaluation results remain in `eval/` and the docs;
they are not per-molecule descriptor targets.

Real Leffingwell data and the `smellcule-lf` model are non-commercial.
Redistribution of catalogue fields and real derived artefacts remains pending a
licence query, which has not been sent. Never redistribute `odor_data` text.
Keller and `smellcule-open` are the permissive fallback.

Real bundles belong in release assets after their licensing requirements are
resolved. No trained weights or full source datasets are included in the software
archive.
