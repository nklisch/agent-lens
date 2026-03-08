"""Usage aggregation and validation for the billing pipeline.

Collects raw usage records from service telemetry and prepares
them for the pricing engine. Records are filtered, validated,
and aggregated by feature before billing calculations begin.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Optional

from models import UsageRecord


def aggregate_usage(
    records: list[UsageRecord], account_id: str
) -> dict[str, float]:
    """Aggregate usage records by feature for a specific account.

    Filters records to the target account and sums quantities per
    feature key. Records with different region tags are combined.

    Args:
        records: All usage records for the billing period.
        account_id: The account to aggregate for.

    Returns:
        Dictionary mapping feature names to total usage quantities.
    """
    usage: dict[str, float] = {}
    for record in records:
        if record.account_id != account_id:
            continue
        feature = record.feature
        usage[feature] = usage.get(feature, 0) + record.quantity
    return usage


def get_feature_usage(usage_data: dict[str, float], feature: str) -> float:
    """Get total usage for a billing feature.

    Looks up the feature key in the aggregated usage data and returns
    the total quantity. Returns 0 if the feature has no recorded usage.

    Args:
        usage_data: Aggregated usage from aggregate_usage().
        feature: The billing feature to look up (e.g., "api_calls").

    Returns:
        Total usage quantity for the feature, or 0 if not found.
    """
    return usage_data.get(feature, 0)


def filter_billable_records(
    records: list[UsageRecord],
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> list[UsageRecord]:
    """Filter out non-billable usage records.

    Removes records with zero or negative quantities and optionally
    restricts to a date range. This is applied before aggregation
    to ensure only valid usage enters the billing pipeline.

    Args:
        records: Raw usage records to filter.
        start: Optional period start (inclusive).
        end: Optional period end (inclusive).

    Returns:
        Filtered list of billable usage records.
    """
    filtered = []
    for record in records:
        if record.quantity <= 0:
            continue
        if start and record.timestamp < start:
            continue
        if end and record.timestamp > end:
            continue
        filtered.append(record)
    return filtered


def usage_by_region(
    records: list[UsageRecord], account_id: str
) -> dict[str, dict[str, float]]:
    """Group usage by region for analytics and reporting.

    Provides a regional breakdown of usage for capacity planning
    and cost attribution. Not used in invoice generation directly,
    but available for detailed usage reports.

    Args:
        records: All usage records for the billing period.
        account_id: The account to analyze.

    Returns:
        Nested dict mapping region -> feature -> total quantity.
    """
    by_region: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for record in records:
        if record.account_id != account_id:
            continue
        by_region[record.region][record.feature] += record.quantity
    return dict(by_region)


def validate_records(records: list[UsageRecord]) -> list[str]:
    """Validate a batch of usage records for data quality issues.

    Checks for common problems like negative quantities, empty feature
    names, and missing account IDs. Returns a list of warning messages.

    Args:
        records: Usage records to validate.

    Returns:
        List of warning strings (empty if all records are valid).
    """
    warnings = []
    for i, record in enumerate(records):
        if record.quantity < 0:
            warnings.append(
                f"Record {i}: negative quantity {record.quantity} "
                f"for {record.feature}"
            )
        if not record.feature:
            warnings.append(f"Record {i}: empty feature name")
        if not record.account_id:
            warnings.append(f"Record {i}: missing account_id")
        if not record.timestamp:
            warnings.append(f"Record {i}: missing timestamp")
    return warnings
