"""Synchronous in-process event bus for the order processing system.

Events are dispatched synchronously — subscriber callbacks execute
inline within the publish() call. This means any side effects from
subscribers happen BEFORE publish() returns.

When debugging subscriber failures, note that the callback runs
inside the publish() call stack, not in a background thread.
"""

import logging
from typing import Any, Callable

log = logging.getLogger(__name__)


class EventBus:
    """Simple synchronous pub/sub event bus."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[Callable]] = {}

    def subscribe(self, event_name: str, handler: Callable) -> None:
        """Register a handler for an event type."""
        if event_name not in self._subscribers:
            self._subscribers[event_name] = []
        self._subscribers[event_name].append(handler)
        log.debug("Subscribed %s to event %r", handler.__name__, event_name)

    def publish(self, event_name: str, payload: Any) -> int:
        """Dispatch an event to all registered handlers.

        Handlers are called synchronously in registration order.
        Errors in handlers are logged but do not prevent other
        handlers from running.

        Args:
            event_name: The event type identifier.
            payload: Data passed to each handler.

        Returns:
            Number of handlers that were called.
        """
        handlers = self._subscribers.get(event_name, [])
        called = 0
        for handler in handlers:
            try:
                handler(payload)
                called += 1
            except Exception as exc:
                log.error(
                    "Handler %s failed for event %r: %s",
                    handler.__name__, event_name, exc,
                    exc_info=True,
                )
        return called

    def subscriber_count(self, event_name: str) -> int:
        """Return the number of registered handlers for an event."""
        return len(self._subscribers.get(event_name, []))
