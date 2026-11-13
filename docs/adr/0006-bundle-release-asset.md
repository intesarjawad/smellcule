# 0006: Bundle release asset

## Context

The site needs a data bundle produced by the research workflow.

## Decision

Publish production data bundles as release assets. Only synthetic or redistribution-cleared test bundles belong in Git.

## Consequence

Site deployment must obtain the bundle from a release rather than from the repository tree.
