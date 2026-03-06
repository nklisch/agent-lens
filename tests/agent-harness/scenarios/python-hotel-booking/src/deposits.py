"""Deposit policy calculation for the Downtown Grand hotel.

The deposit is collected at booking time and applied to the final bill.
Deposit amounts are computed as a percentage of the total stay cost,
subject to a minimum floor amount.
"""

import decimal
from decimal import Decimal, ROUND_HALF_UP

from models import HotelConfig


def calculate_deposit(total: float, config: HotelConfig) -> float:
    """Calculate the deposit amount for a reservation.

    The deposit is the greater of:
      - config.deposit_rate * total
      - config.min_deposit

    Uses Decimal arithmetic for exact rounding to avoid floating-point
    accumulation errors in deposit accounting.

    Args:
        total: The full reservation total (including tax).
        config: Hotel configuration with deposit rate and minimum.

    Returns:
        The deposit amount, rounded to two decimal places.
    """
    rate_deposit = Decimal(str(total)) * Decimal(str(config.rate_card.deposit_rate))
    rate_deposit = float(rate_deposit.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    return max(rate_deposit, config.rate_card.min_deposit)


def is_deposit_waived(total: float, config: HotelConfig, is_gold_member: bool = False) -> bool:
    """Determine whether the deposit requirement can be waived.

    Gold loyalty members booking stays under $500 are eligible for
    deposit waiver as a premium member benefit.

    Args:
        total: The reservation total.
        config: Hotel configuration.
        is_gold_member: Whether the guest holds Gold status.

    Returns:
        True if the deposit should be waived.
    """
    if is_gold_member and total < 500.0:
        return True
    return False


def calculate_refund_on_cancellation(
    deposit: float,
    days_until_checkin: int,
    cancellation_window_days: int,
) -> float:
    """Calculate how much of the deposit is refundable upon cancellation.

    Full refund if cancelled before the cancellation window.
    50% refund if cancelled within the window.
    No refund if cancelled on the day of check-in or later.

    Args:
        deposit: The deposit amount paid.
        days_until_checkin: Number of days remaining until check-in.
        cancellation_window_days: The hotel's cancellation window in days.

    Returns:
        The refund amount.
    """
    if days_until_checkin > cancellation_window_days:
        return deposit
    elif days_until_checkin > 0:
        refund = Decimal(str(deposit)) * Decimal("0.5")
        return float(refund.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    return 0.0


def format_deposit_receipt(deposit: float, total: float, config: HotelConfig) -> str:
    """Return a formatted deposit notice for guest communication."""
    balance_due = round(total - deposit, 2)
    lines = [
        f"Deposit charged: ${deposit:.2f}",
        f"Total reservation: ${total:.2f}",
        f"Balance due at check-in: ${balance_due:.2f}",
        f"(Deposit rate: {config.rate_card.deposit_rate * 100:.0f}% of total)",
    ]
    return "\n".join(lines)
