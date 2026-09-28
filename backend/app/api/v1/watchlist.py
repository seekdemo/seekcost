"""个人股票池、个股速记与财报日历 API"""
import asyncio
from datetime import date, datetime, timezone
import time
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select, delete, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.earnings_calendar import EarningsTarget, fetch_earnings_dates
from app.core.market_history import infer_watch_market
from app.core.price_updater import fetch_prices
from app.core.security import get_current_user
from app.core.watchlist_classifier import (
    ClassificationFileError,
    ParsedClassificationGroup,
    normalize_classification_symbol,
    parse_classification_files,
)
from app.models.note import Note, NoteFormat, NoteVisibility, ResearchLink
from app.models.user import User
from app.models.watchlist import EarningsEvent, EarningsStatus, StockMemo, WatchStock
from app.models.watchlist_research import WatchResearchSectionKey, WatchStockResearchSection
from app.schemas.note import NoteOut
from app.schemas.watchlist import (
    StockMemoCreate,
    StockMemoOut,
    StockMemoUpdate,
    WatchStockBulkImport,
    WatchStockBulkImportOut,
    WatchStockCreate,
    WatchStockOut,
    WatchStockUpdate,
    EarningsEventCreate,
    EarningsEventOut,
    EarningsSyncOut,
    EarningsEventUpdate,
    ClassificationApplyIn,
    ClassificationApplyOut,
    ClassificationGroupPreview,
    ClassificationPreviewOut,
    WatchStockResearchProfileOut,
    WatchStockResearchSectionOut,
    WatchStockResearchSectionUpdate,
)

router = APIRouter(prefix="/watchlist", tags=["股票池"])

_CLASSIFICATION_SESSION_TTL = 30 * 60
_MAX_CLASSIFICATION_FILES = 30
_MAX_CLASSIFICATION_FILE_SIZE = 2 * 1024 * 1024
_MAX_CLASSIFICATION_TOTAL_SIZE = 10 * 1024 * 1024
_MAX_CLASSIFICATION_SESSIONS = 50
_classification_sessions: dict[str, dict] = {}


def _cleanup_classification_sessions() -> None:
    cutoff = time.monotonic() - _CLASSIFICATION_SESSION_TTL
    expired = [key for key, value in _classification_sessions.items() if value["created_at"] < cutoff]
    for key in expired:
        _classification_sessions.pop(key, None)


def _earnings_out(event: EarningsEvent, stock: WatchStock) -> EarningsEventOut:
    return EarningsEventOut(
        id=event.id,
        user_id=event.user_id,
        stock_id=event.stock_id,
        symbol=stock.symbol,
        name=stock.name,
        event_date=event.event_date,
        fiscal_period=event.fiscal_period,
        status=event.status,
        note=event.note,
        source=event.source,
        synced_at=event.synced_at,
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


def _clean_symbol(symbol: str) -> str:
    symbol = symbol.strip().strip('"').upper()
    for suffix in (".US", ".HK", ".SH", ".SZ", ".SS", ".TW", ".TWO", ".BJ"):
        if symbol.endswith(suffix):
            return symbol[: -len(suffix)]
    return symbol


async def _get_user_stock(stock_id: int, db: AsyncSession, user: User) -> WatchStock:
    stock = await db.get(WatchStock, stock_id)
    if not stock or stock.user_id != user.id:
        raise HTTPException(404, "股票池标的不存在")
    return stock


async def _get_user_profile_stock(stock_id: int, db: AsyncSession, user: User) -> WatchStock:
    return await _get_user_stock(stock_id, db, user)


async def _get_user_research_section(
    stock_id: int,
    key: WatchResearchSectionKey,
    db: AsyncSession,
    user: User,
) -> WatchStockResearchSection:
    stock = await _get_user_profile_stock(stock_id, db, user)
    section = await db.scalar(
        select(WatchStockResearchSection).where(
            WatchStockResearchSection.user_id == user.id,
            WatchStockResearchSection.stock_id == stock.id,
            WatchStockResearchSection.key == key,
        )
    )
    if section is None:
        section = WatchStockResearchSection(user_id=user.id, stock_id=stock.id, key=key, stock=stock)
        db.add(section)
        await db.flush()
    else:
        # Avoid async lazy-loading when the section update synchronizes a legacy field.
        section.stock = stock
    return section


_SECTION_LEGACY_FIELDS: dict[WatchResearchSectionKey, tuple[str, ...]] = {
    WatchResearchSectionKey.COMPANY_OVERVIEW: ("business_summary", "entry_reason"),
    WatchResearchSectionKey.INDUSTRY_MOAT: ("sector",),
    WatchResearchSectionKey.GROWTH_FINANCIALS: ("growth_drivers",),
    WatchResearchSectionKey.RISKS_INVALIDATION: ("fundamental_risks", "invalidation"),
    WatchResearchSectionKey.VALUATION_DECISION: ("thesis",),
}


def _section_for_legacy_field(field: str) -> WatchResearchSectionKey | None:
    return next((key for key, fields in _SECTION_LEGACY_FIELDS.items() if field in fields), None)


async def _ensure_research_sections(stock: WatchStock, db: AsyncSession, user: User) -> list[WatchStockResearchSection]:
    rows = (
        await db.execute(
            select(WatchStockResearchSection).where(
                WatchStockResearchSection.user_id == user.id,
                WatchStockResearchSection.stock_id == stock.id,
            )
        )
    ).scalars().all()
    by_key = {row.key: row for row in rows}
    for key in WatchResearchSectionKey:
        if key not in by_key:
            row = WatchStockResearchSection(user_id=user.id, stock_id=stock.id, key=key)
            db.add(row)
            by_key[key] = row
    await db.flush()
    return [by_key[key] for key in WatchResearchSectionKey]


async def _get_user_memo(memo_id: int, db: AsyncSession, user: User) -> StockMemo:
    memo = await db.get(StockMemo, memo_id)
    if not memo or memo.user_id != user.id:
        raise HTTPException(404, "速记不存在")
    return memo


async def _get_user_earnings(event_id: int, db: AsyncSession, user: User) -> EarningsEvent:
    event = await db.get(EarningsEvent, event_id)
    if not event or event.user_id != user.id:
        raise HTTPException(404, "财报事件不存在")
    return event


@router.get("/earnings", response_model=list[EarningsEventOut])
async def list_earnings(
    from_date: date | None = None,
    to_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if from_date and to_date and from_date > to_date:
        raise HTTPException(400, "起始日期不能晚于结束日期")
    stmt = (
        select(EarningsEvent, WatchStock)
        .join(WatchStock, WatchStock.id == EarningsEvent.stock_id)
        .where(EarningsEvent.user_id == user.id, WatchStock.user_id == user.id)
    )
    if from_date:
        stmt = stmt.where(EarningsEvent.event_date >= from_date)
    if to_date:
        stmt = stmt.where(EarningsEvent.event_date <= to_date)
    stmt = stmt.order_by(EarningsEvent.event_date, WatchStock.symbol)
    rows = (await db.execute(stmt)).all()
    return [_earnings_out(event, stock) for event, stock in rows]


@router.post("/earnings", response_model=EarningsEventOut, status_code=201)
async def create_earnings(
    body: EarningsEventCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stock = await _get_user_stock(body.stock_id, db, user)
    event = EarningsEvent(user_id=user.id, **body.model_dump())
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return _earnings_out(event, stock)


@router.patch("/earnings/{event_id}", response_model=EarningsEventOut)
async def update_earnings(
    event_id: int,
    body: EarningsEventUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = await _get_user_earnings(event_id, db, user)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(event, field, value)
    event.source = "manual"
    event.synced_at = None
    await db.commit()
    await db.refresh(event)
    stock = await _get_user_stock(event.stock_id, db, user)
    return _earnings_out(event, stock)


@router.delete("/earnings/{event_id}", status_code=204)
async def delete_earnings(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = await _get_user_earnings(event_id, db, user)
    await db.delete(event)
    await db.commit()


@router.post("/earnings/sync", response_model=EarningsSyncOut)
async def sync_earnings(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stocks = (
        await db.execute(
            select(WatchStock)
            .where(WatchStock.user_id == user.id)
            .order_by(WatchStock.id)
        )
    ).scalars().all()
    targets = [
        EarningsTarget(stock_id=stock.id, symbol=stock.symbol, name=stock.name, sector=stock.sector)
        for stock in stocks
    ]
    fetched = await asyncio.to_thread(fetch_earnings_dates, targets)
    now = datetime.now(timezone.utc)
    today = now.date()

    existing_rows = (
        await db.execute(select(EarningsEvent).where(EarningsEvent.user_id == user.id))
    ).scalars().all()
    events_by_stock: dict[int, list[EarningsEvent]] = {}
    for event in existing_rows:
        events_by_stock.setdefault(event.stock_id, []).append(event)

    created = 0
    updated = 0
    unchanged = 0
    manual_protected = 0
    for stock_id, candidate in fetched.dates.items():
        stock_events = events_by_stock.get(stock_id, [])

        def matches_candidate(event: EarningsEvent) -> bool:
            same_period = bool(
                candidate.fiscal_period
                and event.fiscal_period
                and candidate.fiscal_period == event.fiscal_period
            )
            nearby_date = abs((event.event_date - candidate.event_date).days) <= 45
            return same_period or nearby_date

        protected = any(
            event.source == "manual"
            and event.status != EarningsStatus.REPORTED
            and event.event_date >= today
            and matches_candidate(event)
            for event in stock_events
        )
        if protected:
            manual_protected += 1
            continue

        automatic = sorted(
            (
                event for event in stock_events
                if event.source != "manual" and event.status != EarningsStatus.REPORTED
                and matches_candidate(event)
            ),
            key=lambda event: event.event_date,
            reverse=True,
        )
        status = EarningsStatus.CONFIRMED if candidate.confirmed else EarningsStatus.ESTIMATED
        if automatic:
            event = automatic[0]
            changed = (
                event.event_date != candidate.event_date
                or event.fiscal_period != candidate.fiscal_period
                or event.status != status
                or event.source != candidate.source
            )
            event.event_date = candidate.event_date
            event.fiscal_period = candidate.fiscal_period
            event.status = status
            event.source = candidate.source
            event.synced_at = now
            if changed:
                updated += 1
            else:
                unchanged += 1
        else:
            event = EarningsEvent(
                user_id=user.id,
                stock_id=stock_id,
                event_date=candidate.event_date,
                fiscal_period=candidate.fiscal_period,
                status=status,
                source=candidate.source,
                synced_at=now,
            )
            db.add(event)
            events_by_stock.setdefault(stock_id, []).append(event)
            created += 1

    await db.commit()
    return EarningsSyncOut(
        checked=fetched.checked,
        created=created,
        updated=updated,
        unchanged=unchanged,
        manual_protected=manual_protected,
        unavailable=len(fetched.unavailable_ids),
        skipped=len(fetched.skipped_ids),
        provider_errors=fetched.errors,
    )


@router.get("/stocks", response_model=list[WatchStockOut])
async def list_stocks(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(WatchStock)
        .where(WatchStock.user_id == user.id)
        .order_by(WatchStock.updated_at.desc(), WatchStock.symbol)
    )
    return result.scalars().all()


@router.get("/stocks/{stock_id}/quote")
async def get_stock_quote(
    stock_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Refresh one watchlist price before showing its dossier.

    The watchlist stores the last known quote for fast list rendering, but a
    dossier must not present an old cached value as today's current price.
    """
    stock = await _get_user_stock(stock_id, db, user)
    market = infer_watch_market(stock.symbol, stock.sector)
    try:
        price_data = await asyncio.to_thread(fetch_prices, [stock.symbol], {stock.symbol: market})
    except Exception as error:
        raise HTTPException(status_code=503, detail="当前行情暂不可用，请稍后重试") from error
    price, session = price_data.get(stock.symbol, (None, None))
    if price is None or price <= 0:
        raise HTTPException(status_code=503, detail="当前行情暂不可用，请稍后重试")
    stock.current_price = price
    stock.price_session = session or ""
    # Do not keep an old day's change next to a newly refreshed price. The
    # batch quote endpoint fills these fields when it has an authoritative
    # previous-close value.
    stock.price_change = None
    stock.price_change_pct = None
    await db.commit()
    return {
        "stock_id": stock.id,
        "symbol": stock.symbol,
        "market": market,
        "price": float(price),
        "session": session or "closed",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/stocks/{stock_id}/research-profile", response_model=WatchStockResearchProfileOut)
async def get_research_profile(
    stock_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stock = await _get_user_profile_stock(stock_id, db, user)
    sections = await _ensure_research_sections(stock, db, user)
    await db.commit()
    memos = (
        await db.execute(
            select(StockMemo)
            .where(StockMemo.user_id == user.id, StockMemo.stock_id == stock.id)
            .order_by(StockMemo.pinned.desc(), StockMemo.created_at.desc())
        )
    ).scalars().all()
    linked_rows = (
        await db.execute(
            select(Note, ResearchLink)
            .join(ResearchLink, ResearchLink.note_id == Note.id)
            .where(
                Note.user_id == user.id,
                ResearchLink.user_id == user.id,
                ResearchLink.entity_type == "watch_stock",
                ResearchLink.entity_id == stock.id,
            )
            .order_by(Note.updated_at.desc(), Note.id.desc())
        )
    ).all()
    linked = [
        {
            "id": note.id,
            "title": note.title,
            "kind": note.kind,
            "status": note.status,
            "starred": note.starred,
            "updated_at": note.updated_at,
        }
        for note, _link in linked_rows
    ]
    return WatchStockResearchProfileOut(
        stock_id=stock.id,
        stock=stock,
        research_sections=sections,
        memos=memos,
        linked_research=linked,
    )


@router.patch("/stocks/{stock_id}/research-sections/{key}", response_model=WatchStockResearchSectionOut)
async def update_research_section(
    stock_id: int,
    key: WatchResearchSectionKey,
    body: WatchStockResearchSectionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    section = await _get_user_research_section(stock_id, key, db, user)
    data = body.model_dump(exclude_unset=True)
    if "evidence" in data:
        evidence = body.evidence or []
        if len(evidence) > 100:
            raise HTTPException(422, "每个研究模块最多 100 条证据")
        for item in evidence:
            if item.url and not item.url.lower().startswith(("http://", "https://")):
                raise HTTPException(422, "证据链接必须使用 http 或 https")
        data["evidence"] = [item.model_dump() for item in evidence]
    if "open_questions" in data:
        questions = body.open_questions or []
        if len(questions) > 100:
            raise HTTPException(422, "每个研究模块最多 100 个待验证问题")
        data["open_questions"] = [item.model_dump() for item in questions]
    for field, value in data.items():
        setattr(section, field, value)
    # `sector` is a compact classification label. The industry research module can
    # contain long Markdown, so writing its summary back to `sector` corrupts filters.
    if "summary" in data and key != WatchResearchSectionKey.INDUSTRY_MOAT:
        legacy_fields = _SECTION_LEGACY_FIELDS[key]
        setattr(section.stock, legacy_fields[0], data["summary"] or "")
    await db.commit()
    await db.refresh(section)
    return section


@router.post("/classification/preview", response_model=ClassificationPreviewOut)
async def preview_classification(
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not files or len(files) > _MAX_CLASSIFICATION_FILES:
        raise HTTPException(400, f"Upload between 1 and {_MAX_CLASSIFICATION_FILES} CSV files")

    uploaded: list[tuple[str, bytes]] = []
    total_size = 0
    for file in files:
        filename = file.filename or "classification.csv"
        if not filename.lower().endswith(".csv"):
            raise HTTPException(400, f"{filename} is not a CSV file")
        content = await file.read()
        if len(content) > _MAX_CLASSIFICATION_FILE_SIZE:
            raise HTTPException(400, f"{filename} exceeds the 2 MB limit")
        total_size += len(content)
        if total_size > _MAX_CLASSIFICATION_TOTAL_SIZE:
            raise HTTPException(400, "Classification files exceed the 10 MB total limit")
        uploaded.append((filename, content))

    try:
        groups = parse_classification_files(uploaded)
    except ClassificationFileError as error:
        raise HTTPException(400, str(error)) from error

    stocks = (
        await db.execute(select(WatchStock).where(WatchStock.user_id == user.id).order_by(WatchStock.symbol))
    ).scalars().all()
    stocks_by_symbol = {normalize_classification_symbol(stock.symbol): stock for stock in stocks}
    matched_stock_ids: set[int] = set()
    unmatched_symbols: set[str] = set()
    previews: list[ClassificationGroupPreview] = []
    for group in groups:
        matched = [stocks_by_symbol[symbol] for symbol in sorted(group.symbols) if symbol in stocks_by_symbol]
        missing = group.symbols - set(stocks_by_symbol)
        matched_stock_ids.update(stock.id for stock in matched)
        unmatched_symbols.update(missing)
        previews.append(ClassificationGroupPreview(
            key=group.key,
            source_filename=group.source_filename,
            suggested_name=group.suggested_name,
            row_count=len(group.symbols),
            matched_count=len(matched),
            unmatched_count=len(missing),
            already_assigned_count=sum(group.suggested_name in (stock.concepts or []) for stock in matched),
            sample_symbols=[stock.symbol for stock in matched[:12]],
        ))

    _cleanup_classification_sessions()
    if len(_classification_sessions) >= _MAX_CLASSIFICATION_SESSIONS:
        oldest_session = min(_classification_sessions, key=lambda key: _classification_sessions[key]["created_at"])
        _classification_sessions.pop(oldest_session, None)
    session_id = uuid.uuid4().hex[:16]
    _classification_sessions[session_id] = {
        "user_id": user.id,
        "created_at": time.monotonic(),
        "groups": {group.key: group for group in groups},
    }
    return ClassificationPreviewOut(
        session_id=session_id,
        file_count=len(uploaded),
        group_count=len(groups),
        matched_stock_count=len(matched_stock_ids),
        unmatched_count=len(unmatched_symbols),
        groups=previews,
        unmatched_symbols=sorted(unmatched_symbols)[:500],
    )


@router.post("/classification/apply", response_model=ClassificationApplyOut)
async def apply_classification(
    body: ClassificationApplyIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _cleanup_classification_sessions()
    session = _classification_sessions.get(body.session_id)
    if not session or session["user_id"] != user.id:
        raise HTTPException(404, "Classification preview expired or does not exist")

    available: dict[str, ParsedClassificationGroup] = session["groups"]
    selections: list[tuple[ParsedClassificationGroup, str]] = []
    seen_keys: set[str] = set()
    for item in body.groups:
        if not item.selected:
            continue
        if item.key in seen_keys or item.key not in available:
            raise HTTPException(400, "Classification group is invalid or duplicated")
        seen_keys.add(item.key)
        label = " ".join(item.label.split()).strip()
        if not label:
            raise HTTPException(400, "Classification name cannot be empty")
        selections.append((available[item.key], label))
    if not selections:
        raise HTTPException(400, "Select at least one classification group")

    stocks = (
        await db.execute(select(WatchStock).where(WatchStock.user_id == user.id))
    ).scalars().all()
    stocks_by_symbol = {normalize_classification_symbol(stock.symbol): stock for stock in stocks}
    affected_ids: set[int] = set()
    changed_ids: set[int] = set()
    assignments_added = 0
    for group, label in selections:
        for symbol in group.symbols:
            stock = stocks_by_symbol.get(symbol)
            if not stock:
                continue
            affected_ids.add(stock.id)
            concepts = list(dict.fromkeys(str(value).strip() for value in (stock.concepts or []) if str(value).strip()))
            if label in concepts:
                continue
            stock.concepts = [*concepts, label]
            changed_ids.add(stock.id)
            assignments_added += 1

    await db.commit()
    updated_items = [stock for stock in stocks if stock.id in changed_ids]
    for stock in updated_items:
        await db.refresh(stock)
    return ClassificationApplyOut(
        updated_count=len(changed_ids),
        assignments_added=assignments_added,
        unchanged_count=len(affected_ids - changed_ids),
        items=updated_items,
    )


@router.post("/stocks", response_model=WatchStockOut, status_code=201)
async def create_stock(
    body: WatchStockCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    symbol = _clean_symbol(body.symbol)
    exists = await db.execute(select(WatchStock).where(WatchStock.user_id == user.id, WatchStock.symbol == symbol))
    if exists.scalars().first():
        raise HTTPException(409, f"{symbol} 已在股票池中")
    stock = WatchStock(user_id=user.id, **{**body.model_dump(), "symbol": symbol})
    db.add(stock)
    await db.commit()
    await db.refresh(stock)
    return stock


@router.post("/stocks/bulk-import", response_model=WatchStockBulkImportOut)
async def bulk_import_stocks(
    body: WatchStockBulkImport,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(WatchStock.symbol).where(WatchStock.user_id == user.id))
    existing = {row[0] for row in result.all()}
    incoming: set[str] = set()
    imported: list[WatchStock] = []
    skipped = 0
    for item in body.items:
        symbol = _clean_symbol(item.symbol)
        if not symbol or symbol in existing or symbol in incoming:
            skipped += 1
            continue
        incoming.add(symbol)
        stock = WatchStock(user_id=user.id, **{**item.model_dump(), "symbol": symbol})
        db.add(stock)
        imported.append(stock)
    await db.commit()
    for stock in imported:
        await db.refresh(stock)
    return WatchStockBulkImportOut(imported=len(imported), skipped=skipped, items=imported)


@router.patch("/stocks/{stock_id}", response_model=WatchStockOut)
async def update_stock(
    stock_id: int,
    body: WatchStockUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stock = await _get_user_stock(stock_id, db, user)
    data = body.model_dump(exclude_unset=True)
    if "symbol" in data and data["symbol"]:
        data["symbol"] = _clean_symbol(data["symbol"])
    for field, value in data.items():
        setattr(stock, field, value)
    mapped = {
        _section_for_legacy_field(field)
        for field in data
        if field != "sector" and _section_for_legacy_field(field)
    }
    if mapped:
        existing = (
            await db.execute(
                select(WatchStockResearchSection).where(
                    WatchStockResearchSection.user_id == user.id,
                    WatchStockResearchSection.stock_id == stock.id,
                )
            )
        ).scalars().all()
        by_key = {row.key: row for row in existing}
        for key in mapped:
            section = by_key.get(key)
            if section is None:
                section = WatchStockResearchSection(user_id=user.id, stock_id=stock.id, key=key)
                db.add(section)
            fields = _SECTION_LEGACY_FIELDS[key]
            source_field = next((field for field in fields if field in data), None)
            if source_field:
                section.summary = str(data[source_field] or "")
    await db.commit()
    await db.refresh(stock)
    return stock


@router.delete("/stocks/{stock_id}", status_code=204)
async def delete_stock(stock_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    stock = await _get_user_stock(stock_id, db, user)
    from app.models.research_guide import ResearchGuide
    await db.execute(delete(ResearchGuide).where(ResearchGuide.stock_id == stock_id, ResearchGuide.user_id == user.id))
    from app.models.custom_alert import AlertRule, AlertNotification, AlertRuleState
    # Explicit cleanup also supports local SQLite configurations without FK enforcement.
    await db.execute(update(AlertNotification).where(AlertNotification.stock_id == stock_id, AlertNotification.user_id == user.id).values(stock_id=None, rule_id=None))
    removed_rules = select(AlertRule.id).where(AlertRule.stock_id == stock_id, AlertRule.user_id == user.id)
    # A rule switched from all-watchlist to single may retain other targets' history.
    await db.execute(update(AlertNotification).where(AlertNotification.rule_id.in_(removed_rules),
                                                     AlertNotification.user_id == user.id).values(rule_id=None))
    await db.execute(delete(AlertRuleState).where(AlertRuleState.rule_id.in_(removed_rules)))
    await db.execute(delete(AlertRuleState).where(AlertRuleState.stock_id == stock_id,
                                                AlertRuleState.rule_id.in_(select(AlertRule.id).where(AlertRule.user_id == user.id))))
    await db.execute(delete(AlertRule).where(AlertRule.stock_id == stock_id, AlertRule.user_id == user.id))
    symbol = stock.symbol
    notes = await db.execute(select(Note).where(Note.user_id == user.id))
    for note in notes.scalars().all():
        symbols = [item for item in (note.stock_symbols or []) if _clean_symbol(str(item)) != symbol]
        if symbols != (note.stock_symbols or []):
            note.stock_symbols = symbols
    await db.delete(stock)
    await db.commit()


@router.get("/memos", response_model=list[StockMemoOut])
async def list_memos(
    stock_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(StockMemo).where(StockMemo.user_id == user.id)
    if stock_id:
        stmt = stmt.where(StockMemo.stock_id == stock_id)
    stmt = stmt.order_by(StockMemo.pinned.desc(), StockMemo.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/memos", response_model=StockMemoOut, status_code=201)
async def create_memo(
    body: StockMemoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_user_stock(body.stock_id, db, user)
    memo = StockMemo(user_id=user.id, **body.model_dump())
    db.add(memo)
    await db.commit()
    await db.refresh(memo)
    return memo


@router.patch("/memos/{memo_id}", response_model=StockMemoOut)
async def update_memo(
    memo_id: int,
    body: StockMemoUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    memo = await _get_user_memo(memo_id, db, user)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(memo, field, value)
    await db.commit()
    await db.refresh(memo)
    return memo


@router.delete("/memos/{memo_id}", status_code=204)
async def delete_memo(memo_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    memo = await _get_user_memo(memo_id, db, user)
    await db.delete(memo)
    await db.commit()


@router.post("/memos/{memo_id}/convert-to-note", response_model=NoteOut)
async def convert_memo_to_note(
    memo_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    memo = await _get_user_memo(memo_id, db, user)
    stock = await _get_user_stock(memo.stock_id, db, user)
    if memo.converted_note_id:
        note = await db.get(Note, memo.converted_note_id)
        if note and note.user_id == user.id:
            return note
    note = Note(
        user_id=user.id,
        title=f"{stock.symbol} 速记",
        content=f"${stock.symbol}\n\n{memo.content}",
        format=NoteFormat.MARKDOWN,
        visibility=NoteVisibility.PRIVATE,
        stock_symbols=[stock.symbol],
        knowledge_tags=[],
    )
    db.add(note)
    await db.flush()
    memo.converted_note_id = note.id
    await db.commit()
    await db.refresh(note)
    return note
