"""Generate synthetic descriptor fixtures; never read source measurements or model weights."""

import csv
import json
from dataclasses import asdict
from pathlib import Path

import numpy as np
import yaml

from smellcule.export.bundle_inputs import read_fixture_rows
from smellcule.export.bundle_stats import collect_stats
from smellcule.export.content import mapping, read_yaml, sequence, text
from smellcule.export.neighbours import build_neighbours, nearest_train_similarities
from smellcule.export.smellcule_clues import build_clues
from smellcule.export.smellcule_lock import empty_lock, read_lock
from smellcule.molecules import standardise

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests/fixtures"
SEED = 20261113


def write_catalogues(identities: list[dict[str, str]], targets: dict[str, set[str]]) -> None:
    """Write the parser fixtures in their existing row order."""
    fields = [
        "database_id",
        "chemical_name",
        "cas",
        "smiles",
        "odor_labels_filtered",
        "labels_train/test",
        "labels_cv0",
    ]
    for group, filename in (
        ("catalogue", "leffingwell_fixture.csv"),
        ("content", "content_catalogue.csv"),
        ("export", "export_catalogue.csv"),
    ):
        with (FIXTURES / filename).open("w", newline="") as destination:
            writer = csv.DictWriter(destination, fieldnames=fields, lineterminator="\n")
            writer.writeheader()
            selected = [row for row in identities if row[group] == "1"]
            if group == "export":
                selected.sort(key=lambda row: int(row["database_id"]))
            for index, row in enumerate(selected):
                held_out = index % 5 == 0
                writer.writerow(
                    {
                        **{k: row[k] for k in fields[:4]},
                        "odor_labels_filtered": repr(sorted(targets[row["database_id"]])),
                        "labels_train/test": "0.0" if held_out else "1.0",
                        "labels_cv0": "-1.0" if held_out else "0.0" if index % 3 == 0 else "1.0",
                    }
                )


def write_outputs(labels: tuple[str, ...], rng: np.random.Generator) -> None:
    """Generate numeric test inputs independently of any trained model."""
    rows = read_fixture_rows(ROOT, labels)
    molecules = tuple(standardise(row) for row in rows)
    assignments = tuple(
        "held_out"
        if row.molecule_id == "425"
        else "validation"
        if row.molecule_id == "1557"
        else "train"
        for row in rows
    )
    prob = rng.uniform(0.01, 0.99, size=(len(rows), len(labels)))
    spread = rng.uniform(0.01, 0.2, size=prob.shape)
    positions = rng.uniform(-80, 80, size=(len(rows), 3))
    neighbours = build_neighbours(molecules, rng.normal(size=(len(rows), 16)))
    nearest = nearest_train_similarities(molecules, assignments)
    clues = build_clues(molecules, assignments)
    puzzle_index = next(i for i, row in enumerate(rows) if row.molecule_id == "425")
    answer = [i for i, value in enumerate(rows[puzzle_index].measured) if value]
    options = sorted(set(answer[:6]) | set(np.argsort(-prob[puzzle_index])[:3].tolist()))
    options += [int(i) for i in rng.permutation(len(labels)) if i not in options][
        : 12 - len(options)
    ]
    records = {
        row.molecule_id: {
            "split": assignments[i],
            "nearestTrainSimilarity": nearest[i],
            "prob": prob[i].round(6).tolist(),
            "spread": spread[i].round(6).tolist(),
            "position": positions[i].round(6).tolist(),
            # The cosine comes from a BLAS matmul whose last bits differ across platforms.
            "neighbours": [{**asdict(n), "odour": round(n.odour, 6)} for n in neighbours[i]],
        }
        for i, row in enumerate(rows)
    }
    document = {
        "labels": labels,
        "model": {"id": "synthetic-fixture", "licence": "CC-BY-4.0", "revision": f"seed-{SEED}"},
        "molecules": records,
        "stats": {
            "retiredPuzzles": 0,
            **collect_stats(
                json.loads((ROOT / "eval/results.json").read_text()),
                json.loads((ROOT / "eval/data_counts.json").read_text()),
            ),
        },
        "smellcule": {
            "startDate": empty_lock().start_date.isoformat(),
            "puzzles": [
                {
                    "moleculeId": "425",
                    "options": options,
                    "answer": answer,
                    "clueId": clues[puzzle_index].molecule_index,
                    "clueSimilarity": clues[puzzle_index].similarity,
                }
            ],
        },
    }
    (FIXTURES / "fixture_model_outputs.json").write_text(
        json.dumps(document, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n"
    )


def synthetic_targets(
    identities: list[dict[str, str]], labels: tuple[str, ...], rng: np.random.Generator
) -> dict[str, set[str]]:
    """Assign random labels and compatible synthetic content evidence."""
    by_name: dict[str, list[str]] = {}
    for row in identities:
        by_name.setdefault(row["chemical_name"].casefold(), []).append(row["database_id"])
    targets = {
        row["database_id"]: set(rng.choice(labels, size=5, replace=False).tolist())
        for row in identities
    }
    # Full vocabulary coverage exercises the same schema width as production.
    content_rows = [row for row in identities if row["content"] == "1"]
    for index, label in enumerate(labels):
        row = content_rows[index % len(content_rows)]
        targets[row["database_id"]].add(label)
    notes = read_yaml(ROOT / "config/notes.yaml")
    for raw in mapping(notes["notes"]).values():
        note = mapping(raw)
        evidence = str(rng.choice(labels))
        note["evidence"] = [evidence]
        for link in sequence(note["molecules"]):
            name = text(link) if isinstance(link, str) else text(mapping(link)["name"])
            for key in by_name[name.casefold()]:
                targets[key].add(evidence)
    phrases = read_yaml(ROOT / "config/phrases.yaml")
    for raw in phrases.values():
        phrase = mapping(raw)
        if phrase["exemplar"] is not None:
            evidence = str(rng.choice(labels))
            phrase["weights"] = {evidence: 1.0}
            phrase["source_url"] = "https://example.org/synthetic-fixture"
            for key in by_name[text(phrase["exemplar"]).casefold()]:
                targets[key].add(evidence)
    for name, document in (("notes", notes), ("phrases", phrases)):
        (FIXTURES / f"synthetic-{name}.yaml").write_text(
            yaml.safe_dump(document, sort_keys=False), encoding="utf-8"
        )
    return targets


def main() -> None:
    """Keep structural test cases, replacing all descriptor associations with seeded draws."""
    if read_lock(ROOT / "config/puzzles.lock.json").puzzles:
        message = "Refusing to reset a published puzzle lock."
        raise ValueError(message)
    rng = np.random.default_rng(SEED)
    families = read_yaml(ROOT / "config/families.yaml")
    labels = tuple(
        sorted(
            {text(label) for raw in families.values() for label in sequence(mapping(raw)["labels"])}
            | {"odorless"}
        )
    )
    with (FIXTURES / "molecule_identities.csv").open(newline="") as source:
        identities = list(csv.DictReader(source))
    targets = synthetic_targets(identities, labels, rng)
    write_catalogues(identities, targets)
    write_outputs(labels, rng)
    (ROOT / "config/puzzles.lock.json").write_text(empty_lock().to_json())


if __name__ == "__main__":
    main()
