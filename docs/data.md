# Catalogue reconciliation

Keller's pinned `molecules.csv` has 481 rows. CID 5315892 (cinnamyl alcohol)
occurs twice with identical CanonicalSMILES. Retaining its first row yields
480 distinct CIDs before structure exclusions.

Two stimulus identifiers are CAS numbers rather than CIDs. Their corresponding
molecule rows have `CanonicalSMILES` equal to `NA` and are excluded:

| Stimulus CIDs | Molecule CID | Name |
| --- | --- | --- |
| 109-19-0 | 8038 | isobutyl acetate |
| 3796-70-1 | 1549778 | 6,10-Dimethyl-5,9-undecadien-2-one |

The remaining high-concentration selection joins to 478 structured molecules.
Keller CanonicalSMILES do not encode stereochemistry. Any later model card must
state that limitation.

The required subject filter and NA exclusion leave 120 descriptor means without
any numeric observations across 76 of these molecules. These cells are absent
measurements: `KellerRow.measured` contains `float | None`, and an empty mean is
`None`, never NaN or zero. For example, stimulus 51, CID 61005, has no eligible
BAKERY or FISH ratings. Structured molecules are retained even when a descriptor
has no observations.

Consumers must handle `None` explicitly, including masking absent measurements
when training or evaluating. The site export must serialize these cells as JSON
`null`; it must not impute a numeric value. The regression tests cover stimulus
51 BAKERY, a measured zero, and strict JSON serialization with `allow_nan=False`.

The full-data catalogue check writes `keller_molecules` (478) and
`keller_descriptors` (20) to `eval/data_counts.json`, preserving other counts.

<!-- splits:start -->
## Splits and leakage audit

Regenerated from `eval/data_counts.json` by `uv run pytest -m data -k splits`.

Official validation uses cv0 = 0 inside official train. The leakage audit
includes validation rows as official training siblings. Each crossing held-out
member is compared with its best training sibling using measured-label Jaccard.
The random baseline samples distinct-row ordered pairs with replacement across
pairs, using `numpy.random.default_rng(0)`. Empty label sets agree exactly.

Butina uses Morgan radius 2, 2048 bits, no chirality, distance cutoff 0.6,
and static neighbour ordering (`reordering=False`). Clusters are ordered by
SHA-256 of their smallest InChIKey. Whole clusters fill held-out to at least
20 percent, then validation to at least 10 percent, with the remainder in train.
The cutoff relates members to the centroid; it is not a pairwise bound.
No connectivity key crosses this split. Geosmin is in train; Limonene is in
validation. Reproduce these assertions with `uv run pytest -m data -k splits`.

GS-LF uses `KFold(n_splits=5, shuffle=True, random_state=0)`: same protocol,
different fold assignment from OpenPOM. Cross-source evaluation excludes every
Leffingwell connectivity key and projects targets to sorted shared labels.
Leffingwell-only labels are bread, brothy, catty, chicken, gasoline, horseradish,
jasmine and rum. Source row order and multiplicity are retained. This check
writes aggregate counts only; cross-source molecule targets stay offline.

| Metric | Measured value |
| --- | ---: |
| `leffingwell_molecules` | 3523 |
| `leffingwell_descriptors` | 113 |
| `official_held_out` | 722 |
| `official_train` | 2246 |
| `official_validation` | 555 |
| `cluster_clusters` | 714 |
| `cluster_largest` | 456 |
| `cluster_train` | 2400 |
| `cluster_held_out` | 770 |
| `cluster_validation` | 353 |
| `leakage_multi_member_groups` | 109 |
| `leakage_crossing_groups` | 36 |
| `leakage_crossing_molecules` | 79 |
| `leakage_held_out` | 40 |
| `sibling_jaccard_mean` | 0.592232 |
| `sibling_jaccard_median` | 0.585714 |
| `sibling_identical_count` | 10 |
| `random_pair_count` | 20000 |
| `random_pair_jaccard_mean` | 0.065230 |
| `gslf_molecules` | 4983 |
| `gslf_descriptors` | 138 |
| `gslf_folds` | 5 |
| `gslf_fold_0_test` | 997 |
| `gslf_fold_1_test` | 997 |
| `gslf_fold_2_test` | 997 |
| `gslf_fold_3_test` | 996 |
| `gslf_fold_4_test` | 996 |
| `cross_source_molecules` | 1644 |
| `cross_source_descriptors` | 105 |
<!-- splits:end -->

## Formal-charge saturation

Atom features have 34 columns, including three formal-charge
slots. Charges below -1 saturate to the -1 slot; charges above +1 saturate to
the +1 slot. This preserves that shape and the Vanillin golden bytes while
allowing multivalent ions through evaluation. Charge magnitude beyond one is
not represented. Expanding the vocabulary would change the fixed feature
contract. The full-source feature coverage test exercises all 3,523 Leffingwell,
4,983 GS-LF and 478 structured Keller rows, including GS-LF rows retained for
cross-source evaluation. No evaluation rows are removed to fit the encoder.

Butina fingerprints can differ even for structures sharing an InChI connectivity
key. The pair `O=c1cccc[nH]1` and `Oc1ccccn1` shares `UBQKCCHYAOITMY` but the
prescribed clustering and thresholds assign it to validation and held-out.
`cluster_split` now rejects any assignment crossing a connectivity key with a
`ValueError` naming the key and both partitions. It preserves the prescribed
clustering algorithm; it does not merge clusters or move rows between splits.
The pinned catalogue passes this invariant with all split counts unchanged.

Both streaming passes over Keller behavior validate CSV row width before
filtering. Extra or missing fields raise `ValueError` with the source path and
row number, including rows outside the selected stimuli. Atom-renumbering
checks compare each atom row through the permutation and each directed edge
through its mapped endpoints, so misplaced features cannot pass by preserving
only their multiset.

Validation: `uv run pytest -k 'features or batching or splits or catalogue'`
passes with 56 tests, including the full-source coverage and tautomer regression.
`make check` passes formatting, lint, strict typing, 78 tests without the data
marker, and site checks. The site test command finds no test files and exits
successfully. `eval/data_counts.json` is unchanged.
