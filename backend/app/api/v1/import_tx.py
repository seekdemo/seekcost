"""交易记录批量导入 API — CSV 上传 → 预览 → 确认导入"""
import csv
import io
import uuid
import re
from datetime import datetime, timezone
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.recalc import recalc_asset
from app.models.user import User
from app.models.asset import Asset, detect_market
from app.models.transaction import Transaction, TransactionType
from app.schemas.import_tx import (
    ImportColumnMapping, ImportPreviewRequest,
    ImportPreviewRow, ImportPreviewResponse,
    ImportConfirmRequest, ImportConfirmResponse,
)

router = APIRouter(prefix="/import", tags=["交易导入"])

# 内存缓存预览会话（生产环境可换 Redis）
_sessions: dict[str, dict] = {}
_MAX_SESSIONS = 50
_MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

# ── 常见日期格式 ──────────────────────────────────
_DATE_FMTS = [
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
    "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M", "%Y/%m/%d",
    "%m/%d/%Y %H:%M:%S", "%m/%d/%Y", "%m/%d/%y",
    "%d/%m/%Y", "%Y%m%d",
    "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S.%fZ",
    "%Y-%m-%dT%H:%M:%S%z",
]


def _parse_date(raw: str, hint_fmt: str = "") -> datetime | None:
    """尝试解析日期字符串，返回 datetime 或 None。
    支持 IBKR 特殊格式：
      - "2024-01-15, 10:30:00"（逗号+空格分隔）
      - "2024-01-15;10:30:00"（分号分隔）
      - "20240115;103000"（紧凑分号格式）
    """
    raw = raw.strip()
    if not raw:
        return None
    # IBKR 预处理：统一分号/逗号+空格 → 空格
    normalized = raw.replace(";", " ").replace(", ", " ")
    # 去除多余空格
    normalized = re.sub(r"\s+", " ", normalized).strip()

    # 优先使用用户指定格式（先试原始值，再试 normalized）
    if hint_fmt:
        for v in (raw, normalized):
            try:
                return datetime.strptime(v, hint_fmt)
            except ValueError:
                pass

    # IBKR 紧凑格式: "20240115 103000"
    m = re.match(r"^(\d{8})\s+(\d{6})$", normalized)
    if m:
        try:
            return datetime.strptime(f"{m.group(1)} {m.group(2)}", "%Y%m%d %H%M%S")
        except ValueError:
            pass

    # 先试 normalized，再试原始值
    for v in (normalized, raw):
        for fmt in _DATE_FMTS:
            try:
                return datetime.strptime(v, fmt)
            except ValueError:
                continue
    return None


def _parse_number(raw: str) -> float | None:
    """解析数值，支持千分位逗号和中文万"""
    if not raw or not raw.strip():
        return None
    s = raw.strip().replace(",", "").replace("，", "")
    # 处理中文"万"
    if s.endswith("万"):
        try:
            return float(s[:-1]) * 10000
        except ValueError:
            return None
    # 移除货币符号
    s = re.sub(r"^[$¥€£￥HK$]+", "", s).strip()
    try:
        return float(s)
    except ValueError:
        return None


def _normalize_tx_type(raw: str, buy_kw: str, sell_kw: str) -> str | None:
    """将中英文买卖方向标准化为 buy/sell"""
    s = raw.strip().lower()
    buy_kws = {buy_kw.lower(), "buy", "买入", "买", "b", "bid", "增持", "申购", "bot"}
    sell_kws = {sell_kw.lower(), "sell", "卖出", "卖", "s", "ask", "减持", "赎回", "sld"}
    if s in buy_kws or any(k in s for k in buy_kws if k):
        return "buy"
    if s in sell_kws or any(k in s for k in sell_kws if k):
        return "sell"
    # IBKR 特殊：Quantity 为负数表示卖出
    try:
        num = float(s.replace(",", ""))
        if num > 0:
            return "buy"
        elif num < 0:
            return "sell"
    except ValueError:
        pass
    return None


def _clean_symbol(raw: str) -> str:
    """清理 symbol：去空格，统一大写"""
    return raw.strip().upper().replace(" ", "")


# ── IBKR Activity Statement 预处理 ────────────────────
def _preprocess_ibkr(text: str) -> tuple[str, str]:
    """
    检测并预处理 IBKR (Interactive Brokers) Activity Statement CSV。
    IBKR 导出的文件是多 section 结构：
      Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,...
      Trades,Data,Order,Stocks,USD,AAPL,2024-01-15; 10:30:00,100,178.50,...
    返回 (处理后的标准CSV文本, 检测到的格式名称)
    """
    lines = text.strip().split("\n")

    # 检测 IBKR 格式：第一列以 "Trades" 开头，且有 "Header" 行
    ibkr_header = None
    ibkr_rows = []
    for line in lines:
        parts = line.split(",")
        if len(parts) < 6:
            continue
        section = parts[0].strip().strip('"')
        row_type = parts[1].strip().strip('"') if len(parts) > 1 else ""

        if section == "Trades" and row_type == "Header":
            # 提取表头（从第3列开始，跳过 section 和 row_type）
            ibkr_header = [p.strip().strip('"') for p in parts[2:]]
        elif section == "Trades" and row_type == "Data":
            data_disc = parts[2].strip().strip('"') if len(parts) > 2 else ""
            # 只要 Order / Trade 行，跳过 SubTotal / Total
            if data_disc in ("Order", "Trade", ""):
                ibkr_rows.append([p.strip().strip('"') for p in parts[2:]])

    if not ibkr_header or not ibkr_rows:
        return text, ""

    # 构建标准 CSV —— 映射 IBKR 列名到友好列名
    # IBKR 典型列: DataDiscriminator, Asset Category, Currency, Symbol, Date/Time,
    #              Quantity, T. Price, C. Price, Proceeds, Comm/Fee, Basis, Realized P/L, ...
    out_lines = [",".join(ibkr_header)]
    for row in ibkr_rows:
        # 补齐列数
        while len(row) < len(ibkr_header):
            row.append("")
        out_lines.append(",".join(row))

    return "\n".join(out_lines), "ibkr"


# ── Step 1: 上传 CSV，返回列名 ─────────────────────
@router.post("/upload", response_model=dict)
async def upload_csv(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """上传 CSV 文件，返回列名列表和前 5 行预览。自动检测 IBKR 格式。"""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "仅支持 .csv 文件")

    content = await file.read()
    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(400, f"文件过大，最大支持 {_MAX_FILE_SIZE // 1024 // 1024}MB")

    # 尝试多种编码
    text = None
    for enc in ("utf-8-sig", "utf-8", "gbk", "gb2312", "gb18030", "latin-1"):
        try:
            text = content.decode(enc)
            break
        except (UnicodeDecodeError, LookupError):
            continue
    if text is None:
        raise HTTPException(400, "无法识别文件编码，请使用 UTF-8 或 GBK 编码")

    # 自动检测并预处理 IBKR 格式
    detected_format = ""
    processed_text, detected_format = _preprocess_ibkr(text)
    if detected_format:
        text = processed_text

    reader = csv.DictReader(io.StringIO(text))
    columns = reader.fieldnames or []
    if not columns:
        raise HTTPException(400, "CSV 文件为空或格式不正确")

    # 缓存原始文本
    session_id = str(uuid.uuid4())[:12]
    # 清理旧会话
    if len(_sessions) >= _MAX_SESSIONS:
        oldest = list(_sessions.keys())[:10]
        for k in oldest:
            _sessions.pop(k, None)
    _sessions[session_id] = {"text": text, "user_id": user.id}

    # 取前 5 行预览
    sample_rows = []
    for i, row in enumerate(reader):
        if i >= 5:
            break
        sample_rows.append(dict(row))

    return {
        "session_id": session_id,
        "columns": list(columns),
        "sample_rows": sample_rows,
        "total_rows": text.count("\n") - 1,  # 大致行数
        "detected_format": detected_format,  # 前端可据此自动设置映射
    }


# ── Step 2: 解析预览（带去重检测） ────────────────────
@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    body: ImportPreviewRequest,
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """根据列映射解析 CSV，检测重复，返回预览"""
    sess = _sessions.get(session_id)
    if not sess or sess["user_id"] != user.id:
        raise HTTPException(400, "会话已过期，请重新上传文件")

    text = sess["text"]
    mapping = body.mapping

    # 获取用户已有资产 symbol → Asset
    result = await db.execute(select(Asset).where(Asset.user_id == user.id))
    user_assets = {a.symbol.upper(): a for a in result.scalars().all()}

    # 获取用户已有交易记录（用于去重）
    tx_result = await db.execute(
        select(Transaction).join(Asset).where(Asset.user_id == user.id)
    )
    existing_txs = tx_result.scalars().all()

    # 构建去重指纹集合: (symbol, tx_type, price, quantity, date_str)
    dup_fingerprints: set[tuple] = set()
    for tx in existing_txs:
        asset = user_assets.get(
            next((s for s, a in user_assets.items() if a.id == tx.asset_id), ""),
            None,
        )
        if asset:
            date_str = tx.created_at.strftime("%Y-%m-%d") if tx.created_at else ""
            dup_fingerprints.add((
                asset.symbol.upper(),
                tx.tx_type.value,
                round(float(tx.price), 4),
                round(float(tx.quantity), 4),
                date_str,
            ))

    reader = csv.DictReader(io.StringIO(text))
    rows: list[ImportPreviewRow] = []
    new_symbols: set[str] = set()
    existing_symbols: set[str] = set()
    error_count = 0
    dup_count = 0

    for i, raw_row in enumerate(reader, start=2):  # CSV 行号从 2 开始（1 是表头）
        symbol_raw = raw_row.get(mapping.symbol, "").strip()
        name_raw = raw_row.get(mapping.name, "") if mapping.name else ""
        tx_type_raw = raw_row.get(mapping.tx_type, "").strip()
        price_raw = raw_row.get(mapping.price, "").strip()
        qty_raw = raw_row.get(mapping.quantity, "").strip()
        fee_raw = raw_row.get(mapping.fee, "").strip() if mapping.fee else ""
        date_raw = raw_row.get(mapping.date, "").strip() if mapping.date else ""
        note_raw = raw_row.get(mapping.note, "").strip() if mapping.note else ""

        error = ""
        symbol = _clean_symbol(symbol_raw)
        name = name_raw.strip() or symbol
        tx_type = _normalize_tx_type(tx_type_raw, body.buy_keyword, body.sell_keyword)
        price = _parse_number(price_raw)
        quantity = _parse_number(qty_raw)
        fee = _parse_number(fee_raw) if fee_raw else 0.0
        parsed_date = _parse_date(date_raw, body.date_format) if date_raw else None

        # IBKR 特殊处理：Quantity 正负数判断买卖方向
        # 如果 tx_type 列无法识别（可能没映射或内容为空），
        # 尝试通过 Quantity 的正负来推断：正=买入，负=卖出
        if tx_type is None and quantity is not None:
            if quantity > 0:
                tx_type = "buy"
            elif quantity < 0:
                tx_type = "sell"

        # Quantity 取绝对值（IBKR 卖出时 Quantity 为负数）
        if quantity is not None:
            quantity = abs(quantity)

        # 手续费取绝对值（IBKR 手续费为负数表示扣费）
        if fee is not None:
            fee = abs(fee)
        else:
            fee = 0.0

        # 校验
        if not symbol:
            error = "代码为空"
        elif tx_type is None:
            error = f"无法识别买卖方向: {tx_type_raw}"
        elif price is None or price <= 0:
            error = f"价格无效: {price_raw}"
        elif quantity is None or quantity <= 0:
            error = f"数量无效: {qty_raw}"

        date_str = ""
        if parsed_date:
            date_str = parsed_date.strftime("%Y-%m-%d %H:%M:%S")
        elif date_raw and not error:
            error = f"日期格式无法识别: {date_raw}"

        # 去重检测
        is_dup = False
        dup_reason = ""
        if not error and symbol and tx_type and price and quantity:
            day_str = parsed_date.strftime("%Y-%m-%d") if parsed_date else ""
            fp = (symbol, tx_type, round(price, 4), round(quantity, 4), day_str)
            if fp in dup_fingerprints:
                is_dup = True
                dup_reason = f"与已有交易重复 ({symbol} {tx_type} {price}×{quantity} {day_str})"
                dup_count += 1

        # 资产存在检测
        asset_exists = symbol in user_assets
        asset_id = user_assets[symbol].id if asset_exists else None
        if symbol and not asset_exists:
            new_symbols.add(symbol)
        elif symbol:
            existing_symbols.add(symbol)

        if error:
            error_count += 1

        rows.append(ImportPreviewRow(
            row_num=i,
            symbol=symbol,
            name=name,
            tx_type=tx_type or "",
            price=price or 0,
            quantity=quantity or 0,
            fee=fee or 0,
            date=date_str,
            note=note_raw,
            is_duplicate=is_dup,
            duplicate_reason=dup_reason,
            error=error,
            asset_exists=asset_exists,
            asset_id=asset_id,
        ))

    # 缓存解析结果到会话
    sess["rows"] = rows
    sess["zone"] = body.zone
    sess["category"] = body.category

    valid = len(rows) - error_count
    return ImportPreviewResponse(
        total_rows=len(rows),
        valid_rows=valid,
        error_rows=error_count,
        duplicate_rows=dup_count,
        new_assets=sorted(new_symbols),
        existing_assets=sorted(existing_symbols),
        rows=rows,
        columns=list(csv.DictReader(io.StringIO(text)).fieldnames or []),
        session_id=session_id,
    )


# ── Step 3: 确认导入 ──────────────────────────────
@router.post("/confirm", response_model=ImportConfirmResponse)
async def confirm_import(
    body: ImportConfirmRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """确认导入 — 批量创建资产和交易记录，触发重算"""
    sess = _sessions.get(body.session_id)
    if not sess or sess["user_id"] != user.id or "rows" not in sess:
        raise HTTPException(400, "会话已过期，请重新预览")

    rows: list[ImportPreviewRow] = sess["rows"]
    zone = sess.get("zone", "active")
    category = sess.get("category", "stock")
    selected = set(body.selected_rows) if body.selected_rows is not None else None

    # 获取用户已有资产
    result = await db.execute(select(Asset).where(Asset.user_id == user.id))
    user_assets = {a.symbol.upper(): a for a in result.scalars().all()}

    imported = 0
    skipped = 0
    new_assets_count = 0
    errors: list[str] = []
    affected_asset_ids: set[int] = set()

    # 按日期排序导入（确保 recalc 正确）
    sorted_rows = sorted(rows, key=lambda r: r.date or "9999")

    for row in sorted_rows:
        # 选行过滤
        if selected is not None and row.row_num not in selected:
            skipped += 1
            continue
        # 错误行
        if row.error:
            if body.skip_errors:
                skipped += 1
                continue
            errors.append(f"行{row.row_num}: {row.error}")
            skipped += 1
            continue
        # 重复行
        if row.is_duplicate and body.skip_duplicates:
            skipped += 1
            continue

        # 确保资产存在
        symbol = row.symbol
        asset = user_assets.get(symbol)
        if not asset:
            market = detect_market(symbol, category)
            asset = Asset(
                user_id=user.id,
                symbol=symbol,
                name=row.name or symbol,
                zone=zone,
                category=category,
                market=market,
            )
            db.add(asset)
            await db.flush()  # 获取 ID
            user_assets[symbol] = asset
            new_assets_count += 1

        # 解析日期
        tx_date = None
        if row.date:
            tx_date = _parse_date(row.date)

        # 创建交易记录（简单买入/卖出，无利润分配）
        tx_type = TransactionType.BUY if row.tx_type == "buy" else TransactionType.SELL
        tx = Transaction(
            asset_id=asset.id,
            tx_type=tx_type,
            price=row.price,
            quantity=row.quantity,
            fee=row.fee,
            note=row.note or f"CSV导入 行{row.row_num}",
            created_at=tx_date.replace(tzinfo=timezone.utc) if tx_date else datetime.now(timezone.utc),
        )
        db.add(tx)
        affected_asset_ids.add(asset.id)
        imported += 1

    await db.flush()

    # 对所有受影响的资产触发重算引擎
    for aid in affected_asset_ids:
        await recalc_asset(aid, user.id, db)

    await db.commit()

    # 清理会话
    _sessions.pop(body.session_id, None)

    return ImportConfirmResponse(
        imported_count=imported,
        skipped_count=skipped,
        new_assets_created=new_assets_count,
        errors=errors,
    )


# ── 下载 CSV 模板 ─────────────────────────────────
@router.get("/template")
async def download_template():
    """下载标准 CSV 导入模板"""
    from fastapi.responses import StreamingResponse
    header = "代码,名称,方向,成交价,数量,手续费,成交日期,备注\n"
    sample = "AAPL,苹果公司,买入,178.50,100,5.00,2024-01-15,首次建仓\nNVDA,英伟达,买入,520.00,50,3.50,2024-02-01,加仓\nAAPL,苹果公司,卖出,195.00,50,5.00,2024-03-10,止盈一半\n"
    content = header + sample
    return StreamingResponse(
        io.StringIO(content),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=seekcost_import_template.csv"},
    )