"""Plain lookup rendering, pending the visual direction."""

from textwrap import wrap

from smellcule.lookup import LookupResult


def render(result: LookupResult) -> str:
    """Keep text presentation separate from catalogue resolution and JSON."""
    lines: list[str] = [f"smellcule-{result.model}"]
    for match in result.matches:
        cas = match.cas or "not listed in the source catalogue"
        lines.extend((match.name, f"CAS: {cas}", f"Split: {match.split}"))
        lines.append(f"Nearest train similarity: {match.nearest_train_similarity}")
        for label, measured, prob, spread in zip(
            result.labels, match.measured, match.prob, match.spread, strict=True
        ):
            lines.append(
                f"{label}: measured={measured}, prediction={prob:.6f}, spread={spread:.6f}"
            )
    return "\n".join(part for line in lines for part in wrap(line, width=80))
