import socket
import httpx
import pytest
from app.core import tool_icons as icons


@pytest.mark.asyncio
@pytest.mark.parametrize('url', ['http://127.0.0.1/icon', 'http://[::1]/icon', 'file:///tmp/icon', 'https://example.com:8001/icon', 'https://a:b@example.com/icon'])
async def test_rejects_unsafe_targets(url):
    with pytest.raises(ValueError):
        await icons.public_target(url)


@pytest.mark.asyncio
async def test_pins_public_ip_and_rejects_mixed_dns(monkeypatch):
    async def dns(*args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443))]
    monkeypatch.setattr(icons.asyncio.get_running_loop(), 'getaddrinfo', dns)
    pinned, host, sni = await icons.public_target('https://example.com/icon.png')
    assert pinned.host == '93.184.216.34' and host == sni == 'example.com'
    async def mixed(*args, **kwargs):
        return await dns() + [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('10.0.0.1', 443))]
    monkeypatch.setattr(icons.asyncio.get_running_loop(), 'getaddrinfo', mixed)
    with pytest.raises(ValueError):
        await icons.public_target('https://example.com/icon')


@pytest.mark.asyncio
async def test_discovery_fallback_cache_and_direct(monkeypatch):
    icons._cache.clear()
    calls = []
    async def fetch(url):
        calls.append(url)
        if url.endswith('.png'):
            return b'\x89PNG\r\n\x1a\nfixture', url
        if url.endswith('.ico'):
            return b'\x00\x00\x01\x00fixture', url
        return b'<link rel="icon" href="/logo.png">', url
    monkeypatch.setattr(icons, 'fetch_public', fetch)
    result = await icons.discover_icon('https://example.com')
    assert result.startswith('data:image/png;base64,')
    assert calls == ['https://example.com', 'https://example.com/logo.png']
    assert await icons.discover_icon('https://example.com') == result and len(calls) == 2
    assert await icons.discover_icon('https://example.com/custom.ico', True)
    assert icons.raster_data(b'<svg onload="evil"/>') is None
    async def no_links(url):
        return (b'\x00\x00\x01\x00fixture' if url.endswith('.ico') else b'<html/>'), url
    monkeypatch.setattr(icons, 'fetch_public', no_links)
    assert (await icons.discover_icon('https://other.example')).startswith('data:image/x-icon')


@pytest.mark.asyncio
@pytest.mark.parametrize('kind', ['redirect', 'oversize', 'compressed'])
async def test_fetch_rejects_unsafe_responses(monkeypatch, kind):
    calls = []
    async def target(url):
        calls.append(url)
        if '127.0.0.1' in url:
            raise ValueError('Non-public destination')
        return httpx.URL('https://93.184.216.34/icon'), 'example.com', 'example.com'
    monkeypatch.setattr(icons, 'public_target', target)
    def respond(request):
        assert request.url.host == '93.184.216.34'
        assert request.headers['host'] == 'example.com'
        assert request.extensions['sni_hostname'] == 'example.com'
        if kind == 'redirect':
            return httpx.Response(302, headers={'location': 'http://127.0.0.1/private'})
        if kind == 'compressed':
            return httpx.Response(200, headers={'content-encoding': 'br'})
        return httpx.Response(200, content=b'x' * (icons.LIMIT + 1))
    original = httpx.AsyncClient
    monkeypatch.setattr(icons.httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(respond), **kw))
    with pytest.raises((ValueError, httpx.DecodingError)):
        await icons.fetch_public('https://example.com/icon')
    if kind == 'redirect':
        assert calls[-1] == 'http://127.0.0.1/private'
