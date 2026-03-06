"""Visible test suite for the order processing system.

Run with: python3 -m pytest test_orders.py -x -q
"""

import pytest
from app import create_app

# Expected total for Acme Corp (Gold) ordering WIDGET-1 x2 + GADGET-1 x1:
#   WIDGET-1 $25.00 (electronics, 10% category discount) → $22.50 × 2 = $45.00
#   GADGET-1 $15.00 (accessories, $0.10 flat discount)   → $14.90 × 1 = $14.90
#   Subtotal:  $59.90
#   Gold loyalty (10%): $59.90 × 0.90 = $53.91
#   Tax (8%): $53.91 × 0.08 = $4.31
#   Total: $58.22
EXPECTED_TOTAL = 58.22


def test_order_status_confirmed():
    """Order for a Gold customer with sufficient stock should be confirmed."""
    app = create_app()
    order = app.place_order("CUST-001", [
        {"sku": "WIDGET-1", "quantity": 2},
        {"sku": "GADGET-1", "quantity": 1},
    ])
    assert order.status.value == "confirmed", (
        f"Expected 'confirmed', got '{order.status.value}' — "
        "check order processing pipeline for sequencing issues"
    )


def test_order_total():
    """Order total should reflect category discounts and loyalty pricing."""
    app = create_app()
    order = app.place_order("CUST-001", [
        {"sku": "WIDGET-1", "quantity": 2},
        {"sku": "GADGET-1", "quantity": 1},
    ])
    assert order.total == pytest.approx(EXPECTED_TOTAL, abs=0.01), (
        f"Expected ${EXPECTED_TOTAL:.2f}, got ${order.total:.2f} — "
        "check discount rules and category pricing strategies"
    )
