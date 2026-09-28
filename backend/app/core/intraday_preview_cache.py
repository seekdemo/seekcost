"""Process-local cache and single-flight refresh manager for intraday previews."""
import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


@dataclass
class CacheEntry:
    payload: dict | None = None
    cached_at: datetime | None = None
    refresh_started_at: datetime | None = None
    refresh_error: str | None = None
    last_accessed_at: datetime | None = None


class IntradayPreviewCache:
    """Keep the last useful preview visible while one replacement is built.

    Cache activity opportunistically removes inactive entries idle for the
    retention period. If the cache is still above ``max_entries``, it removes
    the least-recently-accessed inactive entries after their five-minute
    freshness/cooldown window. Active refreshes and entries in that window are
    deliberately retained, so the cache may briefly exceed the soft bound.
    """

    def __init__(
        self,
        ttl_seconds: int = 300,
        *,
        retention_seconds: int = 3600,
        max_entries: int = 256,
    ):
        if retention_seconds < ttl_seconds:
            raise ValueError("retention_seconds must be at least ttl_seconds")
        if max_entries < 1:
            raise ValueError("max_entries must be positive")
        self.ttl_seconds = ttl_seconds
        self.retention_seconds = retention_seconds
        self.max_entries = max_entries
        self._entries: dict[int, CacheEntry] = {}
        self._tasks: dict[int, asyncio.Task[None]] = {}

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _entry(self, user_id: int) -> CacheEntry:
        now = self._now()
        self._evict(now)
        entry = self._entries.setdefault(user_id, CacheEntry())
        entry.last_accessed_at = now
        self._evict(now, protected_user_id=user_id)
        return entry

    def _active_user_ids(self) -> set[int]:
        return {
            user_id
            for user_id, task in self._tasks.items()
            if not task.done()
        }

    def _within_cache_window(self, entry: CacheEntry, now: datetime) -> bool:
        ttl = timedelta(seconds=self.ttl_seconds)
        return (
            (entry.cached_at is not None and now - entry.cached_at < ttl)
            or (entry.refresh_started_at is not None and now - entry.refresh_started_at < ttl)
        )

    def _evict(self, now: datetime, protected_user_id: int | None = None) -> None:
        active_user_ids = self._active_user_ids()
        protected_user_ids = active_user_ids | ({protected_user_id} if protected_user_id is not None else set())
        retention = timedelta(seconds=self.retention_seconds)
        expired_user_ids = [
            user_id
            for user_id, entry in self._entries.items()
            if user_id not in protected_user_ids
            and entry.last_accessed_at is not None
            and now - entry.last_accessed_at >= retention
            and not self._within_cache_window(entry, now)
        ]
        for user_id in expired_user_ids:
            self._entries.pop(user_id, None)

        excess = len(self._entries) - self.max_entries
        if excess <= 0:
            return
        oldest_inactive = sorted(
            (
                (entry.last_accessed_at or datetime.min.replace(tzinfo=timezone.utc), user_id)
                for user_id, entry in self._entries.items()
                if user_id not in protected_user_ids and not self._within_cache_window(entry, now)
            ),
        )
        for _, user_id in oldest_inactive[:excess]:
            self._entries.pop(user_id, None)

    def store(self, user_id: int, payload: dict) -> None:
        entry = self._entry(user_id)
        entry.payload = payload
        entry.cached_at = entry.last_accessed_at
        entry.refresh_error = None

    def get(self, user_id: int) -> dict | None:
        now = self._now()
        self._evict(now)
        entry = self._entries.get(user_id)
        if entry is None:
            return None
        entry.last_accessed_at = now
        return entry.payload

    def is_fresh(self, user_id: int) -> bool:
        now = self._now()
        self._evict(now)
        entry = self._entries.get(user_id)
        if entry is None:
            return False
        entry.last_accessed_at = now
        return entry.cached_at is not None and now - entry.cached_at < timedelta(seconds=self.ttl_seconds)

    def _is_in_cooldown(self, entry: CacheEntry, now: datetime | None = None) -> bool:
        current_time = now or self._now()
        return (
            entry.refresh_started_at is not None
            and current_time - entry.refresh_started_at < timedelta(seconds=self.ttl_seconds)
        )

    def schedule(
        self,
        user_id: int,
        factory: Callable[[], Awaitable[dict]],
        *,
        force: bool = False,
    ) -> bool:
        task = self._tasks.get(user_id)
        if task is not None and not task.done():
            return False

        entry = self._entry(user_id)
        if self._is_in_cooldown(entry) and (force or entry.payload is not None):
            return False
        if not force and self.is_fresh(user_id):
            return False

        entry.refresh_started_at = self._now()
        entry.last_accessed_at = entry.refresh_started_at
        entry.refresh_error = None
        self._tasks[user_id] = asyncio.create_task(self._run(user_id, factory))
        return True

    async def _run(self, user_id: int, factory: Callable[[], Awaitable[dict]]) -> None:
        try:
            payload = await factory()
        except asyncio.CancelledError:
            raise
        except Exception as error:  # The task must not leak provider failures to the event loop.
            self._entry(user_id).refresh_error = str(error)[:160] or type(error).__name__
        else:
            self.store(user_id, payload)
        finally:
            current = asyncio.current_task()
            if self._tasks.get(user_id) is current:
                self._tasks.pop(user_id, None)

    def status(self, user_id: int) -> dict:
        now = self._now()
        self._evict(now)
        entry = self._entries.get(user_id)
        if entry is None:
            entry = CacheEntry()
        else:
            entry.last_accessed_at = now
        task = self._tasks.get(user_id)
        return {
            "refreshing": task is not None and not task.done(),
            "cached_at": entry.cached_at.isoformat() if entry.cached_at else None,
            "refresh_started_at": entry.refresh_started_at.isoformat() if entry.refresh_started_at else None,
            "refresh_error": entry.refresh_error,
        }

    async def wait(self, user_id: int) -> None:
        task = self._tasks.get(user_id)
        if task is not None:
            await task

    def clear(self, user_id: int | None = None) -> None:
        user_ids = [user_id] if user_id is not None else list(set(self._entries) | set(self._tasks))
        for current_user_id in user_ids:
            task = self._tasks.pop(current_user_id, None)
            if task is not None and not task.done():
                task.cancel()
            self._entries.pop(current_user_id, None)
