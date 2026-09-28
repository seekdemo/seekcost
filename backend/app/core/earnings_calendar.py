"""Batch earnings-date lookup for watchlist equities.

Yahoo covers US and Hong Kong equities. Eastmoney supplies the official
appointment dates published for mainland China disclosures. Missing dates are
expected: providers do not publish every future event at the same time.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
import re
from typing import TypeVar

import httpx


_TIMEOUT = 12
_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
_YAHOO_BATCH_SIZE = 100
_EASTMONEY_BATCH_SIZE = 80
T = TypeVar("T")


@dataclass(frozen=True)
class EarningsTarget:
    stock_id: int
    symbol: str
    name: str = ""
    sector: str = ""


@dataclass(frozen=True)
class FetchedEarnings:
    stock_id: int
    event_date: date
    source: str
    fiscal_period: str = ""
    confirmed: bool = False


@dataclass
class EarningsFetchResult:
    checked: int = 0
    dates: dict[int, FetchedEarnings] = field(default_factory=dict)
    skipped_ids: set[int] = field(default_factory=set)
    unavailable_ids: set[int] = field(default_factory=set)
    errors: list[str] = field(default_factory=list)


def _chunks(items: list[T], size: int) -> list[list[T]]:
    return [items[index:index + size] for index in range(0, len(items), size)]


def _target_market(target: EarningsTarget) -> str:
    symbol = target.symbol.strip().upper()
    name = target.name.upper()
    sector = target.sector.upper()
    description = f"{name} {sector}"

    if re.search(r"ETF|基金|TRUST|ISHARES|VANGUARD|SPDR", description):
        return "skip"
    if re.search(r"指数|INDEX|COMPOSITE|NASDAQ|S&P|标普|恒生|中证|上证|深证|创业板", description):
        return "skip"
    if re.search(r"期货|FUTURE|FUTURES|主连|连续|CRYPTO|BITCOIN|ETHEREUM|比特币|以太坊", description):
        return "skip"
    if symbol.startswith("^") or symbol.endswith("=F") or symbol.endswith("-USD"):
        return "skip"
    if re.fullmatch(r"\d{6}", symbol):
        return "cn"
    if re.fullmatch(r"\d{4,5}", symbol):
        return "hk"
    if re.fullmatch(r"[A-Z][A-Z0-9.-]{0,14}", symbol):
        return "us"
    return "skip"


def _yahoo_symbol(target: EarningsTarget, market: str) -> str:
    symbol = target.symbol.strip().upper()
    if market == "hk":
        return f"{symbol.zfill(4)}.HK"
    return symbol.removesuffix(".US")


def choose_yahoo_earnings_date(quote: dict, today: date) -> date | None:
    """Choose the earliest non-stale date from Yahoo's point/range fields."""
    candidates: list[date] = []
    for field_name in ("earningsTimestamp", "earningsTimestampStart", "earningsTimestampEnd"):
        value = quote.get(field_name)
        if not isinstance(value, (int, float)):
            continue
        try:
            candidate = datetime.fromtimestamp(value, timezone.utc).date()
        except (OverflowError, OSError, ValueError):
            continue
        if today <= candidate <= date(today.year + 2, 12, 31):
            candidates.append(candidate)
    return min(candidates) if candidates else None


def _fetch_yahoo(targets: list[EarningsTarget], today: date) -> tuple[dict[int, FetchedEarnings], set[int]]:
    yahoo_targets: dict[str, list[EarningsTarget]] = {}
    for target in targets:
        market = _target_market(target)
        yahoo_targets.setdefault(_yahoo_symbol(target, market), []).append(target)

    found: dict[int, FetchedEarnings] = {}
    skipped: set[int] = set()
    headers = {"User-Agent": _USER_AGENT}
    with httpx.Client(timeout=_TIMEOUT, headers=headers, follow_redirects=True) as client:
        client.get("https://fc.yahoo.com/v1/test")
        crumb_response = client.get("https://query2.finance.yahoo.com/v1/test/getcrumb")
        crumb_response.raise_for_status()
        crumb = crumb_response.text.strip()
        if not crumb or "too many requests" in crumb.lower():
            raise RuntimeError("Yahoo authentication token is unavailable")

        for symbols in _chunks(list(yahoo_targets), _YAHOO_BATCH_SIZE):
            response = client.get(
                "https://query2.finance.yahoo.com/v7/finance/quote",
                params={"symbols": ",".join(symbols), "crumb": crumb},
            )
            response.raise_for_status()
            for quote in response.json().get("quoteResponse", {}).get("result", []):
                matches = yahoo_targets.get(str(quote.get("symbol") or ""), [])
                quote_type = str(quote.get("quoteType") or "").upper()
                if quote_type and quote_type != "EQUITY":
                    skipped.update(target.stock_id for target in matches)
                    continue
                event_date = choose_yahoo_earnings_date(quote, today)
                if not event_date:
                    continue
                for target in matches:
                    found[target.stock_id] = FetchedEarnings(
                        stock_id=target.stock_id,
                        event_date=event_date,
                        source="yahoo",
                    )
    return found, skipped


def _report_periods(today: date) -> list[date]:
    return [
        date(today.year - 1, 12, 31),
        date(today.year, 3, 31),
        date(today.year, 6, 30),
        date(today.year, 9, 30),
        date(today.year, 12, 31),
    ]


def _fiscal_period(report_date: date) -> str:
    labels = {3: "Q1", 6: "H1", 9: "Q3", 12: "FY"}
    return f"{labels[report_date.month]} FY{report_date.year}"


def _fetch_eastmoney(targets: list[EarningsTarget], today: date) -> dict[int, FetchedEarnings]:
    target_by_code = {target.symbol.zfill(6): target for target in targets}
    found: dict[int, FetchedEarnings] = {}
    headers = {"User-Agent": _USER_AGENT, "Referer": "https://data.eastmoney.com/"}
    url = "https://datacenter-web.eastmoney.com/api/data/v1/get"

    with httpx.Client(timeout=_TIMEOUT, headers=headers, follow_redirects=True) as client:
        for report_date in _report_periods(today):
            for codes in _chunks(list(target_by_code), _EASTMONEY_BATCH_SIZE):
                quoted_codes = ",".join(f'"{code}"' for code in codes)
                response = client.get(
                    url,
                    params={
                        "reportName": "RPT_PUBLIC_BS_APPOIN",
                        "columns": "SECURITY_CODE,SECURITY_NAME_ABBR,APPOINT_PUBLISH_DATE,REPORT_DATE",
                        "filter": f"(REPORT_DATE='{report_date.isoformat()}')(SECURITY_CODE in ({quoted_codes}))",
                        "sortColumns": "APPOINT_PUBLISH_DATE",
                        "sortTypes": "1",
                        "pageSize": "500",
                        "pageNumber": "1",
                        "source": "WEB",
                        "client": "WEB",
                    },
                )
                response.raise_for_status()
                payload = response.json()
                if not payload.get("success"):
                    message = str(payload.get("message") or "")
                    if "为空" in message or "empty" in message.lower():
                        continue
                    raise RuntimeError("Eastmoney returned an unsuccessful response")
                rows = (payload.get("result") or {}).get("data") or []
                for row in rows:
                    code = str(row.get("SECURITY_CODE") or "").zfill(6)
                    target = target_by_code.get(code)
                    raw_date = str(row.get("APPOINT_PUBLISH_DATE") or "")[:10]
                    if not target or not raw_date:
                        continue
                    try:
                        event_date = date.fromisoformat(raw_date)
                    except ValueError:
                        continue
                    if event_date < today:
                        continue
                    candidate = FetchedEarnings(
                        stock_id=target.stock_id,
                        event_date=event_date,
                        source="eastmoney",
                        fiscal_period=_fiscal_period(report_date),
                        confirmed=True,
                    )
                    current = found.get(target.stock_id)
                    if not current or candidate.event_date < current.event_date:
                        found[target.stock_id] = candidate
    return found


def fetch_earnings_dates(targets: list[EarningsTarget], today: date | None = None) -> EarningsFetchResult:
    today = today or datetime.now(timezone.utc).date()
    result = EarningsFetchResult(checked=len(targets))
    cn_targets: list[EarningsTarget] = []
    yahoo_targets: list[EarningsTarget] = []

    for target in targets:
        market = _target_market(target)
        if market == "cn":
            cn_targets.append(target)
        elif market in {"us", "hk"}:
            yahoo_targets.append(target)
        else:
            result.skipped_ids.add(target.stock_id)

    if yahoo_targets:
        try:
            dates, remote_skipped = _fetch_yahoo(yahoo_targets, today)
            result.dates.update(dates)
            result.skipped_ids.update(remote_skipped)
        except Exception:
            result.errors.append("yahoo")

    if cn_targets:
        try:
            result.dates.update(_fetch_eastmoney(cn_targets, today))
        except Exception:
            result.errors.append("eastmoney")

    eligible_ids = {target.stock_id for target in [*cn_targets, *yahoo_targets]}
    result.unavailable_ids = eligible_ids - set(result.dates) - result.skipped_ids
    return result
