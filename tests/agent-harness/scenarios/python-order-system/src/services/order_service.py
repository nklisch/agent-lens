"""Order orchestration service.

The create_order() method is the central entry point for order processing.
It coordinates between pricing, inventory, and event publishing.
"""

import logging
import uuid
from dao.order_dao import OrderDAO
from dao.product_dao import ProductDAO
from dao.customer_dao import CustomerDAO
from events import EventBus
from models.order import Order, OrderItem, OrderStatus
from services.pricing_service import PricingService
from services.inventory_service import InventoryService

log = logging.getLogger(__name__)


class OrderService:
    """Creates and manages customer orders."""

    def __init__(
        self,
        order_dao: OrderDAO,
        product_dao: ProductDAO,
        customer_dao: CustomerDAO,
        pricing_service: PricingService,
        inventory_service: InventoryService,
        events: EventBus,
    ) -> None:
        self.order_dao = order_dao
        self.product_dao = product_dao
        self.customer_dao = customer_dao
        self.pricing_service = pricing_service
        self.inventory_service = inventory_service
        self.events = events

    def create_order(self, customer_id: str, items: list[dict]) -> Order:
        """Create and process a new order.

        Args:
            customer_id: The ID of the placing customer.
            items: List of {"sku": str, "quantity": int} dicts.

        Returns:
            The created Order (status depends on processing outcome).
        """
        order = self._build_order(customer_id, items)
        order.total = self.pricing_service.calculate_total(order)

        self.events.publish("order_created", order)

        try:
            self.inventory_service.reserve_stock(order)
        except ValueError as exc:
            log.error("Stock reservation failed for order %s: %s", order.order_id, exc)
            order.status = OrderStatus.FAILED_INVENTORY

        self.order_dao.save(order)
        return order

    def _build_order(self, customer_id: str, items: list[dict]) -> Order:
        """Construct an Order from raw customer/items data."""
        customer = self.customer_dao.get(customer_id)
        if customer is None:
            raise ValueError(f"Customer not found: {customer_id!r}")

        order_id = f"ORD-{uuid.uuid4().hex[:8].upper()}"
        order_items = []
        for item_data in items:
            sku = item_data["sku"]
            quantity = item_data["quantity"]
            unit_price = self.pricing_service.get_product_price(sku)
            order_items.append(OrderItem(
                sku=sku,
                quantity=quantity,
                unit_price=unit_price,
            ))

        return Order(
            order_id=order_id,
            customer_id=customer_id,
            items=order_items,
            status=OrderStatus.PENDING,
        )

    def cancel_order(self, order_id: str) -> Order:
        """Cancel an existing order and release its inventory."""
        order = self.order_dao.get(order_id)
        if order is None:
            raise ValueError(f"Order not found: {order_id!r}")
        if order.status == OrderStatus.SHIPPED:
            raise ValueError(f"Cannot cancel shipped order {order_id!r}")

        self.inventory_service.release_reservation(order_id)
        order.status = OrderStatus.CANCELLED
        self.order_dao.save(order)
        return order

    def get_order(self, order_id: str) -> Order:
        """Retrieve an order by ID."""
        order = self.order_dao.get(order_id)
        if order is None:
            raise ValueError(f"Order not found: {order_id!r}")
        return order
