"""SaaS billing engine — invoice generation and processing.

Ties together usage aggregation and the pricing engine to produce
complete invoices for customer accounts. Handles free tier deductions,
tiered pricing, tax calculations, and minimum charge enforcement.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from models import Account, BillingConfig, Invoice, LineItem
from pricing import apply_minimum_charge, calculate_feature_charge, format_tier_label
from usage import aggregate_usage, get_feature_usage


def default_config() -> BillingConfig:
    """Return the default billing configuration.

    Uses standard settings for most accounts. Custom configs can be
    passed to generate_invoice() for special cases (e.g., tax-exempt
    accounts or region-specific billing).

    Returns:
        A BillingConfig with default values.
    """
    return BillingConfig(
        tax_rate=0.0,
        currency="USD",
        billing_features=["storage", "api_calls", "bandwidth", "compute_hours"],
        rounding_precision=2,
        include_zero_items=False,
    )


def generate_invoice(
    account: Account,
    usage_records: list,
    period_start: datetime,
    period_end: datetime,
    config: Optional[BillingConfig] = None,
) -> Invoice:
    """Generate an invoice for an account's usage in the given period.

    Aggregates raw usage records, applies free tier deductions, computes
    tiered pricing for each feature, and assembles a complete invoice
    with tax and minimum charge adjustments.

    Args:
        account: The customer account to bill.
        usage_records: Raw usage records for the billing period.
        period_start: Start of the billing period.
        period_end: End of the billing period.
        config: Optional billing configuration override.

    Returns:
        A fully computed Invoice with line items and totals.
    """
    config = config or default_config()

    # Aggregate raw usage records into per-feature totals
    usage = aggregate_usage(usage_records, account.account_id)

    # Calculate charges for each billable feature
    line_items: list[LineItem] = []
    for feature in config.billing_features:
        raw_units = get_feature_usage(usage, feature)
        billable, unit_price, charge = calculate_feature_charge(
            feature, raw_units, account.plan
        )

        if billable > 0 or config.include_zero_items:
            tier_label = format_tier_label(feature, billable) if billable > 0 else ""
            line_items.append(
                LineItem(
                    feature=feature,
                    quantity=billable,
                    unit_price=unit_price,
                    amount=charge,
                    tier_label=tier_label,
                )
            )

    # Assemble invoice
    invoice = Invoice(
        invoice_id=_build_invoice_id(account.account_id, period_start),
        account_id=account.account_id,
        period_start=period_start,
        period_end=period_end,
        line_items=line_items,
        tax_rate=config.tax_rate,
    )
    invoice.compute_totals()

    # Enforce plan minimum charge
    minimum = apply_minimum_charge(account.plan, invoice.subtotal)
    if minimum > invoice.subtotal:
        invoice.subtotal = minimum
        invoice.total = round(minimum + invoice.tax_amount, 2)

    return invoice


def _build_invoice_id(account_id: str, period_start: datetime) -> str:
    """Generate a deterministic invoice ID from account and period."""
    return f"INV-{account_id}-{period_start.strftime('%Y%m')}"


def summarize_invoice(invoice: Invoice) -> dict[str, Any]:
    """Create a summary dictionary from an invoice for reporting.

    Produces a simplified representation suitable for JSON serialization
    and external API responses.

    Args:
        invoice: The computed invoice to summarize.

    Returns:
        Dictionary with invoice summary fields.
    """
    return {
        "invoice_id": invoice.invoice_id,
        "account_id": invoice.account_id,
        "period": f"{invoice.period_start:%Y-%m-%d} to {invoice.period_end:%Y-%m-%d}",
        "line_items": [
            {
                "feature": item.feature,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "amount": item.amount,
            }
            for item in invoice.line_items
        ],
        "subtotal": invoice.subtotal,
        "tax": invoice.tax_amount,
        "total": invoice.total,
        "currency": invoice.currency,
    }


def validate_invoice(invoice: Invoice) -> list[str]:
    """Run sanity checks on a computed invoice.

    Catches common issues like negative amounts, mismatched totals,
    and missing required fields. Used as a post-generation quality gate.

    Args:
        invoice: The invoice to validate.

    Returns:
        List of error messages (empty if invoice is valid).
    """
    errors = []

    if not invoice.invoice_id:
        errors.append("Missing invoice_id")
    if not invoice.account_id:
        errors.append("Missing account_id")

    computed_subtotal = round(sum(item.amount for item in invoice.line_items), 2)
    if invoice.subtotal < computed_subtotal:
        # subtotal can be >= computed if minimum charge applied
        pass
    elif abs(invoice.subtotal - computed_subtotal) > 0.01:
        errors.append(
            f"Subtotal mismatch: {invoice.subtotal} vs computed {computed_subtotal}"
        )

    for item in invoice.line_items:
        if item.amount < 0:
            errors.append(f"Negative amount for {item.feature}: {item.amount}")
        if item.quantity < 0:
            errors.append(f"Negative quantity for {item.feature}: {item.quantity}")
        expected = round(item.quantity * item.unit_price, 2)
        if abs(item.amount - expected) > 0.01:
            errors.append(
                f"Amount mismatch for {item.feature}: "
                f"{item.amount} vs {item.quantity} * {item.unit_price} = {expected}"
            )

    return errors
