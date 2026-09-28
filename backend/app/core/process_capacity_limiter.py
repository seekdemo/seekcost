"""Event-loop-independent process-wide capacity limits for async work."""
import asyncio
import threading
from collections import deque
from dataclasses import dataclass


@dataclass
class _Waiter:
    loop: asyncio.AbstractEventLoop
    future: asyncio.Future[None]
    granted: bool = False
    cancelled: bool = False


class ProcessCapacityLimiter:
    """Limit async work across every event loop in the current process."""

    def __init__(self, capacity: int):
        if capacity < 1:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self._active = 0
        self._lock = threading.Lock()
        self._waiters: deque[_Waiter] = deque()

    async def acquire(self) -> None:
        loop = asyncio.get_running_loop()
        waiter = _Waiter(loop=loop, future=loop.create_future())
        with self._lock:
            if self._active < self.capacity and not self._waiters:
                self._active += 1
                waiter.granted = True
            else:
                self._waiters.append(waiter)
        if waiter.granted:
            return

        try:
            await waiter.future
        except BaseException:
            with self._lock:
                waiter.cancelled = True
                if waiter.granted:
                    self._release_locked()
            raise

    def release(self) -> None:
        with self._lock:
            if self._active < 1:
                raise RuntimeError("capacity limiter released too many times")
            self._release_locked()

    def _release_locked(self) -> None:
        while self._waiters:
            waiter = self._waiters.popleft()
            if waiter.cancelled:
                continue
            waiter.granted = True
            try:
                waiter.loop.call_soon_threadsafe(self._deliver, waiter)
            except RuntimeError:
                waiter.cancelled = True
                waiter.granted = False
                continue
            return
        self._active -= 1

    @staticmethod
    def _deliver(waiter: _Waiter) -> None:
        if not waiter.cancelled and not waiter.future.done():
            waiter.future.set_result(None)

    async def __aenter__(self) -> "ProcessCapacityLimiter":
        await self.acquire()
        return self

    async def __aexit__(self, *_exc_info: object) -> None:
        self.release()
