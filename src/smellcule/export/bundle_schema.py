import json
import math
import re
from datetime import date
from pathlib import Path
from typing import TypeGuard

from smellcule.export.content import mapping, sequence, text


def _is_object(value: object) -> TypeGuard[dict[str, object]]:
    return isinstance(value, dict)


def _is_array(value: object) -> TypeGuard[list[object]]:
    return isinstance(value, list)


def validate_schema(value: object, schema: dict[str, object], root: dict[str, object]) -> None:
    """Validate the JSON Schema vocabulary used by the bundle without extra dependencies."""
    if "$ref" in schema:
        target = root
        for key in text(schema["$ref"]).removeprefix("#/").split("/"):
            target = mapping(target[key])
        validate_schema(value, target, root)
        return
    if "anyOf" in schema and not any(
        _matches(value, mapping(choice), root) for choice in sequence(schema["anyOf"])
    ):
        message = "Value matches none of the permitted schemas."
        raise ValueError(message)
    _scalar(value, schema)
    if _is_object(value):
        _object(value, schema, root)
    elif _is_array(value):
        _array(sequence(value), schema, root)
    for clause in sequence(schema.get("allOf", [])):
        validate_schema(value, mapping(clause), root)
    if "if" in schema:
        branch = "then" if _matches(value, mapping(schema["if"]), root) else "else"
        if branch in schema:
            validate_schema(value, mapping(schema[branch]), root)


def _matches(value: object, schema: dict[str, object], root: dict[str, object]) -> bool:
    try:
        validate_schema(value, schema, root)
    except (ValueError, TypeError):
        return False
    return True


def _scalar(value: object, schema: dict[str, object]) -> None:
    kind = schema.get("type")
    valid = {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "null": value is None,
    }
    if kind is not None and not valid[text(kind)]:
        message = f"Expected schema type {kind}."
        raise ValueError(message)
    if "const" in schema and value != schema["const"]:
        message = f"Expected {schema['const']!r}."
        raise ValueError(message)
    if "enum" in schema and value not in sequence(schema["enum"]):
        message = f"Value {value!r} is outside the permitted enum."
        raise ValueError(message)
    if isinstance(value, str):
        _bounds(len(value), schema, "minLength", "maxLength")
        if "pattern" in schema and re.search(text(schema["pattern"]), value) is None:
            message = "String does not match schema pattern."
            raise ValueError(message)
        if schema.get("format") == "date" and date.fromisoformat(value).isoformat() != value:
            message = "Date must use YYYY-MM-DD."
            raise ValueError(message)
    elif isinstance(value, (int, float)):
        if not math.isfinite(value):
            message = "Numbers must be finite."
            raise ValueError(message)
        _bounds(value, schema, "minimum", "maximum")


def _array(items: list[object], schema: dict[str, object], root: dict[str, object]) -> None:
    _bounds(len(items), schema, "minItems", "maxItems")
    if schema.get("uniqueItems") and len({json.dumps(v, sort_keys=True) for v in items}) != len(
        items
    ):
        message = "Array items must be unique."
        raise ValueError(message)
    for item in items:
        if "items" in schema:
            validate_schema(item, mapping(schema["items"]), root)


def _bounds(value: float, schema: dict[str, object], lower: str, upper: str) -> None:
    for key in (lower, upper):
        limit = schema.get(key)
        if isinstance(limit, (int, float)) and (value < limit if key == lower else value > limit):
            message = f"Value {value} violates {key} {limit}."
            raise ValueError(message)


def _object(value: object, schema: dict[str, object], root: dict[str, object]) -> None:
    obj = mapping(value) if value else {}
    required = sequence(schema.get("required", []))
    if any(key not in obj for key in required):
        message = f"Missing required schema fields: {required}."
        raise ValueError(message)
    properties = mapping(schema["properties"]) if schema.get("properties") else {}
    for key, item in obj.items():
        if key in properties:
            validate_schema(item, mapping(properties[key]), root)
        elif schema.get("additionalProperties") is False:
            message = f"Unexpected schema field {key}."
            raise ValueError(message)
        elif isinstance(schema.get("additionalProperties"), dict):
            validate_schema(item, mapping(schema["additionalProperties"]), root)


def validate_document(document: object, path: Path, definition: str = "atlas") -> None:
    """Apply the committed schema, including date formats and catalogue conditions."""
    root = mapping(json.loads(path.read_text(encoding="utf-8")))
    validate_schema(document, mapping(mapping(root["$defs"])[definition]), root)
