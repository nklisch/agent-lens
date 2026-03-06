"""Computation result cache with TTL-based expiry.

Caches metric computation results to avoid redundant processing
when the same query is issued multiple times within a short window.

The cache is intentionally simple — it's an in-process dict with
time-based expiry. Production usage would use Redis or Memcached.
"""

import time
from typing import Any, Optional


class TTLCache:
    """A simple time-to-live cache backed by a Python dict.

    Each entry stores (expiry_timestamp, value). On get(), expired
    entries are evicted. On set(), the TTL is reset.

    This cache is a plausible source of stale data issues — if a
    computation is cached, subsequent runs within the TTL window
    will return the cached result even if inputs have changed.
    Always check whether caching is the source of unexpected values.
    """

    def __init__(self, default_ttl: float = 60.0):
        """Initialize the cache.

        Args:
            default_ttl: Default time-to-live in seconds for cache entries.
        """
        self._store: dict[str, tuple[float, Any]] = {}
        self._default_ttl = default_ttl
        self._hit_count = 0
        self._miss_count = 0

    def get(self, key: str) -> Optional[Any]:
        """Retrieve a cached value.

        Returns None if the key is not found or has expired.
        Expired entries are removed on access.

        Args:
            key: Cache key.

        Returns:
            The cached value, or None if not present or expired.
        """
        if key in self._store:
            expiry, value = self._store[key]
            if time.time() < expiry:
                self._hit_count += 1
                return value
            # Expired — evict
            del self._store[key]

        self._miss_count += 1
        return None

    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        """Store a value in the cache.

        Args:
            key: Cache key.
            value: Value to store.
            ttl: Time-to-live in seconds. Uses default_ttl if not specified.
        """
        t = ttl if ttl is not None else self._default_ttl
        self._store[key] = (time.time() + t, value)

    def invalidate(self, key: str) -> bool:
        """Remove a specific entry from the cache.

        Args:
            key: Cache key to remove.

        Returns:
            True if the key existed and was removed; False otherwise.
        """
        if key in self._store:
            del self._store[key]
            return True
        return False

    def clear(self) -> None:
        """Remove all entries from the cache."""
        self._store.clear()

    def evict_expired(self) -> int:
        """Remove all expired entries.

        Returns:
            The number of entries removed.
        """
        now = time.time()
        expired_keys = [k for k, (expiry, _) in self._store.items() if now >= expiry]
        for k in expired_keys:
            del self._store[k]
        return len(expired_keys)

    def stats(self) -> dict[str, int]:
        """Return cache hit/miss statistics."""
        return {
            "hits": self._hit_count,
            "misses": self._miss_count,
            "size": len(self._store),
        }

    def __len__(self) -> int:
        return len(self._store)

    def __contains__(self, key: str) -> bool:
        entry = self.get(key)
        return entry is not None
