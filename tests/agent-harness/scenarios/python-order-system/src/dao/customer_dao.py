"""Data access object for customers."""

import logging
from typing import Optional
from models.customer import Customer

log = logging.getLogger(__name__)


class CustomerDAO:
    """In-memory CRUD for Customer objects."""

    def __init__(self) -> None:
        self._store: dict[str, Customer] = {}

    def save(self, customer: Customer) -> Customer:
        """Add or update a customer."""
        self._store[customer.customer_id] = customer
        return customer

    def get(self, customer_id: str) -> Optional[Customer]:
        """Retrieve a customer by ID."""
        return self._store.get(customer_id)

    def find_by_email(self, email: str) -> Optional[Customer]:
        """Find a customer by email address (case-insensitive)."""
        email_lower = email.lower()
        for customer in self._store.values():
            if customer.email.lower() == email_lower:
                return customer
        return None

    def list_by_tier(self, tier_value: str) -> list[Customer]:
        """Return all customers at the given loyalty tier."""
        from models.customer import LoyaltyTier
        try:
            tier = LoyaltyTier(tier_value)
        except ValueError:
            return []
        return [c for c in self._store.values() if c.loyalty_tier == tier]

    def count(self) -> int:
        """Return total number of stored customers."""
        return len(self._store)
