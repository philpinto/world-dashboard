"""In-memory TTL cache for collector data."""

import time
from typing import Any, Dict, Optional, Tuple


class TTLCache:
    """Simple dict-based cache with per-key TTL expiry."""

    def __init__(self):
        self._store: Dict[str, Tuple[Any, float]] = {}

    def get(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.time() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl: int):
        self._store[key] = (value, time.time() + ttl)

    def age(self, key: str) -> Optional[float]:
        """Seconds since the value was cached. None if missing/expired."""
        entry = self._store.get(key)
        if entry is None:
            return None
        _, expires_at = entry
        ttl_remaining = expires_at - time.time()
        if ttl_remaining < 0:
            del self._store[key]
            return None
        # We don't store insertion time, so approximate from TTL
        return None

    def info(self, key: str) -> dict:
        """Return cache status for a key."""
        entry = self._store.get(key)
        if entry is None:
            return {"status": "empty", "ttl_remaining": 0}
        value, expires_at = entry
        remaining = expires_at - time.time()
        if remaining < 0:
            del self._store[key]
            return {"status": "expired", "ttl_remaining": 0}
        return {"status": "cached", "ttl_remaining": round(remaining, 1)}


cache = TTLCache()
