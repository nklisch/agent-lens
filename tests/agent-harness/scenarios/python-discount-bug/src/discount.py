"""Discount calculation module."""

tier_multipliers = {
    "bronze": 0.05,
    "silver": 0.1,
    "gold": 1.0,  # BUG: should be 0.1 (10% discount, not 100%)
    "platinum": 0.2,
}


def calculate_discount(tier: str, subtotal: float) -> float:
    rate = tier_multipliers.get(tier, 0.0)
    discount = subtotal * rate
    return discount


def process_order(user_tier: str, item_prices: list[float]) -> float:
    subtotal = sum(item_prices)
    discount = calculate_discount(user_tier, subtotal)
    tax_rate = 0.1
    tax = subtotal * tax_rate
    total = subtotal - discount + tax
    return total
