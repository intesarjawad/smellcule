import logging
from collections.abc import Iterator
from copy import deepcopy
from dataclasses import dataclass
from time import perf_counter

import torch
from sklearn.metrics import roc_auc_score
from torch import Tensor, nn

from smellcule.batching import GraphBatch, batch_graphs
from smellcule.features import GraphArrays
from smellcule.model import OdourMPNN
from smellcule.torch_api import AdamW, manual_seed

LOGGER = logging.getLogger(__name__)
LOG_EVERY_EPOCHS = 10
MATRIX_DIMENSIONS = 2
MAX_EPOCHS = 200


@dataclass(frozen=True)
class TrainingSet:
    """Graph-aligned binary or soft descriptor targets stored on CPU."""

    graphs: tuple[GraphArrays, ...]
    targets: Tensor

    def __post_init__(self) -> None:
        if (
            not self.graphs
            or self.targets.ndim != MATRIX_DIMENSIONS
            or len(self.graphs) != len(self.targets)
        ):
            message = "Training data needs nonempty graphs and a row-aligned target matrix."
            raise ValueError(message)
        if self.targets.device.type != "cpu":
            message = "Store training targets on CPU; batches are moved to the requested device."
            raise ValueError(message)
        if not bool(torch.isfinite(self.targets).all()) or bool(
            ((self.targets < 0) | (self.targets > 1)).any()
        ):
            message = "Descriptor targets must be finite values between zero and one."
            raise ValueError(message)


@dataclass(frozen=True)
class TrainingConfig:
    """Pinned optimisation defaults and the feasibility gate's network parameters."""

    hidden: int = 192
    steps: int = 4
    embed_dim: int = 256
    dropout: float = 0.1
    batch_size: int = 64
    max_epochs: int = 200
    patience: int = 30
    learning_rate: float = 1e-3
    minimum_learning_rate: float = 1e-5
    weight_decay: float = 1e-4

    def __post_init__(self) -> None:
        sizes = (self.hidden, self.steps, self.embed_dim, self.batch_size, self.patience)
        if min(sizes) < 1 or not 1 <= self.max_epochs <= MAX_EPOCHS:
            message = "Model and batch sizes must be positive; max_epochs must be in 1..200."
            raise ValueError(message)
        if not 0 <= self.dropout < 1 or not 0 < self.minimum_learning_rate <= self.learning_rate:
            message = "Use dropout in [0, 1) and positive learning rates with minimum <= initial."
            raise ValueError(message)
        if self.weight_decay < 0:
            message = "Weight decay must be nonnegative."
            raise ValueError(message)


@dataclass(frozen=True)
class EpochResult:
    """Measured optimisation and validation values for one epoch."""

    epoch: int
    loss: float
    validation_auroc: float
    elapsed_s: float


@dataclass(frozen=True)
class TrainedModel:
    """Best validation checkpoint, with the complete seed timing and epoch history."""

    model: OdourMPNN
    best_epoch: int
    validation_auroc: float
    wall_time_s: float
    history: tuple[EpochResult, ...]


def macro_auroc(targets: Tensor, scores: Tensor) -> tuple[float, int]:
    """Average binary AUROC only over columns with both classes present."""
    if targets.ndim != MATRIX_DIMENSIONS or targets.shape != scores.shape or targets.shape[0] == 0:
        message = "AUROC needs nonempty, matching target and score matrices."
        raise ValueError(message)
    if not bool(((targets == 0) | (targets == 1)).all()):
        message = "AUROC needs binary targets; use a regression metric for soft ratings."
        raise ValueError(message)
    if not bool(torch.isfinite(scores).all()):
        message = "AUROC scores must be finite."
        raise ValueError(message)
    eligible = (targets.sum(dim=0) > 0) & (targets.sum(dim=0) < len(targets))
    count = int(eligible.sum().item())
    if count == 0:
        message = "AUROC has no eligible labels; supply at least one positive and negative."
        raise ValueError(message)
    value = roc_auc_score(
        targets[:, eligible].numpy(), scores[:, eligible].numpy(), average="macro"
    )
    return float(value), count


def graph_batch_to(batch: GraphBatch, device: torch.device) -> GraphBatch:
    """Move every graph tensor together, retaining graph membership and count."""
    return GraphBatch(
        batch.atom_features.to(device),
        batch.edge_index.to(device),
        batch.edge_features.to(device),
        batch.graph_index.to(device),
        batch.num_graphs,
    )


def _batches(
    dataset: TrainingSet, order: list[int], batch_size: int, device: torch.device
) -> Iterator[tuple[GraphBatch, Tensor]]:
    for start in range(0, len(order), batch_size):
        indices = order[start : start + batch_size]
        batch = batch_graphs([dataset.graphs[index] for index in indices])
        yield graph_batch_to(batch, device), dataset.targets[indices].to(device)


def predict_probabilities(
    model: OdourMPNN, dataset: TrainingSet, device: torch.device, batch_size: int = 64
) -> Tensor:
    """Predict descriptor probabilities in input row order without dropout."""
    model.eval()
    with torch.no_grad():
        return torch.cat(
            [
                model.forward(batch).sigmoid().cpu()
                for batch, _ in _batches(
                    dataset, list(range(len(dataset.graphs))), batch_size, device
                )
            ]
        )


def train_one_seed(
    train: TrainingSet,
    validation: TrainingSet,
    *,
    seed: int,
    device: torch.device,
    config: TrainingConfig,
) -> TrainedModel:
    """Fit one seed, stopping on validation macro AUROC and restoring its best state."""
    if train.targets.shape[1] != validation.targets.shape[1]:
        message = "Training and validation target columns must have the same descriptor order."
        raise ValueError(message)
    # Check the metric before starting an expensive run, without looking at held-out rows.
    macro_auroc(validation.targets, validation.targets)
    started = perf_counter()
    previous_determinism = torch.are_deterministic_algorithms_enabled()
    previous_rng = torch.get_rng_state()
    try:
        torch.use_deterministic_algorithms(device.type == "cpu")
        manual_seed(seed)
        result = _fit(train, validation, seed=seed, device=device, config=config)
    finally:
        torch.set_rng_state(previous_rng)
        torch.use_deterministic_algorithms(previous_determinism)
    return TrainedModel(
        result.model,
        result.best_epoch,
        result.validation_auroc,
        perf_counter() - started,
        result.history,
    )


def _fit(
    train: TrainingSet,
    validation: TrainingSet,
    *,
    seed: int,
    device: torch.device,
    config: TrainingConfig,
) -> TrainedModel:
    started = perf_counter()
    model = OdourMPNN(
        train.targets.shape[1], config.hidden, config.steps, config.embed_dim, config.dropout
    ).to(device)
    optimizer = AdamW(model.parameters(), lr=config.learning_rate, weight_decay=config.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=config.max_epochs, eta_min=config.minimum_learning_rate
    )
    loss_function = nn.BCEWithLogitsLoss()
    generator = torch.Generator().manual_seed(seed)
    best_score = -torch.inf
    best_epoch = 0
    best_state = deepcopy(model.state_dict())
    history: list[EpochResult] = []
    for epoch in range(1, config.max_epochs + 1):
        model.train()
        order = [
            int(index.item()) for index in torch.randperm(len(train.graphs), generator=generator)
        ]
        total_loss = 0.0
        for batch, targets in _batches(train, order, config.batch_size, device):
            optimizer.zero_grad(set_to_none=True)
            loss = loss_function(model.forward(batch), targets)
            if not bool(torch.isfinite(loss)):
                message = f"Nonfinite training loss at seed={seed} epoch={epoch}; inspect inputs."
                raise ValueError(message)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * batch.num_graphs
        scheduler.step()
        probabilities = predict_probabilities(model, validation, device, config.batch_size)
        score, _ = macro_auroc(validation.targets, probabilities)
        record = EpochResult(epoch, total_loss / len(train.graphs), score, perf_counter() - started)
        history.append(record)
        if score > best_score:
            best_score, best_epoch = score, epoch
            best_state = deepcopy(model.state_dict())
        if epoch % LOG_EVERY_EPOCHS == 0:
            LOGGER.info(
                "seed=%d epoch=%d loss=%.4f val_auroc=%.6f elapsed_s=%.1f",
                seed,
                epoch,
                record.loss,
                score,
                record.elapsed_s,
            )
        if epoch - best_epoch >= config.patience:
            break
    model.load_state_dict(best_state)
    model.eval()
    wall_time_s = perf_counter() - started
    LOGGER.info(
        "seed=%d best_epoch=%d val_auroc=%.6f elapsed_s=%.1f",
        seed,
        best_epoch,
        best_score,
        wall_time_s,
    )
    return TrainedModel(model, best_epoch, best_score, wall_time_s, tuple(history))
