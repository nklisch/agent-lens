"""Aggregation functions for the analytics engine.

All aggregators accept a list of values and a parallel list of weights.
For unweighted aggregations (sum, count, mean), the weights are ignored.
None values in the values list are always excluded from calculations.

Note: # FIXME: percentile calculation may be off for small datasets
(This comment refers to statistical accuracy of the P95 estimation
with n<20 samples, which is a known limitation but not a bug in
production-scale usage.)
"""

from typing import Optional


def agg_sum(values: list[Optional[float]], weights: list[float]) -> float:
    """Compute the sum of all non-None values.

    Args:
        values: List of numeric values (None entries are skipped).
        weights: Ignored — present for interface uniformity.

    Returns:
        Sum of all non-None values. Returns 0.0 for empty input.
    """
    return sum(v for v in values if v is not None)


def agg_count(values: list[Optional[float]], weights: list[float]) -> float:
    """Count the number of non-None values.

    Args:
        values: List of values to count.
        weights: Ignored.

    Returns:
        Count as a float. Returns 0.0 for empty input.
    """
    return float(sum(1 for v in values if v is not None))


def agg_mean(values: list[Optional[float]], weights: list[float]) -> float:
    """Compute the arithmetic mean of all non-None values.

    Args:
        values: List of numeric values.
        weights: Ignored — for equal-weight mean use this; for weighted use agg_weighted_average.

    Returns:
        Arithmetic mean, or 0.0 if no non-None values exist.
    """
    valid = [v for v in values if v is not None]
    if not valid:
        return 0.0
    return sum(valid) / len(valid)


def agg_weighted_average(values: list[Optional[float]], weights: list[float]) -> float:
    """Compute the weighted average. None values are excluded.

    Pairs with value=None are excluded from both numerator and denominator.
    This is intentional — a None value signals that no meaningful data
    was available for that event (e.g. zero-unit events have no revenue_per_unit).

    Args:
        values: List of values to average (None = exclude this event).
        weights: Parallel list of weight values for each event.

    Returns:
        Weighted average, or 0.0 if no valid pairs exist.
    """
    pairs = [(v, w) for v, w in zip(values, weights) if v is not None]
    if not pairs:
        return 0.0
    total = sum(v * w for v, w in pairs)
    weight_sum = sum(w for _, w in pairs)
    return total / weight_sum if weight_sum > 0 else 0.0


def agg_p95(values: list[Optional[float]], weights: list[float]) -> float:
    """Compute the 95th percentile of non-None values using linear interpolation.

    Args:
        values: List of numeric values.
        weights: Ignored.

    Returns:
        The 95th percentile value, or 0.0 if no data.
    """
    valid = sorted(v for v in values if v is not None)
    if not valid:
        return 0.0
    if len(valid) == 1:
        return valid[0]

    idx = (len(valid) - 1) * 0.95
    lower = int(idx)
    upper = lower + 1
    frac = idx - lower

    if upper >= len(valid):
        return valid[-1]

    return valid[lower] + frac * (valid[upper] - valid[lower])


class MedianAbsoluteDeviation:
    """Computes the Median Absolute Deviation (MAD) for outlier detection.

    This aggregator is defined for potential future use in anomaly
    detection workflows. It is not currently wired into any metric
    definition.
    """

    def __call__(self, values: list[Optional[float]], weights: list[float]) -> float:
        """Return the MAD of the non-None values."""
        valid = sorted(v for v in values if v is not None)
        if not valid:
            return 0.0
        mid = len(valid) // 2
        median = valid[mid] if len(valid) % 2 else (valid[mid - 1] + valid[mid]) / 2
        deviations = sorted(abs(v - median) for v in valid)
        mad_mid = len(deviations) // 2
        if len(deviations) % 2:
            return deviations[mad_mid]
        return (deviations[mad_mid - 1] + deviations[mad_mid]) / 2
