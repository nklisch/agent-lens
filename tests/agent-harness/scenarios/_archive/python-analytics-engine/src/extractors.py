"""Event extraction and parsing from multiple source formats.

Supports three input formats:
  - dict: Raw Python dict (from in-memory sources or unit tests)
  - json_str: JSON-encoded string (from message queues, HTTP)
  - csv_row: Comma-separated string (from file ingestion)

All extractors return Event objects ready for transformation.
"""

import csv
import io
import json
import uuid
from datetime import datetime
from typing import Any

from models import Event


def extract_from_dict(raw: dict[str, Any]) -> Event:
    """Create an Event from a raw dictionary.

    Expected keys:
      - event_id (str, optional — generated if missing)
      - timestamp (str ISO8601 or datetime)
      - event_type (str)
      - dimensions (dict, optional)
      - metrics (dict of str→float, optional)

    Args:
        raw: Input dictionary.

    Returns:
        A populated Event object.
    """
    event_id = raw.get("event_id") or str(uuid.uuid4())

    ts = raw.get("timestamp")
    if isinstance(ts, str):
        ts = datetime.fromisoformat(ts)
    elif ts is None:
        ts = datetime.now()

    return Event(
        event_id=event_id,
        timestamp=ts,
        event_type=raw.get("event_type", "unknown"),
        dimensions=dict(raw.get("dimensions", {})),
        metrics={k: float(v) for k, v in raw.get("metrics", {}).items()},
    )


def extract_from_json(json_str: str) -> Event:
    """Parse an Event from a JSON string.

    See extract_from_dict for the expected JSON schema.

    Args:
        json_str: JSON-encoded event.

    Returns:
        A populated Event object.

    Raises:
        json.JSONDecodeError: If the string is not valid JSON.
        ValueError: If required fields are missing.
    """
    raw = json.loads(json_str)
    return extract_from_dict(raw)


def extract_from_csv_row(row: str, field_order: list[str] | None = None) -> Event:
    """Parse an Event from a CSV row string.

    Default field order: event_id, timestamp, event_type, region, priority, revenue, units

    Args:
        row: A CSV-formatted string (single row).
        field_order: Override the default column order.

    Returns:
        A populated Event object.
    """
    if field_order is None:
        field_order = ["event_id", "timestamp", "event_type", "region", "priority", "revenue", "units"]

    reader = csv.reader(io.StringIO(row))
    values = next(reader)

    raw: dict[str, Any] = {}
    dimensions: dict[str, Any] = {}
    metrics: dict[str, float] = {}

    for i, field_name in enumerate(field_order):
        if i >= len(values):
            break
        val = values[i].strip()
        if field_name in ("event_id", "timestamp", "event_type"):
            raw[field_name] = val
        elif field_name in ("revenue", "units"):
            try:
                metrics[field_name] = float(val)
            except ValueError:
                pass
        else:
            # Everything else is a dimension
            try:
                dimensions[field_name] = int(val)
            except ValueError:
                dimensions[field_name] = val

    raw["dimensions"] = dimensions
    raw["metrics"] = metrics
    return extract_from_dict(raw)


def extract_batch(raw_events: list[dict[str, Any]]) -> list[Event]:
    """Extract a batch of events from a list of raw dicts.

    Args:
        raw_events: List of raw event dicts.

    Returns:
        List of Event objects.
    """
    return [extract_from_dict(r) for r in raw_events]


def validate_extraction(event: Event) -> list[str]:
    """Check an extracted event for obvious data quality issues.

    Returns a list of warning strings. An empty list means no issues.
    """
    warnings = []
    if not event.event_id:
        warnings.append("Missing event_id")
    if event.event_type == "unknown":
        warnings.append("event_type is 'unknown'")
    if not event.dimensions:
        warnings.append("No dimensions present")
    if not event.metrics:
        warnings.append("No metrics present")
    return warnings
