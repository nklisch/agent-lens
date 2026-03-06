"""Utility functions for the analytics engine.

Date arithmetic, hashing, and serialization helpers used across
multiple modules.
"""

import hashlib
import json
from datetime import datetime, timedelta
from typing import Any


def parse_iso_datetime(s: str) -> datetime:
    """Parse an ISO 8601 datetime string into a datetime object.

    Handles the common formats:
      - "2025-01-15T10:30:00"
      - "2025-01-15T10:30:00.000000"
      - "2025-01-15 10:30:00"

    Args:
        s: ISO 8601 datetime string.

    Returns:
        Parsed datetime (naive, no timezone).

    Raises:
        ValueError: If the string cannot be parsed.
    """
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse datetime: {s!r}")


def truncate_to_hour(dt: datetime) -> datetime:
    """Return the datetime with minutes and seconds zeroed."""
    return dt.replace(minute=0, second=0, microsecond=0)


def truncate_to_day(dt: datetime) -> datetime:
    """Return the datetime with time components zeroed."""
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def date_range(start: datetime, end: datetime, step: timedelta) -> list[datetime]:
    """Generate a list of datetime checkpoints from start to end.

    Args:
        start: Start datetime (inclusive).
        end: End datetime (exclusive).
        step: Interval between checkpoints.

    Returns:
        List of datetimes.
    """
    checkpoints = []
    current = start
    while current < end:
        checkpoints.append(current)
        current += step
    return checkpoints


def stable_hash(data: Any) -> str:
    """Return a stable MD5 hex digest of a JSON-serializable object.

    Useful for generating cache keys from query parameters.

    Args:
        data: A JSON-serializable object.

    Returns:
        32-character hex string.
    """
    serialized = json.dumps(data, sort_keys=True, default=str)
    return hashlib.md5(serialized.encode()).hexdigest()


def flatten_dict(d: dict, prefix: str = "", sep: str = ".") -> dict:
    """Flatten a nested dictionary to a single level.

    Example:
        {"a": {"b": 1}} → {"a.b": 1}

    Args:
        d: The dictionary to flatten.
        prefix: Key prefix for nested entries.
        sep: Separator between key levels.

    Returns:
        Flattened dictionary.
    """
    result = {}
    for k, v in d.items():
        full_key = f"{prefix}{sep}{k}" if prefix else k
        if isinstance(v, dict):
            result.update(flatten_dict(v, full_key, sep))
        else:
            result[full_key] = v
    return result


def clamp(value: float, min_val: float, max_val: float) -> float:
    """Clamp a value between min and max."""
    return max(min_val, min(max_val, value))
