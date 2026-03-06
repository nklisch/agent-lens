"""Hidden oracle tests — copied into workspace after the agent finishes."""

import pytest
from config import load_config, get_conversion_rate, load_metric_definitions
from engine import AnalyticsEngine
from registry import get_aggregation_fn
from aggregators import agg_weighted_average, agg_sum
from data import SAMPLE_EVENTS, METRIC_QUERY, PRIORITY_QUERY


# ---------------------------------------------------------------------------
# Bug 1: Encoded config has aggregation function typo
# ---------------------------------------------------------------------------

def test_config_aggregation_name():
    """The decoded config must spell 'weighted_average' correctly."""
    load_config()
    metrics = load_metric_definitions()
    rpu_metric = next((m for m in metrics if m["name"] == "avg_revenue_per_unit"), None)
    assert rpu_metric is not None, "avg_revenue_per_unit must be in config"
    assert rpu_metric["aggregation"] == "weighted_average", (
        f"Expected aggregation 'weighted_average', got {rpu_metric['aggregation']!r} "
        f"(check the base64-encoded config for typos)"
    )


def test_registry_resolves_weighted_average():
    """The name 'weighted_average' must resolve to agg_weighted_average."""
    fn = get_aggregation_fn("weighted_average")
    assert fn is agg_weighted_average, (
        f"'weighted_average' should resolve to agg_weighted_average, got {fn}"
    )


# ---------------------------------------------------------------------------
# Bug 2: Default argument captures stale conversion rate
# ---------------------------------------------------------------------------

def test_conversion_rate_after_load():
    """After load_config(), conversion rate must be 0.85 (not 1.0)."""
    load_config()
    rate = get_conversion_rate()
    assert rate == pytest.approx(0.85), (
        f"Expected conversion rate 0.85 after load_config(), got {rate} "
        f"(check for stale default argument binding in normalize_revenue)"
    )


def test_conversion_rate_applied_to_events():
    """Revenue $20 normalized must be $17.00 (× 0.85 EUR rate)."""
    from transformers import normalize_revenue
    from models import Event
    from datetime import datetime
    load_config()
    event = Event(
        event_id="TEST-01",
        timestamp=datetime.now(),
        event_type="purchase",
        revenue=20.0,
    )
    normalized = normalize_revenue(event)
    assert normalized.revenue == pytest.approx(17.0, abs=0.01), (
        f"Revenue $20 x 0.85 = $17.00, got ${normalized.revenue} "
        f"(check normalize_revenue default rate argument)"
    )


# ---------------------------------------------------------------------------
# Bug 3: Dimension filter type mismatch
# ---------------------------------------------------------------------------

def test_dimension_filter_int_match():
    """priority=1 (int) must match filter priority='1' (str) after fix."""
    from filters import filter_by_dimensions
    east_events = [e for e in SAMPLE_EVENTS if e.dimensions.get("region") == "east"]
    matched = filter_by_dimensions(east_events, {"priority": "1"})
    assert len(matched) == 5, (
        f"Expected 5 east events with priority=1 to match str filter, "
        f"got {len(matched)} (check filter comparison)"
    )


def test_dimension_filter_priority_2():
    """priority=2 (int) must match filter priority='2' (str)."""
    from filters import filter_by_dimensions
    east_events = [e for e in SAMPLE_EVENTS if e.dimensions.get("region") == "east"]
    matched = filter_by_dimensions(east_events, {"priority": "2"})
    assert len(matched) == 3, (
        f"Expected 3 events with priority=2, got {len(matched)}"
    )


def test_priority_query_event_count():
    """The east+priority='1' query must find 5 events (not 0 from type mismatch)."""
    load_config()
    engine = AnalyticsEngine()
    result = engine.compute_metric(PRIORITY_QUERY, SAMPLE_EVENTS)
    assert result.event_count == 5, (
        f"Expected 5 east+priority=1 events, got {result.event_count} "
        f"(int priority=1 must match str '1')"
    )


# ---------------------------------------------------------------------------
# Bug 4: Zero-unit fallback pollutes the average
# ---------------------------------------------------------------------------

def test_zero_units_revenue_per_unit_is_none():
    """Event with units=0 must have revenue_per_unit=None, not 0."""
    from transformers import extract_fields_from_metrics, enrich_revenue_per_unit
    from models import Event
    from datetime import datetime
    event = Event(
        event_id="TEST-ZERO",
        timestamp=datetime.now(),
        event_type="trial",
        metrics={"revenue": 0.0, "units": 0},
    )
    event = extract_fields_from_metrics(event)
    event = enrich_revenue_per_unit(event)
    assert event.revenue_per_unit is None, (
        f"Zero-unit event should have revenue_per_unit=None, got {event.revenue_per_unit}"
    )


def test_zero_units_excluded_from_average():
    """agg_weighted_average must skip None entries, not 0 entries."""
    result_with_0 = agg_weighted_average([8.5, 8.5, 10.2, 10.2, 0.0], [1.0] * 5)
    result_with_none = agg_weighted_average([8.5, 8.5, 10.2, 10.2, None], [1.0] * 5)
    assert result_with_none > result_with_0
    assert result_with_none == pytest.approx(9.35, abs=0.01), (
        f"Expected 9.35 with None excluded, got {result_with_none}"
    )


# ---------------------------------------------------------------------------
# Integration
# ---------------------------------------------------------------------------

def test_metric_value_correct():
    """avg_revenue_per_unit for east+priority=1 must be $9.35 EUR."""
    load_config()
    engine = AnalyticsEngine()
    result = engine.compute_metric(METRIC_QUERY, SAMPLE_EVENTS)
    assert result.value == pytest.approx(9.35, abs=0.01), (
        f"Expected $9.35 EUR, got ${result.value:.4f} {result.currency}"
    )


def test_total_revenue_all_events():
    """total_revenue for all events must equal sum of EUR-converted revenues."""
    from models import Query
    load_config()
    engine = AnalyticsEngine()
    query = Query(metric_name="total_revenue", filters={})
    result = engine.compute_metric(query, SAMPLE_EVENTS)
    # Sum of all revenues × 0.85
    raw = [20, 30, 12, 24, 18, 40, 25, 0, 50, 35]
    expected = sum(r * 0.85 for r in raw)
    assert result.value == pytest.approx(expected, abs=0.01), (
        f"Expected total_revenue ${expected:.2f} EUR, got ${result.value:.2f}"
    )


def test_event_count_all():
    """event_count must equal 10 for the full event set."""
    from models import Query
    load_config()
    engine = AnalyticsEngine()
    query = Query(metric_name="event_count", filters={})
    result = engine.compute_metric(query, SAMPLE_EVENTS)
    assert result.event_count == 10
