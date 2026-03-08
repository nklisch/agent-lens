"""Inventory management service."""

import logging
from typing import Optional
from dao.inventory_dao import InventoryDAO, InventoryReservation
from dao.product_dao import ProductDAO
from models.order import Order

log = logging.getLogger(__name__)


class InventoryService:
    """Manages stock levels and order reservations."""

    def __init__(self, inventory_dao: InventoryDAO, product_dao: ProductDAO) -> None:
        self.inventory_dao = inventory_dao
        self.product_dao = product_dao

    def check_availability(self, sku: str, quantity: int) -> bool:
        """Return True if sufficient stock is available."""
        product = self.product_dao.get(sku)
        if product is None:
            log.warning("Product not found during availability check: %s", sku)
            return False
        return product.is_in_stock(quantity)

    def reserve_stock(self, order: Order) -> InventoryReservation:
        """Create an inventory reservation for all items in an order.

        Decrements stock for each item and stores a reservation record.
        Raises ValueError if any item is out of stock.
        """
        # Validate availability first
        for item in order.items:
            if not self.check_availability(item.sku, item.quantity):
                raise ValueError(
                    f"Insufficient stock for {item.sku!r} "
                    f"(requested {item.quantity})"
                )

        # Decrement stock for each item
        for item in order.items:
            self.product_dao.decrement_stock(item.sku, item.quantity)

        # Create and store the reservation
        reservation = InventoryReservation(
            order_id=order.order_id,
            items=[{"sku": i.sku, "quantity": i.quantity} for i in order.items],
        )
        self.inventory_dao.save_reservation(reservation)
        log.info("Reserved stock for order %s", order.order_id)
        return reservation

    def get_reservation(self, order_id: str) -> Optional[InventoryReservation]:
        """Return the reservation for an order, or None if not found."""
        return self.inventory_dao.get_reservation(order_id)

    def release_reservation(self, order_id: str) -> bool:
        """Release an inventory reservation and restore stock.

        Returns True if a reservation existed and was released.
        """
        reservation = self.inventory_dao.get_reservation(order_id)
        if reservation is None:
            log.warning("No reservation found for order %s to release", order_id)
            return False

        for item_data in reservation.items:
            product = self.product_dao.get(item_data["sku"])
            if product:
                product.stock += item_data["quantity"]

        self.inventory_dao.delete_reservation(order_id)
        log.info("Released reservation for order %s", order_id)
        return True

    def validate_inventory(self, order: Order) -> list[str]:
        """Validate that all order items have sufficient stock.

        Returns a list of error messages. An empty list means all items
        are available.
        """
        errors = []
        for item in order.items:
            product = self.product_dao.get(item.sku)
            if product is None:
                errors.append(f"Product {item.sku!r} not found")
            elif product.stock < item.quantity:
                errors.append(
                    f"{item.sku!r}: requested {item.quantity}, "
                    f"only {product.stock} in stock"
                )
        return errors
