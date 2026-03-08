"""Hidden oracle tests — copied into workspace after agent finishes."""
import pytest
from pipeline import process_order


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_order(lines, state="OR", zone="domestic", carrier="standard", order_id="ORD-TEST"):
    return {
        "order_id": order_id,
        "customer_id": "CUST-TEST",
        "ship_to_state": state,
        "shipping_zone": zone,
        "carrier": carrier,
        "lines": [{"sku": sku, "qty": qty} for sku, qty in lines],
    }


# ---------------------------------------------------------------------------
# Bundle: STARTER-KIT (widget-a + cable-1m + power-supply, 15% off)
# ---------------------------------------------------------------------------


def test_starter_kit_discount_applied():
    order = make_order([("widget-a", 1), ("cable-1m", 1), ("power-supply", 1)])
    result = process_order(order)
    bundle_ids = [b["id"] for b in result["discounts"]["bundles"]]
    assert "STARTER-KIT" in bundle_ids, f"STARTER-KIT not in {bundle_ids}"
    discount = result["discounts"]["total"]
    assert discount > 0, f"Expected positive discount, got {discount}"


def test_starter_kit_discount_amount():
    # subtotal: 29.99 + 9.99 + 39.99 = 79.97; 15% = 11.995 ≈ 12.00
    order = make_order([("widget-a", 1), ("cable-1m", 1), ("power-supply", 1)])
    result = process_order(order)
    discount = result["discounts"]["total"]
    assert abs(discount - 11.995) < 0.05, f"Expected ~12.00, got {discount}"


def test_starter_kit_with_extra_items():
    # Adding extra items shouldn't prevent the bundle from applying
    order = make_order([("widget-a", 1), ("cable-1m", 2), ("power-supply", 1), ("mount-desk", 1)])
    result = process_order(order)
    bundle_ids = [b["id"] for b in result["discounts"]["bundles"]]
    assert "STARTER-KIT" in bundle_ids, f"Bundle should apply even with extra items: {bundle_ids}"


# ---------------------------------------------------------------------------
# Bundle: TRAVEL-BUNDLE (cable-2m + battery-pack + filter-uv, 10% off)
# ---------------------------------------------------------------------------


def test_travel_bundle_discount_applied():
    order = make_order([("cable-2m", 1), ("battery-pack", 1), ("filter-uv", 1)])
    result = process_order(order)
    bundle_ids = [b["id"] for b in result["discounts"]["bundles"]]
    assert "TRAVEL-BUNDLE" in bundle_ids, f"TRAVEL-BUNDLE not in {bundle_ids}"


def test_travel_bundle_discount_amount():
    # subtotal: 14.99 + 34.99 + 15.99 = 65.97; 10% = 6.597 ≈ 6.60
    order = make_order([("cable-2m", 1), ("battery-pack", 1), ("filter-uv", 1)])
    result = process_order(order)
    discount = result["discounts"]["total"]
    assert abs(discount - 6.597) < 0.05, f"Expected ~6.60 for travel bundle, got {discount}"


# ---------------------------------------------------------------------------
# Non-qualifying orders: no discount
# ---------------------------------------------------------------------------


def test_partial_bundle_no_discount():
    # Only two of three STARTER-KIT items — should not qualify
    order = make_order([("widget-a", 1), ("cable-1m", 1)])
    result = process_order(order)
    assert result["discounts"]["total"] == 0.0, (
        f"Partial bundle should not get a discount: {result['discounts']}"
    )


def test_single_item_no_discount():
    order = make_order([("widget-b", 1)])
    result = process_order(order)
    assert result["discounts"]["total"] == 0.0


# ---------------------------------------------------------------------------
# Multiple bundles in one order
# ---------------------------------------------------------------------------


def test_two_bundles_in_one_order():
    # STARTER-KIT + TRAVEL-BUNDLE in the same order
    order = make_order([
        ("widget-a", 1),
        ("cable-1m", 1),
        ("power-supply", 1),
        ("cable-2m", 1),
        ("battery-pack", 1),
        ("filter-uv", 1),
    ])
    result = process_order(order)
    bundle_ids = {b["id"] for b in result["discounts"]["bundles"]}
    assert "STARTER-KIT" in bundle_ids, f"STARTER-KIT missing from {bundle_ids}"
    assert "TRAVEL-BUNDLE" in bundle_ids, f"TRAVEL-BUNDLE missing from {bundle_ids}"
    # Total discount should be the sum of both
    starter_discount = next(b["discount_amount"] for b in result["discounts"]["bundles"] if b["id"] == "STARTER-KIT")
    travel_discount = next(b["discount_amount"] for b in result["discounts"]["bundles"] if b["id"] == "TRAVEL-BUNDLE")
    assert result["discounts"]["total"] == pytest.approx(starter_discount + travel_discount, abs=0.02)


# ---------------------------------------------------------------------------
# Invoice correctness
# ---------------------------------------------------------------------------


def test_invoice_grand_total_with_discount():
    order = make_order([("widget-a", 1), ("cable-1m", 1), ("power-supply", 1)])
    result = process_order(order)
    inv = result["invoice"]
    # grand_total = lines_subtotal + shipping + tax - discounts
    expected = inv["lines_subtotal"] + inv["shipping"] + inv["tax"] - inv["discounts"]
    assert abs(inv["grand_total"] - expected) < 0.02, (
        f"grand_total {inv['grand_total']} != {expected}"
    )


def test_discount_reduces_grand_total():
    order_with = make_order([("widget-a", 1), ("cable-1m", 1), ("power-supply", 1)])
    order_without = make_order([("widget-a", 1), ("cable-1m", 1)])  # missing power-supply

    result_with = process_order(order_with)
    result_without = process_order(order_without)

    # Adding the bundle's missing item should reduce grand total (discount > extra cost is not expected,
    # but the total WITH discount should be less than WITHOUT discount on the same 3 items)
    total_with_discount = result_with["invoice"]["grand_total"]
    total_without_discount = result_with["invoice"]["lines_subtotal"] + result_with["invoice"]["shipping"] + result_with["invoice"]["tax"]
    assert total_with_discount < total_without_discount, (
        f"Discount should reduce grand total: {total_with_discount} vs {total_without_discount}"
    )
