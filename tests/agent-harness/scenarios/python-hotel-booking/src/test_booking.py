"""Visible tests for the hotel booking system.

These tests are run by the agent to see what's failing.
Run with: python3 -m pytest test_booking.py -x -q
"""

import pytest
from reservations import create_reservation
from data import alice, alice_booking_request, hotel_config


def test_alice_reservation_total():
    """Alice's 3-night Deluxe stay in January should total $428.40."""
    reservation = create_reservation(alice, alice_booking_request, hotel_config)
    assert reservation.total == pytest.approx(428.40, abs=0.01), (
        f"Expected $428.40 total, got ${reservation.total:.2f}\n"
        f"  Nights: {reservation.nights}\n"
        f"  Loyalty tier: {reservation.loyalty_tier} ({reservation.loyalty_discount*100:.0f}% off)\n"
        f"  Seasonal multiplier: {reservation.seasonal_multiplier:.2f}x\n"
        f"  Nightly rate: ${reservation.nightly_rate:.2f}\n"
        f"  Subtotal: ${reservation.subtotal:.2f}\n"
        f"  Tax: ${reservation.tax:.2f}"
    )


def test_alice_night_count():
    """A check-in Jan 15 and check-out Jan 18 is a 3-night stay."""
    reservation = create_reservation(alice, alice_booking_request, hotel_config)
    assert reservation.nights == 3, (
        f"Expected 3 nights (Jan 15 to Jan 18), got {reservation.nights}"
    )
