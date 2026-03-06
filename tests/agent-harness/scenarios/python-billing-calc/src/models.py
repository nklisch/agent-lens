"""Domain models for SaaS billing system.

Defines the core data structures used across the billing pipeline:
usage tracking, pricing tiers, invoice generation, and account management.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class UsageRecord:
    """A single usage event recorded for an account.

    Usage records are collected from service telemetry and aggregated
    per billing period. The feature field uses dot-notation for
    sub-feature granularity (e.g., "api_calls.read", "api_calls.write").
    """

    account_id: str
    feature: str
    quantity: float
    timestamp: datetime
    region: str = "us-east-1"


@dataclass
class PricingTier:
    """A single tier in a volume-based pricing schedule.

    Tiers are defined in ascending order by max_units. The price_per_unit
    applies to all units when the total falls within this tier bracket.
    """

    max_units: float
    price_per_unit: float


@dataclass
class LineItem:
    """A single charge on an invoice.

    Represents the computed charge for one billing feature after
    free tier deductions and tier-based pricing are applied.
    """

    feature: str
    quantity: float
    unit_price: float
    amount: float
    tier_label: str = ""


@dataclass
class Invoice:
    """A complete billing invoice for one account and period.

    Line items are computed per feature, then totals are derived
    including applicable tax.
    """

    invoice_id: str
    account_id: str
    period_start: datetime
    period_end: datetime
    line_items: list[LineItem] = field(default_factory=list)
    subtotal: float = 0.0
    tax_rate: float = 0.0
    tax_amount: float = 0.0
    total: float = 0.0
    currency: str = "USD"

    def compute_totals(self) -> None:
        """Recompute subtotal, tax, and total from line items."""
        self.subtotal = round(sum(item.amount for item in self.line_items), 2)
        self.tax_amount = round(self.subtotal * self.tax_rate, 2)
        self.total = round(self.subtotal + self.tax_amount, 2)


@dataclass
class Account:
    """A customer account with billing information.

    The plan field determines free tier allowances and minimum charges.
    Supported plans: starter, professional, enterprise.
    """

    account_id: str
    name: str
    plan: str
    created_at: datetime
    billing_email: str
    metadata: dict[str, Any] = field(default_factory=dict)

    def is_active(self) -> bool:
        """Check if the account is currently active for billing."""
        return self.plan in ("starter", "professional", "enterprise")


@dataclass
class BillingConfig:
    """Configuration for the billing engine.

    Controls which features are billed, tax rates, and output currency.
    The billing_features list determines which features appear on invoices.
    """

    tax_rate: float = 0.0
    currency: str = "USD"
    billing_features: list[str] = field(default_factory=lambda: [
        "storage", "api_calls", "bandwidth", "compute_hours"
    ])
    rounding_precision: int = 2
    include_zero_items: bool = False
