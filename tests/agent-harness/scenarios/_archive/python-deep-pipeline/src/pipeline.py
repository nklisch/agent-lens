"""Order fulfillment pipeline.

Five-stage processing pipeline:
  1. enrich_order      — joins order lines with product catalog (prices, weights,
                         categories, warehouse locations, normalized SKUs)
  2. calculate_shipping — calculates shipping cost based on total weight,
                         destination zone, and carrier preferences
  3. calculate_tax      — applies per-state, per-category tax rules
  4. apply_discounts    — checks for qualifying bundle promotions and applies
                         percentage discounts to bundle items
  5. finalize_order     — assembles the final invoice with per-line totals,
                         subtotals, shipping, tax, discounts, and grand total

Input order shape:
    {
        "order_id": "ORD-001",
        "customer_id": "CUST-123",
        "ship_to_state": "CA",
        "shipping_zone": "domestic",
        "carrier": "standard",
        "lines": [
            {"sku": "widget-a", "qty": 2},
            {"sku": "cable-1m", "qty": 1},
        ]
    }
"""

from catalog import BUNDLES, PRODUCTS, SHIPPING_RATES, TAX_RULES


class OrderError(Exception):
    """Raised when an order cannot be processed."""


# ---------------------------------------------------------------------------
# Stage 1: Enrichment
# ---------------------------------------------------------------------------


def enrich_order(order: dict) -> dict:
    """Join order lines with product catalog data.

    Each line gains:
        - unit_price    : price per unit from catalog
        - subtotal      : unit_price * qty
        - product       : full product record
    """
    enriched_lines = []
    for line in order["lines"]:
        raw_sku = line["sku"]
        if raw_sku not in PRODUCTS:
            raise OrderError(f"Unknown SKU: {raw_sku!r}. Known SKUs: {sorted(PRODUCTS)}")
        product = PRODUCTS[raw_sku]
        enriched_lines.append(
            {
                "sku": raw_sku,
                "qty": line["qty"],
                "unit_price": product["price"],
                "subtotal": round(product["price"] * line["qty"], 2),
                "product": {
                    **product
                },
            }
        )
    return {**order, "lines": enriched_lines}


# ---------------------------------------------------------------------------
# Stage 2: Shipping
# ---------------------------------------------------------------------------


def calculate_shipping(order: dict) -> dict:
    """Calculate shipping cost based on total weight, zone, and carrier.

    Looks up the first weight bracket (inclusive upper bound) that covers
    the order's total weight, then selects the appropriate carrier rate.
    Falls back to standard rate if the requested carrier is unavailable.
    """
    total_weight_g = sum(line["qty"] * line["product"]["weight_g"] for line in order["lines"])

    zone = order.get("shipping_zone", "domestic")
    carrier = order.get("carrier", "standard")
    rate_table = SHIPPING_RATES.get(zone, SHIPPING_RATES["domestic"])

    shipping_cost = None
    for bracket_g, carriers in sorted(rate_table.items()):
        if total_weight_g <= bracket_g:
            shipping_cost = carriers.get(carrier, carriers["standard"])
            break

    if shipping_cost is None:
        # Heavier than any defined bracket — use the last bracket's standard rate
        last_bracket = max(rate_table)
        shipping_cost = rate_table[last_bracket]["standard"]

    # Mark fragile orders for special handling
    has_fragile = any(line["product"]["fragile"] for line in order["lines"])

    return {
        **order,
        "shipping": {
            "total_weight_g": total_weight_g,
            "zone": zone,
            "carrier": carrier,
            "cost": shipping_cost,
            "fragile_handling": has_fragile,
        },
    }


# ---------------------------------------------------------------------------
# Stage 3: Tax
# ---------------------------------------------------------------------------


def calculate_tax(order: dict) -> dict:
    """Apply per-state, per-category tax rules to each line.

    Each line gains:
        - tax_rate   : applicable rate (0.0 for exempt categories/states)
        - tax_amount : line subtotal * tax_rate

    The order gains a "tax" summary with the state and total tax.
    """
    state = order.get("ship_to_state", "CA")
    state_rules = TAX_RULES.get(state, TAX_RULES["CA"])

    taxed_lines = []
    total_tax = 0.0
    for line in order["lines"]:
        category = line["product"]["category"]
        rate = state_rules.get(category, 0.0)
        tax_amount = round(line["subtotal"] * rate, 4)
        total_tax += tax_amount
        taxed_lines.append({**line, "tax_rate": rate, "tax_amount": round(tax_amount, 2)})

    return {
        **order,
        "lines": taxed_lines,
        "tax": {"state": state, "total": round(total_tax, 2)},
    }


# ---------------------------------------------------------------------------
# Stage 4: Discounts
# ---------------------------------------------------------------------------


def _get_bundle_discount(order: dict, bundle: dict) -> float:
    """Calculate the discount amount for a single bundle promotion.

    Returns 0.0 if the order does not contain all required SKUs.
    Otherwise returns the total discount across all qualifying line items.
    """
    # Collect the SKUs present in this order
    order_skus = {line["sku"] for line in order["lines"]}

    required = set(bundle["required_skus"])
    if not required.issubset(order_skus):
        return 0.0

    # Sum subtotals for the lines that are part of this bundle
    bundle_subtotal = sum(
        line["subtotal"]
        for line in order["lines"]
        if line["product"]["sku"] in required
    )
    return round(bundle_subtotal * (bundle["discount_pct"] / 100), 2)


def apply_discounts(order: dict) -> dict:
    """Apply qualifying bundle promotions to the order.

    Checks each defined bundle to see if the order contains all required
    items. For each qualifying bundle, computes the discount as a percentage
    of the bundle items' subtotals.

    The order gains a "discounts" summary listing applied bundles and the
    total discount amount.
    """
    applied_bundles = []
    discount_total = 0.0

    for bundle in BUNDLES:
        discount = _get_bundle_discount(order, bundle)
        if discount > 0:
            applied_bundles.append(
                {
                    "id": bundle["id"],
                    "name": bundle["name"],
                    "discount_pct": bundle["discount_pct"],
                    "discount_amount": discount,
                }
            )
            discount_total += discount

    return {
        **order,
        "discounts": {
            "bundles": applied_bundles,
            "total": round(discount_total, 2),
        },
    }


# ---------------------------------------------------------------------------
# Stage 5: Finalization
# ---------------------------------------------------------------------------


def finalize_order(order: dict) -> dict:
    """Build the final invoice.

    Assembles the complete invoice from the outputs of all prior stages:
        lines_subtotal : sum of all line subtotals
        shipping       : shipping cost from calculate_shipping
        tax            : total tax from calculate_tax
        discounts      : total discount from apply_discounts
        grand_total    : lines_subtotal + shipping + tax - discounts
    """
    lines_subtotal = sum(line["subtotal"] for line in order["lines"])
    shipping_cost = order.get("shipping", {}).get("cost", 0.0)
    tax_total = order.get("tax", {}).get("total", 0.0)
    discount_total = order.get("discounts", {}).get("total", 0.0)

    grand_total = lines_subtotal + shipping_cost + tax_total - discount_total

    return {
        **order,
        "invoice": {
            "lines_subtotal": round(lines_subtotal, 2),
            "shipping": round(shipping_cost, 2),
            "tax": round(tax_total, 2),
            "discounts": round(discount_total, 2),
            "grand_total": round(grand_total, 2),
        },
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def process_order(order: dict) -> dict:
    """Run the full order fulfillment pipeline.

    Applies all five stages in sequence and returns the fully-processed
    order with shipping, tax, discounts, and invoice attached.
    """
    order = enrich_order(order)
    order = calculate_shipping(order)
    order = calculate_tax(order)
    order = apply_discounts(order)
    order = finalize_order(order)
    return order
