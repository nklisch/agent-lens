"""Product and pricing domain models."""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class PriceEntry:
    """A price record for a product, with effective date tracking."""
    amount: float
    currency: str = "USD"
    effective_date: Optional[datetime] = None

    def __repr__(self) -> str:
        return f"PriceEntry(${self.amount:.2f} {self.currency})"


@dataclass
class Product:
    """A product in the catalog."""
    sku: str
    name: str
    category: str       # e.g. "electronics", "accessories", "services"
    price: float
    stock: int = 0
    description: str = ""
    weight_kg: float = 0.0

    def __repr__(self) -> str:
        return f"Product({self.sku!r}, {self.name!r}, ${self.price:.2f})"

    def is_in_stock(self, quantity: int = 1) -> bool:
        """Return True if at least `quantity` units are available."""
        return self.stock >= quantity

    def available_stock(self) -> int:
        """Return the current available stock count."""
        return self.stock
