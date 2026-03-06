"""Analytics engine — orchestrates the full pipeline.

The pipeline for each metric computation:
  1. Extract events from source
  2. Validate events
  3. Transform/enrich events
  4. Apply query filters
  5. Aggregate using the metric's aggregation function
  6. Format and return results

The engine is the main entry point for the analytics system.
"""

from datetime import datetime
from typing import Optional, Any

from copy import deepcopy
from models import Event, MetricDefinition, MetricResult, Query
from config import (
    get_default_currency,
    get_metric_definition_objects,
    load_metric_definitions,
    get_conversion_rate,
)
from registry import get_aggregation_fn
from transformers import extract_fields_from_metrics, normalize_revenue, enrich_revenue_per_unit
from filters import apply_query_filters
from cache import TTLCache


class AnalyticsEngine:
    """The main analytics computation engine.

    Processes event streams against metric definitions and returns
    computed MetricResult objects.

    Usage:
        load_config()
        engine = AnalyticsEngine()
        result = engine.compute_metric(query, events)
    """

    def __init__(self, cache_ttl: float = 300.0):
        """Initialize the engine with an optional result cache.

        Args:
            cache_ttl: Time-to-live for cached results in seconds.
        """
        self._cache = TTLCache(default_ttl=cache_ttl)

    def _get_metric_definition(self, metric_name: str) -> Optional[MetricDefinition]:
        """Look up a metric definition by name."""
        for defn in get_metric_definition_objects():
            if defn.name == metric_name:
                return defn
        return None

    def _prepare_events(self, events: list[Event]) -> list[Event]:
        """Apply the standard transformation pipeline to a list of events.

        Each event is deep-copied before transformation to avoid mutating
        shared event objects across multiple pipeline invocations.

        Transformers are applied in order:
          1. Extract revenue/units from metrics dict to typed fields
          2. Normalize revenue to target currency
          3. Compute revenue_per_unit derived field
        """
        prepared = []
        for event in events:
            e = deepcopy(event)
            e = extract_fields_from_metrics(e)
            e = normalize_revenue(e)
            e = enrich_revenue_per_unit(e)
            prepared.append(e)
        return prepared

    def _extract_field_values(
        self,
        events: list[Event],
        field_name: str,
    ) -> tuple[list[Optional[float]], list[float]]:
        """Extract field values and weights from prepared events.

        For weighted_average, the weight is the units count.
        For all other aggregations, weights are 1.0.

        Args:
            events: Prepared events.
            field_name: The Event attribute or '*' for count.

        Returns:
            Tuple of (values, weights).
        """
        if field_name == "*":
            return [1.0] * len(events), [1.0] * len(events)

        values = []
        weights = []
        for event in events:
            val = getattr(event, field_name, None)
            values.append(val)
            # Use equal weighting — zero-unit events contribute unless
            # their field value is None (explicitly excluded).
            weights.append(1.0)

        return values, weights

    def compute_metric(self, query: Query, events: list[Event]) -> MetricResult:
        """Compute a single metric over a set of events.

        Args:
            query: The metric query specifying name, filters, and time range.
            events: The raw event list to process.

        Returns:
            A MetricResult with the computed value.

        Raises:
            ValueError: If the metric name is not defined in the config.
        """
        definition = self._get_metric_definition(query.metric_name)
        if definition is None:
            raise ValueError(
                f"Unknown metric: {query.metric_name!r}. "
                f"Available: {[d.name for d in get_metric_definition_objects()]}"
            )

        # Prepare events (transform + enrich)
        prepared = self._prepare_events(events)

        # Apply query filters
        filtered = apply_query_filters(
            prepared,
            dimension_predicates=query.filters,
            time_range=query.time_range,
        )

        # Extract field values for aggregation
        values, weights = self._extract_field_values(filtered, definition.field)

        # Get aggregation function and compute
        agg_fn = get_aggregation_fn(definition.aggregation)
        raw_value = agg_fn(values, weights)

        return MetricResult(
            metric_name=query.metric_name,
            value=round(raw_value, 4),
            currency=get_default_currency(),
            event_count=len(filtered),
            definition=definition,
            query=query,
            computed_at=datetime.now(),
        )

    def compute_all_metrics(
        self,
        events: list[Event],
        filters: dict[str, Any] | None = None,
    ) -> list[MetricResult]:
        """Compute all configured metrics over the event set.

        Args:
            events: Raw event list.
            filters: Optional dimension predicates applied to all metrics.

        Returns:
            List of MetricResult objects (one per configured metric).
        """
        results = []
        for defn in get_metric_definition_objects():
            query = Query(
                metric_name=defn.name,
                filters=filters or {},
            )
            result = self.compute_metric(query, events)
            results.append(result)
        return results

    def clear_cache(self) -> None:
        """Clear the computation result cache."""
        self._cache.clear()

    def cache_stats(self) -> dict:
        """Return cache hit/miss statistics."""
        return self._cache.stats()
