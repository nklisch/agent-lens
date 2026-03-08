"""Pricing engine for SaaS billing.

Implements volume-based tiered pricing with free tier allowances
and plan-specific minimum charges. Each feature has its own tier
schedule defined in ascending order by unit count.
"""

from models import PricingTier


# ── Tier definitions ────────────────────────────────────────────
# Each feature maps to a list of tiers sorted by max_units ascending.
# The first tier whose max_units accommodates the usage count is selected.

PRICING: dict[str, list[PricingTier]] = {
    "storage": [
        PricingTier(max_units=100, price_per_unit=0.10),
        PricingTier(max_units=500, price_per_unit=0.05),
        PricingTier(max_units=2000, price_per_unit=0.03),
        PricingTier(max_units=float("inf"), price_per_unit=0.02),
    ],
    "api_calls": [
        PricingTier(max_units=500, price_per_unit=0.15),
        PricingTier(max_units=1000, price_per_unit=0.10),
        PricingTier(max_units=5000, price_per_unit=0.05),
        PricingTier(max_units=float("inf"), price_per_unit=0.02),
    ],
    "bandwidth": [
        PricingTier(max_units=50, price_per_unit=0.12),
        PricingTier(max_units=200, price_per_unit=0.08),
        PricingTier(max_units=1000, price_per_unit=0.05),
        PricingTier(max_units=float("inf"), price_per_unit=0.03),
    ],
    "compute_hours": [
        PricingTier(max_units=100, price_per_unit=0.50),
        PricingTier(max_units=500, price_per_unit=0.35),
        PricingTier(max_units=2000, price_per_unit=0.20),
        PricingTier(max_units=float("inf"), price_per_unit=0.12),
    ],
}

# ── Free tier allowances per plan ───────────────────────────────

FREE_TIER: dict[str, dict[str, float]] = {
    "starter": {"storage": 5, "api_calls": 100, "bandwidth": 10, "compute_hours": 0},
    "professional": {"storage": 50, "api_calls": 1000, "bandwidth": 50, "compute_hours": 10},
    "enterprise": {"storage": 200, "api_calls": 5000, "bandwidth": 200, "compute_hours": 50},
}

# ── Minimum monthly charges per plan ────────────────────────────

MINIMUM_CHARGES: dict[str, float] = {
    "starter": 0.0,
    "professional": 49.0,
    "enterprise": 199.0,
}


def get_tier(feature: str, units: float) -> PricingTier:
    """Find the pricing tier for a given feature and unit count.

    Iterates through tiers in ascending order and returns the first
    tier that can accommodate the requested number of units.

    Args:
        feature: The billing feature name (e.g., "storage", "api_calls").
        units: The number of billable units after free tier deduction.

    Returns:
        The applicable PricingTier for the given usage level.

    Raises:
        ValueError: If the feature is not found in the pricing table.
    """
    tiers = PRICING.get(feature)
    if not tiers:
        raise ValueError(f"Unknown feature: {feature}")
    for tier in tiers:
        if units < tier.max_units:
            return tier
    return tiers[-1]


def calculate_feature_charge(
    feature: str, raw_units: float, plan: str
) -> tuple[float, float, float]:
    """Calculate the billable charge for a single feature.

    Deducts the free tier allowance, looks up the appropriate pricing
    tier, and computes the total charge.

    Args:
        feature: The billing feature name.
        raw_units: Total usage units before free tier deduction.
        plan: The account's plan name for free tier lookup.

    Returns:
        A tuple of (billable_units, unit_price, total_charge).
    """
    free_allowance = FREE_TIER.get(plan, {}).get(feature, 0)
    billable = max(0, raw_units - free_allowance)

    if billable <= 0:
        return (0, 0.0, 0.0)

    tier = get_tier(feature, billable)
    charge = round(billable * tier.price_per_unit, 2)
    return (billable, tier.price_per_unit, charge)


def apply_minimum_charge(plan: str, subtotal: float) -> float:
    """Apply plan minimum charge if the subtotal is below the threshold.

    Args:
        plan: The account's plan name.
        subtotal: The computed subtotal before minimum adjustment.

    Returns:
        The effective subtotal (at least the plan minimum).
    """
    minimum = MINIMUM_CHARGES.get(plan, 0.0)
    return max(subtotal, minimum)


def format_tier_label(feature: str, units: float) -> str:
    """Generate a human-readable label for the pricing tier.

    Used for invoice display to show customers which tier bracket
    their usage falls into.

    Args:
        feature: The billing feature name.
        units: The number of billable units.

    Returns:
        A formatted string like "Storage: Standard (up to 500 units)".
    """
    tier = get_tier(feature, units)
    feature_display = feature.replace("_", " ").title()
    if tier.max_units == float("inf"):
        return f"{feature_display}: Unlimited @ ${tier.price_per_unit:.2f}/unit"
    return f"{feature_display}: Up to {tier.max_units:.0f} units @ ${tier.price_per_unit:.2f}/unit"


def get_plan_features(plan: str) -> list[str]:
    """Return the list of features available for a given plan.

    All plans currently have access to the same features, but this
    function exists to support future per-plan feature gating.

    Args:
        plan: The account's plan name.

    Returns:
        List of feature names available for billing.
    """
    if plan not in FREE_TIER:
        raise ValueError(f"Unknown plan: {plan}")
    return list(PRICING.keys())
