# 0005: Precomputed outputs

## Context

The catalogue is fixed, and the site and base package need access to its predictions.

## Decision

Precompute the site bundle and CLI predictions in `predictions.safetensors`.

## Consequence

Neither the browser nor the base install runs the model; predictions are refreshed through the release workflow.
