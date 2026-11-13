Ship gate: PASS; ship the network. Cluster macro AUROC over labels with at least five positives: network 0.859706, RF 0.813293 (80 labels). Paired bootstrap 95 percent CI of network minus RF: [0.031121, 0.056972].

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

| Measurement | Value |
| --- | ---: |
| device | cpu |
| ensemble_size | 10 |
| machine | macOS-27.2-arm64-arm-64bit-Mach-O |
| mean_prevalence | 0.033413 |
| molecule_count | 722 |
| mpnn / all_labels / auprc | 0.393365 |
| mpnn / all_labels / auprc_ci / lower | 0.390198 |
| mpnn / all_labels / auprc_ci / resamples | 1000 |
| mpnn / all_labels / auprc_ci / upper | 0.440276 |
| mpnn / all_labels / auroc | 0.905877 |
| mpnn / all_labels / ci / lower | 0.895866 |
| mpnn / all_labels / ci / resamples | 1000 |
| mpnn / all_labels / ci / upper | 0.915462 |
| mpnn / all_labels / label_count | 113 |
| mpnn / all_labels / paired_auroc_difference_ci / lower | 0.029687 |
| mpnn / all_labels / paired_auroc_difference_ci / resamples | 1000 |
| mpnn / all_labels / paired_auroc_difference_ci / upper | 0.050903 |
| mpnn / stable_labels / auprc | 0.402213 |
| mpnn / stable_labels / auprc_ci / lower | 0.398461 |
| mpnn / stable_labels / auprc_ci / resamples | 1000 |
| mpnn / stable_labels / auprc_ci / upper | 0.447085 |
| mpnn / stable_labels / auroc | 0.908809 |
| mpnn / stable_labels / ci / lower | 0.899645 |
| mpnn / stable_labels / ci / resamples | 1000 |
| mpnn / stable_labels / ci / upper | 0.917136 |
| mpnn / stable_labels / label_count | 105 |
| mpnn / stable_labels / paired_auroc_difference_ci / lower | 0.028367 |
| mpnn / stable_labels / paired_auroc_difference_ci / resamples | 1000 |
| mpnn / stable_labels / paired_auroc_difference_ci / upper | 0.049172 |
| rf / all_labels / auprc | 0.338899 |
| rf / all_labels / auprc_ci / lower | 0.335016 |
| rf / all_labels / auprc_ci / resamples | 1000 |
| rf / all_labels / auprc_ci / upper | 0.386658 |
| rf / all_labels / auroc | 0.865890 |
| rf / all_labels / ci / lower | 0.850876 |
| rf / all_labels / ci / resamples | 1000 |
| rf / all_labels / ci / upper | 0.880637 |
| rf / all_labels / label_count | 113 |
| rf / stable_labels / auprc | 0.343296 |
| rf / stable_labels / auprc_ci / lower | 0.338777 |
| rf / stable_labels / auprc_ci / resamples | 1000 |
| rf / stable_labels / auprc_ci / upper | 0.388407 |
| rf / stable_labels / auroc | 0.869973 |
| rf / stable_labels / ci / lower | 0.856895 |
| rf / stable_labels / ci / resamples | 1000 |
| rf / stable_labels / ci / upper | 0.883700 |
| rf / stable_labels / label_count | 105 |
| rf_ensemble_size | 1 |
| threads | 4 |
| training / wall_time_s | 340.452806 |
| versions / numpy | 2.5.4 |
| versions / python | 3.13.16 |
| versions / rdkit | 2026.9.1 |
| versions / scikit-learn | 1.9.1 |
| versions / torch | 2.15.0 |
| wall_time_s | 428.430865 |

Test prevalence is the AUPRC chance level. Missing measurements remain unavailable.

| Descriptor | train_positive_counts | test_positive_counts | test_prevalence |
| --- | ---: | ---: | ---: |
| alcoholic | 54.000000 | 17.000000 | 0.023546 |
| aldehydic | 18.000000 | 4.000000 | 0.005540 |
| alliaceous | 43.000000 | 15.000000 | 0.020776 |
| almond | 30.000000 | 10.000000 | 0.013850 |
| animal | 31.000000 | 10.000000 | 0.013850 |
| anisic | 27.000000 | 9.000000 | 0.012465 |
| apple | 151.000000 | 49.000000 | 0.067867 |
| apricot | 20.000000 | 7.000000 | 0.009695 |
| aromatic | 35.000000 | 12.000000 | 0.016620 |
| balsamic | 106.000000 | 33.000000 | 0.045706 |
| banana | 41.000000 | 15.000000 | 0.020776 |
| beefy | 18.000000 | 5.000000 | 0.006925 |
| berry | 45.000000 | 16.000000 | 0.022161 |
| black currant | 15.000000 | 5.000000 | 0.006925 |
| brandy | 19.000000 | 7.000000 | 0.009695 |
| bread | 17.000000 | 5.000000 | 0.006925 |
| brothy | 11.000000 | 7.000000 | 0.009695 |
| burnt | 77.000000 | 32.000000 | 0.044321 |
| buttery | 61.000000 | 22.000000 | 0.030471 |
| cabbage | 18.000000 | 5.000000 | 0.006925 |
| camphoreous | 40.000000 | 15.000000 | 0.020776 |
| caramellic | 101.000000 | 33.000000 | 0.045706 |
| catty | 13.000000 | 4.000000 | 0.005540 |
| chamomile | 14.000000 | 5.000000 | 0.006925 |
| cheesy | 89.000000 | 32.000000 | 0.044321 |
| cherry | 26.000000 | 7.000000 | 0.009695 |
| chicken | 19.000000 | 6.000000 | 0.008310 |
| chocolate | 17.000000 | 6.000000 | 0.008310 |
| cinnamon | 13.000000 | 8.000000 | 0.011080 |
| citrus | 127.000000 | 43.000000 | 0.059557 |
| cocoa | 47.000000 | 21.000000 | 0.029086 |
| coconut | 29.000000 | 8.000000 | 0.011080 |
| coffee | 35.000000 | 13.000000 | 0.018006 |
| cognac | 50.000000 | 16.000000 | 0.022161 |
| coumarinic | 23.000000 | 8.000000 | 0.011080 |
| creamy | 49.000000 | 22.000000 | 0.030471 |
| cucumber | 17.000000 | 5.000000 | 0.006925 |
| dairy | 43.000000 | 16.000000 | 0.022161 |
| dry | 20.000000 | 6.000000 | 0.008310 |
| earthy | 103.000000 | 43.000000 | 0.059557 |
| ethereal | 124.000000 | 39.000000 | 0.054017 |
| fatty | 261.000000 | 81.000000 | 0.112188 |
| fermented | 64.000000 | 25.000000 | 0.034626 |
| fishy | 37.000000 | 11.000000 | 0.015235 |
| floral | 349.000000 | 119.000000 | 0.164820 |
| fresh | 148.000000 | 50.000000 | 0.069252 |
| fruity | 890.000000 | 280.000000 | 0.387812 |
| garlic | 53.000000 | 18.000000 | 0.024931 |
| gasoline | 30.000000 | 10.000000 | 0.013850 |
| grape | 29.000000 | 10.000000 | 0.013850 |
| grapefruit | 16.000000 | 6.000000 | 0.008310 |
| grassy | 17.000000 | 6.000000 | 0.008310 |
| green | 580.000000 | 185.000000 | 0.256233 |
| hay | 27.000000 | 8.000000 | 0.011080 |
| hazelnut | 21.000000 | 6.000000 | 0.008310 |
| herbal | 255.000000 | 87.000000 | 0.120499 |
| honey | 51.000000 | 19.000000 | 0.026316 |
| horseradish | 13.000000 | 3.000000 | 0.004155 |
| jasmine | 27.000000 | 8.000000 | 0.011080 |
| ketonic | 18.000000 | 6.000000 | 0.008310 |
| leafy | 34.000000 | 10.000000 | 0.013850 |
| leathery | 13.000000 | 4.000000 | 0.005540 |
| lemon | 16.000000 | 5.000000 | 0.006925 |
| malty | 19.000000 | 4.000000 | 0.005540 |
| meaty | 139.000000 | 44.000000 | 0.060942 |
| medicinal | 22.000000 | 9.000000 | 0.012465 |
| melon | 51.000000 | 18.000000 | 0.024931 |
| metallic | 14.000000 | 8.000000 | 0.011080 |
| milky | 27.000000 | 8.000000 | 0.011080 |
| mint | 76.000000 | 27.000000 | 0.037396 |
| mushroom | 38.000000 | 13.000000 | 0.018006 |
| musk | 14.000000 | 4.000000 | 0.005540 |
| musty | 59.000000 | 20.000000 | 0.027701 |
| nutty | 138.000000 | 49.000000 | 0.067867 |
| odorless | 46.000000 | 14.000000 | 0.019391 |
| oily | 128.000000 | 41.000000 | 0.056787 |
| onion | 77.000000 | 29.000000 | 0.040166 |
| orange | 33.000000 | 13.000000 | 0.018006 |
| orris | 19.000000 | 4.000000 | 0.005540 |
| peach | 28.000000 | 12.000000 | 0.016620 |
| pear | 58.000000 | 19.000000 | 0.026316 |
| phenolic | 51.000000 | 18.000000 | 0.024931 |
| pine | 20.000000 | 9.000000 | 0.012465 |
| pineapple | 88.000000 | 30.000000 | 0.041551 |
| plum | 17.000000 | 7.000000 | 0.009695 |
| popcorn | 15.000000 | 5.000000 | 0.006925 |
| potato | 20.000000 | 6.000000 | 0.008310 |
| pungent | 73.000000 | 25.000000 | 0.034626 |
| radish | 13.000000 | 4.000000 | 0.005540 |
| ripe | 21.000000 | 5.000000 | 0.006925 |
| roasted | 121.000000 | 39.000000 | 0.054017 |
| rose | 102.000000 | 39.000000 | 0.054017 |
| rum | 36.000000 | 14.000000 | 0.019391 |
| savory | 51.000000 | 18.000000 | 0.024931 |
| sharp | 37.000000 | 11.000000 | 0.015235 |
| smoky | 29.000000 | 11.000000 | 0.015235 |
| solvent | 24.000000 | 10.000000 | 0.013850 |
| sour | 29.000000 | 9.000000 | 0.012465 |
| spicy | 120.000000 | 45.000000 | 0.062327 |
| strawberry | 16.000000 | 6.000000 | 0.008310 |
| sulfurous | 156.000000 | 55.000000 | 0.076177 |
| sweet | 521.000000 | 173.000000 | 0.239612 |
| tea | 21.000000 | 8.000000 | 0.011080 |
| tobacco | 34.000000 | 12.000000 | 0.016620 |
| tomato | 14.000000 | 5.000000 | 0.006925 |
| tropical | 127.000000 | 44.000000 | 0.060942 |
| vanilla | 40.000000 | 12.000000 | 0.016620 |
| vegetable | 103.000000 | 35.000000 | 0.048476 |
| violet | 16.000000 | 6.000000 | 0.008310 |
| warm | 25.000000 | 7.000000 | 0.009695 |
| waxy | 159.000000 | 47.000000 | 0.065097 |
| winey | 113.000000 | 33.000000 | 0.045706 |
| woody | 133.000000 | 44.000000 | 0.060942 |

## Official split excluding leaked siblings

Sibling agreement, including the random-pair baseline, justifies the leakage audit. These scores reuse official predictions.

| Sibling agreement | Value |
| --- | ---: |
| random_pair_mean | 0.065230 |
| sibling_agreement_mean | 0.592232 |
| sibling_agreement_median | 0.585714 |
| sibling_identical_count | 10 |

| Measurement | Value |
| --- | ---: |
| device | cpu |
| ensemble_size | 10 |
| machine | macOS-27.2-arm64-arm-64bit-Mach-O |
| mean_prevalence | 0.033530 |
| molecule_count | 682 |
| mpnn / all_labels / auprc | 0.387825 |
| mpnn / all_labels / auprc_ci / lower | 0.384993 |
| mpnn / all_labels / auprc_ci / resamples | 1000 |
| mpnn / all_labels / auprc_ci / upper | 0.435173 |
| mpnn / all_labels / auroc | 0.902603 |
| mpnn / all_labels / ci / lower | 0.892010 |
| mpnn / all_labels / ci / resamples | 1000 |
| mpnn / all_labels / ci / upper | 0.912603 |
| mpnn / all_labels / label_count | 113 |
| mpnn / all_labels / paired_auroc_difference_ci / lower | 0.030342 |
| mpnn / all_labels / paired_auroc_difference_ci / resamples | 1000 |
| mpnn / all_labels / paired_auroc_difference_ci / upper | 0.053449 |
| mpnn / stable_labels / auprc | 0.396536 |
| mpnn / stable_labels / auprc_ci / lower | 0.393152 |
| mpnn / stable_labels / auprc_ci / resamples | 1000 |
| mpnn / stable_labels / auprc_ci / upper | 0.441418 |
| mpnn / stable_labels / auroc | 0.904457 |
| mpnn / stable_labels / ci / lower | 0.894180 |
| mpnn / stable_labels / ci / resamples | 1000 |
| mpnn / stable_labels / ci / upper | 0.914021 |
| mpnn / stable_labels / label_count | 101 |
| mpnn / stable_labels / paired_auroc_difference_ci / lower | 0.028962 |
| mpnn / stable_labels / paired_auroc_difference_ci / resamples | 1000 |
| mpnn / stable_labels / paired_auroc_difference_ci / upper | 0.048686 |
| rf / all_labels / auprc | 0.318163 |
| rf / all_labels / auprc_ci / lower | 0.316693 |
| rf / all_labels / auprc_ci / resamples | 1000 |
| rf / all_labels / auprc_ci / upper | 0.365600 |
| rf / all_labels / auroc | 0.860216 |
| rf / all_labels / ci / lower | 0.846961 |
| rf / all_labels / ci / resamples | 1000 |
| rf / all_labels / ci / upper | 0.875575 |
| rf / all_labels / label_count | 113 |
| rf / stable_labels / auprc | 0.327661 |
| rf / stable_labels / auprc_ci / lower | 0.325350 |
| rf / stable_labels / auprc_ci / resamples | 1000 |
| rf / stable_labels / auprc_ci / upper | 0.371616 |
| rf / stable_labels / auroc | 0.865309 |
| rf / stable_labels / ci / lower | 0.852514 |
| rf / stable_labels / ci / resamples | 1000 |
| rf / stable_labels / ci / upper | 0.878960 |
| rf / stable_labels / label_count | 101 |
| rf_ensemble_size | 1 |
| sibling_agreement / random_pair_mean | 0.065230 |
| sibling_agreement / sibling_agreement_mean | 0.592232 |
| sibling_agreement / sibling_agreement_median | 0.585714 |
| sibling_agreement / sibling_identical_count | 10 |
| threads | 4 |
| training / wall_time_s | 340.452806 |
| versions / numpy | 2.5.4 |
| versions / python | 3.13.16 |
| versions / rdkit | 2026.9.1 |
| versions / scikit-learn | 1.9.1 |
| versions / torch | 2.15.0 |
| wall_time_s | 418.762198 |

Test prevalence is the AUPRC chance level. Missing measurements remain unavailable.

| Descriptor | train_positive_counts | test_positive_counts | test_prevalence |
| --- | ---: | ---: | ---: |
| alcoholic | 54.000000 | 17.000000 | 0.024927 |
| aldehydic | 18.000000 | 4.000000 | 0.005865 |
| alliaceous | 43.000000 | 15.000000 | 0.021994 |
| almond | 30.000000 | 10.000000 | 0.014663 |
| animal | 31.000000 | 10.000000 | 0.014663 |
| anisic | 27.000000 | 9.000000 | 0.013196 |
| apple | 151.000000 | 46.000000 | 0.067449 |
| apricot | 20.000000 | 7.000000 | 0.010264 |
| aromatic | 35.000000 | 12.000000 | 0.017595 |
| balsamic | 106.000000 | 33.000000 | 0.048387 |
| banana | 41.000000 | 15.000000 | 0.021994 |
| beefy | 18.000000 | 5.000000 | 0.007331 |
| berry | 45.000000 | 16.000000 | 0.023460 |
| black currant | 15.000000 | 4.000000 | 0.005865 |
| brandy | 19.000000 | 7.000000 | 0.010264 |
| bread | 17.000000 | 5.000000 | 0.007331 |
| brothy | 11.000000 | 7.000000 | 0.010264 |
| burnt | 77.000000 | 32.000000 | 0.046921 |
| buttery | 61.000000 | 22.000000 | 0.032258 |
| cabbage | 18.000000 | 5.000000 | 0.007331 |
| camphoreous | 40.000000 | 12.000000 | 0.017595 |
| caramellic | 101.000000 | 32.000000 | 0.046921 |
| catty | 13.000000 | 4.000000 | 0.005865 |
| chamomile | 14.000000 | 4.000000 | 0.005865 |
| cheesy | 89.000000 | 31.000000 | 0.045455 |
| cherry | 26.000000 | 7.000000 | 0.010264 |
| chicken | 19.000000 | 5.000000 | 0.007331 |
| chocolate | 17.000000 | 6.000000 | 0.008798 |
| cinnamon | 13.000000 | 8.000000 | 0.011730 |
| citrus | 127.000000 | 39.000000 | 0.057185 |
| cocoa | 47.000000 | 21.000000 | 0.030792 |
| coconut | 29.000000 | 8.000000 | 0.011730 |
| coffee | 35.000000 | 13.000000 | 0.019062 |
| cognac | 50.000000 | 16.000000 | 0.023460 |
| coumarinic | 23.000000 | 8.000000 | 0.011730 |
| creamy | 49.000000 | 21.000000 | 0.030792 |
| cucumber | 17.000000 | 4.000000 | 0.005865 |
| dairy | 43.000000 | 15.000000 | 0.021994 |
| dry | 20.000000 | 5.000000 | 0.007331 |
| earthy | 103.000000 | 42.000000 | 0.061584 |
| ethereal | 124.000000 | 38.000000 | 0.055718 |
| fatty | 261.000000 | 70.000000 | 0.102639 |
| fermented | 64.000000 | 25.000000 | 0.036657 |
| fishy | 37.000000 | 10.000000 | 0.014663 |
| floral | 349.000000 | 114.000000 | 0.167155 |
| fresh | 148.000000 | 46.000000 | 0.067449 |
| fruity | 890.000000 | 270.000000 | 0.395894 |
| garlic | 53.000000 | 18.000000 | 0.026393 |
| gasoline | 30.000000 | 9.000000 | 0.013196 |
| grape | 29.000000 | 10.000000 | 0.014663 |
| grapefruit | 16.000000 | 6.000000 | 0.008798 |
| grassy | 17.000000 | 5.000000 | 0.007331 |
| green | 580.000000 | 169.000000 | 0.247801 |
| hay | 27.000000 | 8.000000 | 0.011730 |
| hazelnut | 21.000000 | 6.000000 | 0.008798 |
| herbal | 255.000000 | 81.000000 | 0.118768 |
| honey | 51.000000 | 18.000000 | 0.026393 |
| horseradish | 13.000000 | 3.000000 | 0.004399 |
| jasmine | 27.000000 | 8.000000 | 0.011730 |
| ketonic | 18.000000 | 6.000000 | 0.008798 |
| leafy | 34.000000 | 9.000000 | 0.013196 |
| leathery | 13.000000 | 4.000000 | 0.005865 |
| lemon | 16.000000 | 5.000000 | 0.007331 |
| malty | 19.000000 | 4.000000 | 0.005865 |
| meaty | 139.000000 | 44.000000 | 0.064516 |
| medicinal | 22.000000 | 9.000000 | 0.013196 |
| melon | 51.000000 | 15.000000 | 0.021994 |
| metallic | 14.000000 | 8.000000 | 0.011730 |
| milky | 27.000000 | 8.000000 | 0.011730 |
| mint | 76.000000 | 22.000000 | 0.032258 |
| mushroom | 38.000000 | 13.000000 | 0.019062 |
| musk | 14.000000 | 4.000000 | 0.005865 |
| musty | 59.000000 | 17.000000 | 0.024927 |
| nutty | 138.000000 | 48.000000 | 0.070381 |
| odorless | 46.000000 | 13.000000 | 0.019062 |
| oily | 128.000000 | 40.000000 | 0.058651 |
| onion | 77.000000 | 29.000000 | 0.042522 |
| orange | 33.000000 | 9.000000 | 0.013196 |
| orris | 19.000000 | 4.000000 | 0.005865 |
| peach | 28.000000 | 11.000000 | 0.016129 |
| pear | 58.000000 | 15.000000 | 0.021994 |
| phenolic | 51.000000 | 18.000000 | 0.026393 |
| pine | 20.000000 | 5.000000 | 0.007331 |
| pineapple | 88.000000 | 28.000000 | 0.041056 |
| plum | 17.000000 | 6.000000 | 0.008798 |
| popcorn | 15.000000 | 5.000000 | 0.007331 |
| potato | 20.000000 | 6.000000 | 0.008798 |
| pungent | 73.000000 | 25.000000 | 0.036657 |
| radish | 13.000000 | 4.000000 | 0.005865 |
| ripe | 21.000000 | 5.000000 | 0.007331 |
| roasted | 121.000000 | 39.000000 | 0.057185 |
| rose | 102.000000 | 38.000000 | 0.055718 |
| rum | 36.000000 | 14.000000 | 0.020528 |
| savory | 51.000000 | 18.000000 | 0.026393 |
| sharp | 37.000000 | 9.000000 | 0.013196 |
| smoky | 29.000000 | 11.000000 | 0.016129 |
| solvent | 24.000000 | 10.000000 | 0.014663 |
| sour | 29.000000 | 7.000000 | 0.010264 |
| spicy | 120.000000 | 44.000000 | 0.064516 |
| strawberry | 16.000000 | 6.000000 | 0.008798 |
| sulfurous | 156.000000 | 55.000000 | 0.080645 |
| sweet | 521.000000 | 164.000000 | 0.240469 |
| tea | 21.000000 | 7.000000 | 0.010264 |
| tobacco | 34.000000 | 11.000000 | 0.016129 |
| tomato | 14.000000 | 4.000000 | 0.005865 |
| tropical | 127.000000 | 42.000000 | 0.061584 |
| vanilla | 40.000000 | 12.000000 | 0.017595 |
| vegetable | 103.000000 | 33.000000 | 0.048387 |
| violet | 16.000000 | 5.000000 | 0.007331 |
| warm | 25.000000 | 7.000000 | 0.010264 |
| waxy | 159.000000 | 42.000000 | 0.061584 |
| winey | 113.000000 | 32.000000 | 0.046921 |
| woody | 133.000000 | 39.000000 | 0.057185 |

## GS-LF cross-validation

| Measurement | Value |
| --- | ---: |
| device | cpu |
| ensemble_size | 10 |
| machine | macOS-27.2-arm64-arm-64bit-Mach-O |
| mean_prevalence | 0.035355 |
| molecule_count | 4983 |
| mpnn / all_labels / auprc | 0.318539 |
| mpnn / all_labels / auprc_ci / lower | 0.317205 |
| mpnn / all_labels / auprc_ci / resamples | 1000 |
| mpnn / all_labels / auprc_ci / upper | 0.334213 |
| mpnn / all_labels / auroc | 0.879732 |
| mpnn / all_labels / ci / lower | 0.875879 |
| mpnn / all_labels / ci / resamples | 1000 |
| mpnn / all_labels / ci / upper | 0.883671 |
| mpnn / all_labels / label_count | 138 |
| mpnn / stable_labels / auprc | 0.318539 |
| mpnn / stable_labels / auprc_ci / lower | 0.317205 |
| mpnn / stable_labels / auprc_ci / resamples | 1000 |
| mpnn / stable_labels / auprc_ci / upper | 0.334213 |
| mpnn / stable_labels / auroc | 0.879732 |
| mpnn / stable_labels / ci / lower | 0.875879 |
| mpnn / stable_labels / ci / resamples | 1000 |
| mpnn / stable_labels / ci / upper | 0.883671 |
| mpnn / stable_labels / label_count | 138 |
| threads | 4 |
| versions / numpy | 2.5.4 |
| versions / python | 3.13.16 |
| versions / rdkit | 2026.9.1 |
| versions / scikit-learn | 1.9.1 |
| versions / torch | 2.15.0 |
| wall_time_s | 2969.050437 |

Test prevalence is the AUPRC chance level. Missing measurements remain unavailable.

| Descriptor | test_positive_counts | test_prevalence |
| --- | ---: | ---: |
| alcoholic | 105.000000 | 0.021072 |
| aldehydic | 144.000000 | 0.028898 |
| alliaceous | 126.000000 | 0.025286 |
| almond | 87.000000 | 0.017459 |
| amber | 101.000000 | 0.020269 |
| animal | 124.000000 | 0.024885 |
| anisic | 87.000000 | 0.017459 |
| apple | 308.000000 | 0.061810 |
| apricot | 78.000000 | 0.015653 |
| aromatic | 76.000000 | 0.015252 |
| balsamic | 298.000000 | 0.059803 |
| banana | 128.000000 | 0.025687 |
| beefy | 43.000000 | 0.008629 |
| bergamot | 32.000000 | 0.006422 |
| berry | 156.000000 | 0.031306 |
| bitter | 64.000000 | 0.012844 |
| black currant | 43.000000 | 0.008629 |
| brandy | 42.000000 | 0.008429 |
| burnt | 186.000000 | 0.037327 |
| buttery | 139.000000 | 0.027895 |
| cabbage | 46.000000 | 0.009231 |
| camphoreous | 132.000000 | 0.026490 |
| caramellic | 234.000000 | 0.046960 |
| cedar | 49.000000 | 0.009833 |
| celery | 42.000000 | 0.008429 |
| chamomile | 31.000000 | 0.006221 |
| cheesy | 187.000000 | 0.037528 |
| cherry | 82.000000 | 0.016456 |
| chocolate | 69.000000 | 0.013847 |
| cinnamon | 66.000000 | 0.013245 |
| citrus | 379.000000 | 0.076059 |
| clean | 97.000000 | 0.019466 |
| clove | 34.000000 | 0.006823 |
| cocoa | 118.000000 | 0.023681 |
| coconut | 91.000000 | 0.018262 |
| coffee | 110.000000 | 0.022075 |
| cognac | 112.000000 | 0.022476 |
| cooked | 87.000000 | 0.017459 |
| cooling | 81.000000 | 0.016255 |
| cortex | 56.000000 | 0.011238 |
| coumarinic | 60.000000 | 0.012041 |
| creamy | 190.000000 | 0.038130 |
| cucumber | 46.000000 | 0.009231 |
| dairy | 123.000000 | 0.024684 |
| dry | 166.000000 | 0.033313 |
| earthy | 328.000000 | 0.065824 |
| ethereal | 287.000000 | 0.057596 |
| fatty | 598.000000 | 0.120008 |
| fermented | 147.000000 | 0.029500 |
| fishy | 78.000000 | 0.015653 |
| floral | 1100.000000 | 0.220751 |
| fresh | 533.000000 | 0.106964 |
| fruit skin | 52.000000 | 0.010435 |
| fruity | 1902.000000 | 0.381698 |
| garlic | 120.000000 | 0.024082 |
| gassy | 35.000000 | 0.007024 |
| geranium | 61.000000 | 0.012242 |
| grape | 91.000000 | 0.018262 |
| grapefruit | 74.000000 | 0.014850 |
| grassy | 64.000000 | 0.012844 |
| green | 1446.000000 | 0.290187 |
| hawthorn | 34.000000 | 0.006823 |
| hay | 74.000000 | 0.014850 |
| hazelnut | 52.000000 | 0.010435 |
| herbal | 756.000000 | 0.151716 |
| honey | 157.000000 | 0.031507 |
| hyacinth | 58.000000 | 0.011640 |
| jasmin | 103.000000 | 0.020670 |
| juicy | 51.000000 | 0.010235 |
| ketonic | 48.000000 | 0.009633 |
| lactonic | 67.000000 | 0.013446 |
| lavender | 44.000000 | 0.008830 |
| leafy | 139.000000 | 0.027895 |
| leathery | 54.000000 | 0.010837 |
| lemon | 81.000000 | 0.016255 |
| lily | 71.000000 | 0.014248 |
| malty | 33.000000 | 0.006623 |
| meaty | 299.000000 | 0.060004 |
| medicinal | 71.000000 | 0.014248 |
| melon | 132.000000 | 0.026490 |
| metallic | 134.000000 | 0.026891 |
| milky | 87.000000 | 0.017459 |
| mint | 226.000000 | 0.045354 |
| muguet | 56.000000 | 0.011238 |
| mushroom | 99.000000 | 0.019868 |
| musk | 98.000000 | 0.019667 |
| musty | 200.000000 | 0.040136 |
| natural | 77.000000 | 0.015453 |
| nutty | 366.000000 | 0.073450 |
| odorless | 200.000000 | 0.040136 |
| oily | 388.000000 | 0.077865 |
| onion | 177.000000 | 0.035521 |
| orange | 98.000000 | 0.019667 |
| orangeflower | 33.000000 | 0.006623 |
| orris | 59.000000 | 0.011840 |
| ozone | 39.000000 | 0.007827 |
| peach | 95.000000 | 0.019065 |
| pear | 130.000000 | 0.026089 |
| phenolic | 180.000000 | 0.036123 |
| pine | 78.000000 | 0.015653 |
| pineapple | 205.000000 | 0.041140 |
| plum | 61.000000 | 0.012242 |
| popcorn | 36.000000 | 0.007225 |
| potato | 56.000000 | 0.011238 |
| powdery | 167.000000 | 0.033514 |
| pungent | 198.000000 | 0.039735 |
| radish | 55.000000 | 0.011038 |
| raspberry | 43.000000 | 0.008629 |
| ripe | 87.000000 | 0.017459 |
| roasted | 305.000000 | 0.061208 |
| rose | 332.000000 | 0.066627 |
| rummy | 89.000000 | 0.017861 |
| sandalwood | 36.000000 | 0.007225 |
| savory | 128.000000 | 0.025687 |
| sharp | 104.000000 | 0.020871 |
| smoky | 72.000000 | 0.014449 |
| soapy | 50.000000 | 0.010034 |
| solvent | 59.000000 | 0.011840 |
| sour | 72.000000 | 0.014449 |
| spicy | 464.000000 | 0.093117 |
| strawberry | 49.000000 | 0.009833 |
| sulfurous | 402.000000 | 0.080674 |
| sweaty | 38.000000 | 0.007626 |
| sweet | 1429.000000 | 0.286775 |
| tea | 56.000000 | 0.011238 |
| terpenic | 49.000000 | 0.009833 |
| tobacco | 102.000000 | 0.020470 |
| tomato | 37.000000 | 0.007425 |
| tropical | 386.000000 | 0.077463 |
| vanilla | 111.000000 | 0.022276 |
| vegetable | 287.000000 | 0.057596 |
| vetiver | 38.000000 | 0.007626 |
| violet | 66.000000 | 0.013245 |
| warm | 96.000000 | 0.019266 |
| waxy | 488.000000 | 0.097933 |
| weedy | 44.000000 | 0.008830 |
| winey | 221.000000 | 0.044351 |
| woody | 679.000000 | 0.136263 |

## Cluster-held-out split

| Measurement | Value |
| --- | ---: |
| device | cpu |
| ensemble_size | 10 |
| machine | macOS-27.2-arm64-arm-64bit-Mach-O |
| mean_prevalence | 0.034249 |
| molecule_count | 770 |
| mpnn / all_labels / auprc | 0.348218 |
| mpnn / all_labels / auprc_ci / lower | 0.324636 |
| mpnn / all_labels / auprc_ci / resamples | 1000 |
| mpnn / all_labels / auprc_ci / upper | 0.447304 |
| mpnn / all_labels / auroc | 0.877695 |
| mpnn / all_labels / ci / lower | 0.852539 |
| mpnn / all_labels / ci / resamples | 1000 |
| mpnn / all_labels / ci / upper | 0.910152 |
| mpnn / all_labels / label_count | 112 |
| mpnn / all_labels / paired_auroc_difference_ci / lower | 0.027341 |
| mpnn / all_labels / paired_auroc_difference_ci / resamples | 1000 |
| mpnn / all_labels / paired_auroc_difference_ci / upper | 0.054975 |
| mpnn / stable_labels / auprc | 0.347143 |
| mpnn / stable_labels / auprc_ci / lower | 0.322374 |
| mpnn / stable_labels / auprc_ci / resamples | 1000 |
| mpnn / stable_labels / auprc_ci / upper | 0.437694 |
| mpnn / stable_labels / auroc | 0.859706 |
| mpnn / stable_labels / ci / lower | 0.836961 |
| mpnn / stable_labels / ci / resamples | 1000 |
| mpnn / stable_labels / ci / upper | 0.901236 |
| mpnn / stable_labels / label_count | 80 |
| mpnn / stable_labels / paired_auroc_difference_ci / lower | 0.031121 |
| mpnn / stable_labels / paired_auroc_difference_ci / resamples | 1000 |
| mpnn / stable_labels / paired_auroc_difference_ci / upper | 0.056972 |
| rf / all_labels / auprc | 0.285715 |
| rf / all_labels / auprc_ci / lower | 0.263965 |
| rf / all_labels / auprc_ci / resamples | 1000 |
| rf / all_labels / auprc_ci / upper | 0.408854 |
| rf / all_labels / auroc | 0.832254 |
| rf / all_labels / ci / lower | 0.800439 |
| rf / all_labels / ci / resamples | 1000 |
| rf / all_labels / ci / upper | 0.877310 |
| rf / all_labels / label_count | 112 |
| rf / stable_labels / auprc | 0.284133 |
| rf / stable_labels / auprc_ci / lower | 0.258965 |
| rf / stable_labels / auprc_ci / resamples | 1000 |
| rf / stable_labels / auprc_ci / upper | 0.398575 |
| rf / stable_labels / auroc | 0.813293 |
| rf / stable_labels / ci / lower | 0.783238 |
| rf / stable_labels / ci / resamples | 1000 |
| rf / stable_labels / ci / upper | 0.863165 |
| rf / stable_labels / label_count | 80 |
| rf_ensemble_size | 1 |
| threads | 4 |
| training / wall_time_s | 397.726952 |
| versions / numpy | 2.5.4 |
| versions / python | 3.13.16 |
| versions / rdkit | 2026.9.1 |
| versions / scikit-learn | 1.9.1 |
| versions / torch | 2.15.0 |
| wall_time_s | 477.930853 |

Test prevalence is the AUPRC chance level. Missing measurements remain unavailable.

| Descriptor | train_positive_counts | test_positive_counts | test_prevalence |
| --- | ---: | ---: | ---: |
| alcoholic | 66.000000 | 11.000000 | 0.014286 |
| aldehydic | 13.000000 | 7.000000 | 0.009091 |
| alliaceous | 48.000000 | 2.000000 | 0.002597 |
| almond | 42.000000 | 3.000000 | 0.003896 |
| animal | 38.000000 | 8.000000 | 0.010390 |
| anisic | 38.000000 | 3.000000 | 0.003896 |
| apple | 134.000000 | 92.000000 | 0.119481 |
| apricot | 22.000000 | 10.000000 | 0.012987 |
| aromatic | 47.000000 | 5.000000 | 0.006494 |
| balsamic | 135.000000 | 15.000000 | 0.019481 |
| banana | 36.000000 | 27.000000 | 0.035065 |
| beefy | 18.000000 | 6.000000 | 0.007792 |
| berry | 51.000000 | 13.000000 | 0.016883 |
| black currant | 17.000000 | 2.000000 | 0.002597 |
| brandy | 16.000000 | 13.000000 | 0.016883 |
| bread | 21.000000 | 2.000000 | 0.002597 |
| brothy | 14.000000 | 5.000000 | 0.006494 |
| burnt | 105.000000 | 9.000000 | 0.011688 |
| buttery | 80.000000 | 11.000000 | 0.014286 |
| cabbage | 18.000000 | 2.000000 | 0.002597 |
| camphoreous | 50.000000 | 11.000000 | 0.014286 |
| caramellic | 122.000000 | 18.000000 | 0.023377 |
| catty | 16.000000 | 2.000000 | 0.002597 |
| chamomile | 15.000000 | 6.000000 | 0.007792 |
| cheesy | 84.000000 | 29.000000 | 0.037662 |
| cherry | 38.000000 | 2.000000 | 0.002597 |
| chicken | 16.000000 | 11.000000 | 0.014286 |
| chocolate | 25.000000 | 1.000000 | 0.001299 |
| cinnamon | 20.000000 | 3.000000 | 0.003896 |
| citrus | 117.000000 | 62.000000 | 0.080519 |
| cocoa | 74.000000 | 2.000000 | 0.002597 |
| coconut | 29.000000 | 10.000000 | 0.012987 |
| coffee | 43.000000 | 4.000000 | 0.005195 |
| cognac | 37.000000 | 40.000000 | 0.051948 |
| coumarinic | 31.000000 | 3.000000 | 0.003896 |
| creamy | 57.000000 | 20.000000 | 0.025974 |
| cucumber | 12.000000 | 13.000000 | 0.016883 |
| dairy | 34.000000 | 27.000000 | 0.035065 |
| dry | 25.000000 | 2.000000 | 0.002597 |
| earthy | 119.000000 | 37.000000 | 0.048052 |
| ethereal | 142.000000 | 40.000000 | 0.051948 |
| fatty | 157.000000 | 216.000000 | 0.280519 |
| fermented | 72.000000 | 24.000000 | 0.031169 |
| fishy | 43.000000 | 7.000000 | 0.009091 |
| floral | 426.000000 | 90.000000 | 0.116883 |
| fresh | 173.000000 | 51.000000 | 0.066234 |
| fruity | 893.000000 | 394.000000 | 0.511688 |
| garlic | 60.000000 | 2.000000 | 0.002597 |
| gasoline | 28.000000 | 2.000000 | 0.002597 |
| grape | 36.000000 | 5.000000 | 0.006494 |
| grapefruit | 21.000000 | 3.000000 | 0.003896 |
| grassy | 23.000000 | 4.000000 | 0.005195 |
| green | 585.000000 | 250.000000 | 0.324675 |
| hay | 36.000000 | 1.000000 | 0.001299 |
| hazelnut | 27.000000 | 1.000000 | 0.001299 |
| herbal | 283.000000 | 71.000000 | 0.092208 |
| honey | 74.000000 | 8.000000 | 0.010390 |
| horseradish | 16.000000 | 0.000000 | 0.000000 |
| jasmine | 36.000000 | 4.000000 | 0.005195 |
| ketonic | 21.000000 | 2.000000 | 0.002597 |
| leafy | 35.000000 | 15.000000 | 0.019481 |
| leathery | 15.000000 | 5.000000 | 0.006494 |
| lemon | 19.000000 | 3.000000 | 0.003896 |
| malty | 22.000000 | 3.000000 | 0.003896 |
| meaty | 149.000000 | 31.000000 | 0.040260 |
| medicinal | 28.000000 | 8.000000 | 0.010390 |
| melon | 41.000000 | 40.000000 | 0.051948 |
| metallic | 17.000000 | 2.000000 | 0.002597 |
| milky | 28.000000 | 6.000000 | 0.007792 |
| mint | 92.000000 | 13.000000 | 0.016883 |
| mushroom | 35.000000 | 13.000000 | 0.016883 |
| musk | 17.000000 | 3.000000 | 0.003896 |
| musty | 65.000000 | 17.000000 | 0.022078 |
| nutty | 185.000000 | 24.000000 | 0.031169 |
| odorless | 37.000000 | 29.000000 | 0.037662 |
| oily | 64.000000 | 122.000000 | 0.158442 |
| onion | 78.000000 | 11.000000 | 0.014286 |
| orange | 23.000000 | 25.000000 | 0.032468 |
| orris | 17.000000 | 7.000000 | 0.009091 |
| peach | 34.000000 | 10.000000 | 0.012987 |
| pear | 35.000000 | 53.000000 | 0.068831 |
| phenolic | 63.000000 | 17.000000 | 0.022078 |
| pine | 28.000000 | 4.000000 | 0.005195 |
| pineapple | 66.000000 | 60.000000 | 0.077922 |
| plum | 25.000000 | 2.000000 | 0.002597 |
| popcorn | 20.000000 | 1.000000 | 0.001299 |
| potato | 22.000000 | 5.000000 | 0.006494 |
| pungent | 92.000000 | 8.000000 | 0.010390 |
| radish | 16.000000 | 1.000000 | 0.001299 |
| ripe | 24.000000 | 5.000000 | 0.006494 |
| roasted | 145.000000 | 22.000000 | 0.028571 |
| rose | 118.000000 | 39.000000 | 0.050649 |
| rum | 44.000000 | 11.000000 | 0.014286 |
| savory | 55.000000 | 7.000000 | 0.009091 |
| sharp | 46.000000 | 5.000000 | 0.006494 |
| smoky | 35.000000 | 9.000000 | 0.011688 |
| solvent | 28.000000 | 3.000000 | 0.003896 |
| sour | 26.000000 | 10.000000 | 0.012987 |
| spicy | 160.000000 | 23.000000 | 0.029870 |
| strawberry | 21.000000 | 3.000000 | 0.003896 |
| sulfurous | 161.000000 | 36.000000 | 0.046753 |
| sweet | 610.000000 | 138.000000 | 0.179221 |
| tea | 28.000000 | 6.000000 | 0.007792 |
| tobacco | 42.000000 | 9.000000 | 0.011688 |
| tomato | 15.000000 | 5.000000 | 0.006494 |
| tropical | 107.000000 | 67.000000 | 0.087013 |
| vanilla | 47.000000 | 13.000000 | 0.016883 |
| vegetable | 116.000000 | 33.000000 | 0.042857 |
| violet | 18.000000 | 8.000000 | 0.010390 |
| warm | 32.000000 | 5.000000 | 0.006494 |
| waxy | 79.000000 | 152.000000 | 0.197403 |
| winey | 79.000000 | 85.000000 | 0.110390 |
| woody | 154.000000 | 24.000000 | 0.031169 |

## Cross-source evaluation

| Measurement | Value |
| --- | ---: |
| bins / 0 / lower | 0.000000 |
| bins / 0 / metrics / all_labels / auprc | 0.286957 |
| bins / 0 / metrics / all_labels / auprc_ci / lower | 0.270334 |
| bins / 0 / metrics / all_labels / auprc_ci / resamples | 1000 |
| bins / 0 / metrics / all_labels / auprc_ci / upper | 0.372581 |
| bins / 0 / metrics / all_labels / auroc | 0.850684 |
| bins / 0 / metrics / all_labels / ci / lower | 0.816649 |
| bins / 0 / metrics / all_labels / ci / resamples | 1000 |
| bins / 0 / metrics / all_labels / ci / upper | 0.869624 |
| bins / 0 / metrics / all_labels / label_count | 59 |
| bins / 0 / metrics / stable_labels / auprc | 0.328925 |
| bins / 0 / metrics / stable_labels / auprc_ci / lower | 0.310677 |
| bins / 0 / metrics / stable_labels / auprc_ci / resamples | 1000 |
| bins / 0 / metrics / stable_labels / auprc_ci / upper | 0.394136 |
| bins / 0 / metrics / stable_labels / auroc | 0.828218 |
| bins / 0 / metrics / stable_labels / ci / lower | 0.801811 |
| bins / 0 / metrics / stable_labels / ci / resamples | 1000 |
| bins / 0 / metrics / stable_labels / ci / upper | 0.851735 |
| bins / 0 / metrics / stable_labels / label_count | 23 |
| bins / 0 / molecule_count | 233 |
| bins / 0 / upper | 0.300000 |
| bins / 1 / lower | 0.300000 |
| bins / 1 / metrics / all_labels / auprc | 0.170635 |
| bins / 1 / metrics / all_labels / auprc_ci / lower | 0.174243 |
| bins / 1 / metrics / all_labels / auprc_ci / resamples | 1000 |
| bins / 1 / metrics / all_labels / auprc_ci / upper | 0.219581 |
| bins / 1 / metrics / all_labels / auroc | 0.810231 |
| bins / 1 / metrics / all_labels / ci / lower | 0.786743 |
| bins / 1 / metrics / all_labels / ci / resamples | 1000 |
| bins / 1 / metrics / all_labels / ci / upper | 0.825369 |
| bins / 1 / metrics / all_labels / label_count | 103 |
| bins / 1 / metrics / stable_labels / auprc | 0.217544 |
| bins / 1 / metrics / stable_labels / auprc_ci / lower | 0.209508 |
| bins / 1 / metrics / stable_labels / auprc_ci / resamples | 1000 |
| bins / 1 / metrics / stable_labels / auprc_ci / upper | 0.259835 |
| bins / 1 / metrics / stable_labels / auroc | 0.805973 |
| bins / 1 / metrics / stable_labels / ci / lower | 0.789756 |
| bins / 1 / metrics / stable_labels / ci / resamples | 1000 |
| bins / 1 / metrics / stable_labels / ci / upper | 0.821574 |
| bins / 1 / metrics / stable_labels / label_count | 67 |
| bins / 1 / molecule_count | 640 |
| bins / 1 / upper | 0.500000 |
| bins / 2 / lower | 0.500000 |
| bins / 2 / metrics / all_labels / auprc | 0.255675 |
| bins / 2 / metrics / all_labels / auprc_ci / lower | 0.252051 |
| bins / 2 / metrics / all_labels / auprc_ci / resamples | 1000 |
| bins / 2 / metrics / all_labels / auprc_ci / upper | 0.307611 |
| bins / 2 / metrics / all_labels / auroc | 0.833151 |
| bins / 2 / metrics / all_labels / ci / lower | 0.817971 |
| bins / 2 / metrics / all_labels / ci / resamples | 1000 |
| bins / 2 / metrics / all_labels / ci / upper | 0.852251 |
| bins / 2 / metrics / all_labels / label_count | 101 |
| bins / 2 / metrics / stable_labels / auprc | 0.273999 |
| bins / 2 / metrics / stable_labels / auprc_ci / lower | 0.268493 |
| bins / 2 / metrics / stable_labels / auprc_ci / resamples | 1000 |
| bins / 2 / metrics / stable_labels / auprc_ci / upper | 0.319826 |
| bins / 2 / metrics / stable_labels / auroc | 0.835167 |
| bins / 2 / metrics / stable_labels / ci / lower | 0.818928 |
| bins / 2 / metrics / stable_labels / ci / resamples | 1000 |
| bins / 2 / metrics / stable_labels / ci / upper | 0.851435 |
| bins / 2 / metrics / stable_labels / label_count | 79 |
| bins / 2 / molecule_count | 771 |
| bins / 2 / upper | 1.000000 |
| device | cpu |
| ensemble_size | 10 |
| machine | macOS-27.2-arm64-arm-64bit-Mach-O |
| mean_prevalence | 0.026289 |
| molecule_count | 1644 |
| mpnn / all_labels / auprc | 0.196580 |
| mpnn / all_labels / auprc_ci / lower | 0.194541 |
| mpnn / all_labels / auprc_ci / resamples | 1000 |
| mpnn / all_labels / auprc_ci / upper | 0.230639 |
| mpnn / all_labels / auroc | 0.829763 |
| mpnn / all_labels / ci / lower | 0.816507 |
| mpnn / all_labels / ci / resamples | 1000 |
| mpnn / all_labels / ci / upper | 0.841216 |
| mpnn / all_labels / label_count | 105 |
| mpnn / all_labels / paired_auroc_difference_ci / lower | 0.041650 |
| mpnn / all_labels / paired_auroc_difference_ci / resamples | 1000 |
| mpnn / all_labels / paired_auroc_difference_ci / upper | 0.063092 |
| mpnn / stable_labels / auprc | 0.206648 |
| mpnn / stable_labels / auprc_ci / lower | 0.203806 |
| mpnn / stable_labels / auprc_ci / resamples | 1000 |
| mpnn / stable_labels / auprc_ci / upper | 0.237600 |
| mpnn / stable_labels / auroc | 0.827765 |
| mpnn / stable_labels / ci / lower | 0.815469 |
| mpnn / stable_labels / ci / resamples | 1000 |
| mpnn / stable_labels / ci / upper | 0.839161 |
| mpnn / stable_labels / label_count | 95 |
| mpnn / stable_labels / paired_auroc_difference_ci / lower | 0.042123 |
| mpnn / stable_labels / paired_auroc_difference_ci / resamples | 1000 |
| mpnn / stable_labels / paired_auroc_difference_ci / upper | 0.063216 |
| rf / all_labels / auprc | 0.171682 |
| rf / all_labels / auprc_ci / lower | 0.169819 |
| rf / all_labels / auprc_ci / resamples | 1000 |
| rf / all_labels / auprc_ci / upper | 0.203764 |
| rf / all_labels / auroc | 0.777703 |
| rf / all_labels / ci / lower | 0.762320 |
| rf / all_labels / ci / resamples | 1000 |
| rf / all_labels / ci / upper | 0.789996 |
| rf / all_labels / label_count | 105 |
| rf / stable_labels / auprc | 0.182837 |
| rf / stable_labels / auprc_ci / lower | 0.179957 |
| rf / stable_labels / auprc_ci / resamples | 1000 |
| rf / stable_labels / auprc_ci / upper | 0.213970 |
| rf / stable_labels / auroc | 0.775747 |
| rf / stable_labels / ci / lower | 0.761567 |
| rf / stable_labels / ci / resamples | 1000 |
| rf / stable_labels / ci / upper | 0.788406 |
| rf / stable_labels / label_count | 95 |
| rf_ensemble_size | 1 |
| threads | 4 |
| training / wall_time_s | 397.726952 |
| versions / numpy | 2.5.4 |
| versions / python | 3.13.16 |
| versions / rdkit | 2026.9.1 |
| versions / scikit-learn | 1.9.1 |
| versions / torch | 2.15.0 |
| wall_time_s | 616.883928 |

Test prevalence is the AUPRC chance level. Missing measurements remain unavailable.

| Descriptor | train_positive_counts | test_positive_counts | test_prevalence |
| --- | ---: | ---: | ---: |
| alcoholic | 66.000000 | 12.000000 | 0.007299 |
| aldehydic | 13.000000 | 49.000000 | 0.029805 |
| alliaceous | 48.000000 | 16.000000 | 0.009732 |
| almond | 42.000000 | 5.000000 | 0.003041 |
| animal | 38.000000 | 50.000000 | 0.030414 |
| anisic | 38.000000 | 21.000000 | 0.012774 |
| apple | 134.000000 | 21.000000 | 0.012774 |
| apricot | 22.000000 | 9.000000 | 0.005474 |
| aromatic | 47.000000 | 6.000000 | 0.003650 |
| balsamic | 135.000000 | 72.000000 | 0.043796 |
| banana | 36.000000 | 11.000000 | 0.006691 |
| beefy | 18.000000 | 8.000000 | 0.004866 |
| berry | 51.000000 | 32.000000 | 0.019465 |
| black currant | 17.000000 | 14.000000 | 0.008516 |
| brandy | 16.000000 | 2.000000 | 0.001217 |
| burnt | 105.000000 | 13.000000 | 0.007908 |
| buttery | 80.000000 | 14.000000 | 0.008516 |
| cabbage | 18.000000 | 3.000000 | 0.001825 |
| camphoreous | 50.000000 | 36.000000 | 0.021898 |
| caramellic | 122.000000 | 35.000000 | 0.021290 |
| chamomile | 15.000000 | 9.000000 | 0.005474 |
| cheesy | 84.000000 | 10.000000 | 0.006083 |
| cherry | 38.000000 | 4.000000 | 0.002433 |
| chocolate | 25.000000 | 12.000000 | 0.007299 |
| cinnamon | 20.000000 | 11.000000 | 0.006691 |
| citrus | 117.000000 | 96.000000 | 0.058394 |
| cocoa | 74.000000 | 7.000000 | 0.004258 |
| coconut | 29.000000 | 14.000000 | 0.008516 |
| coffee | 43.000000 | 17.000000 | 0.010341 |
| cognac | 37.000000 | 6.000000 | 0.003650 |
| coumarinic | 31.000000 | 10.000000 | 0.006083 |
| creamy | 57.000000 | 27.000000 | 0.016423 |
| cucumber | 12.000000 | 7.000000 | 0.004258 |
| dairy | 34.000000 | 16.000000 | 0.009732 |
| dry | 25.000000 | 77.000000 | 0.046837 |
| earthy | 119.000000 | 73.000000 | 0.044404 |
| ethereal | 142.000000 | 25.000000 | 0.015207 |
| fatty | 157.000000 | 85.000000 | 0.051703 |
| fermented | 72.000000 | 4.000000 | 0.002433 |
| fishy | 43.000000 | 8.000000 | 0.004866 |
| floral | 426.000000 | 347.000000 | 0.211071 |
| fresh | 173.000000 | 142.000000 | 0.086375 |
| fruity | 893.000000 | 329.000000 | 0.200122 |
| garlic | 60.000000 | 10.000000 | 0.006083 |
| grape | 36.000000 | 16.000000 | 0.009732 |
| grapefruit | 21.000000 | 37.000000 | 0.022506 |
| grassy | 23.000000 | 10.000000 | 0.006083 |
| green | 585.000000 | 323.000000 | 0.196472 |
| hay | 36.000000 | 14.000000 | 0.008516 |
| hazelnut | 27.000000 | 8.000000 | 0.004866 |
| herbal | 283.000000 | 198.000000 | 0.120438 |
| honey | 74.000000 | 21.000000 | 0.012774 |
| ketonic | 21.000000 | 2.000000 | 0.001217 |
| leafy | 35.000000 | 38.000000 | 0.023114 |
| leathery | 15.000000 | 14.000000 | 0.008516 |
| lemon | 19.000000 | 22.000000 | 0.013382 |
| malty | 22.000000 | 4.000000 | 0.002433 |
| meaty | 149.000000 | 48.000000 | 0.029197 |
| medicinal | 28.000000 | 2.000000 | 0.001217 |
| melon | 41.000000 | 18.000000 | 0.010949 |
| metallic | 17.000000 | 37.000000 | 0.022506 |
| milky | 28.000000 | 18.000000 | 0.010949 |
| mint | 92.000000 | 67.000000 | 0.040754 |
| mushroom | 35.000000 | 14.000000 | 0.008516 |
| musk | 17.000000 | 68.000000 | 0.041363 |
| musty | 65.000000 | 24.000000 | 0.014599 |
| nutty | 185.000000 | 69.000000 | 0.041971 |
| odorless | 37.000000 | 183.000000 | 0.111314 |
| oily | 64.000000 | 48.000000 | 0.029197 |
| onion | 78.000000 | 26.000000 | 0.015815 |
| orange | 23.000000 | 15.000000 | 0.009124 |
| orris | 17.000000 | 21.000000 | 0.012774 |
| peach | 34.000000 | 13.000000 | 0.007908 |
| pear | 35.000000 | 15.000000 | 0.009124 |
| phenolic | 63.000000 | 27.000000 | 0.016423 |
| pine | 28.000000 | 31.000000 | 0.018856 |
| pineapple | 66.000000 | 16.000000 | 0.009732 |
| plum | 25.000000 | 8.000000 | 0.004866 |
| popcorn | 20.000000 | 11.000000 | 0.006691 |
| potato | 22.000000 | 7.000000 | 0.004258 |
| pungent | 92.000000 | 18.000000 | 0.010949 |
| radish | 16.000000 | 3.000000 | 0.001825 |
| ripe | 24.000000 | 5.000000 | 0.003041 |
| roasted | 145.000000 | 71.000000 | 0.043187 |
| rose | 118.000000 | 104.000000 | 0.063260 |
| savory | 55.000000 | 22.000000 | 0.013382 |
| sharp | 46.000000 | 10.000000 | 0.006083 |
| smoky | 35.000000 | 7.000000 | 0.004258 |
| solvent | 28.000000 | 2.000000 | 0.001217 |
| sour | 26.000000 | 5.000000 | 0.003041 |
| spicy | 160.000000 | 120.000000 | 0.072993 |
| strawberry | 21.000000 | 6.000000 | 0.003650 |
| sulfurous | 161.000000 | 73.000000 | 0.044404 |
| sweet | 610.000000 | 238.000000 | 0.144769 |
| tea | 28.000000 | 10.000000 | 0.006083 |
| tobacco | 42.000000 | 23.000000 | 0.013990 |
| tomato | 15.000000 | 3.000000 | 0.001825 |
| tropical | 107.000000 | 66.000000 | 0.040146 |
| vanilla | 47.000000 | 18.000000 | 0.010949 |
| vegetable | 116.000000 | 24.000000 | 0.014599 |
| violet | 18.000000 | 27.000000 | 0.016423 |
| warm | 32.000000 | 25.000000 | 0.015207 |
| waxy | 79.000000 | 81.000000 | 0.049270 |
| winey | 79.000000 | 6.000000 | 0.003650 |
| woody | 154.000000 | 303.000000 | 0.184307 |

## Calibration

| Measurement | Value |
| --- | ---: |
| all_labels / auprc | 0.348218 |
| all_labels / auprc_ci / lower | 0.324636 |
| all_labels / auprc_ci / resamples | 1000 |
| all_labels / auprc_ci / upper | 0.447304 |
| all_labels / auroc | 0.877695 |
| all_labels / ci / lower | 0.852539 |
| all_labels / ci / resamples | 1000 |
| all_labels / ci / upper | 0.910152 |
| all_labels / label_count | 112 |
| ci / brier / lower | 0.021725 |
| ci / brier / resamples | 1000 |
| ci / brier / upper | 0.023790 |
| ci / brier_skill / lower | 0.202947 |
| ci / brier_skill / resamples | 1000 |
| ci / brier_skill / upper | 0.266145 |
| ci / classwise_ece / lower | 0.017722 |
| ci / classwise_ece / resamples | 1000 |
| ci / classwise_ece / upper | 0.036048 |
| ci / pooled_ece / lower | 0.001858 |
| ci / pooled_ece / resamples | 1000 |
| ci / pooled_ece / upper | 0.006685 |
| ci / spread_bce_spearman / lower | 0.034767 |
| ci / spread_bce_spearman / resamples | 1000 |
| ci / spread_bce_spearman / upper | 0.237477 |
| classwise_label_count | 80 |
| device | cpu |
| ensemble_size | 10 |
| machine | macOS-27.2-arm64-arm-64bit-Mach-O |
| reliability_bins / 0 / count | 8701 |
| reliability_bins / 0 / frequency | 0.000115 |
| reliability_bins / 0 / probability | 0.000010 |
| reliability_bins / 1 / count | 8701 |
| reliability_bins / 1 / frequency | 0.000575 |
| reliability_bins / 1 / probability | 0.000068 |
| reliability_bins / 2 / count | 8701 |
| reliability_bins / 2 / frequency | 0.000919 |
| reliability_bins / 2 / probability | 0.000202 |
| reliability_bins / 3 / count | 8701 |
| reliability_bins / 3 / frequency | 0.001954 |
| reliability_bins / 3 / probability | 0.000460 |
| reliability_bins / 4 / count | 8701 |
| reliability_bins / 4 / frequency | 0.003218 |
| reliability_bins / 4 / probability | 0.001004 |
| reliability_bins / 5 / count | 8701 |
| reliability_bins / 5 / frequency | 0.005632 |
| reliability_bins / 5 / probability | 0.002179 |
| reliability_bins / 6 / count | 8701 |
| reliability_bins / 6 / frequency | 0.007815 |
| reliability_bins / 6 / probability | 0.004867 |
| reliability_bins / 7 / count | 8701 |
| reliability_bins / 7 / frequency | 0.017239 |
| reliability_bins / 7 / probability | 0.011389 |
| reliability_bins / 8 / count | 8701 |
| reliability_bins / 8 / frequency | 0.043673 |
| reliability_bins / 8 / probability | 0.033478 |
| reliability_bins / 9 / count | 8701 |
| reliability_bins / 9 / frequency | 0.261349 |
| reliability_bins / 9 / probability | 0.234210 |
| stable_labels / auprc | 0.347143 |
| stable_labels / auprc_ci / lower | 0.322374 |
| stable_labels / auprc_ci / resamples | 1000 |
| stable_labels / auprc_ci / upper | 0.437694 |
| stable_labels / auroc | 0.859706 |
| stable_labels / ci / lower | 0.836961 |
| stable_labels / ci / resamples | 1000 |
| stable_labels / ci / upper | 0.901236 |
| stable_labels / label_count | 80 |
| statistics / brier | 0.023316 |
| statistics / brier_skill | 0.220112 |
| statistics / classwise_ece | 0.017356 |
| statistics / pooled_ece | 0.005462 |
| statistics / spread_bce_spearman | 0.096320 |
| threads | 4 |
| training / wall_time_s | 397.726952 |
| versions / numpy | 2.5.4 |
| versions / python | 3.13.16 |
| versions / rdkit | 2026.9.1 |
| versions / scikit-learn | 1.9.1 |
| versions / torch | 2.15.0 |
| wall_time_s | 504.935685 |

## Applicability domain

| Measurement | Value |
| --- | ---: |
| all_labels / auprc | 0.348218 |
| all_labels / auprc_ci / lower | 0.324636 |
| all_labels / auprc_ci / resamples | 1000 |
| all_labels / auprc_ci / upper | 0.447304 |
| all_labels / auroc | 0.877695 |
| all_labels / ci / lower | 0.852539 |
| all_labels / ci / resamples | 1000 |
| all_labels / ci / upper | 0.910152 |
| all_labels / label_count | 112 |
| bins / 0 / lower | 0.000000 |
| bins / 0 / metrics / all_labels / auprc | 0.704167 |
| bins / 0 / metrics / all_labels / auprc_ci / lower | 0.683854 |
| bins / 0 / metrics / all_labels / auprc_ci / resamples | 1000 |
| bins / 0 / metrics / all_labels / auprc_ci / upper | 0.980556 |
| bins / 0 / metrics / all_labels / auroc | 0.797059 |
| bins / 0 / metrics / all_labels / ci / lower | 0.696429 |
| bins / 0 / metrics / all_labels / ci / resamples | 1000 |
| bins / 0 / metrics / all_labels / ci / upper | 0.972222 |
| bins / 0 / metrics / all_labels / label_count | 17 |
| bins / 0 / metrics / stable_labels / auprc | 1.000000 |
| bins / 0 / metrics / stable_labels / auprc_ci / lower | 1.000000 |
| bins / 0 / metrics / stable_labels / auprc_ci / resamples | 911 |
| bins / 0 / metrics / stable_labels / auprc_ci / upper | 1.000000 |
| bins / 0 / metrics / stable_labels / auroc | 1.000000 |
| bins / 0 / metrics / stable_labels / ci / lower | 1.000000 |
| bins / 0 / metrics / stable_labels / ci / resamples | 911 |
| bins / 0 / metrics / stable_labels / ci / upper | 1.000000 |
| bins / 0 / metrics / stable_labels / label_count | 1 |
| bins / 0 / molecule_count | 7 |
| bins / 0 / upper | 0.300000 |
| bins / 1 / lower | 0.300000 |
| bins / 1 / metrics / all_labels / auprc | 0.487352 |
| bins / 1 / metrics / all_labels / auprc_ci / lower | 0.464007 |
| bins / 1 / metrics / all_labels / auprc_ci / resamples | 1000 |
| bins / 1 / metrics / all_labels / auprc_ci / upper | 0.587107 |
| bins / 1 / metrics / all_labels / auroc | 0.879703 |
| bins / 1 / metrics / all_labels / ci / lower | 0.849366 |
| bins / 1 / metrics / all_labels / ci / resamples | 1000 |
| bins / 1 / metrics / all_labels / ci / upper | 0.896574 |
| bins / 1 / metrics / all_labels / label_count | 88 |
| bins / 1 / metrics / stable_labels / auprc | 0.507649 |
| bins / 1 / metrics / stable_labels / auprc_ci / lower | 0.466602 |
| bins / 1 / metrics / stable_labels / auprc_ci / resamples | 1000 |
| bins / 1 / metrics / stable_labels / auprc_ci / upper | 0.598218 |
| bins / 1 / metrics / stable_labels / auroc | 0.872310 |
| bins / 1 / metrics / stable_labels / ci / lower | 0.827319 |
| bins / 1 / metrics / stable_labels / ci / resamples | 1000 |
| bins / 1 / metrics / stable_labels / ci / upper | 0.889879 |
| bins / 1 / metrics / stable_labels / label_count | 25 |
| bins / 1 / molecule_count | 106 |
| bins / 1 / upper | 0.500000 |
| bins / 2 / lower | 0.500000 |
| bins / 2 / metrics / all_labels / auprc | 0.338708 |
| bins / 2 / metrics / all_labels / auprc_ci / lower | 0.323862 |
| bins / 2 / metrics / all_labels / auprc_ci / resamples | 1000 |
| bins / 2 / metrics / all_labels / auprc_ci / upper | 0.492881 |
| bins / 2 / metrics / all_labels / auroc | 0.866483 |
| bins / 2 / metrics / all_labels / ci / lower | 0.840079 |
| bins / 2 / metrics / all_labels / ci / resamples | 1000 |
| bins / 2 / metrics / all_labels / ci / upper | 0.913545 |
| bins / 2 / metrics / all_labels / label_count | 106 |
| bins / 2 / metrics / stable_labels / auprc | 0.367941 |
| bins / 2 / metrics / stable_labels / auprc_ci / lower | 0.335512 |
| bins / 2 / metrics / stable_labels / auprc_ci / resamples | 1000 |
| bins / 2 / metrics / stable_labels / auprc_ci / upper | 0.497541 |
| bins / 2 / metrics / stable_labels / auroc | 0.850284 |
| bins / 2 / metrics / stable_labels / ci / lower | 0.828419 |
| bins / 2 / metrics / stable_labels / ci / resamples | 1000 |
| bins / 2 / metrics / stable_labels / ci / upper | 0.902974 |
| bins / 2 / metrics / stable_labels / label_count | 66 |
| bins / 2 / molecule_count | 657 |
| bins / 2 / upper | 1.000000 |
| device | cpu |
| ensemble_size | 10 |
| machine | macOS-27.2-arm64-arm-64bit-Mach-O |
| stable_labels / auprc | 0.347143 |
| stable_labels / auprc_ci / lower | 0.322374 |
| stable_labels / auprc_ci / resamples | 1000 |
| stable_labels / auprc_ci / upper | 0.437694 |
| stable_labels / auroc | 0.859706 |
| stable_labels / ci / lower | 0.836961 |
| stable_labels / ci / resamples | 1000 |
| stable_labels / ci / upper | 0.901236 |
| stable_labels / label_count | 80 |
| threads | 4 |
| training / wall_time_s | 397.726952 |
| versions / numpy | 2.5.4 |
| versions / python | 3.13.16 |
| versions / rdkit | 2026.9.1 |
| versions / scikit-learn | 1.9.1 |
| versions / torch | 2.15.0 |
| wall_time_s | 451.186324 |

## Map quality

Held-out query Jaccard means test whether odour neighbours generalise. All-molecule means include training labels used to fit the embedding.

| Measurement | Value |
| --- | ---: |
| held_out / molecule_count | 770 |
| held_out / odour | 0.281876 |
| held_out / random | 0.071540 |
| held_out / tanimoto | 0.228797 |
| all_molecules / molecule_count | 3523 |
| all_molecules / odour | 0.270337 |
| all_molecules / random | 0.063991 |
| all_molecules / tanimoto | 0.218313 |
| ensemble_size | 10 |
| machine | macOS-27.2-arm64-arm-64bit-Mach-O |
| neighbour_count | 8 |
| random_seed | 0 |
| trustworthiness | 0.998655 |
| versions / numpy | 2.5.4 |
| versions / python | 3.13.16 |
| versions / rdkit | 2026.9.1 |
| versions / scikit-learn | 1.9.1 |
| versions / torch | 2.15.0 |
| wall_time_s | 3.121817 |

## Keller cluster cross-validation

| Measurement | Value |
| --- | ---: |
| all_labels / label_count | 20 |
| all_labels / metric | pearson |
| ci / lower | 0.071065 |
| ci / resamples | 1000 |
| ci / upper | 0.139482 |
| device | cpu |
| ensemble_size | 10 |
| final_epochs | 53 |
| final_training / wall_time_s | 51.346405 |
| final_training_rows | 478 |
| machine | macOS-27.2-arm64-arm-64bit-Mach-O |
| mean_pearson | 0.104136 |
| missing_rating_count | 120 |
| molecule_count | 478 |
| stable_labels / label_count | 20 |
| stable_labels / metric | pearson |
| stable_labels / support | continuous ratings; positive-count threshold is inapplicable |
| stopping_metric | mean Pearson r |
| threads | 4 |
| versions / numpy | 2.5.4 |
| versions / python | 3.13.16 |
| versions / rdkit | 2026.9.1 |
| versions / scikit-learn | 1.9.1 |
| versions / torch | 2.15.0 |
| wall_time_s | 336.867309 |

Test prevalence is the AUPRC chance level. Missing measurements remain unavailable.

| Descriptor | per_descriptor_pearson |
| --- | ---: |
| EDIBLE | 0.013129 |
| BAKERY | 0.067931 |
| SWEET | 0.270731 |
| FRUIT | 0.339544 |
| FISH | 0.227069 |
| GARLIC | 0.147967 |
| SPICES | 0.121372 |
| COLD | 0.107244 |
| SOUR | 0.146437 |
| BURNT | 0.116644 |
| ACID | -0.047989 |
| WARM | 0.065042 |
| MUSKY | 0.083773 |
| SWEATY | 0.077830 |
| AMMONIA/URINOUS | 0.075810 |
| DECAYED | 0.091261 |
| WOOD | 0.002938 |
| GRASS | -0.018783 |
| FLOWER | 0.128139 |
| CHEMICAL | 0.066638 |

## Stereo pairs

Held-out groups are the test; all groups include fitted predictions.

| Measurement | Value |
| --- | ---: |
| held_out / ci / lower | -0.374276 |
| held_out / ci / resamples | 1000 |
| held_out / ci / upper | 0.304393 |
| held_out / different_labels / ci / lower | 0.005788 |
| held_out / different_labels / ci / resamples | 1000 |
| held_out / different_labels / ci / upper | 0.012286 |
| held_out / different_labels / mean_distance | 0.008810 |
| held_out / different_labels / pair_count | 35 |
| held_out / identical_labels / ci / lower | 0.002816 |
| held_out / identical_labels / ci / resamples | 1000 |
| held_out / identical_labels / ci / upper | 0.019483 |
| held_out / identical_labels / mean_distance | 0.010967 |
| held_out / identical_labels / pair_count | 7 |
| held_out / pair_count | 42 |
| held_out / spearman | -0.027206 |
| all_groups / ci / lower | -0.011080 |
| all_groups / ci / resamples | 1000 |
| all_groups / ci / upper | 0.346346 |
| all_groups / different_labels / ci / lower | 0.006306 |
| all_groups / different_labels / ci / resamples | 1000 |
| all_groups / different_labels / ci / upper | 0.012002 |
| all_groups / different_labels / mean_distance | 0.009036 |
| all_groups / different_labels / pair_count | 106 |
| all_groups / identical_labels / ci / lower | 0.003969 |
| all_groups / identical_labels / ci / resamples | 1000 |
| all_groups / identical_labels / ci / upper | 0.011036 |
| all_groups / identical_labels / mean_distance | 0.007283 |
| all_groups / identical_labels / pair_count | 28 |
| all_groups / pair_count | 134 |
| all_groups / spearman | 0.177158 |
| all_labels / auprc | 0.348218 |
| all_labels / auprc_ci / lower | 0.324636 |
| all_labels / auprc_ci / resamples | 1000 |
| all_labels / auprc_ci / upper | 0.447304 |
| all_labels / auroc | 0.877695 |
| all_labels / ci / lower | 0.852539 |
| all_labels / ci / resamples | 1000 |
| all_labels / ci / upper | 0.910152 |
| all_labels / label_count | 112 |
| device | cpu |
| ensemble_size | 10 |
| machine | macOS-27.2-arm64-arm-64bit-Mach-O |
| stable_labels / auprc | 0.347143 |
| stable_labels / auprc_ci / lower | 0.322374 |
| stable_labels / auprc_ci / resamples | 1000 |
| stable_labels / auprc_ci / upper | 0.437694 |
| stable_labels / auroc | 0.859706 |
| stable_labels / ci / lower | 0.836961 |
| stable_labels / ci / resamples | 1000 |
| stable_labels / ci / upper | 0.901236 |
| stable_labels / label_count | 80 |
| threads | 4 |
| training / wall_time_s | 397.726952 |
| versions / numpy | 2.5.4 |
| versions / python | 3.13.16 |
| versions / rdkit | 2026.9.1 |
| versions / scikit-learn | 1.9.1 |
| versions / torch | 2.15.0 |
| wall_time_s | 425.482178 |

## Submitted predictions

| Measurement | Value |
| --- | ---: |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / accelerator | cpu |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / all_labels / auprc | 0.236764 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / all_labels / auprc_ci / lower | 0.228139 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / all_labels / auprc_ci / resamples | 1000 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / all_labels / auprc_ci / upper | 0.331746 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / all_labels / auroc | 0.837824 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / all_labels / ci / lower | 0.811310 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / all_labels / ci / resamples | 1000 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / all_labels / ci / upper | 0.871726 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / all_labels / label_count | 112 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / data_seed | 0 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / ensemble_size | 10 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / epochs | 100 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / evaluate_wall_time_s | 30.156392 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / machine | macOS-27.2-arm64-arm-64bit-Mach-O |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / mean_prevalence | 0.034249 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / molecule_count | 770 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / predict_wall_time_s | 5.636316 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / pytorch_seed | 0 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / stable_labels / auprc | 0.263581 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / stable_labels / auprc_ci / lower | 0.244143 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / stable_labels / auprc_ci / resamples | 1000 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / stable_labels / auprc_ci / upper | 0.352941 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / stable_labels / auroc | 0.820901 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / stable_labels / ci / lower | 0.797802 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / stable_labels / ci / resamples | 1000 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / stable_labels / ci / upper | 0.863465 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / stable_labels / label_count | 80 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / train_wall_time_s | 374.757286 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / cluster / wall_time_s | 410.549994 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / licence | MIT |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / name | Chemprop 2.3.1 (D-MPNN, 10-model ensemble) |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / accelerator | cpu |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / all_labels / auprc | 0.256845 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / all_labels / auprc_ci / lower | 0.259102 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / all_labels / auprc_ci / resamples | 1000 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / all_labels / auprc_ci / upper | 0.298526 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / all_labels / auroc | 0.866471 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / all_labels / ci / lower | 0.854964 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / all_labels / ci / resamples | 1000 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / all_labels / ci / upper | 0.878428 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / all_labels / label_count | 113 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / data_seed | 0 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / ensemble_size | 10 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / epochs | 100 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / evaluate_wall_time_s | 34.467174 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / machine | macOS-27.2-arm64-arm-64bit-Mach-O |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / mean_prevalence | 0.033413 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / molecule_count | 722 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / predict_wall_time_s | 5.414717 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / pytorch_seed | 0 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / stable_labels / auprc | 0.267519 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / stable_labels / auprc_ci / lower | 0.268141 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / stable_labels / auprc_ci / resamples | 1000 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / stable_labels / auprc_ci / upper | 0.306263 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / stable_labels / auroc | 0.867046 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / stable_labels / ci / lower | 0.855333 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / stable_labels / ci / resamples | 1000 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / stable_labels / ci / upper | 0.878178 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / stable_labels / label_count | 105 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / train_wall_time_s | 388.422920 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / official / wall_time_s | 428.304810 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / source_url | https://chemprop.readthedocs.io/en/v2.3.1/ |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / versions / chemprop | 2.3.1 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / versions / numpy | 2.5.4 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / versions / python | 3.13.16 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / versions / rdkit | 2026.3.6 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / versions / scikit-learn | 1.9.1 |
| Chemprop 2.3.1 (D-MPNN, 10-model ensemble) / versions / torch | 2.15.0 |

## Figures

![Reliability diagram](figures/reliability.svg)

![Applicability domain](figures/domain.svg)

Per-descriptor AUROC is not stored in the results file; no per-descriptor AUROC figure is inferred from aggregate metrics.
