Ship gate: PASS; ship the network. Cluster macro AUROC over labels with at least five positives: network 0.840000, RF 0.810000 (1 labels). Paired bootstrap 95 percent CI of network minus RF: [-0.020000, 0.080000].

# Evaluation

All measured values below come from the results file. AUROC and AUPRC are macro averages: all_labels requires a positive and a negative; stable_labels requires at least five positives. Each row records its label count. Intervals are bootstrap 95 percent confidence intervals. Official, GS-LF and cross-source resample molecules; cluster, calibration, domain and Keller resample whole clusters. Stereo intervals resample molecule pairs. Paired differences use the same resamples for both models.

GS-LF comparison: same protocol, different fold assignment. Ensemble sizes and mean prevalence appear beside the measured macro metrics. Published OpenPOM uses five folds and ten models per fold.

Map (run 9) requires the exported bundle and runs separately. Chemprop (run 10) uses its isolated environment; recorded submissions are included below.

## Published comparisons

| Model | AUROC | CI lower | CI upper | Source | Status |
| --- | ---: | ---: | ---: | --- | --- |
| Leffingwell GNN | 0.913000 | 0.908000 | 0.923000 | Leffingwell README Table 1 | published, not rerun |
| Leffingwell RF-Mordred | 0.882000 | 0.871000 | 0.891000 | Leffingwell README Table 1 | published, not rerun |
| Leffingwell RF-cFP | 0.867000 | 0.860000 | 0.880000 | Leffingwell README Table 1 | published, not rerun |
| OpenPOM | 0.887200 | not available | not available | OpenPOM GS-LF cross-validation | published, not rerun |
| POM | 0.890000 | not available | not available | Principal Odor Map, bioRxiv v4 | published, not rerun |

The source's caption says these are means over 138 descriptors; the released file has 113. Compared as published.

## Official Leffingwell split

Not evaluated; no result entry is present.

## Official split excluding leaked siblings

Not evaluated; no result entry is present.

## GS-LF cross-validation

Not evaluated; no result entry is present.

## Cluster-held-out split

| Measurement | Value |
| --- | ---: |
| ensemble_size | 10 |
| mpnn / stable_labels / auroc | 0.840000 |
| mpnn / stable_labels / auprc | 0.240000 |
| mpnn / stable_labels / label_count | 1 |
| mpnn / stable_labels / paired_auroc_difference_ci / lower | -0.020000 |
| mpnn / stable_labels / paired_auroc_difference_ci / upper | 0.080000 |
| rf / stable_labels / auroc | 0.810000 |
| rf / stable_labels / label_count | 1 |
| mean_prevalence | 0.250000 |

Test prevalence is the AUPRC chance level. Missing measurements remain unavailable.

| Descriptor | train_positive_counts | test_positive_counts | test_prevalence |
| --- | ---: | ---: | ---: |
| floral | 10 | 5 | 0.500000 |
| green | 3 | 0 | 0.000000 |

## Cross-source evaluation

Not evaluated; no result entry is present.

## Calibration

| Measurement | Value |
| --- | ---: |
| reliability_bins / 0 / probability | 0.100000 |
| reliability_bins / 0 / frequency | 0.200000 |
| reliability_bins / 0 / count | 20 |

## Applicability domain

| Measurement | Value |
| --- | ---: |
| bins / 0 / lower | 0.000000 |
| bins / 0 / upper | 0.300000 |
| bins / 0 / molecule_count | 7 |
| bins / 0 / metrics / all_labels / auroc | 0.800000 |
| bins / 0 / metrics / stable_labels / auroc | not available |

## Map quality

Not evaluated. Map (run 9) requires the exported bundle and runs separately.

## Keller cluster cross-validation

Not evaluated; no result entry is present.

## Stereo pairs

Held-out groups are the test; all groups include fitted predictions.

| Measurement | Value |
| --- | ---: |
| held_out / spearman | not available |
| all_groups / spearman | 0.200000 |

## Submitted predictions

| Measurement | Value |
| --- | ---: |
| Example / name | Example |
| Example / licence | MIT |
| Example / source_url | https://example.org/ |
| Example / official / all_labels / auroc | 0.900000 |

## Figures

![Reliability diagram](figures/reliability.svg)

![Applicability domain](figures/domain.svg)

Per-descriptor AUROC is not stored in the results file; no per-descriptor AUROC figure is inferred from aggregate metrics.
