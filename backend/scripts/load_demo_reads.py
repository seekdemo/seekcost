"""Bounded local read-only load baseline. Credentials supplied through environment."""
import asyncio
import json
import os
import time
import httpx


async def main():
    base = "http://127.0.0.1:3000/api/v1"
    async with httpx.AsyncClient(timeout=10, limits=httpx.Limits(max_connections=20)) as client:
        login = await client.post(base + "/auth/login", json={
            "username": os.environ["LOAD_USERNAME"], "password": os.environ["LOAD_PASSWORD"]})
        login.raise_for_status()
        headers = {"Authorization": "Bearer " + login.json()["access_token"]}
        paths = ["/watchlist/stocks", "/research-guides", "/alerts/notifications", "/auth/me"]
        for path in paths:
            (await client.get(base + path, headers=headers)).raise_for_status()
        for concurrency in (1, 5, 10, 20):
            semaphore = asyncio.Semaphore(concurrency)
            elapsed, errors = [], []
            async def request(index):
                async with semaphore:
                    started = time.perf_counter()
                    try:
                        response = await client.get(base + paths[index % len(paths)], headers=headers)
                        response.raise_for_status()
                        body = response.json()
                        if index % len(paths) == 0 and len(body) != 346:
                            raise ValueError("Unexpected watchlist count")
                    except Exception as exc:
                        errors.append(type(exc).__name__)
                    elapsed.append((time.perf_counter() - started) * 1000)
            started = time.perf_counter()
            await asyncio.gather(*(request(i) for i in range(100)))
            duration = time.perf_counter() - started
            elapsed.sort()
            print(json.dumps(dict(concurrency=concurrency, requests=100, errors=len(errors),
                                  p50_ms=round(elapsed[49], 1), p95_ms=round(elapsed[94], 1),
                                  max_ms=round(elapsed[-1], 1), requests_per_second=round(100/duration, 1))), flush=True)
            if errors:
                raise SystemExit("Stopping load test after request errors")


if __name__ == "__main__":
    asyncio.run(main())
