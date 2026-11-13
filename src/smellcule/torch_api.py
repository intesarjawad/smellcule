from collections.abc import Callable

import torch
from torch import Tensor
from torch.optim import AdamW

__all__ = ("AdamW", "backward", "manual_seed")

# The companion stub describes the unannotated upstream export.
manual_seed: Callable[[int], torch.Generator] = vars(torch)["manual_seed"]

backward: Callable[[Tensor], None] = vars(torch.autograd)["backward"]
