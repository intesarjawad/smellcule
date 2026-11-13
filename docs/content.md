# Perception content and daily puzzles

Families cover the complete descriptor vocabulary except `odorless`, with each
remaining descriptor assigned once. Notes resolve every matching catalogue row,
including stereo and isomer variants. Every character link has measured evidence;
constituent links require an HTTPS source. Phrase exemplars resolve uniquely and
have measured evidence for their strongest descriptor and a linked source.

The five exemplar sources link rain to Geosmin, coffee to Furfuryl mercaptan,
cut grass to Hexanal, smoke to Guaiacol, and vanilla ice cream to Vanillin.
These are associations with individual molecules, not claims about the composition
of a mixture. The source URLs live alongside the exemplar entries.

The real-data content and puzzle checks run with:

```sh
uv run pytest -m data -k "notes or smellcule"
```

The puzzle check reads the local cluster ensemble and saves the accepted pool
size, family-strategy mean, exact random-choice mean and any dropped molecule
identifiers in `eval/data_counts.json`. It never changes the family mapping.
The synthetic cases cover widening the same-family share, dropping perfect
family solves, dropping two-pick solves, and rejecting an insufficient pool.

## Bundle integration

`compile_smellcule` accepts aligned catalogue rows, cluster assignments, model
probabilities, nearest-training clues, families and a `Publication`. That
publication supplies the committed lock, the verified deployed schedule and its
catalogue, and one explicit export date. The result contains the complete schedule,
updated lock and statistics. Validate all bundle components before replacing any
output file. A `SmellculeError` carries exit code `1` and an actionable message.

A first export leaves the lock empty. Later exports merge deployed puzzles dated
through the export date plus the deployment buffer. The lock records identity and
a SHA-256 digest of canonical options, the complete measured answer and the clue.
Locked puzzles are recovered verbatim before any decoy adjustment. Changed or
missing locked molecules fail validation. Later puzzle numbers follow the seeded
order, skipping used molecules.

For Keller, use `retire_smellcule` instead. Its schedule is `None`: omit
`smellcule.json`, remove any stale copy from the destination, and copy
`retiredPuzzles` into atlas statistics. Retired entries contain only
`{"retired": true}`. Future entries disappear; reinstated schedules continue
after the highest retired number. No filesystem or clock reads occur inside
these lifecycle functions.
