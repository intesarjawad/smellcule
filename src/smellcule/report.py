from __future__ import annotations

import math
from html import escape
from typing import TYPE_CHECKING, TypeGuard

from smellcule.cli import is_result_object

if TYPE_CHECKING:
    from pathlib import Path

# Published comparisons, fixed independently of local runs.
PUBLISHED = (
    ("Leffingwell GNN", 0.913, 0.908, 0.923, "Leffingwell README Table 1"),
    ("Leffingwell RF-Mordred", 0.882, 0.871, 0.891, "Leffingwell README Table 1"),
    ("Leffingwell RF-cFP", 0.867, 0.860, 0.880, "Leffingwell README Table 1"),
    ("OpenPOM", 0.8872, None, None, "OpenPOM GS-LF cross-validation"),
    ("POM", 0.89, None, None, "Principal Odor Map, bioRxiv v4"),
)
RUN_TITLES = {
    "official": "Official Leffingwell split",
    "official_minus_leaked": "Official split excluding leaked siblings",
    "gslf_cv": "GS-LF cross-validation",
    "cluster": "Cluster-held-out split",
    "cross_source": "Cross-source evaluation",
    "calibration": "Calibration",
    "domain": "Applicability domain",
    "map": "Map quality",
    "keller_cv": "Keller cluster cross-validation",
    "stereo_pairs": "Stereo pairs",
    "submissions": "Submitted predictions",
}
OMITTED = frozenset(
    {
        "folds",
        "best_epochs",
        "fold_best_epochs",
        "labels",
        "train_positive_counts",
        "test_positive_counts",
        "test_prevalence",
        "per_descriptor_pearson",
        "crossing_groups",
        "multi_member_groups",
    }
)


def is_result_list(value: object) -> TypeGuard[list[object]]:
    """Recognise arrays decoded from JSON without losing their element type."""
    return isinstance(value, list)


def number(value: object) -> str:
    """Use fixed precision for measurements and preserve missing values explicitly."""
    if value is None:
        return "not available"
    if isinstance(value, float):
        if not math.isfinite(value):
            message = "Report measurements must be finite or null."
            raise ValueError(message)
        return f"{value:.6f}"
    return str(value).replace("|", "&#124;").replace("\n", " ")


def object_at(document: dict[str, object], *keys: str) -> dict[str, object]:
    """Read an optional result section while rejecting malformed objects."""
    current = document
    for key in keys:
        value = current.get(key, {})
        if not is_result_object(value):
            message = f"Report section {'.'.join(keys)} must be an object."
            raise ValueError(message)
        current = value
    return current


def ship_gate(results: dict[str, object]) -> str:
    """Apply the cluster stable-label point-estimate gate, quoting its paired CI."""
    mpnn = object_at(results, "cluster", "mpnn", "stable_labels")
    rf = object_at(results, "cluster", "rf", "stable_labels")
    ours, baseline = mpnn.get("auroc"), rf.get("auroc")
    if not isinstance(ours, (int, float)) or not isinstance(baseline, (int, float)):
        return "Ship gate: not evaluated; cluster stable-label network and RF scores are required."
    decision = (
        "PASS; ship the network" if ours > baseline else "FAIL; ship the fingerprint MLP fallback"
    )
    ci = object_at(mpnn, "paired_auroc_difference_ci")
    return (
        f"Ship gate: {decision}. Cluster macro AUROC over labels with at least five positives: "
        f"network {number(ours)}, RF {number(baseline)} "
        f"({number(mpnn.get('label_count'))} labels). Paired bootstrap 95 percent CI "
        f"of network minus RF: [{number(ci.get('lower'))}, {number(ci.get('upper'))}]."
    )


def _rows(value: object, prefix: str = "") -> list[str]:
    if is_result_object(value):
        return [
            row
            for key, item in value.items()
            if key not in OMITTED
            for row in _rows(item, f"{prefix} / {key}" if prefix else key)
        ]
    if is_result_list(value):
        items: list[object] = value
        return [row for i, item in enumerate(items) for row in _rows(item, f"{prefix} / {i}")]
    return [f"| {escape(prefix)} | {number(value)} |"]


def _descriptors(entry: dict[str, object]) -> list[str]:
    labels = entry.get("labels")
    if not is_result_list(labels):
        return []
    names: list[object] = labels
    columns = [
        key
        for key in (
            "train_positive_counts",
            "test_positive_counts",
            "test_prevalence",
            "per_descriptor_pearson",
        )
        if key in entry
    ]
    arrays: list[list[object]] = []
    for key in columns:
        values = entry[key]
        if not is_result_list(values) or len(values) != len(names):
            message = f"Descriptor column {key} must match labels."
            raise ValueError(message)
        arrays.append(values)
    if not arrays:
        return []
    return [
        "",
        "Test prevalence is the AUPRC chance level. Missing measurements remain unavailable.",
        "",
        "| Descriptor | " + " | ".join(columns) + " |",
        "| --- | " + " | ".join("---:" for _ in columns) + " |",
        *[
            "| " + " | ".join([escape(str(label)), *[number(a[i]) for a in arrays]]) + " |"
            for i, label in enumerate(names)
        ],
    ]


def render_markdown(results: dict[str, object]) -> str:
    """Render aggregate evidence without fitting, fetching or changing results."""
    lines = [
        ship_gate(results),
        "",
        "# Evaluation",
        "",
        (
            "All measured values below come from the results file. AUROC and AUPRC are macro "
            "averages: all_labels requires a positive and a negative; stable_labels requires "
            "at least five positives. Each row records its label count. Intervals are bootstrap "
            "95 percent confidence intervals. Official, GS-LF and cross-source resample molecules; "
            "cluster, calibration, domain and Keller resample whole clusters. Stereo intervals "
            "resample molecule pairs. Paired differences use the same resamples for both models."
        ),
        "",
        (
            "GS-LF comparison: same protocol, different fold assignment. Ensemble sizes and mean "
            "prevalence appear beside the measured macro metrics. Published OpenPOM uses "
            "five folds and ten models per fold."
        ),
        "",
        (
            "Map (run 9) requires the exported bundle and runs separately. "
            "Chemprop (run 10) uses its isolated environment; "
            "recorded submissions are included below."
        ),
        "",
        "## Published comparisons",
        "",
        "| Model | AUROC | CI lower | CI upper | Source | Status |",
        "| --- | ---: | ---: | ---: | --- | --- |",
    ]
    lines.extend(
        (
            f"| {name} | {number(score)} | {number(lo)} | {number(hi)} | "
            f"{source} | published, not rerun |"
        )
        for name, score, lo, hi, source in PUBLISHED
    )
    lines.extend(
        [
            "",
            (
                "The source's caption says these are means over 138 descriptors; "
                "the released file has 113. Compared as published."
            ),
        ]
    )
    for run, title in RUN_TITLES.items():
        lines.extend(["", f"## {title}", ""])
        if run not in results:
            lines.append(
                "Not evaluated. Map (run 9) requires the exported bundle and runs separately."
                if run == "map"
                else "Not evaluated; no result entry is present."
            )
            continue
        entry = object_at(results, run)
        if run == "official_minus_leaked":
            lines.extend(
                [
                    (
                        "Sibling agreement, including the random-pair baseline, justifies "
                        "the leakage audit. These scores reuse official predictions."
                    ),
                    "",
                ]
            )
            lines.extend(
                [
                    "| Sibling agreement | Value |",
                    "| --- | ---: |",
                    *_rows(entry.get("sibling_agreement", {})),
                    "",
                ]
            )
        if run == "map":
            lines.extend(
                [
                    (
                        "Held-out query Jaccard means test whether odour neighbours generalise. "
                        "All-molecule means include training labels used to fit the embedding."
                    ),
                    "",
                ]
            )
            entry = {k: entry[k] for k in ("held_out", "all_molecules") if k in entry} | {
                k: v for k, v in entry.items() if k not in {"held_out", "all_molecules"}
            }
        if run == "stereo_pairs":
            lines.extend(
                ["Held-out groups are the test; all groups include fitted predictions.", ""]
            )
            entry = {k: entry[k] for k in ("held_out", "all_groups") if k in entry} | {
                k: v for k, v in entry.items() if k not in {"held_out", "all_groups"}
            }
        lines.extend(["| Measurement | Value |", "| --- | ---: |", *_rows(entry)])
        lines.extend(_descriptors(entry))
    lines.extend(
        [
            "",
            "## Figures",
            "",
            "![Reliability diagram](figures/reliability.svg)",
            "",
            "![Applicability domain](figures/domain.svg)",
            "",
            (
                "Per-descriptor AUROC is not stored in the results file; no per-descriptor "
                "AUROC figure is inferred from aggregate metrics."
            ),
            "",
        ]
    )
    return "\n".join(lines)


def render_svg(title: str, rows: list[tuple[str, object]]) -> str:
    """Render a labelled unit-interval dot plot with values in accessible SVG text."""
    height = 60 + 56 * len(rows)
    parts = [
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 {height}" '
            'role="img" aria-labelledby="title">'
        ),
        f'<title id="title">{escape(title)}</title>',
        f'<text x="8" y="20">{escape(title)}</text>',
    ]
    for i, (label, value) in enumerate(rows):
        y = 50 + 56 * i
        parts.append(f'<text x="8" y="{y}">{escape(label)}: {escape(number(value))}</text>')
        if isinstance(value, (int, float)):
            x = 8 + 772 * value
            parts.extend(
                [
                    f'<path d="M8 {y + 14} H780" stroke="currentColor"/>',
                    f'<circle cx="{x:.6f}" cy="{y + 14}" r="3" fill="currentColor"/>',
                ]
            )
    return "\n".join([*parts, "</svg>", ""])


def render_reliability(bins: list[dict[str, object]]) -> str:
    """Plot observed frequency against predicted probability, with bin pair counts."""
    parts = [
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 {460 + 24 * len(bins)}" '
            'role="img" aria-labelledby="title">'
        ),
        '<title id="title">Reliability: predicted probability versus observed frequency</title>',
        '<path d="M60 60 V380 H380 M60 380 L380 60" fill="none" stroke="currentColor"/>',
        '<text x="60" y="420">Predicted probability: zero to one</text>',
        '<text x="60" y="30">Observed frequency: zero to one</text>',
    ]
    for i, item in enumerate(bins):
        probability, frequency = item.get("probability"), item.get("frequency")
        label = (
            f"p={number(probability)}, observed={number(frequency)}, n={number(item.get('count'))}"
        )
        if isinstance(probability, (int, float)) and isinstance(frequency, (int, float)):
            parts.append(
                f'<circle cx="{60 + 320 * probability:.6f}" '
                f'cy="{380 - 320 * frequency:.6f}" r="3" fill="currentColor">'
                f"<title>{escape(label)}</title></circle>"
            )
        parts.append(f'<text x="8" y="{450 + 24 * i}">{escape(label)}</text>')
    return "\n".join([*parts, "</svg>", ""])


def render_figures(results: dict[str, object]) -> dict[str, str]:
    """Extract recorded plot values, retaining absent runs as explicit empty plots."""
    reliability: list[dict[str, object]] = []
    bins = object_at(results, "calibration").get("reliability_bins", [])
    if is_result_list(bins):
        entries: list[object] = bins
        reliability.extend(item for item in entries if is_result_object(item))
    domain: list[tuple[str, object]] = []
    bins = object_at(results, "domain").get("bins", [])
    if is_result_list(bins):
        entries = bins
        for item in entries:
            if is_result_object(item):
                upper = item.get("upper")
                comparison = "to <=" if upper == 1.0 else "to <"
                label = f"Tanimoto {number(item.get('lower'))} {comparison} {number(upper)}"
                for support in ("all_labels", "stable_labels"):
                    score = (
                        {} if item.get("metrics") is None else object_at(item, "metrics", support)
                    )
                    domain.append(
                        (
                            f"{label}, {support}, n={number(item.get('molecule_count'))}",
                            score.get("auroc"),
                        )
                    )
    return {
        "reliability.svg": render_reliability(reliability),
        "domain.svg": render_svg("Applicability domain: macro AUROC", domain),
    }


def write_report(results: dict[str, object], destination: Path) -> None:
    """Write a report and its adjacent figures for repository and installed CLI use."""
    markdown = render_markdown(results)
    figures = render_figures(results)
    destination.parent.mkdir(parents=True, exist_ok=True)
    directory = destination.parent / "figures"
    directory.mkdir(exist_ok=True)
    destination.write_text(markdown, encoding="utf-8")
    for name, content in figures.items():
        (directory / name).write_text(content, encoding="utf-8")
