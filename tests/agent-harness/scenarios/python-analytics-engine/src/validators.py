"""Event schema validation for the analytics engine.

Validates that events conform to the expected schema before processing.
Validation is performed at the extraction boundary (after parsing,
before transformation) to catch data quality issues early.
"""

from typing import Any

from models import Event


# ---------------------------------------------------------------------------
# Schema definition
# ---------------------------------------------------------------------------

REQUIRED_DIMENSIONS = {"region"}
REQUIRED_METRICS = {"revenue", "units"}
VALID_EVENT_TYPES = {"purchase", "subscription", "refund", "trial", "upgrade"}
VALID_REGIONS = {"east", "west", "north", "south", "central"}


def validate_event(event: Event) -> list[str]:
    """Validate a single event against the analytics schema.

    Checks:
      - event_id is present and non-empty
      - event_type is a known type
      - required dimensions are present
      - required metrics are present and numeric
      - revenue is non-negative

    Args:
        event: The event to validate.

    Returns:
        List of validation error messages. Empty = valid.
    """
    errors: list[str] = []

    if not event.event_id:
        errors.append("event_id is required")

    if event.event_type not in VALID_EVENT_TYPES:
        errors.append(
            f"event_type {event.event_type!r} is not in "
            f"{sorted(VALID_EVENT_TYPES)}"
        )

    for dim in REQUIRED_DIMENSIONS:
        if dim not in event.dimensions:
            errors.append(f"Required dimension {dim!r} is missing")
        elif event.dimensions[dim] not in VALID_REGIONS:
            region = event.dimensions[dim]
            errors.append(
                f"Dimension 'region' value {region!r} not in "
                f"{sorted(VALID_REGIONS)}"
            )

    for metric_name in REQUIRED_METRICS:
        if metric_name not in event.metrics:
            errors.append(f"Required metric {metric_name!r} is missing")
        else:
            val = event.metrics[metric_name]
            if not isinstance(val, (int, float)):
                errors.append(
                    f"Metric {metric_name!r} must be numeric, got {type(val).__name__}"
                )

    revenue = event.metrics.get("revenue")
    if revenue is not None and revenue < 0:
        errors.append(f"revenue must be non-negative, got {revenue}")

    return errors


def validate_batch(events: list[Event]) -> dict[str, list[str]]:
    """Validate a batch of events.

    Args:
        events: List of events to validate.

    Returns:
        Dict mapping event_id to list of errors. Events with no errors
        are omitted from the result.
    """
    return {
        e.event_id: errs
        for e in events
        if (errs := validate_event(e))
    }


def filter_valid_events(events: list[Event]) -> tuple[list[Event], dict[str, list[str]]]:
    """Split events into valid and invalid sets.

    Args:
        events: Events to validate and split.

    Returns:
        A tuple of (valid_events, invalid_event_errors).
    """
    valid = []
    errors = {}
    for event in events:
        errs = validate_event(event)
        if errs:
            errors[event.event_id] = errs
        else:
            valid.append(event)
    return valid, errors


def is_valid(event: Event) -> bool:
    """Quick check — return True if the event passes all validation rules."""
    return len(validate_event(event)) == 0
