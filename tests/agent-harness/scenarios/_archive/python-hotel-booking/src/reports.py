"""Booking reports and revenue analytics for the Downtown Grand hotel.

Generates summary reports over a collection of reservations, including
revenue totals, occupancy statistics, and tier breakdowns.
"""

from datetime import date

from models import Reservation


def calculate_total_revenue(reservations: list[Reservation]) -> float:
    """Sum total revenue across all confirmed reservations."""
    return round(
        sum(r.total for r in reservations if r.status != "cancelled"),
        2,
    )


def calculate_average_nightly_rate(reservations: list[Reservation]) -> float:
    """Compute the mean nightly rate across all confirmed reservations."""
    active = [r for r in reservations if r.status != "cancelled"]
    if not active:
        return 0.0
    return round(sum(r.nightly_rate for r in active) / len(active), 2)


def get_revenue_by_room_type(reservations: list[Reservation]) -> dict[str, float]:
    """Break down total revenue by room type."""
    breakdown: dict[str, float] = {}
    for r in reservations:
        if r.status == "cancelled":
            continue
        room_type = r.room.room_type
        breakdown[room_type] = round(breakdown.get(room_type, 0.0) + r.total, 2)
    return breakdown


def get_revenue_by_loyalty_tier(reservations: list[Reservation]) -> dict[str, float]:
    """Break down total revenue by guest loyalty tier."""
    breakdown: dict[str, float] = {}
    for r in reservations:
        if r.status == "cancelled":
            continue
        tier = r.loyalty_tier
        breakdown[tier] = round(breakdown.get(tier, 0.0) + r.total, 2)
    return breakdown


def get_occupancy_rate(
    reservations: list[Reservation],
    total_rooms: int,
    start_date: date,
    end_date: date,
) -> float:
    """Estimate occupancy rate over a date range.

    Counts room-nights booked divided by total available room-nights.

    Args:
        reservations: All reservations to consider.
        total_rooms: Total number of rooms in the hotel.
        start_date: Start of the reporting period.
        end_date: End of the reporting period (exclusive).

    Returns:
        Occupancy rate as a fraction between 0.0 and 1.0.
    """
    total_days = (end_date - start_date).days
    if total_days <= 0 or total_rooms <= 0:
        return 0.0

    available_room_nights = total_rooms * total_days

    booked_nights = 0
    for r in reservations:
        if r.status == "cancelled":
            continue
        # Count overlap between stay and reporting window
        overlap_start = max(r.check_in, start_date)
        overlap_end = min(r.check_out, end_date)
        overlap_days = (overlap_end - overlap_start).days
        if overlap_days > 0:
            booked_nights += overlap_days

    return round(booked_nights / available_room_nights, 4)


def format_revenue_report(reservations: list[Reservation]) -> str:
    """Return a formatted text revenue report for a set of reservations."""
    total = calculate_total_revenue(reservations)
    avg_nightly = calculate_average_nightly_rate(reservations)
    by_type = get_revenue_by_room_type(reservations)
    by_tier = get_revenue_by_loyalty_tier(reservations)

    lines = [
        "=" * 40,
        "  Revenue Report — Downtown Grand",
        "=" * 40,
        f"  Total revenue:     ${total:>10.2f}",
        f"  Avg nightly rate:  ${avg_nightly:>10.2f}",
        "",
        "  By room type:",
    ]
    for room_type, rev in sorted(by_type.items()):
        lines.append(f"    {room_type:<12}: ${rev:.2f}")
    lines.append("")
    lines.append("  By loyalty tier:")
    for tier, rev in sorted(by_tier.items()):
        lines.append(f"    {tier:<12}: ${rev:.2f}")
    lines.append("=" * 40)
    return "\n".join(lines)
