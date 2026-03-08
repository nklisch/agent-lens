"""Hidden validation tests — verifies both bugs are properly fixed.

These tests are not visible to the agent. They check:
1. Tier boundary off-by-one is fixed (units == max_units stays in current tier)
2. Sub-feature aggregation works (api_calls.read + api_calls.write -> api_calls)
3. Non-affected features remain correct
4. Full invoice total matches expected value
"""

import sys
import os
import pytest
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from models import UsageRecord, Account
from billing import generate_invoice


def make_account(plan: str = "starter") -> Account:
    return Account(
        account_id="test-acct",
        name="Test Co",
        plan=plan,
        created_at=datetime(2024, 1, 1),
        billing_email="test@example.com",
    )


def test_tier_boundary_storage():
    """Bug 1: exactly 500 billable storage should use $0.05 tier, not $0.03."""
    acct = make_account()
    usage = [UsageRecord("test-acct", "storage", 505, datetime(2024, 3, 1))]
    invoice = generate_invoice(acct, usage, datetime(2024, 3, 1), datetime(2024, 3, 31))
    storage = [li for li in invoice.line_items if li.feature == "storage"][0]
    assert storage.unit_price == 0.05, (
        f"Expected $0.05/unit at 500 boundary, got ${storage.unit_price}"
    )
    assert storage.amount == 25.00


def test_tier_boundary_api_calls():
    """Bug 1+2: 1000 billable api_calls should use $0.10 tier."""
    acct = make_account()
    usage = [
        UsageRecord("test-acct", "api_calls.read", 700, datetime(2024, 3, 1)),
        UsageRecord("test-acct", "api_calls.write", 400, datetime(2024, 3, 1)),
    ]
    invoice = generate_invoice(acct, usage, datetime(2024, 3, 1), datetime(2024, 3, 31))
    api = [li for li in invoice.line_items if li.feature == "api_calls"]
    assert len(api) == 1, f"Expected api_calls line item, got {len(api)}"
    assert api[0].quantity == 1000
    assert api[0].unit_price == 0.10


def test_sub_feature_aggregation():
    """Bug 2: sub-features like api_calls.read should be summed into api_calls."""
    acct = make_account()
    usage = [
        UsageRecord("test-acct", "api_calls.read", 200, datetime(2024, 3, 1)),
        UsageRecord("test-acct", "api_calls.write", 100, datetime(2024, 3, 1)),
    ]
    invoice = generate_invoice(acct, usage, datetime(2024, 3, 1), datetime(2024, 3, 31))
    api = [li for li in invoice.line_items if li.feature == "api_calls"]
    assert len(api) == 1
    # 300 total - 100 free = 200 billable, tier <=500 at $0.15
    assert api[0].quantity == 200
    assert api[0].amount == 30.00


def test_non_boundary_unaffected():
    """Features not at tier boundaries should be priced correctly."""
    acct = make_account()
    usage = [
        UsageRecord("test-acct", "bandwidth", 110, datetime(2024, 3, 1)),
        UsageRecord("test-acct", "compute_hours", 50, datetime(2024, 3, 1)),
    ]
    invoice = generate_invoice(acct, usage, datetime(2024, 3, 1), datetime(2024, 3, 31))
    bw = [li for li in invoice.line_items if li.feature == "bandwidth"][0]
    assert bw.amount == 8.00  # 100 billable @ $0.08
    ch = [li for li in invoice.line_items if li.feature == "compute_hours"][0]
    assert ch.amount == 25.00  # 50 billable @ $0.50


def test_full_invoice_total():
    """Complete invoice with all features — both bugs must be fixed."""
    acct = make_account()
    usage = [
        UsageRecord("test-acct", "storage", 505, datetime(2024, 3, 1)),
        UsageRecord("test-acct", "api_calls.read", 700, datetime(2024, 3, 1)),
        UsageRecord("test-acct", "api_calls.write", 400, datetime(2024, 3, 1)),
        UsageRecord("test-acct", "bandwidth", 110, datetime(2024, 3, 1)),
        UsageRecord("test-acct", "compute_hours", 50, datetime(2024, 3, 1)),
    ]
    invoice = generate_invoice(acct, usage, datetime(2024, 3, 1), datetime(2024, 3, 31))
    assert invoice.subtotal == 158.00, f"Expected $158.00, got ${invoice.subtotal}"
