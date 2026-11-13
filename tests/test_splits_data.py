import json
from collections import Counter
from collections.abc import Mapping
from pathlib import Path

import pytest

from smellcule import catalogue, sources, splits
from smellcule.molecules import standardise

REPORT_START = "<!-- splits:start -->"
REPORT_END = "<!-- splits:end -->"


def write_counts(
    counts_path: Path, documentation_path: Path, counts: Mapping[str, int | float | None]
) -> None:
    existing: dict[str, object] = json.loads(counts_path.read_text(encoding="utf-8"))
    existing.update(counts)
    counts_path.write_text(json.dumps(existing, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    persisted: dict[str, object] = json.loads(counts_path.read_text(encoding="utf-8"))
    table = ["| Metric | Measured value |", "| --- | ---: |"]
    for key in counts:
        value = persisted[key]
        display = f"{value:.6f}" if isinstance(value, float) else str(value)
        table.append(f"| `{key}` | {display} |")
    explanation = (
        "Regenerated from `eval/data_counts.json` by `uv run pytest -m data -k splits`.\n\n"
        "Official validation uses cv0 = 0 inside official train. The leakage audit\n"
        "includes validation rows as official training siblings. Each crossing held-out\n"
        "member is compared with its best training sibling using measured-label Jaccard.\n"
        "The random baseline samples distinct-row ordered pairs with replacement across\n"
        "pairs, using `numpy.random.default_rng(0)`. Empty label sets agree exactly.\n\n"
        "Butina uses Morgan radius 2, 2048 bits, no chirality, distance cutoff 0.6,\n"
        "and static neighbour ordering (`reordering=False`). Clusters are ordered by\n"
        "SHA-256 of their smallest InChIKey. Whole clusters fill held-out to at least\n"
        "20 percent, then validation to at least 10 percent, with the remainder in train.\n"
        "The cutoff relates members to the centroid; it is not a pairwise bound.\n"
        "No connectivity key crosses this split. Geosmin is in train; Limonene is in\n"
        "validation. Reproduce these assertions with `uv run pytest -m data -k splits`.\n\n"
        "GS-LF uses `KFold(n_splits=5, shuffle=True, random_state=0)`: same protocol,\n"
        "different fold assignment from OpenPOM. Cross-source evaluation excludes every\n"
        "Leffingwell connectivity key and projects targets to sorted shared labels.\n"
        "Leffingwell-only labels are bread, brothy, catty, chicken, gasoline, horseradish,\n"
        "jasmine and rum. Source row order and multiplicity are retained. This check\n"
        "writes aggregate counts only; cross-source molecule targets stay offline."
    )
    section = f"{REPORT_START}\n## Splits and leakage audit\n\n{explanation}\n\n"
    section += "\n".join(table) + f"\n{REPORT_END}"
    original = documentation_path.read_text(encoding="utf-8")
    before, marker, after = original.partition(REPORT_START)
    suffix = after.split(REPORT_END, 1)[1] if marker else "\n"
    documentation_path.write_text(before.rstrip() + "\n\n" + section + suffix, encoding="utf-8")


def test_splits_counts_preserve_other_records_and_render_saved_values(tmp_path: Path) -> None:
    counts_path = tmp_path / "counts.json"
    docs_path = tmp_path / "data.md"
    counts_path.write_text('{"keller_molecules": 478}\n', encoding="utf-8")
    docs_path.write_text("# Existing findings\n", encoding="utf-8")
    counts = {"sibling_jaccard_mean": 0.592123456, "cross_source_molecules": 1644}
    write_counts(counts_path, docs_path, counts)
    first = docs_path.read_text(encoding="utf-8")
    write_counts(counts_path, docs_path, counts)
    assert docs_path.read_text(encoding="utf-8") == first
    assert first.startswith("# Existing findings\n")
    assert "| `sibling_jaccard_mean` | 0.592123 |" in first
    assert "| `cross_source_molecules` | 1644 |" in first
    assert json.loads(counts_path.read_text()) == {"keller_molecules": 478, **counts}


@pytest.mark.data
def test_splits_full_sources() -> None:
    root = Path(__file__).resolve().parents[1]
    cache = root / ".cache" / "smellcule"
    labels, rows = catalogue.read_leffingwell(sources.fetch("leffingwell", cache_dir=cache))
    molecules = tuple(standardise(row) for row in rows)
    gslf_labels, gslf = catalogue.read_gslf(sources.fetch("gslf", cache_dir=cache))
    official = splits.official_split(molecules)
    assert Counter(official) == {"train": 2246, "validation": 555, "held_out": 722}
    report = splits.leakage_audit(molecules)
    assert len(report.multi_member_groups) == 109
    assert len(report.crossing_groups) == 36
    assert (
        sum(len(group.train_ids) + len(group.held_out_ids) for group in report.crossing_groups)
        == 79
    )
    assert sum(len(group.held_out_ids) for group in report.crossing_groups) == 40
    assert report.sibling_agreement_mean == pytest.approx(0.592, abs=0.0005)
    assert report.sibling_agreement_median == pytest.approx(0.586, abs=0.0005)
    assert report.sibling_identical_count == 10
    assert report.random_pair_mean is not None
    assert report.random_pair_mean < 0.10
    cross = splits.cross_source(gslf, molecules, gslf_labels, labels)
    assert len(cross.rows) == 1644
    assert len(cross.labels) == 105
    assert set(labels) - set(cross.labels) == {
        "bread",
        "brothy",
        "catty",
        "chicken",
        "gasoline",
        "horseradish",
        "jasmine",
        "rum",
    }
    cluster = splits.cluster_split(molecules)
    assert cluster == splits.cluster_split(molecules)
    counts = Counter(cluster.assignments)
    assert 0.18 <= counts["held_out"] / len(molecules) <= 0.22
    assert 0.08 <= counts["validation"] / len(molecules) <= 0.12
    assert counts == {"train": 2400, "validation": 353, "held_out": 770}
    assert len(cluster.clusters) == 714
    assert max(map(len, cluster.clusters)) == 456
    for name, expected in (("Geosmin", "train"), ("Limonene", "validation")):
        assert {cluster.assignments[i] for i, row in enumerate(molecules) if row.name == name} == {
            expected
        }
    by_key: dict[str, set[str]] = {}
    for row, assignment in zip(molecules, cluster.assignments, strict=True):
        by_key.setdefault(row.connectivity_key, set()).add(assignment)
    assert all(len(assignments) == 1 for assignments in by_key.values())
    folds = splits.gslf_folds(gslf)
    assert Counter(len(fold.test_indices) for fold in folds) == {997: 3, 996: 2}
    assert sorted(index for fold in folds for index in fold.test_indices) == list(range(len(gslf)))
    write_counts(
        root / "eval" / "data_counts.json",
        root / "docs" / "data.md",
        {
            "leffingwell_molecules": len(molecules),
            "leffingwell_descriptors": len(labels),
            **{f"official_{name}": count for name, count in Counter(official).items()},
            "cluster_clusters": len(cluster.clusters),
            "cluster_largest": max(map(len, cluster.clusters)),
            **{f"cluster_{name}": count for name, count in counts.items()},
            "leakage_multi_member_groups": len(report.multi_member_groups),
            "leakage_crossing_groups": len(report.crossing_groups),
            "leakage_crossing_molecules": sum(
                len(group.train_ids) + len(group.held_out_ids) for group in report.crossing_groups
            ),
            "leakage_held_out": sum(len(group.held_out_ids) for group in report.crossing_groups),
            "sibling_jaccard_mean": report.sibling_agreement_mean,
            "sibling_jaccard_median": report.sibling_agreement_median,
            "sibling_identical_count": report.sibling_identical_count,
            "random_pair_count": splits.RANDOM_PAIR_COUNT,
            "random_pair_jaccard_mean": report.random_pair_mean,
            "gslf_molecules": len(gslf),
            "gslf_descriptors": len(gslf_labels),
            "gslf_folds": len(folds),
            **{f"gslf_fold_{i}_test": len(fold.test_indices) for i, fold in enumerate(folds)},
            "cross_source_molecules": len(cross.rows),
            "cross_source_descriptors": len(cross.labels),
        },
    )
