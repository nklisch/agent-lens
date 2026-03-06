"""Reservation orchestration for the Downtown Grand hotel.

The central module that ties together all subsystems to produce a
complete Reservation object: room selection, rate calculation,
discount application, tax, deposit, and status management.
"""

import uuid
from datetime import date

from models import BookingRequest, Guest, HotelConfig, Reservation
from rooms import get_available_room, get_base_rate
from rates import get_seasonal_rate
from guests import get_loyalty_tier
from availability import count_nights, validate_date_range
from discounts import calculate_effective_nightly_rate
from deposits import calculate_deposit, is_deposit_waived


def create_reservation(
    guest: Guest,
    request: BookingRequest,
    config: HotelConfig,
) -> Reservation:
    """Create a complete reservation for a guest.

    Orchestrates the full pricing pipeline:
      1. Find an available room matching the requested type.
      2. Look up the seasonal rate multiplier for the check-in month.
      3. Determine the guest's loyalty tier.
      4. Calculate the effective nightly rate (seasonal + loyalty).
      5. Count the number of nights.
      6. Compute subtotal, tax, and total.
      7. Determine deposit required.

    Args:
        guest: The guest making the booking.
        request: The booking request with dates and room type.
        config: Hotel configuration (rates, discounts, tax).

    Returns:
        A fully priced Reservation object.

    Raises:
        ValueError: If no room of the requested type is available,
                    or if the date range is invalid.
    """
    # Validate date range
    errors = validate_date_range(
        request.check_in,
        request.check_out,
        config.max_advance_booking_days,
    )
    if errors:
        raise ValueError("Invalid booking request: " + "; ".join(errors))

    # Find a room
    room = get_available_room(request.room_type, request.num_guests)
    if room is None:
        raise ValueError(
            f"No available {request.room_type!r} room for "
            f"{request.num_guests} guest(s)."
        )

    # Seasonal pricing
    seasonal_multiplier = get_seasonal_rate(request.check_in)

    # Loyalty tier and discount
    loyalty_tier = get_loyalty_tier(guest)
    loyalty_discount = config.get_loyalty_discount(loyalty_tier)

    # Effective nightly rate
    nightly_rate = calculate_effective_nightly_rate(
        room.base_rate,
        seasonal_multiplier,
        loyalty_tier,
        config,
    )

    # Night count and pricing
    nights = count_nights(request.check_in, request.check_out)
    subtotal = round(nightly_rate * nights, 2)
    tax = round(subtotal * config.rate_card.tax_rate, 2)
    total = round(subtotal + tax, 2)

    # Deposit
    is_gold = loyalty_tier == "gold"
    if is_deposit_waived(total, config, is_gold):
        deposit_required = 0.0
    else:
        deposit_required = calculate_deposit(total, config)

    reservation_id = f"RES-{uuid.uuid4().hex[:8].upper()}"

    return Reservation(
        reservation_id=reservation_id,
        guest=guest,
        room=room,
        check_in=request.check_in,
        check_out=request.check_out,
        nights=nights,
        nightly_rate=nightly_rate,
        subtotal=subtotal,
        tax=tax,
        total=total,
        loyalty_tier=loyalty_tier,
        loyalty_discount=loyalty_discount,
        seasonal_multiplier=seasonal_multiplier,
        deposit_required=deposit_required,
        status="confirmed",
        notes=request.special_requests,
    )


def cancel_reservation(reservation: Reservation, as_of_date: date | None = None) -> Reservation:
    """Mark a reservation as cancelled.

    Args:
        reservation: The reservation to cancel.
        as_of_date: The date of cancellation (defaults to today).

    Returns:
        The updated reservation with status "cancelled".
    """
    reservation.status = "cancelled"
    return reservation


def calculate_cancellation_fee(reservation: Reservation, cancellation_date: date) -> float:
    """Calculate the fee charged upon cancellation.

    Fee schedule:
      - More than 7 days before check-in: no fee
      - 4-7 days before check-in: 1 night's nightly rate
      - 1-3 days before check-in: 2 nights' nightly rate
      - Same day: full first-night charge

    Args:
        reservation: The reservation being cancelled.
        cancellation_date: The date the cancellation is requested.

    Returns:
        The cancellation fee amount.
    """
    days_remaining = (reservation.check_in - cancellation_date).days

    if days_remaining > 7:
        return 0.0
    elif days_remaining >= 4:
        return round(reservation.nightly_rate * 1, 2)
    elif days_remaining >= 1:
        return round(reservation.nightly_rate * 2, 2)
    else:
        # Same-day cancellation: full first night
        return reservation.nightly_rate


def list_reservations_for_date(
    reservations: list[Reservation],
    target_date: date,
) -> list[Reservation]:
    """Return all active reservations that overlap a given date.

    Args:
        reservations: The full list of reservations.
        target_date: Date to check (inclusive).

    Returns:
        Reservations where check_in <= target_date < check_out.
    """
    return [
        r for r in reservations
        if r.status not in ("cancelled",)
        and r.check_in <= target_date < r.check_out
    ]


def get_reservations_by_guest(
    reservations: list[Reservation],
    guest_id: str,
) -> list[Reservation]:
    """Return all reservations for a specific guest."""
    return [r for r in reservations if r.guest.guest_id == guest_id]
