"""Oracle validation tests for python-order-system.

These tests verify that all 4 bugs are fixed:
  Bug 1 — event published before reservation stored (ordering)
  Bug 2 — deep_merge concatenates lists instead of replacing (config)
  Bug 3 — cache not invalidated on price update (ghost cache)
  Bug 4 — encoded config has wrong discount strategy name (runtime-only)

Run from src/ directory: python3 -m pytest test_validation.py -x -q
"""

import sys
import os
import base64
import json
import pytest

# Ensure src/ is on the path when running from hidden/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from app import create_app
from config import load_config, get_discount_rules, deep_merge, _ENCODED_PRICING_CONFIG
from models.order import OrderStatus
from dao.product_dao import _price_cache


# ---------------------------------------------------------------------------
# Bug 1: Event published before reservation stored
# ---------------------------------------------------------------------------

def test_order_status_confirmed():
    """Order should be confirmed, not failed_inventory."""
    app = create_app()
    order = app.place_order("CUST-001", [
        {"sku": "WIDGET-1", "quantity": 2},
        {"sku": "GADGET-1", "quantity": 1},
    ])
    assert order.status == OrderStatus.CONFIRMED, (
        f"Expected CONFIRMED, got {order.status.value} — "
        "is reserve_stock() called before events.publish()?"
    )


def test_worker_processes_successfully():
    """Worker must find the reservation and mark the order confirmed."""
    app = create_app()
    order = app.place_order("CUST-001", [{"sku": "WIDGET-1", "quantity": 1}])
    # If worker ran before reservation existed, audit log shows failed_inventory
    audit = app.order_dao.audit_log()
    order_audit = [a for a in audit if a["order_id"] == order.order_id]
    confirmed_entries = [a for a in order_audit if a["status"] == "confirmed"]
    assert len(confirmed_entries) >= 1, (
        f"Worker never marked order as confirmed. Audit: {order_audit}"
    )


def test_inventory_decremented():
    """Stock should be correctly reduced after a successful order."""
    app = create_app()
    widget_start = app.product_dao.get("WIDGET-1").stock
    gadget_start = app.product_dao.get("GADGET-1").stock
    app.place_order("CUST-001", [
        {"sku": "WIDGET-1", "quantity": 2},
        {"sku": "GADGET-1", "quantity": 1},
    ])
    assert app.product_dao.get("WIDGET-1").stock == widget_start - 2
    assert app.product_dao.get("GADGET-1").stock == gadget_start - 1


# ---------------------------------------------------------------------------
# Bug 2: deep_merge concatenates lists instead of replacing
# ---------------------------------------------------------------------------

def test_config_deep_merge_replaces_lists():
    """deep_merge should replace list values, not concatenate them."""
    base = {"rules": [{"type": "loyalty", "rate": 0.05}]}
    override = {"rules": [{"type": "loyalty", "rate": 0.10}]}
    merged = deep_merge(base, override)
    assert len(merged["rules"]) == 1, (
        f"Expected 1 rule after merge, got {len(merged['rules'])}: {merged['rules']}"
    )
    assert merged["rules"][0]["rate"] == 0.10


def test_config_discount_rules_not_duplicated():
    """Merged config should have exactly one loyalty discount rule."""
    load_config()
    rules = get_discount_rules()
    loyalty_rules = [r for r in rules if r.get("type") == "loyalty"]
    assert len(loyalty_rules) == 1, (
        f"Expected 1 loyalty rule, got {len(loyalty_rules)}: {loyalty_rules}"
    )


def test_loyalty_discount_not_doubled():
    """Gold loyalty discount should be applied once (10%), not twice (5%+10%)."""
    load_config()
    rules = get_discount_rules()
    gold_rules = [
        r for r in rules
        if r.get("type") == "loyalty" and r.get("tier") == "gold"
    ]
    assert len(gold_rules) == 1, (
        f"Expected exactly 1 gold loyalty rule, got {len(gold_rules)}"
    )
    assert gold_rules[0]["rate"] == pytest.approx(0.10)


def test_loyalty_discount_applied():
    """Gold customer should get exactly 10% off the subtotal."""
    app = create_app()
    order = app.place_order("CUST-001", [
        {"sku": "WIDGET-1", "quantity": 2},
        {"sku": "GADGET-1", "quantity": 1},
    ])
    # With all bugs fixed: subtotal=59.90, Gold 10% discount = 5.99
    assert order.discount_amount == pytest.approx(5.99, abs=0.01), (
        f"Expected discount $5.99 (10% of $59.90), got ${order.discount_amount:.2f} — "
        "check if loyalty discount is applied once or multiple times"
    )


# ---------------------------------------------------------------------------
# Bug 3: Ghost cache — price not invalidated on update
# ---------------------------------------------------------------------------

def test_cache_invalidated_on_price_update():
    """Updating a product price should invalidate the cached value."""
    _price_cache.clear()
    app = create_app()

    # Warm the cache
    initial = app.pricing_service.get_product_price("WIDGET-1")
    assert initial == pytest.approx(25.00, abs=0.01)

    # Update price
    app.product_dao.update_price("WIDGET-1", 20.00)

    # Cache must be invalidated; next fetch should return new price
    refreshed = app.pricing_service.get_product_price("WIDGET-1")
    assert refreshed == pytest.approx(20.00, abs=0.01), (
        f"Expected $20.00 after price update, got ${refreshed:.2f} — "
        "stale cache: update_price() should invalidate the price cache"
    )


def test_price_reflects_sale():
    """Order pricing should use the current price, not a stale cached price."""
    _price_cache.clear()
    app = create_app()

    # Warm cache at original price
    _ = app.pricing_service.get_product_price("WIDGET-1")

    # Apply a price reduction
    app.product_dao.update_price("WIDGET-1", 20.00)

    # Fresh fetch should return the reduced price
    current = app.pricing_service.get_product_price("WIDGET-1")
    assert current == pytest.approx(20.00, abs=0.01), (
        f"Expected sale price $20.00, got ${current:.2f} — "
        "cache was not invalidated when price changed"
    )


# ---------------------------------------------------------------------------
# Bug 4: Encoded config has wrong discount strategy name
# ---------------------------------------------------------------------------

def test_encoded_strategy_name():
    """Encoded config must use 'percentage' (not 'percent') for electronics."""
    decoded = json.loads(base64.b64decode(_ENCODED_PRICING_CONFIG))
    strategy = decoded["pricing"]["strategies"]["electronics"]
    assert strategy == "percentage", (
        f"Expected strategy 'percentage' for electronics, got {strategy!r}"
    )


def test_discount_strategy_resolved():
    """Electronics category must resolve to percentage_discount, not no_discount."""
    from services.pricing_service import PricingService, percentage_discount
    from dao.product_dao import ProductDAO
    from dao.customer_dao import CustomerDAO
    load_config()
    ps = PricingService(ProductDAO(), CustomerDAO())
    strategy = ps.get_discount_strategy("electronics")
    assert strategy is percentage_discount, (
        "Electronics discount strategy resolved to the wrong function — "
        "check that the config strategy name matches the registry key"
    )


# ---------------------------------------------------------------------------
# Integration: correct order total
# ---------------------------------------------------------------------------

def test_order_total_correct():
    """Full order total must match expected value with all discounts applied."""
    _price_cache.clear()
    app = create_app()
    order = app.place_order("CUST-001", [
        {"sku": "WIDGET-1", "quantity": 2},
        {"sku": "GADGET-1", "quantity": 1},
    ])
    # WIDGET-1: 25.00 * 0.90 = 22.50 × 2 = 45.00
    # GADGET-1: 15.00 - 0.10 = 14.90 × 1 = 14.90
    # Subtotal: 59.90 → Gold 10% → 53.91 → Tax 8% → 4.31 → Total: 58.22
    assert order.total == pytest.approx(58.22, abs=0.01), (
        f"Expected $58.22, got ${order.total:.2f}"
    )


def test_order_item_prices():
    """Line item prices must reflect category discounts."""
    _price_cache.clear()
    app = create_app()
    order = app.place_order("CUST-001", [
        {"sku": "WIDGET-1", "quantity": 2},
        {"sku": "GADGET-1", "quantity": 1},
    ])
    widget = next(i for i in order.items if i.sku == "WIDGET-1")
    gadget = next(i for i in order.items if i.sku == "GADGET-1")
    # WIDGET-1 (electronics, 10% percentage discount): 25.00 * 0.90 = 22.50
    assert widget.unit_price == pytest.approx(22.50, abs=0.01), (
        f"Expected WIDGET-1 unit price $22.50, got ${widget.unit_price:.2f} — "
        "electronics category discount may not be applied"
    )
    assert widget.line_total == pytest.approx(45.00, abs=0.01)
    # GADGET-1 (accessories, fixed $0.10 discount): 15.00 - 0.10 = 14.90
    assert gadget.unit_price == pytest.approx(14.90, abs=0.01)
    assert gadget.line_total == pytest.approx(14.90, abs=0.01)
