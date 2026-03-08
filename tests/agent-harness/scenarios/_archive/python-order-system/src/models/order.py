"""Order and OrderItem domain models."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class OrderStatus(Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    FAILED_INVENTORY = "failed_inventory"
    FAILED_PAYMENT = "failed_payment"
    CANCELLED = "cancelled"
    SHIPPED = "shipped"


@dataclass
class OrderItem:
    """A single line item in an order."""
    sku: str
    quantity: int
    unit_price: float
    line_total: float = 0.0

    def __post_init__(self) -> None:
        if self.line_total == 0.0:
            self.line_total = round(self.unit_price * self.quantity, 2)

    def __repr__(self) -> str:
        return f"OrderItem({self.sku!r}, qty={self.quantity}, ${self.unit_price:.2f})"


@dataclass
class Order:
    """A customer order with line items and pricing details."""
    order_id: str
    customer_id: str
    items: list[OrderItem] = field(default_factory=list)
    subtotal: float = 0.0
    discount_amount: float = 0.0
    tax: float = 0.0
    total: float = 0.0
    status: OrderStatus = OrderStatus.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    notes: str = ""

    def __repr__(self) -> str:
        return f"Order({self.order_id!r}, {self.customer_id!r}, ${self.total:.2f}, {self.status.value})"

    def item_count(self) -> int:
        """Return total quantity across all line items."""
        return sum(item.quantity for item in self.items)

    def recalculate_subtotal(self) -> None:
        """Recompute subtotal from current line items."""
        self.subtotal = round(sum(item.line_total for item in self.items), 2)
