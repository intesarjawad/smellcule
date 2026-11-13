import logging
from copy import deepcopy
from dataclasses import dataclass
from time import perf_counter

import numpy as np
import torch
from torch import Tensor, nn

from smellcule.batching import batch_graphs
from smellcule.ensemble import Ensemble, model_from_config
from smellcule.metrics import MIN_CORRELATION_SAMPLES, pearson
from smellcule.torch_api import AdamW, backward, manual_seed
from smellcule.training import (
    EpochResult,
    TrainedModel,
    TrainingConfig,
    TrainingSet,
    graph_batch_to,
    predict_probabilities,
)

LOGGER = logging.getLogger(__name__)
LOG_EVERY_EPOCHS = 10


def mean_pearson(targets: Tensor, scores: Tensor, observed: Tensor | None = None) -> float:
    """Average defined descriptor correlations without binarising soft ratings."""
    masks = torch.ones_like(targets, dtype=torch.bool) if observed is None else observed
    values = [
        value
        for target, score, mask in zip(
            targets.numpy().T, scores.numpy().T, masks.numpy().T, strict=True
        )
        if mask.sum() >= MIN_CORRELATION_SAMPLES
        if (value := pearson(target[mask].astype(np.float64), score[mask].astype(np.float64)))
        is not None
    ]
    if not values:
        message = "Keller validation has no descriptors with defined Pearson correlation."
        raise ValueError(message)
    return float(np.mean(values))


@dataclass(frozen=True)
class KellerFitConfig:
    """The CV observation masks and stopping protocol, or final fixed epochs."""

    device: torch.device
    config: TrainingConfig
    seeds: tuple[int, ...]
    fixed_epochs: int | None = None
    train_observed: Tensor | None = None
    validation_observed: Tensor | None = None


def train_keller(
    train: TrainingSet,
    validation: TrainingSet | None,
    *,
    options: KellerFitConfig,
) -> Ensemble:
    """Fit soft targets using Pearson stopping or a prescribed final epoch count."""
    fixed_epochs = options.fixed_epochs
    if (validation is None) != (fixed_epochs is not None):
        message = "Supply validation for CV, or fixed_epochs without validation for the final fit."
        raise ValueError(message)
    previous_rng = torch.get_rng_state()
    previous_determinism = torch.are_deterministic_algorithms_enabled()
    try:
        torch.use_deterministic_algorithms(options.device.type == "cpu")
        return Ensemble(tuple(_fit(train, validation, seed, options) for seed in options.seeds))
    finally:
        torch.set_rng_state(previous_rng)
        torch.use_deterministic_algorithms(previous_determinism)


def _fit(
    train: TrainingSet,
    validation: TrainingSet | None,
    seed: int,
    options: KellerFitConfig,
) -> TrainedModel:
    device, config = options.device, options.config
    fixed_epochs = options.fixed_epochs
    train_observed, validation_observed = options.train_observed, options.validation_observed
    started = perf_counter()
    manual_seed(seed)
    model = model_from_config(train.targets.shape[1], config).to(device)
    optimizer = AdamW(model.parameters(), lr=config.learning_rate, weight_decay=config.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=config.max_epochs, eta_min=config.minimum_learning_rate
    )
    generator = torch.Generator().manual_seed(seed)
    best_score, best_epoch = -float("inf"), 0
    best_state = deepcopy(model.state_dict())
    history: list[EpochResult] = []
    for epoch in range(1, (fixed_epochs or config.max_epochs) + 1):
        model.train()
        order = [
            int(index.item()) for index in torch.randperm(len(train.graphs), generator=generator)
        ]
        total_loss = 0.0
        for start in range(0, len(order), config.batch_size):
            indices = order[start : start + config.batch_size]
            batch = graph_batch_to(batch_graphs([train.graphs[i] for i in indices]), device)
            optimizer.zero_grad(set_to_none=True)
            losses = nn.functional.binary_cross_entropy_with_logits(
                model.forward(batch), train.targets[indices].to(device), reduction="none"
            )
            loss: Tensor = (
                losses.mean()
                if train_observed is None
                else losses[train_observed[indices].to(device)].mean()
            )
            if not bool(torch.isfinite(loss)):
                message = f"Nonfinite Keller loss at seed={seed} epoch={epoch}."
                raise ValueError(message)
            backward(loss)
            optimizer.step()
            total_loss += loss.item() * len(indices)
        scheduler.step()
        score = (
            mean_pearson(
                validation.targets,
                predict_probabilities(model, validation, device),
                validation_observed,
            )
            if validation is not None
            else 0.0
        )
        history.append(
            EpochResult(epoch, total_loss / len(train.graphs), score, perf_counter() - started)
        )
        if fixed_epochs is not None or score > best_score:
            best_score, best_epoch, best_state = score, epoch, deepcopy(model.state_dict())
        if epoch % LOG_EVERY_EPOCHS == 0:
            LOGGER.info(
                "keller seed=%d epoch=%d val_pearson=%.6f elapsed_s=%.1f",
                seed,
                epoch,
                score,
                perf_counter() - started,
            )
        if validation is not None and epoch - best_epoch >= config.patience:
            break
    model.load_state_dict(best_state)
    model.eval()
    return TrainedModel(model, best_epoch, best_score, perf_counter() - started, tuple(history))
