"""Discount application logic for the Downtown Grand hotel.

Handles loyalty-tier discounts and any other promotional pricing.
Discounts are applied to the adjusted nightly rate (after seasonal
multiplier) before tax is calculated.
"""

from models import Guest, HotelConfig


def apply_loyalty_discount(base_rate: float, tier: str, config: HotelConfig) -> float:
    """Apply the loyalty discount for the given tier to a nightly rate.

    Args:
        base_rate: The nightly rate before loyalty adjustment (after seasonal).
        tier: Loyalty tier string ("gold", "silver", "bronze", "standard").
        config: Hotel configuration containing the discount schedule.

    Returns:
        The discounted nightly rate, rounded to two decimal places.
    """
    discount_fraction = config.get_loyalty_discount(tier)
    adjusted = base_rate * (1.0 - discount_fraction)
    return round(adjusted, 2)


def get_effective_discount_rate(tier: str, config: HotelConfig) -> float:
    """Return the effective discount fraction for a loyalty tier.

    Returns 0.0 for unknown or standard tiers (no discount).
    """
    return config.get_loyalty_discount(tier)


def apply_group_discount(subtotal: float, num_rooms: int) -> float:
    """Apply a group booking discount for reservations of 5+ rooms.

    Groups of 5-9 rooms receive 5% off; 10+ rooms receive 10% off.
    Single-room bookings are not affected.

    Args:
        subtotal: Total before group discount.
        num_rooms: Number of rooms in the group booking.

    Returns:
        Adjusted subtotal with group discount applied.
    """
    if num_rooms >= 10:
        return round(subtotal * 0.90, 2)
    elif num_rooms >= 5:
        return round(subtotal * 0.95, 2)
    return subtotal


def calculate_effective_nightly_rate(
    base_room_rate: float,
    seasonal_multiplier: float,
    loyalty_tier: str,
    config: HotelConfig,
) -> float:
    """Compute the all-in nightly rate after seasonal and loyalty adjustments.

    Pipeline:
        1. Apply seasonal multiplier to base room rate.
        2. Apply loyalty discount to the seasonally-adjusted rate.

    Args:
        base_room_rate: Nightly rate from the room catalog.
        seasonal_multiplier: Rate multiplier for the booking month.
        loyalty_tier: Guest's loyalty tier.
        config: Hotel configuration with discount schedule.

    Returns:
        The final nightly rate, rounded to two decimal places.
    """
    seasonally_adjusted = round(base_room_rate * seasonal_multiplier, 2)
    return apply_loyalty_discount(seasonally_adjusted, loyalty_tier, config)


def describe_discount_summary(
    base_rate: float,
    seasonal_multiplier: float,
    tier: str,
    config: HotelConfig,
) -> str:
    """Return a human-readable breakdown of applied discounts."""
    seasonal_rate = round(base_rate * seasonal_multiplier, 2)
    discount_fraction = get_effective_discount_rate(tier, config)
    final_rate = apply_loyalty_discount(seasonal_rate, tier, config)
    lines = [
        f"Base rate:              ${base_rate:.2f}/night",
        f"Seasonal ({seasonal_multiplier:.2f}x):      ${seasonal_rate:.2f}/night",
        f"Loyalty ({tier}, {discount_fraction*100:.0f}% off): ${final_rate:.2f}/night",
    ]
    return "\n".join(lines)
