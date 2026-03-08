"""Data models for the analytics engine.

Defines the core domain objects that flow through the pipeline:
events, metric definitions, queries, and results.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass
class Event:
    """A single analytics event representing a business transaction."""
    event_id: str
    timestamp: datetime
    event_type: str
    dimensions: dict[str, Any] = field(default_factory=dict)
    metrics: dict[str, float] = field(default_factory=dict)

    # Derived fields populated by transformers
    revenue: Optional[float] = None
    units: Optional[int] = None
    revenue_per_unit: Optional[float] = None

    def __repr__(self) -> str:
        return f"Event({self.event_id!r}, {self.event_type!r}, rev={self.revenue})"

    def get_dimension(self, name: str, default: Any = None) -> Any:
        """Retrieve a dimension value by name."""
        return self.dimensions.get(name, default)

    def get_metric(self, name: str, default: float = 0.0) -> float:
        """Retrieve a raw metric value by name."""
        return self.metrics.get(name, default)


@dataclass
class MetricDefinition:
    """Defines how a metric should be computed."""
    name: str
    aggregation: str        # "sum", "mean", "weighted_average", "count", "percentile_95"
    field: str              # field name on Event, or "*" for count
    description: str = ""
    unit: str = "USD"

    def __repr__(self) -> str:
        return f"MetricDefinition({self.name!r}, {self.aggregation!r}, field={self.field!r})"


@dataclass
class Query:
    """A request to compute a specific metric over a filtered event set."""
    metric_name: str
    filters: dict[str, Any] = field(default_factory=dict)     # dimension predicates
    time_range: Optional[tuple[datetime, datetime]] = None
    group_by: Optional[str] = None

    def __repr__(self) -> str:
        return f"Query({self.metric_name!r}, filters={self.filters})"


@dataclass
class MetricResult:
    """The result of computing a metric over a set of events."""
    metric_name: str
    value: float
    currency: str
    event_count: int
    definition: MetricDefinition
    query: Query
    computed_at: datetime = field(default_factory=datetime.now)

    def __repr__(self) -> str:
        return f"MetricResult({self.metric_name!r}, {self.value:.4f} {self.currency})"

    def format(self) -> str:
        """Return a human-readable metric result line."""
        return f"{self.metric_name}: {self.value:.2f} {self.currency} (n={self.event_count})"


@dataclass
class PipelineConfig:
    """Configuration for a single pipeline run."""
    metric_definitions: list[MetricDefinition]
    default_currency: str
    conversion_rate: float
    filters: dict[str, Any] = field(default_factory=dict)
