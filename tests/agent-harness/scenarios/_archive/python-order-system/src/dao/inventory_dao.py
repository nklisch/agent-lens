"""Data access object for inventory reservations."""

import logging
from typing import Optional

log = logging.getLogger(__name__)


class InventoryReservation:
    """An active inventory reservation for an order."""
    def __init__(self, order_id: str, items: list[dict]) -> None:
        self.order_id = order_id
        self.items = items  # [{"sku": str, "quantity": int}]

    def __repr__(self) -> str:
        return f"InventoryReservation({self.order_id!r}, items={len(self.items)})"


class InventoryDAO:
    """In-memory store for inventory reservations."""

    def __init__(self) -> None:
        self._reservations: dict[str, InventoryReservation] = {}

    def save_reservation(self, reservation: InventoryReservation) -> InventoryReservation:
        """Store a new reservation."""
        self._reservations[reservation.order_id] = reservation
        log.debug("Stored reservation for order %s", reservation.order_id)
        return reservation

    def get_reservation(self, order_id: str) -> Optional[InventoryReservation]:
        """Look up a reservation by order ID.

        Returns None if no reservation exists for this order.
        """
        return self._reservations.get(order_id)

    def delete_reservation(self, order_id: str) -> bool:
        """Remove a reservation. Returns True if it existed."""
        if order_id in self._reservations:
            del self._reservations[order_id]
            return True
        return False

    def list_active(self) -> list[InventoryReservation]:
        """Return all active reservations."""
        return list(self._reservations.values())

    def has_reservation(self, order_id: str) -> bool:
        """Return True if a reservation exists for the order."""
        return order_id in self._reservations
