"""Visible failing test — agent can see and run this."""
from pipeline import process_order


# A Starter Kit Bundle order: widget-a + cable-1m + power-supply
# These three items qualify for a 15% bundle discount on their subtotals:
#   widget-a:     29.99 * 1 = 29.99
#   cable-1m:      9.99 * 1 =  9.99
#   power-supply: 39.99 * 1 = 39.99
# Bundle subtotal = 79.97, 15% discount = 11.996 ≈ 12.00
STARTER_KIT_ORDER = {
    "order_id": "ORD-001",
    "customer_id": "CUST-001",
    "ship_to_state": "OR",  # Oregon: no tax, keeps numbers clean
    "shipping_zone": "domestic",
    "carrier": "standard",
    "lines": [
        {"sku": "widget-a", "qty": 1},
        {"sku": "cable-1m", "qty": 1},
        {"sku": "power-supply", "qty": 1},
    ],
}


def test_starter_kit_bundle_discount_applied():
    result = process_order(STARTER_KIT_ORDER)
    bundles = result["discounts"]["bundles"]
    assert len(bundles) == 1, (
        f"Expected 1 bundle discount (STARTER-KIT), got {len(bundles)}: {bundles}\n"
        f"discounts = {result['discounts']}"
    )
    assert bundles[0]["id"] == "STARTER-KIT", f"Wrong bundle: {bundles[0]}"
    assert bundles[0]["discount_pct"] == 15.0


def test_bundle_discount_reduces_grand_total():
    result = process_order(STARTER_KIT_ORDER)
    discount = result["discounts"]["total"]
    assert discount > 0, (
        f"Expected a positive discount for STARTER-KIT order, got {discount}\n"
        f"discounts = {result['discounts']}"
    )
    # Without discount: subtotal=79.97, shipping=7.99 → total=87.96
    # With 15% discount on 79.97 = 11.996 ≈ 12.00 → total ≈ 75.96
    grand_total = result["invoice"]["grand_total"]
    assert grand_total < 85.0, (
        f"Grand total {grand_total} is too high — discount of {discount} was not applied"
    )
