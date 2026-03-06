"""Visible test suite for the billing system.

These tests exercise the end-to-end invoice generation pipeline
for a typical starter-plan customer with usage across all features.
"""

import pytest
from datetime import datetime
from models import UsageRecord, Account
from billing import generate_invoice


ACCOUNT = Account(
    account_id="acct-001",
    name="Acme Corp",
    plan="starter",
    created_at=datetime(2024, 1, 15),
    billing_email="billing@acme.example.com",
)

USAGE = [
    UsageRecord("acct-001", "storage", 505, datetime(2024, 3, 15)),
    UsageRecord("acct-001", "api_calls.read", 700, datetime(2024, 3, 10)),
    UsageRecord("acct-001", "api_calls.write", 400, datetime(2024, 3, 12)),
    UsageRecord("acct-001", "bandwidth", 110, datetime(2024, 3, 8)),
    UsageRecord("acct-001", "compute_hours", 50, datetime(2024, 3, 20)),
]

PERIOD_START = datetime(2024, 3, 1)
PERIOD_END = datetime(2024, 3, 31)


def test_invoice_total():
    invoice = generate_invoice(ACCOUNT, USAGE, PERIOD_START, PERIOD_END)
    # Expected: storage=$25 + api=$100 + bw=$8 + compute=$25 = $158.00
    assert invoice.subtotal == 158.00, (
        f"Expected subtotal $158.00, got ${invoice.subtotal}\n"
        f"Line items: {[(li.feature, li.quantity, li.unit_price, li.amount) for li in invoice.line_items]}"
    )


def test_api_calls_billed():
    invoice = generate_invoice(ACCOUNT, USAGE, PERIOD_START, PERIOD_END)
    api_items = [li for li in invoice.line_items if li.feature == "api_calls"]
    assert len(api_items) == 1, (
        f"Expected 1 api_calls line item, got {len(api_items)}\n"
        f"Line items: {[(li.feature, li.quantity) for li in invoice.line_items]}"
    )
    assert api_items[0].quantity == 1000, (
        f"Expected 1000 billable API calls, got {api_items[0].quantity}"
    )
