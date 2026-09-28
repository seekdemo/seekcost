"""Bounded public-web favicon discovery. No ambient proxies, cookies or redirects."""
import asyncio
import base64
import ipaddress
import socket
import time
from collections import OrderedDict
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx

LIMIT = 262144
_slots = asyncio.Semaphore(4)
_cache = OrderedDict()


class IconLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        rel = (values.get("rel") or "").lower().split()
        if tag == "link" and ("icon" in rel or "apple-touch-icon" in rel) and values.get("href"):
            self.links.append(values["href"])


async def public_target(url):
    parts = urlsplit(url)
    if (parts.scheme not in {"https", "http"} or not parts.hostname or parts.username
            or parts.password or parts.port not in {None, 80, 443} or len(url) > 2048):
        raise ValueError("Unsupported icon URL")
    host = parts.hostname.encode("idna").decode("ascii")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    addresses = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    ips = [row[4][0] for row in addresses]
    if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
        raise ValueError("Non-public destination")
    return httpx.URL(url).copy_with(host=ips[0]), parts.netloc, host


async def fetch_public(url):
    for _ in range(4):
        pinned, authority, hostname = await public_target(url)
        async with httpx.AsyncClient(timeout=3, trust_env=False, follow_redirects=False) as client:
            async with client.stream("GET", pinned, headers={"Host": authority,
                    "User-Agent": "SeekCost-Icon/1.0", "Accept-Encoding": "identity"},
                    extensions={"sni_hostname": hostname}) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        raise ValueError("Redirect missing location")
                    url = urljoin(url, location)
                    continue
                response.raise_for_status()
                if response.headers.get("content-encoding", "identity").lower() != "identity":
                    raise ValueError("Compressed response refused")
                if int(response.headers.get("content-length", "0")) > LIMIT:
                    raise ValueError("Icon response too large")
                data = bytearray()
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    data.extend(chunk)
                    if len(data) > LIMIT:
                        raise ValueError("Icon response too large")
                return bytes(data), url
    raise ValueError("Too many redirects")


def raster_data(data):
    # Never return SVG/HTML or other active content supplied by a remote site.
    mime = None
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        mime = "image/png"
    elif data.startswith(b"\x00\x00\x01\x00"):
        mime = "image/x-icon"
    elif data.startswith(b"\xff\xd8\xff"):
        mime = "image/jpeg"
    elif data.startswith((b"GIF87a", b"GIF89a")):
        mime = "image/gif"
    elif data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        mime = "image/webp"
    return f"data:{mime};base64,{base64.b64encode(data).decode()}" if mime else None


async def discover_icon(url, direct=False):
    key = (url, direct)
    cached = _cache.get(key)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    result = None
    try:
        async with asyncio.timeout(8):
            async with _slots:
                if direct:
                    result = raster_data((await fetch_public(url))[0])
                else:
                    candidates = []
                    try:
                        body, final = await fetch_public(url)
                        parser = IconLinks()
                        parser.feed(body.decode("utf-8", errors="replace"))
                        candidates = [urljoin(final, link) for link in parser.links[:3]]
                    except (ValueError, OSError, httpx.HTTPError):
                        pass
                    candidates.append(urljoin(url, "/favicon.ico"))
                    for candidate in dict.fromkeys(candidates):
                        try:
                            result = raster_data((await fetch_public(candidate))[0])
                            if result:
                                break
                        except (ValueError, OSError, httpx.HTTPError):
                            continue
    except (TimeoutError, ValueError, OSError, httpx.HTTPError):
        pass
    _cache[key] = (time.monotonic() + (3600 if result else 300), result)
    if len(_cache) > 128:
        _cache.popitem(last=False)
    return result
