"""Background order worker — processes order_created events.

The worker is registered as a subscriber to the "order_created" event.
Because the event bus is synchronous, on_order_created() runs inline
during order_service.create_order(), before that method returns.
"""

import logging
from dao.order_dao import OrderDAO
from services.inventory_service import InventoryService
from models.order import Order, OrderStatus

log = logging.getLogger(__name__)


class OrderWorker:
    """Handles post-creation order processing."""

    def __init__(
        self,
        order_dao: OrderDAO,
        inventory_service: InventoryService,
    ) -> None:
        self.order_dao = order_dao
        self.inventory_service = inventory_service

    def on_order_created(self, order: Order) -> None:
        """Confirm the inventory reservation for a newly created order.

        Looks up the reservation for the order. If found, marks CONFIRMED.
        If no reservation exists, marks FAILED_INVENTORY.

        Args:
            order: The newly created order.
        """
        reservation = self.inventory_service.get_reservation(order.order_id)
        if reservation is None:
            # Reservation not found — likely a timing/ordering issue
            log.error(
                "No inventory reservation found for order %s at confirmation time",
                order.order_id,
            )
            order.status = OrderStatus.FAILED_INVENTORY
            self.order_dao.save(order)
            return

        # Reservation confirmed
        order.status = OrderStatus.CONFIRMED
        self.order_dao.save(order)
        log.info("Order %s confirmed (reservation: %s items)", order.order_id, len(reservation.items))

    def process_batch(self, order_ids: list[str]) -> dict[str, str]:
        """Process a batch of orders, returning {order_id: new_status} map."""
        results = {}
        for order_id in order_ids:
            order = self.order_dao.get(order_id)
            if order is None:
                log.warning("Order %s not found in batch processing", order_id)
                continue
            if order.status == OrderStatus.PENDING:
                self.on_order_created(order)
            results[order_id] = order.status.value
        return results
