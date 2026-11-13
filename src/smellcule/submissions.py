import csv
import io
import math
import re
from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass
from urllib.parse import urlsplit

# Decimal MB keeps the upload limit independent of platform units.
MAX_PREDICTIONS_BYTES = 20_000_000
INCHIKEY = re.compile(r"[A-Z]{14}-[A-Z]{10}-[A-Z]")
ASCII_SPACE = 32


class SubmissionError(ValueError):
    """Invalid submission data with a row and column suitable for CLI diagnostics."""

    def __init__(self, row: int, column: str, reason: str) -> None:
        super().__init__(f"row {row}, column {column}: {reason}")


@dataclass(frozen=True)
class SubmissionMetadata:
    """Attribution supplied by the submitter, without executable content."""

    name: str
    licence: str
    source_url: str


def validate_metadata(fields: Mapping[str, object]) -> SubmissionMetadata:
    """Require the same attribution fields for command flags and TOML metadata."""
    required = {"name", "licence", "source_url"}
    if set(fields) != required:
        raise SubmissionError(1, "meta", "supply exactly name, licence and source_url")
    values: dict[str, str] = {}
    for field, value in fields.items():
        if (
            not isinstance(value, str)
            or not value.strip()
            or any(ord(c) < ASCII_SPACE for c in value)
        ):
            raise SubmissionError(1, field, "must be a nonempty, single-line string")
        values[field] = value
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.+-]*", values["licence"]) is None:
        raise SubmissionError(1, "licence", "supply a single SPDX licence identifier")
    try:
        url = urlsplit(values["source_url"])
    except ValueError as error:
        raise SubmissionError(1, "source_url", "supply an absolute HTTP or HTTPS URL") from error
    if url.scheme not in {"http", "https"} or not url.hostname:
        raise SubmissionError(1, "source_url", "supply an absolute HTTP or HTTPS URL")
    return SubmissionMetadata(**values)


def _probability(value: str, number: int, label: str) -> float:
    try:
        probability = float(value)
    except ValueError as error:
        raise SubmissionError(number, label, "expected a finite probability") from error
    if not math.isfinite(probability) or not 0 <= probability <= 1:
        raise SubmissionError(number, label, "expected a finite probability in [0, 1]")
    return probability


def _validate_key(
    key: str, number: int, catalogue_keys: Collection[str], seen: Collection[str]
) -> None:
    if INCHIKEY.fullmatch(key) is None:
        raise SubmissionError(number, "inchikey", "malformed InChIKey")
    if key not in catalogue_keys:
        raise SubmissionError(number, "inchikey", "unknown catalogue InChIKey")
    if key in seen:
        raise SubmissionError(number, "inchikey", "duplicate InChIKey")


def validate_predictions(
    content: bytes,
    labels: Sequence[str],
    catalogue_keys: Collection[str],
    required_keys: Collection[str],
) -> dict[str, tuple[float, ...]]:
    """Validate bounded CSV bytes and coverage before returning any predictions."""
    if len(content) > MAX_PREDICTIONS_BYTES:
        raise SubmissionError(1, "file", "exceeds the 20 MB limit")
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as error:
        raise SubmissionError(1, "file", "must be UTF-8 CSV") from error
    reader = csv.reader(io.StringIO(text, newline=""), strict=True)
    number = 1
    predictions: dict[str, tuple[float, ...]] = {}
    try:
        if next(reader, None) != ["inchikey", *labels]:
            raise SubmissionError(1, "header", "expected inchikey then labels in labels.json order")
        for number, row in enumerate(reader, start=2):
            if len(row) != len(labels) + 1:
                raise SubmissionError(number, "header", "row width differs from the header")
            key = row[0]
            _validate_key(key, number, catalogue_keys, predictions)
            predictions[key] = tuple(
                _probability(value, number, label)
                for label, value in zip(labels, row[1:], strict=True)
            )
    except csv.Error as error:
        raise SubmissionError(
            reader.line_num or number, "file", f"malformed CSV: {error}"
        ) from error
    missing = set(required_keys) - predictions.keys()
    if missing:
        raise SubmissionError(
            number + 1, "inchikey", f"missing {len(missing)} held-out keys; first: {min(missing)}"
        )
    return predictions
