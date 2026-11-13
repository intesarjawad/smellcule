import csv
import io

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from smellcule.submissions import (
    MAX_PREDICTIONS_BYTES,
    SubmissionError,
    validate_metadata,
    validate_predictions,
)

LABELS = ("floral", "woody")
KEYS = ("AAAAAAAAAAAAAA-BBBBBBBBBB-C", "DDDDDDDDDDDDDD-EEEEEEEEEE-F")
UNKNOWN = "GGGGGGGGGGGGGG-HHHHHHHHHH-I"
PROBABILITY = st.floats(min_value=0, max_value=1, allow_nan=False, allow_infinity=False)


def encode(rows: list[list[str]]) -> bytes:
    destination = io.StringIO(newline="")
    csv.writer(destination).writerows(rows)
    return destination.getvalue().encode()


@settings(deadline=None)
@given(
    values=st.lists(st.tuples(PROBABILITY, PROBABILITY), min_size=2, max_size=2),
    reverse=st.booleans(),
)
def test_accepts_probabilities_in_any_row_order_and_ignores_extra_coverage(
    *, values: list[tuple[float, float]], reverse: bool
) -> None:
    rows = [[key, *(str(v) for v in scores)] for key, scores in zip(KEYS, values, strict=True)]
    content = encode([["inchikey", *LABELS], *(rows[::-1] if reverse else rows)])
    assert validate_predictions(content, LABELS, set(KEYS), {KEYS[0]}) == dict(
        zip(KEYS, values, strict=True)
    )


@settings(deadline=None)
@given(st.lists(st.text(max_size=20), max_size=5).filter(lambda v: v != ["inchikey", *LABELS]))
def test_rejects_inexact_header(header: list[str]) -> None:
    with pytest.raises(SubmissionError, match="row 1, column header"):
        validate_predictions(encode([header]), LABELS, set(KEYS), set())


@settings(deadline=None)
@given(st.text(max_size=40).filter(lambda v: v != KEYS[0]))
def test_rejects_malformed_or_unknown_key(key: str) -> None:
    with pytest.raises(SubmissionError, match="row 2, column inchikey"):
        validate_predictions(
            encode([["inchikey", *LABELS], [key, "0", "1"]]), LABELS, {KEYS[0]}, set()
        )


@settings(deadline=None)
@given(st.sampled_from(KEYS), PROBABILITY)
def test_rejects_duplicate_key(key: str, probability: float) -> None:
    row = [key, str(probability), "0"]
    with pytest.raises(SubmissionError, match="row 3, column inchikey: duplicate"):
        validate_predictions(encode([["inchikey", *LABELS], row, row]), LABELS, set(KEYS), set())


@settings(deadline=None)
@given(
    st.one_of(
        st.sampled_from(["NaN", "nan", "inf", "-inf", "", "no probability"]),
        st.floats(max_value=-1e-12).map(str),
        st.floats(min_value=1.0000000001).map(str),
    ),
    st.integers(min_value=0, max_value=1),
)
def test_rejects_nonfinite_unparseable_and_out_of_range(value: str, column: int) -> None:
    row = [KEYS[0], "0", "1"]
    row[column + 1] = value
    with pytest.raises(SubmissionError, match=f"row 2, column {LABELS[column]}"):
        validate_predictions(encode([["inchikey", *LABELS], row]), LABELS, set(KEYS), set())


@settings(deadline=None)
@given(st.sampled_from(KEYS))
def test_rejects_missing_held_out_coverage(key: str) -> None:
    with pytest.raises(SubmissionError, match="column inchikey: missing 1 held-out"):
        validate_predictions(encode([["inchikey", *LABELS]]), LABELS, set(KEYS), {key})


@settings(max_examples=3, deadline=None)
@given(st.integers(min_value=1, max_value=100))
def test_rejects_oversize_before_parsing(extra: int) -> None:
    with pytest.raises(SubmissionError, match="column file: exceeds the 20 MB limit"):
        validate_predictions(b"x" * (MAX_PREDICTIONS_BYTES + extra), LABELS, set(KEYS), set())


@settings(deadline=None)
@given(st.lists(st.text(max_size=5), max_size=5).filter(lambda v: len(v) != 3))
def test_rejects_bad_row_width(row: list[str]) -> None:
    with pytest.raises(SubmissionError, match="row 2, column header: row width"):
        validate_predictions(encode([["inchikey", *LABELS], row]), LABELS, set(KEYS), set())


@pytest.mark.parametrize(
    ("content", "reason"),
    [
        (b"\xff", "UTF-8"),
        (b'inchikey,floral,woody\n"unterminated', "malformed CSV"),
        (encode([["inchikey", *LABELS], [UNKNOWN, "0", "0"]]), "unknown catalogue"),
    ],
)
def test_rejects_invalid_encoding_csv_and_unknown_valid_key(content: bytes, reason: str) -> None:
    with pytest.raises(SubmissionError, match=reason):
        validate_predictions(content, LABELS, set(KEYS), set())


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("name", ""),
        ("name", "new\nline"),
        ("licence", "MIT OR BSD"),
        ("source_url", "file:///tmp/model"),
        ("source_url", "https://[invalid"),
        ("source_url", 1),
    ],
)
def test_metadata_requires_nonempty_attribution_and_web_source(field: str, value: object) -> None:
    fields: dict[str, object] = {
        "name": "forest",
        "licence": "MIT",
        "source_url": "https://example.org/model",
    }
    fields[field] = value
    with pytest.raises(SubmissionError, match=f"column {field}"):
        validate_metadata(fields)


def test_metadata_requires_exact_fields() -> None:
    with pytest.raises(SubmissionError, match="supply exactly"):
        validate_metadata({"name": "forest"})
