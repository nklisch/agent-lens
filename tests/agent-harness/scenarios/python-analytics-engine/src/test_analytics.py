"""Visible tests for the analytics engine.

These tests are run by the agent to see what's failing.
Run with: python3 -m pytest test_analytics.py -x -q
"""

import pytest
from config import load_config
from engine import AnalyticsEngine
from data import SAMPLE_EVENTS, METRIC_QUERY

# Correct avg_revenue_per_unit for east region, priority=1:
# 4 events (E001-E004, E008 excluded as zero-unit), EUR conversion applied
# $9.35 EUR (mean of [8.50, 8.50, 10.20, 10.20])
EXPECTED_VALUE = 9.35


def test_avg_revenue_per_unit():
    """avg_revenue_per_unit for east region priority=1 should be ~$9.35 EUR."""
    load_config()
    engine = AnalyticsEngine()
    result = engine.compute_metric(METRIC_QUERY, SAMPLE_EVENTS)
    assert result.value == pytest.approx(EXPECTED_VALUE, abs=0.01), (
        f"Expected avg_revenue_per_unit ~${EXPECTED_VALUE:.2f} EUR, "
        f"got ${result.value:.2f} {result.currency} (event_count={result.event_count})"
    )


def test_revenue_currency_is_eur():
    """The metric result should report EUR currency."""
    load_config()
    engine = AnalyticsEngine()
    result = engine.compute_metric(METRIC_QUERY, SAMPLE_EVENTS)
    assert result.currency == "EUR", (
        f"Expected currency EUR, got {result.currency!r}"
    )
