import logging
from collections.abc import Iterator
from dataclasses import asdict, dataclass, field
from time import perf_counter

import numpy as np
import torch
from numpy.typing import NDArray

from smellcule import splits
from smellcule.baseline import RandomForestBaseline, count_fingerprints, fit_random_forest
from smellcule.ensemble import Ensemble, train_ensemble
from smellcule.evaluation import calibration_summary, classification_summary, domain_summary
from smellcule.experiment_data import ExperimentData, cluster_ids
from smellcule.metrics import FloatArray
from smellcule.molecules import nearest_similarity, source_structures
from smellcule.stereo_evaluation import stereo_summary
from smellcule.training import TrainingConfig

LOGGER = logging.getLogger(__name__)
RUNS = (
    "official",
    "official_minus_leaked",
    "gslf_cv",
    "cluster",
    "keller_cv",
    "cross_source",
    "calibration",
    "domain",
    "stereo_pairs",
)


@dataclass
class RunOutput:
    """One completed run and the local evidence needed by later jobs."""

    name: str
    result: dict[str, object]
    ensembles: dict[str, Ensemble] = field(default_factory=dict[str, Ensemble])
    arrays: dict[str, dict[str, NDArray[np.generic]]] = field(
        default_factory=dict[str, dict[str, NDArray[np.generic]]]
    )


@dataclass
class RunContext:
    """Explicit experiment inputs and reusable in-memory training outputs."""

    lf: ExperimentData
    gslf: ExperimentData
    keller: ExperimentData
    keller_observed: NDArray[np.bool_]
    requested: tuple[str, ...]
    ensemble_size: int
    device: torch.device
    config: TrainingConfig
    evaluate: bool = True
    checkpoints: dict[str, Ensemble] | None = None

    def fit(
        self, name: str, data: ExperimentData, train: list[int], validation: list[int]
    ) -> Ensemble:
        """Use saved members for evaluate, otherwise fit every requested seed afresh."""
        if self.checkpoints is not None:
            return self.checkpoints[name]
        return train_ensemble(
            data.subset(train),
            data.subset(validation),
            device=self.device,
            config=self.config,
            seeds=tuple(range(self.ensemble_size)),
        )


def _classification(
    data: ExperimentData,
    probabilities: FloatArray,
    *,
    rows: tuple[list[int], list[int]],
    groups: NDArray[np.int64] | None,
    rf: FloatArray | None,
) -> dict[str, object]:
    train, test = rows
    result: dict[str, object] = {
        "mpnn": classification_summary(data.targets[test], probabilities[test], groups, rf),
        "molecule_count": len(test),
        "labels": list(data.labels),
        "train_positive_counts": data.targets[train].sum(axis=0).tolist(),
        "test_positive_counts": data.targets[test].sum(axis=0).tolist(),
        "test_prevalence": data.targets[test].mean(axis=0).tolist(),
        "mean_prevalence": float(data.targets[test].mean()),
    }
    if rf is not None:
        result["rf"] = classification_summary(data.targets[test], rf, groups)
        result["rf_ensemble_size"] = 1
    return result


def binary_runs(context: RunContext) -> Iterator[RunOutput]:
    """Fit only the official and cluster parents needed by the selected runs."""
    partition, clusters = cluster_ids(context.lf)
    for parent, children, assignments in (
        (
            "official",
            ("official", "official_minus_leaked"),
            splits.official_split(context.lf.molecules),
        ),
        (
            "cluster",
            ("cluster", "cross_source", "calibration", "domain", "stereo_pairs"),
            partition.assignments,
        ),
    ):
        selected = [run for run in children if run in context.requested]
        if not selected:
            continue
        started = perf_counter()
        train = [i for i, split in enumerate(assignments) if split == "train"]
        validation = [i for i, split in enumerate(assignments) if split == "validation"]
        test = [i for i, split in enumerate(assignments) if split == "held_out"]
        ensemble = context.fit(parent, context.lf, train, validation)
        probabilities, spread = ensemble.predict(context.lf.dataset, context.device)
        fp = count_fingerprints(source_structures([row.smiles for row in context.lf.molecules]))
        rf = fit_random_forest(fp[train], context.lf.targets[train]) if context.evaluate else None
        forest = rf.predict_probabilities(fp) if rf is not None else None
        similarities = nearest_similarity(
            context.lf.molecules, [context.lf.molecules[i] for i in train]
        )
        training_wall = perf_counter() - started
        for name in selected:
            evaluated = perf_counter()
            result: dict[str, object] = {}
            if context.evaluate:
                if name == "official_minus_leaked":
                    audit = splits.leakage_audit(context.lf.molecules)
                    leaked = {key for group in audit.crossing_groups for key in group.held_out_ids}
                    test = [i for i in test if context.lf.molecules[i].molecule_id not in leaked]
                    result["sibling_agreement"] = asdict(audit)
                if name in ("official", "official_minus_leaked", "cluster"):
                    result.update(
                        _classification(
                            context.lf,
                            probabilities,
                            rows=(train, test),
                            groups=clusters[test] if parent == "cluster" else None,
                            rf=forest[test] if forest is not None else None,
                        )
                    )
                elif name == "cross_source":
                    result.update(_cross_source(context, ensemble, train, rf))
                else:
                    result.update(
                        classification_summary(
                            context.lf.targets[test], probabilities[test], clusters[test]
                        )
                    )
                    if name == "calibration":
                        result.update(
                            calibration_summary(
                                context.lf.targets[test],
                                probabilities[test],
                                spread[test],
                                context.lf.targets[train],
                                clusters[test],
                            )
                        )
                    elif name == "domain":
                        result["bins"] = domain_summary(
                            context.lf.targets[test],
                            probabilities[test],
                            similarities[test],
                            clusters[test],
                        )
                    else:
                        result.update(stereo_summary(context.lf.molecules, probabilities, test))
            result.update(
                ensemble_size=context.ensemble_size,
                wall_time_s=training_wall + perf_counter() - evaluated,
                training={"wall_time_s": training_wall},
                best_epochs=[member.best_epoch for member in ensemble.members],
            )
            yield RunOutput(
                name,
                result,
                {parent: ensemble},
                {
                    parent: {
                        "prob": probabilities,
                        "spread": spread,
                        "nearest_train_similarity": similarities,
                        "molecule_id": np.array([row.molecule_id for row in context.lf.molecules]),
                        "labels": np.array(context.lf.labels),
                        "split": np.array(assignments),
                    }
                },
            )
            LOGGER.info("run=%s elapsed_s=%.1f", name, result["wall_time_s"])


def _cross_source(
    context: RunContext,
    ensemble: Ensemble,
    train: list[int],
    rf: RandomForestBaseline | None,
) -> dict[str, object]:

    rows = context.gslf.molecules
    known = {row.connectivity_key for row in context.lf.molecules}
    selected = [i for i, row in enumerate(rows) if row.connectivity_key not in known]
    labels = tuple(sorted(set(context.lf.labels) & set(context.gslf.labels)))
    columns = [context.lf.labels.index(label) for label in labels]
    target_columns = [context.gslf.labels.index(label) for label in labels]
    probabilities, _ = ensemble.predict(context.gslf.subset(selected), context.device)
    probabilities = probabilities[:, columns]
    targets = context.gslf.targets[selected][:, target_columns]
    similarities = nearest_similarity(
        [rows[i] for i in selected], [context.lf.molecules[i] for i in train]
    )
    if rf is None:
        message = "Cross-source evaluation requires the cluster training forest."
        raise ValueError(message)
    forest = rf.predict_probabilities(
        count_fingerprints(source_structures([rows[i].smiles for i in selected]))
    )[:, columns]
    return {
        "molecule_count": len(selected),
        "labels": list(labels),
        "mpnn": classification_summary(targets, probabilities, comparison=forest),
        "rf": classification_summary(targets, forest),
        "rf_ensemble_size": 1,
        "train_positive_counts": context.lf.targets[train][:, columns].sum(axis=0).tolist(),
        "test_positive_counts": targets.sum(axis=0).tolist(),
        "test_prevalence": targets.mean(axis=0).tolist(),
        "mean_prevalence": float(targets.mean()),
        "bins": domain_summary(targets, probabilities, similarities, None),
    }
