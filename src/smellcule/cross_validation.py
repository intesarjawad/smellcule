from collections.abc import Iterator
from statistics import median
from time import perf_counter

import numpy as np
import torch

from smellcule import splits
from smellcule.catalogue import GSLFRow
from smellcule.ensemble import Ensemble
from smellcule.evaluation import classification_summary, correlation_summary
from smellcule.experiment_data import cluster_ids, gslf_validation
from smellcule.experiments import RunContext, RunOutput
from smellcule.keller_training import KellerFitConfig, train_keller
from smellcule.molecules import nearest_similarity

FOLDS = 5


def cross_validation(context: RunContext, name: str) -> Iterator[RunOutput]:
    """Generate out-of-fold evidence without training on evaluated molecules."""
    started = perf_counter()
    data = context.keller if name == "keller_cv" else context.gslf
    probabilities = np.zeros_like(data.targets)
    spread = np.zeros_like(probabilities)
    assignments = np.full(len(data.molecules), -1, dtype=np.int64)
    nearest = np.zeros(len(data.molecules), dtype=np.float64)
    best_epochs: list[list[int]] = []
    fold_records: list[dict[str, object]] = []
    _, groups = cluster_ids(data)
    keller_folds = groups % FOLDS
    folds = (
        splits.gslf_folds(tuple(GSLFRow(row.smiles, row.measured) for row in data.molecules))
        if name == "gslf_cv"
        else ()
    )
    for fold in range(FOLDS):
        fold_started = perf_counter()
        if name == "gslf_cv":
            test = list(folds[fold].test_indices)
            train, validation = gslf_validation(folds[fold].train_indices, fold)
        else:
            test = np.flatnonzero(keller_folds == fold).tolist()
            validation = np.flatnonzero(keller_folds == (fold + 1) % FOLDS).tolist()
            train = np.flatnonzero(
                (keller_folds != fold) & (keller_folds != (fold + 1) % FOLDS)
            ).tolist()
        checkpoint = f"{name}/fold{fold}"
        if name == "gslf_cv":
            ensemble = context.fit(checkpoint, data, train, validation)
        elif context.checkpoints is not None:
            ensemble = context.checkpoints[checkpoint]
        else:
            ensemble = train_keller(
                data.subset(train),
                data.subset(validation),
                options=KellerFitConfig(
                    seeds=tuple(range(context.ensemble_size)),
                    device=context.device,
                    config=context.config,
                    train_observed=torch.tensor(context.keller_observed[train], dtype=torch.bool),
                    validation_observed=torch.tensor(
                        context.keller_observed[validation], dtype=torch.bool
                    ),
                ),
            )
        probabilities[test], spread[test] = ensemble.predict(data.subset(test), context.device)
        assignments[test] = fold
        if name == "keller_cv":
            nearest[test] = nearest_similarity(
                [data.molecules[i] for i in test], [data.molecules[i] for i in train]
            )
        epochs = [member.best_epoch for member in ensemble.members]
        best_epochs.append(epochs)
        fold_records.append(
            {
                "fold": fold,
                "train_indices": train,
                "validation_indices": validation,
                "test_indices": test,
                "best_epochs": epochs,
                "best_validation_scores": [member.validation_auroc for member in ensemble.members],
                "wall_time_s": perf_counter() - fold_started,
            }
        )
        yield RunOutput("", {}, {checkpoint: ensemble})
    if (assignments < 0).any():
        message = "Cross-validation did not predict every source molecule."
        raise ValueError(message)
    result: dict[str, object] = {
        "ensemble_size": context.ensemble_size,
        "folds": fold_records,
        "molecule_count": len(data.molecules),
        "labels": list(data.labels),
        "best_epochs": best_epochs,
    }
    if name == "keller_cv":
        final, metadata = _final_keller(context, best_epochs)
        yield RunOutput("", {}, {"smellcule-open": final})
        result.update(metadata)
        if context.evaluate:
            result.update(
                correlation_summary(data.targets, probabilities, groups, context.keller_observed)
            )
    elif context.evaluate:
        result["mpnn"] = classification_summary(data.targets, probabilities)
        result.update(
            test_positive_counts=data.targets.sum(axis=0).tolist(),
            test_prevalence=data.targets.mean(axis=0).tolist(),
            mean_prevalence=float(data.targets.mean()),
        )
    result["wall_time_s"] = perf_counter() - started
    yield RunOutput(
        name,
        result,
        arrays={
            "keller_oof" if name == "keller_cv" else "gslf_oof": {
                "cid" if name == "keller_cv" else "molecule_id": np.array(
                    [row.molecule_id for row in data.molecules]
                ),
                "prob": probabilities,
                "spread": spread,
                "fold": assignments,
                "nearest_train_similarity": nearest,
                "targets": data.targets,
                "observed": context.keller_observed
                if name == "keller_cv"
                else np.ones_like(probabilities, dtype=bool),
                "labels": np.array(data.labels),
            }
        },
    )


def _final_keller(
    context: RunContext, best_epochs: list[list[int]]
) -> tuple[Ensemble, dict[str, object]]:
    data = context.keller
    fold_best_epochs = [int(median(epochs)) for epochs in best_epochs]
    fixed_epochs = int(median(fold_best_epochs))
    final_started = perf_counter()
    final = (
        context.checkpoints["smellcule-open"]
        if context.checkpoints is not None
        else train_keller(
            data.dataset,
            None,
            options=KellerFitConfig(
                seeds=tuple(range(context.ensemble_size)),
                device=context.device,
                config=context.config,
                fixed_epochs=fixed_epochs,
                train_observed=torch.tensor(context.keller_observed, dtype=torch.bool),
            ),
        )
    )
    metadata: dict[str, object] = {
        "final_epochs": fixed_epochs,
        "fold_best_epochs": fold_best_epochs,
        "final_training": {"wall_time_s": perf_counter() - final_started},
        "missing_rating_count": int((~context.keller_observed).sum()),
        "stopping_metric": "mean Pearson r",
        "final_training_rows": len(data.molecules),
    }
    return final, metadata
