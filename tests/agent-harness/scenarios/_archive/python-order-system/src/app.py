"""Application factory — wires together all system components.

create_app() assembles the full dependency graph:
  DAOs → Services → Workers → Event subscriptions

All test code should use create_app() to get a properly configured
system instance. Do not create DAOs or services directly in tests.
"""

import logging
from dao.order_dao import OrderDAO
from dao.product_dao import ProductDAO
from dao.customer_dao import CustomerDAO
from dao.inventory_dao import InventoryDAO
from services.order_service import OrderService
from services.pricing_service import PricingService
from services.inventory_service import InventoryService
from services.notification_service import NotificationService
from events import EventBus
from worker import OrderWorker
from config import load_config
from models.customer import Customer, LoyaltyTier
from models.product import Product

log = logging.getLogger(__name__)


class App:
    """The assembled application, exposing the main operations."""

    def __init__(
        self,
        order_service: OrderService,
        pricing_service: PricingService,
        inventory_service: InventoryService,
        notification_service: NotificationService,
        order_dao: OrderDAO,
        product_dao: ProductDAO,
        customer_dao: CustomerDAO,
        inventory_dao: InventoryDAO,
        event_bus: EventBus,
        worker: OrderWorker,
    ) -> None:
        self.order_service = order_service
        self.pricing_service = pricing_service
        self.inventory_service = inventory_service
        self.notification_service = notification_service
        self.order_dao = order_dao
        self.product_dao = product_dao
        self.customer_dao = customer_dao
        self.inventory_dao = inventory_dao
        self.event_bus = event_bus
        self.worker = worker

    def place_order(self, customer_id: str, items: list[dict]):
        """Place an order and return the resulting Order object."""
        return self.order_service.create_order(customer_id, items)


def create_app() -> App:
    """Assemble and return a fully configured application instance."""
    load_config()

    # DAOs
    order_dao = OrderDAO()
    product_dao = ProductDAO()
    customer_dao = CustomerDAO()
    inventory_dao = InventoryDAO()

    # Infrastructure
    event_bus = EventBus()

    # Services
    pricing_service = PricingService(product_dao, customer_dao)
    inventory_service = InventoryService(inventory_dao, product_dao)
    notification_service = NotificationService()
    order_service = OrderService(
        order_dao=order_dao,
        product_dao=product_dao,
        customer_dao=customer_dao,
        pricing_service=pricing_service,
        inventory_service=inventory_service,
        events=event_bus,
    )

    # Worker
    worker = OrderWorker(order_dao, inventory_service)
    event_bus.subscribe("order_created", worker.on_order_created)

    # Seed test data
    _seed_test_data(customer_dao, product_dao)

    return App(
        order_service=order_service,
        pricing_service=pricing_service,
        inventory_service=inventory_service,
        notification_service=notification_service,
        order_dao=order_dao,
        product_dao=product_dao,
        customer_dao=customer_dao,
        inventory_dao=inventory_dao,
        event_bus=event_bus,
        worker=worker,
    )


def _seed_test_data(customer_dao: CustomerDAO, product_dao: ProductDAO) -> None:
    """Populate the in-memory stores with test customers and products."""
    # Customers
    customer_dao.save(Customer(
        customer_id="CUST-001",
        name="Acme Corp",
        email="orders@acme.com",
        loyalty_tier=LoyaltyTier.GOLD,
        total_orders=42,
        total_spend=15000.0,
    ))
    customer_dao.save(Customer(
        customer_id="CUST-002",
        name="Bob Smith",
        email="bob@example.com",
        loyalty_tier=LoyaltyTier.STANDARD,
        total_orders=2,
    ))

    # Products
    product_dao.save(Product(
        sku="WIDGET-1",
        name="Premium Widget",
        category="electronics",
        price=25.00,
        stock=100,
        weight_kg=0.5,
    ))
    product_dao.save(Product(
        sku="GADGET-1",
        name="Basic Gadget",
        category="accessories",
        price=15.00,
        stock=50,
        weight_kg=0.2,
    ))
    product_dao.save(Product(
        sku="SERVICE-1",
        name="Annual Support",
        category="services",
        price=99.00,
        stock=999,
        weight_kg=0.0,
    ))
