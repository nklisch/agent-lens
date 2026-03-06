"""Room catalog for the Downtown Grand hotel.

Provides the room inventory and lookup utilities for finding rooms
by type, floor, accessibility requirements, and occupancy limits.
"""

from models import Room


# ---------------------------------------------------------------------------
# Room inventory
# ---------------------------------------------------------------------------

ROOM_CATALOG: list[Room] = [
    # Standard rooms — floors 2-4
    Room("201", "standard", 2, 2, 100.00, ["wifi", "tv"], False),
    Room("202", "standard", 2, 2, 100.00, ["wifi", "tv"], False),
    Room("203", "standard", 2, 2, 100.00, ["wifi", "tv"], True),
    Room("301", "standard", 3, 2, 100.00, ["wifi", "tv", "minibar"], False),
    Room("302", "standard", 3, 2, 100.00, ["wifi", "tv", "minibar"], False),
    Room("401", "standard", 4, 2, 100.00, ["wifi", "tv", "minibar"], False),
    Room("402", "standard", 4, 2, 100.00, ["wifi", "tv", "minibar"], True),

    # Deluxe rooms — floors 5-7
    Room("501", "deluxe", 5, 3, 150.00, ["wifi", "tv", "minibar", "balcony"], False),
    Room("502", "deluxe", 5, 3, 150.00, ["wifi", "tv", "minibar", "balcony"], False),
    Room("503", "deluxe", 5, 3, 150.00, ["wifi", "tv", "minibar", "balcony"], True),
    Room("601", "deluxe", 6, 3, 150.00, ["wifi", "tv", "minibar", "balcony", "city_view"], False),
    Room("602", "deluxe", 6, 3, 150.00, ["wifi", "tv", "minibar", "balcony", "city_view"], False),
    Room("701", "deluxe", 7, 3, 150.00, ["wifi", "tv", "minibar", "balcony", "city_view"], False),

    # Suites — floor 8+
    Room("801", "suite", 8, 4, 280.00, ["wifi", "tv", "minibar", "balcony", "kitchenette", "jacuzzi"], False),
    Room("802", "suite", 8, 4, 280.00, ["wifi", "tv", "minibar", "balcony", "kitchenette", "jacuzzi"], True),
    Room("901", "suite", 9, 6, 350.00, ["wifi", "tv", "minibar", "balcony", "kitchenette", "jacuzzi", "living_room"], False),
]


def get_rooms_by_type(room_type: str) -> list[Room]:
    """Return all rooms of the given type."""
    return [r for r in ROOM_CATALOG if r.room_type == room_type]


def get_room_by_number(room_number: str) -> Room | None:
    """Look up a specific room by its number."""
    for room in ROOM_CATALOG:
        if room.room_number == room_number:
            return room
    return None


def get_accessible_rooms(room_type: str | None = None) -> list[Room]:
    """Return all ADA-accessible rooms, optionally filtered by type."""
    rooms = [r for r in ROOM_CATALOG if r.is_accessible]
    if room_type:
        rooms = [r for r in rooms if r.room_type == room_type]
    return rooms


def get_available_room(room_type: str, num_guests: int = 1) -> Room | None:
    """Find the first room matching the type and occupancy requirements.

    In production this would check actual availability; here we return
    the first matching room from the catalog.
    """
    for room in ROOM_CATALOG:
        if room.room_type == room_type and room.max_occupancy >= num_guests:
            return room
    return None


def describe_room(room: Room) -> str:
    """Return a formatted description of a room."""
    amenity_list = ", ".join(room.amenities) if room.amenities else "none"
    accessible_tag = " [ADA accessible]" if room.is_accessible else ""
    return (
        f"Room {room.room_number} ({room.room_type.title()}, Floor {room.floor}){accessible_tag}\n"
        f"  Max occupancy: {room.max_occupancy} guests\n"
        f"  Base rate: ${room.base_rate:.2f}/night\n"
        f"  Amenities: {amenity_list}"
    )


def get_base_rate(room_type: str) -> float:
    """Return the base nightly rate for a room type.

    Uses the first room of that type as the canonical rate.
    Raises ValueError if the type is not found.
    """
    rooms = get_rooms_by_type(room_type)
    if not rooms:
        raise ValueError(f"Unknown room type: {room_type!r}")
    return rooms[0].base_rate
