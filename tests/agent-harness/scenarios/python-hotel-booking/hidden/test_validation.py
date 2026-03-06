"""Hidden oracle tests — copied into workspace after the agent finishes."""

import pytest
from datetime import date

from rates import get_seasonal_rate, SEASONAL_RATES
from availability import count_nights
from guests import get_loyalty_tier
from reservations import create_reservation
from data import alice, alice_booking_request, bob, bob_booking_request, hotel_config
from models import Guest


# ---------------------------------------------------------------------------
# Bug 1: Seasonal rate month off-by-one
# ---------------------------------------------------------------------------

def test_seasonal_rate_january():
    """January rate should be 1.0 (shoulder season), not 1.2 (February's rate)."""
    jan_date = date(2027, 1, 15)
    rate = get_seasonal_rate(jan_date)
    assert rate == pytest.approx(1.0), (
        f"January rate should be 1.0, got {rate} "
        f"(check SEASONAL_RATES key for month 1)"
    )


def test_seasonal_rate_february():
    """February rate should be 1.2 (Valentine's premium)."""
    feb_date = date(2027, 2, 1)
    rate = get_seasonal_rate(feb_date)
    assert rate == pytest.approx(1.2), (
        f"February rate should be 1.2, got {rate}"
    )


def test_seasonal_rate_july():
    """July rate should be 1.3 (peak summer)."""
    jul_date = date(2027, 7, 4)
    rate = get_seasonal_rate(jul_date)
    assert rate == pytest.approx(1.3), (
        f"July rate should be 1.3, got {rate}"
    )


def test_seasonal_rate_december():
    """December rate should be 1.2 (holiday premium)."""
    dec_date = date(2027, 12, 25)
    rate = get_seasonal_rate(dec_date)
    assert rate == pytest.approx(1.2), (
        f"December rate should be 1.2, got {rate}"
    )


# ---------------------------------------------------------------------------
# Bug 2: Night count includes checkout day
# ---------------------------------------------------------------------------

def test_night_count_3_nights():
    """Jan 15 → Jan 18 is 3 nights, not 4."""
    nights = count_nights(date(2027, 1, 15), date(2027, 1, 18))
    assert nights == 3, (
        f"Jan 15–18 should be 3 nights, got {nights}"
    )


def test_night_count_1_night():
    """Jan 15 → Jan 16 is 1 night."""
    nights = count_nights(date(2027, 1, 15), date(2027, 1, 16))
    assert nights == 1, (
        f"Jan 15–16 should be 1 night, got {nights}"
    )


def test_night_count_7_nights():
    """A week-long stay Jan 10 → Jan 17 is 7 nights."""
    nights = count_nights(date(2027, 1, 10), date(2027, 1, 17))
    assert nights == 7, (
        f"Jan 10–17 should be 7 nights, got {nights}"
    )


# ---------------------------------------------------------------------------
# Bug 3: Loyalty tier uses reservation_count instead of total_nights
# ---------------------------------------------------------------------------

def test_loyalty_tier_gold_by_total_nights():
    """Guest with 15 total nights should be Gold, not Bronze."""
    guest = Guest(
        guest_id="TEST-01",
        name="Test Guest",
        email="test@example.com",
        phone="555-0000",
        reservation_count=3,   # only 3 bookings — Bronze if using this field
        total_nights=15,       # 15+ nights — Gold if using this field
    )
    tier = get_loyalty_tier(guest)
    assert tier == "gold", (
        f"Guest with 15 total_nights should be Gold, got {tier!r} "
        f"(reservation_count=3 would give Bronze)"
    )


def test_loyalty_tier_silver_by_total_nights():
    """Guest with 7 total nights and 1 reservation should be Silver."""
    guest = Guest(
        guest_id="TEST-02",
        name="Test Guest 2",
        email="test2@example.com",
        phone="555-0001",
        reservation_count=1,
        total_nights=7,
    )
    tier = get_loyalty_tier(guest)
    assert tier == "silver", (
        f"Guest with 7 total_nights should be Silver, got {tier!r}"
    )


def test_loyalty_tier_distinguishes_nights_vs_stays():
    """3 reservations / 15 nights → Gold (not Bronze from reservation_count)."""
    assert get_loyalty_tier(alice) == "gold", (
        f"Alice has 15 total_nights → Gold, got {get_loyalty_tier(alice)!r}"
    )


# ---------------------------------------------------------------------------
# Integration: full reservation pricing
# ---------------------------------------------------------------------------

def test_alice_total():
    """Alice's full booking should total $428.40 with all bugs fixed."""
    reservation = create_reservation(alice, alice_booking_request, hotel_config)
    assert reservation.total == pytest.approx(428.40, abs=0.01), (
        f"Expected $428.40, got ${reservation.total:.2f}"
    )


def test_alice_nightly_rate():
    """Alice's nightly rate should be $127.50 ($150 × 1.0 × 0.85)."""
    reservation = create_reservation(alice, alice_booking_request, hotel_config)
    assert reservation.nightly_rate == pytest.approx(127.50, abs=0.01), (
        f"Expected $127.50/night, got ${reservation.nightly_rate:.2f}"
    )


def test_alice_loyalty_discount():
    """Alice's loyalty discount should be 15% (Gold tier)."""
    reservation = create_reservation(alice, alice_booking_request, hotel_config)
    assert reservation.loyalty_discount == pytest.approx(0.15, abs=0.001), (
        f"Expected 15% (Gold) discount, got {reservation.loyalty_discount*100:.1f}%"
    )


def test_bob_unaffected():
    """Bob books in April with no loyalty — standard tier, 1.0 seasonal rate."""
    reservation = create_reservation(bob, bob_booking_request, hotel_config)
    assert reservation.loyalty_tier == "standard", (
        f"Bob has 0 stays/nights → Standard, got {reservation.loyalty_tier!r}"
    )
    assert reservation.seasonal_multiplier == pytest.approx(1.0), (
        f"April rate should be 1.0, got {reservation.seasonal_multiplier}"
    )
