"""Notification service for order events."""

import logging
from functools import wraps
from time import sleep
from typing import Callable, Any

log = logging.getLogger(__name__)


def retry_with_backoff(max_attempts: int = 3, delay: float = 0.01) -> Callable:
    """Decorator: retry a function up to max_attempts times on exception."""
    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            last_exc = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except Exception as exc:
                    last_exc = exc
                    log.warning(
                        "%s failed (attempt %d/%d): %s",
                        fn.__name__, attempt, max_attempts, exc,
                    )
                    if attempt < max_attempts:
                        sleep(delay)
            raise last_exc
        return wrapper
    return decorator


class NotificationService:
    """Sends order status notifications (email/webhook simulated)."""

    def __init__(self) -> None:
        self._sent: list[dict] = []

    @retry_with_backoff(max_attempts=3, delay=0.001)
    def send(self, notification_type: str, recipient: str, payload: dict) -> bool:
        """Send a notification.

        Args:
            notification_type: "order_confirmed", "order_failed", etc.
            recipient: Email address or webhook URL.
            payload: Notification data.

        Returns:
            True if sent successfully.
        """
        self._sent.append({
            "type": notification_type,
            "recipient": recipient,
            "payload": payload,
        })
        log.info("Sent %r notification to %s", notification_type, recipient)
        return True

    def notify_order_confirmed(self, order_id: str, customer_email: str, total: float) -> None:
        """Send an order confirmation notification."""
        self.send("order_confirmed", customer_email, {
            "order_id": order_id,
            "total": total,
        })

    def notify_order_failed(self, order_id: str, customer_email: str, reason: str) -> None:
        """Send an order failure notification."""
        self.send("order_failed", customer_email, {
            "order_id": order_id,
            "reason": reason,
        })

    def sent_count(self) -> int:
        """Return the number of notifications sent."""
        return len(self._sent)

    def get_sent(self) -> list[dict]:
        """Return all sent notifications (for testing)."""
        return list(self._sent)
