"""Data access layer for the order processing system.

Provides CRUD operations for all domain entities. In production
these would delegate to a database; here they use in-memory stores.
"""

from dao.order_dao import OrderDAO
from dao.product_dao import ProductDAO
from dao.customer_dao import CustomerDAO
from dao.inventory_dao import InventoryDAO

__all__ = ["OrderDAO", "ProductDAO", "CustomerDAO", "InventoryDAO"]
