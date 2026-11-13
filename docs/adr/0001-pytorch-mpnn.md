# 0001: Pure-PyTorch MPNN

## Context

The perception model needs a message-passing neural network.

## Decision

Implement the MPNN in pure PyTorch instead of using OpenPOM or DeepChem.

## Consequence

The project owns the model implementation and its training integration.
