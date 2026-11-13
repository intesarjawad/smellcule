import math
from collections.abc import Mapping

from smellcule.export.content import mapping

# These keys are the numeric comparisons available to the explanatory view.
RESULT_STATS = {
    **{
        f"{run}.{model}.{group}.{metric}": (run, model, group, metric)
        for run in ("official", "official_minus_leaked", "cluster", "cross_source")
        for model in ("mpnn", "rf")
        for group in ("all_labels", "stable_labels")
        for metric in ("auroc", "auprc", "label_count")
    },
    "gslf_cv.mpnn.all_labels.auroc": ("gslf_cv", "mpnn", "all_labels", "auroc"),
    "keller_cv.mean_pearson": ("keller_cv", "mean_pearson"),
    "map.trustworthiness": ("map", "trustworthiness"),
    "map.neighbour_count": ("map", "neighbour_count"),
    **{
        f"calibration.statistics.{key}": ("calibration", "statistics", key)
        for key in ("brier", "brier_skill", "pooled_ece", "classwise_ece", "spread_bce_spearman")
    },
}
COUNT_STATS = (
    "leffingwell_molecules",
    "leffingwell_descriptors",
    "cluster_train",
    "cluster_validation",
    "cluster_held_out",
    "official_train",
    "official_validation",
    "official_held_out",
    "leakage_crossing_groups",
    "leakage_crossing_molecules",
    "leakage_held_out",
    "gslf_molecules",
    "gslf_descriptors",
    "cross_source_molecules",
    "cross_source_descriptors",
    "keller_molecules",
    "keller_descriptors",
    "sibling_jaccard_mean",
    "random_pair_jaccard_mean",
)


def numeric(value: object) -> float | int:
    """Require finite numeric evidence without treating booleans as counts."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        message = "Bundle statistics require finite numeric evidence."
        raise ValueError(message)
    return value


def collect_stats(results: Mapping[str, object], counts: Mapping[str, object]) -> dict[str, object]:
    """Fail on missing public comparisons rather than substituting a plausible number."""
    stats: dict[str, object] = {key: numeric(counts[key]) for key in COUNT_STATS}
    for name, path in RESULT_STATS.items():
        value: object = results
        for key in path:
            value = mapping(value)[key]
        stats[name] = numeric(value)
    return stats
