"""Customer and loyalty tier domain models."""

from dataclasses import dataclass
from enum import Enum
from typing import Optional
from datetime import date


class LoyaltyTier(Enum):
    STANDARD = "standard"
    BRONZE = "bronze"
    SILVER = "silver"
    GOLD = "gold"


@dataclass
class Customer:
    """A registered customer with loyalty information."""
    customer_id: str
    name: str
    email: str
    loyalty_tier: LoyaltyTier = LoyaltyTier.STANDARD
    total_orders: int = 0
    total_spend: float = 0.0
    member_since: Optional[date] = None

    def __repr__(self) -> str:
        return f"Customer({self.customer_id!r}, {self.name!r}, {self.loyalty_tier.value})"

    def is_gold(self) -> bool:
        return self.loyalty_tier == LoyaltyTier.GOLD

    def is_premium(self) -> bool:
        return self.loyalty_tier in (LoyaltyTier.SILVER, LoyaltyTier.GOLD)
