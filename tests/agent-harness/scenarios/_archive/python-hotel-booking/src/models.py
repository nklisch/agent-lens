"""Data models for the Downtown Grand hotel reservation system.

Defines core domain objects: rooms, guests, reservations, and
rate/config structures used throughout the system.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Optional


@dataclass
class Room:
    """A bookable hotel room."""
    room_number: str
    room_type: str          # "standard", "deluxe", "suite"
    floor: int
    max_occupancy: int
    base_rate: float        # nightly rate in USD before seasonal adjustments
    amenities: list[str] = field(default_factory=list)
    is_accessible: bool = False

    def __repr__(self) -> str:
        return f"Room({self.room_number}, {self.room_type!r}, ${self.base_rate}/night)"


@dataclass
class Guest:
    """A hotel guest with loyalty history."""
    guest_id: str
    name: str
    email: str
    phone: str
    reservation_count: int = 0   # number of past bookings
    total_nights: int = 0        # cumulative nights stayed
    member_since: Optional[date] = None
    preferred_room_type: Optional[str] = None

    def __repr__(self) -> str:
        return f"Guest({self.guest_id}, {self.name!r})"

    def is_returning(self) -> bool:
        """True if the guest has made at least one prior reservation."""
        return self.reservation_count > 0


@dataclass
class BookingRequest:
    """A request to create a reservation."""
    check_in: date
    check_out: date
    room_type: str
    num_guests: int = 1
    special_requests: str = ""


@dataclass
class RateCard:
    """Seasonal rate multipliers and deposit rules for the hotel."""
    seasonal_multipliers: dict[int, float]   # month (0-indexed) -> multiplier
    tax_rate: float = 0.12
    deposit_rate: float = 0.20
    min_deposit: float = 50.0


@dataclass
class HotelConfig:
    """Full configuration for the hotel pricing and policies."""
    hotel_name: str
    rate_card: RateCard
    loyalty_discounts: dict[str, float]      # tier -> discount fraction (e.g. 0.15 = 15% off)
    cancellation_window_days: int = 3
    max_advance_booking_days: int = 365

    def get_loyalty_discount(self, tier: str) -> float:
        """Return the discount fraction for a given loyalty tier."""
        return self.loyalty_discounts.get(tier, 0.0)


@dataclass
class Reservation:
    """A confirmed or pending hotel reservation."""
    reservation_id: str
    guest: Guest
    room: Room
    check_in: date
    check_out: date
    nights: int
    nightly_rate: float          # after seasonal + loyalty adjustments
    subtotal: float              # nightly_rate * nights
    tax: float
    total: float
    loyalty_tier: str
    loyalty_discount: float      # fraction (e.g. 0.15)
    seasonal_multiplier: float
    deposit_required: float
    status: str = "confirmed"    # "confirmed", "cancelled", "checked_in", "checked_out"
    notes: str = ""

    def __repr__(self) -> str:
        return (
            f"Reservation({self.reservation_id}, {self.guest.name!r}, "
            f"{self.room.room_type!r}, {self.check_in}→{self.check_out}, "
            f"${self.total:.2f})"
        )

    def summary(self) -> str:
        """Human-readable reservation summary."""
        lines = [
            f"Reservation ID: {self.reservation_id}",
            f"Guest: {self.guest.name}",
            f"Room: {self.room.room_number} ({self.room.room_type})",
            f"Check-in: {self.check_in}  Check-out: {self.check_out}",
            f"Nights: {self.nights}",
            f"Seasonal multiplier: {self.seasonal_multiplier:.2f}x",
            f"Loyalty tier: {self.loyalty_tier} ({self.loyalty_discount*100:.0f}% off)",
            f"Nightly rate: ${self.nightly_rate:.2f}",
            f"Subtotal: ${self.subtotal:.2f}",
            f"Tax ({12:.0f}%): ${self.tax:.2f}",
            f"Total: ${self.total:.2f}",
            f"Deposit required: ${self.deposit_required:.2f}",
        ]
        return "\n".join(lines)
