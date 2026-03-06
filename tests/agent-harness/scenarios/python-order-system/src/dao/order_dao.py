"""Data access object for orders."""

import logging
from typing import Optional
from models.order import Order, OrderStatus

log = logging.getLogger(__name__)


class OrderDAO:
    """In-memory CRUD for Order objects, with audit logging."""

    def __init__(self) -> None:
        self._store: dict[str, Order] = {}
        self._audit: list[dict] = []

    def save(self, order: Order) -> Order:
        """Persist an order (insert or update)."""
        is_new = order.order_id not in self._store
        self._store[order.order_id] = order
        self._audit.append({
            "action": "insert" if is_new else "update",
            "order_id": order.order_id,
            "status": order.status.value,
        })
        log.debug("Saved order %s (status=%s)", order.order_id, order.status.value)
        return order

    def get(self, order_id: str) -> Optional[Order]:
        """Retrieve an order by ID."""
        return self._store.get(order_id)

    def list_by_customer(self, customer_id: str) -> list[Order]:
        """Return all orders for a specific customer."""
        return [o for o in self._store.values() if o.customer_id == customer_id]

    def list_by_status(self, status: OrderStatus) -> list[Order]:
        """Return all orders with the given status."""
        return [o for o in self._store.values() if o.status == status]

    def count(self) -> int:
        """Return total number of stored orders."""
        return len(self._store)

    def audit_log(self) -> list[dict]:
        """Return the full audit trail."""
        return list(self._audit)
