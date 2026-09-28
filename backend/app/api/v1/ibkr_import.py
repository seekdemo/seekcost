"""IBKR (Interactive Brokers) 活动报表 (Activity Statement) 一键导入 API
仅支持中文版活动报表CSV，自动解析"交易"section中的股票买卖记录，
自动创建资产、去重、触发重算。

活动报表"交易"section Header (16列):
  DataDiscriminator, 资产分类, 货币, 代码, 日期/时间, 数量, 交易价格,
  收盘价格, 收益, 佣金/税, 基础, 已实现的损益, 按市值计算的损益, 代码(尾)

核心函数：
- _parse_activity_statement(text) → 解析活动报表"交易"section
- _make_fingerprint(...) → 去重指纹(symbol, tx_type, price, quantity, datetime)
- POST /import/ibkr/preview → 上传解析预览
- POST /import/ibkr/confirm → 确认导入
"""
import csv
import hashlib
import io
import re
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.recalc import recalc_asset
from app.models.user import User
from app.models.asset import Asset, AssetCategory, AssetZone, detect_market
from app.models.cash_account import CashAccount
from app.models.ibkr_cash_flow import IBKRCashFlowRecord
from app.models.ibkr_lot import IBKRLotRecord
from app.models.transaction import Transaction, TransactionType

router = APIRouter(prefix="/import/ibkr", tags=["IBKR导入"])

_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def _apply_ibkr_asset_metrics(
    asset: Asset,
    *,
    cost_price: float | None = None,
    realized_pnl: float | None = None,
) -> None:
    """Apply broker-authoritative metrics without changing positive-profit recovery."""
    if cost_price is not None and float(asset.quantity) > 0:
        if abs(float(asset.broker_cost) - cost_price) > 0.001:
            asset.broker_cost = cost_price
            asset.mental_cost = cost_price
    if realized_pnl is not None:
        asset.total_realized_pnl = realized_pnl


class IBKRParsedRow(BaseModel):
    """解析后的单条交易记录"""
    datetime_str: str       # "2026-02-09, 12:27:40" 精确到秒
    date: str               # "2026-02-09" 向前端兼容
    tx_type: str            # buy / sell
    symbol: str
    quantity: float
    price: float            # 交易价格
    close_price: float      # 收盘价格
    currency: str
    amount: float           # 收益（正=卖出收入, 负=买入支出）
    commission: float       # 佣金/税（绝对值）
    cost_basis: float       # 基础
    realized_pnl: float     # 已实现的损益
    mtm_pnl: float          # 按市值计算的损益
    trade_codes: str        # O/C/SL/P 等
    description: str        # 组合描述


class IBKRCashFlow(BaseModel):
    """存取款记录"""
    date: str               # 结算日期 "2026-01-27"
    currency: str           # HKD / USD
    description: str        # 电子资金转账 / 内部转入等券商原始描述
    amount: float           # 金额（正=存入, 负=取出）
    flow_type: str          # deposit / withdrawal


class IBKRCashBalance(BaseModel):
    """IBKR现金报告中的分币种期末现金"""
    currency: str
    ending_cash: float
    settled_cash: float | None = None


class IBKRLot(BaseModel):
    """IBKR持仓批次明细"""
    open_datetime: str      # 买入时间 "2026-02-09, 13:21:14"
    quantity: float
    cost_price: float       # 每股成本价
    cost_basis: float       # 成本基础
    close_price: float      # 收盘价格
    market_value: float     # 市值
    unrealized_pnl: float   # 未实现损益


class IBKROpenPosition(BaseModel):
    """IBKR未平仓持仓"""
    symbol: str
    currency: str
    quantity: float
    multiplier: float       # 合约乘数
    cost_price: float       # 成本价格
    cost_basis: float       # 成本基础
    close_price: float      # 收盘价格
    market_value: float     # 市值
    unrealized_pnl: float   # 未实现损益
    lots: list[IBKRLot]     # 逐批次明细（新格式才有）


class IBKRPreviewResponse(BaseModel):
    total_rows: int           # 交易section总行数
    trade_rows: int           # 股票买卖交易行数
    skipped_rows: int         # 跳过的行数（外汇/SubTotal/Total等）
    duplicate_rows: int       # 重复行数
    new_assets: list[str]     # 需要新建的资产
    existing_assets: list[str]
    rows: list[IBKRParsedRow]
    duplicates: list[IBKRParsedRow]
    cash_flows: list[IBKRCashFlow]  # 存取款记录
    cash_balances: list[IBKRCashBalance]  # 分币种期末现金
    total_deposits: float     # 存款合计
    total_withdrawals: float  # 取款合计
    open_positions: list[IBKROpenPosition]   # 未平仓持仓
    ibkr_total_cost_basis: float             # IBKR持仓总成本
    ibkr_total_market_value: float           # IBKR持仓总市值
    ibkr_total_unrealized_pnl: float         # IBKR未实现浮盈总计
    ibkr_realized_pnl: float                 # IBKR已实现损益总数
    product_names: dict[str, str]             # 股票代码→全名 {AVGO: "BROADCOM INC"}
    session_id: str


class IBKRConfirmRequest(BaseModel):
    session_id: str
    zone: str = "active"
    category: str = "stock"
    skip_duplicates: bool = True
    selected_indices: list[int] | None = None


class IBKRConfirmResponse(BaseModel):
    imported_count: int
    skipped_count: int
    duplicate_count: int
    new_assets_created: int
    cash_assets_synced: int = 0
    errors: list[str]


class IBKRParsedPreviewRequest(BaseModel):
    total_trade_lines: int | None = None
    rows: list[IBKRParsedRow]
    cash_flows: list[IBKRCashFlow] = []
    cash_balances: list[IBKRCashBalance] = []
    open_positions: list[IBKROpenPosition] = []
    realized_by_symbol: dict[str, float] = {}
    product_names: dict[str, str] = {}


# 内存会话缓存
_ibkr_sessions: dict[str, dict] = {}
_MAX_SESSIONS = 30


def _parse_number(raw: str) -> float | None:
    """解析数值，处理逗号千分位、负号等"""
    if not raw or raw == "-" or raw == "--":
        return None
    s = raw.strip().replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def _make_cash_flow_fingerprint(flow: IBKRCashFlow) -> str:
    """为 IBKR 存取款流水生成去重指纹。"""
    raw = "|".join([
        flow.date.strip(),
        flow.currency.strip().upper(),
        f"{flow.amount:.4f}",
        flow.description.strip(),
        flow.flow_type.strip().lower(),
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _parse_activity_statement(text: str) -> tuple[list[IBKRParsedRow], int]:
    """解析活动报表CSV的"交易"section，提取股票买卖记录。

    自动兼容新旧两种Header格式:
    - 旧: ...,代码,日期/时间,数量,交易价格,收盘价格,...       (16列)
    - 新: ...,代码,日期/时间,交易所,数量,交易价格,收盘价格,...  (17列,多一个交易所)
    """
    lines = text.strip().split("\n")
    trades: list[IBKRParsedRow] = []
    in_stock_section = False
    total_trade_lines = 0
    # 交易所列偏移: 新格式在日期/时间后多一列"交易所"
    exchange_offset = 0

    for line in lines:
        reader = csv.reader(io.StringIO(line))
        parts = next(reader, [])
        if len(parts) < 4:
            continue

        section = parts[0].strip()
        row_type = parts[1].strip()

        # 只处理"交易"section
        if section != "交易":
            continue

        # Header行: 检查是否是股票section，并检测是否有交易所列
        if row_type == "Header":
            header_text = ",".join(parts)
            if "收盘价格" in header_text:
                in_stock_section = True
                # 检测是否包含"交易所"列
                exchange_offset = 1 if "交易所" in header_text else 0
            else:
                in_stock_section = False
            continue

        # 只处理股票section中的Data行
        if row_type != "Data" or not in_stock_section:
            continue

        total_trade_lines += 1

        discriminator = parts[2].strip() if len(parts) > 2 else ""
        if discriminator != "Order":
            continue

        asset_class = parts[3].strip() if len(parts) > 3 else ""
        if asset_class != "股票":
            continue

        # 解析字段（使用偏移量兼容新旧格式）
        o = exchange_offset
        currency = parts[4].strip() if len(parts) > 4 else "USD"
        symbol = parts[5].strip().upper() if len(parts) > 5 else ""
        datetime_str = parts[6].strip() if len(parts) > 6 else ""
        # parts[7] 在新格式中是交易所("-")，跳过
        qty_raw = parts[7 + o].strip() if len(parts) > 7 + o else ""
        price_raw = parts[8 + o].strip() if len(parts) > 8 + o else ""
        close_price_raw = parts[9 + o].strip() if len(parts) > 9 + o else ""
        proceeds_raw = parts[10 + o].strip() if len(parts) > 10 + o else ""
        commission_raw = parts[11 + o].strip() if len(parts) > 11 + o else ""
        basis_raw = parts[12 + o].strip() if len(parts) > 12 + o else ""
        realized_pnl_raw = parts[13 + o].strip() if len(parts) > 13 + o else ""
        mtm_pnl_raw = parts[14 + o].strip() if len(parts) > 14 + o else ""
        trade_codes = parts[15 + o].strip() if len(parts) > 15 + o else ""

        if not symbol or symbol == "-":
            continue

        qty = _parse_number(qty_raw)
        price = _parse_number(price_raw)
        if qty is None or price is None:
            continue

        # 数量: 正=买入, 负=卖出
        if qty > 0:
            tx_type = "buy"
        elif qty < 0:
            tx_type = "sell"
        else:
            continue

        close_price = _parse_number(close_price_raw) or 0.0
        proceeds = _parse_number(proceeds_raw) or 0.0
        commission = _parse_number(commission_raw) or 0.0
        basis = _parse_number(basis_raw) or 0.0
        realized_pnl = _parse_number(realized_pnl_raw) or 0.0
        mtm_pnl = _parse_number(mtm_pnl_raw) or 0.0

        # 提取日期部分用于向前端兼容
        date_part = datetime_str.split(",")[0].strip() if "," in datetime_str else datetime_str

        trades.append(IBKRParsedRow(
            datetime_str=datetime_str,
            date=date_part,
            tx_type=tx_type,
            symbol=symbol,
            quantity=abs(qty),
            price=abs(price),
            close_price=close_price,
            currency=currency,
            amount=proceeds,
            commission=abs(commission),
            cost_basis=abs(basis),
            realized_pnl=realized_pnl,
            mtm_pnl=mtm_pnl,
            trade_codes=trade_codes,
            description=f"{symbol} {tx_type.upper()} {abs(qty)}@{abs(price)}",
        ))

    return trades, total_trade_lines


def _parse_cash_flows(text: str) -> list[IBKRCashFlow]:
    """解析活动报表CSV的"存款和取款"section。

    格式:
    - 存款和取款,Header,货币,结算日期,描述,金额
    - 存款和取款,Data,HKD,2026-01-27,电子资金转账,9800
    - 存款和取款,Data,总数,,,326456  (跳过汇总行)
    """
    lines = text.strip().split("\n")
    flows: list[IBKRCashFlow] = []

    for line in lines:
        reader = csv.reader(io.StringIO(line))
        parts = next(reader, [])
        if len(parts) < 6:
            continue

        section = parts[0].strip()
        row_type = parts[1].strip()

        if section != "存款和取款" or row_type != "Data":
            continue

        currency = parts[2].strip()
        date_str = parts[3].strip()
        desc = parts[4].strip()
        amount_raw = parts[5].strip()

        # 跳过汇总行（"总数" / "总数 USD" / "总数 存款和取款 在 USD"）
        if currency.startswith("总数") or not date_str:
            continue

        amount = _parse_number(amount_raw)
        if amount is None:
            continue

        flow_type = "deposit" if amount >= 0 else "withdrawal"

        flows.append(IBKRCashFlow(
            date=date_str,
            currency=currency,
            description=desc,
            amount=amount,
            flow_type=flow_type,
        ))

    return flows


def _parse_cash_balances(text: str) -> list[IBKRCashBalance]:
    """解析活动报表CSV的"现金报告"section，提取分币种期末现金。

    期末现金才是当前 IBKR 账户里的现金资产余额；存取款流水只表示入出金历史。
    """
    by_currency: dict[str, dict[str, float | None]] = {}

    for line in text.strip().split("\n"):
        reader = csv.reader(io.StringIO(line))
        parts = next(reader, [])
        if len(parts) < 5:
            continue

        section = parts[0].strip()
        row_type = parts[1].strip()
        metric = parts[2].strip()
        currency = parts[3].strip().upper()

        if section != "现金报告" or row_type != "Data":
            continue
        if not currency or currency == "基础货币总结" or currency.startswith("总数"):
            continue
        if metric not in ("期末现金", "期末已结算现金"):
            continue

        amount = _parse_number(parts[4].strip())
        if amount is None:
            continue

        bucket = by_currency.setdefault(currency, {"ending_cash": None, "settled_cash": None})
        if metric == "期末现金":
            bucket["ending_cash"] = amount
        else:
            bucket["settled_cash"] = amount

    balances: list[IBKRCashBalance] = []
    for currency, values in by_currency.items():
        ending_cash = values.get("ending_cash")
        if ending_cash is None:
            continue
        balances.append(IBKRCashBalance(
            currency=currency,
            ending_cash=ending_cash,
            settled_cash=values.get("settled_cash"),
        ))
    return sorted(balances, key=lambda item: item.currency)


def _market_for_cash_currency(currency: str) -> str:
    """Preserve the currency market for valuation; UI groups is_cash separately."""
    cur = currency.upper()
    if cur == "USD":
        return "us"
    if cur == "HKD":
        return "hk"
    if cur == "CNY":
        return "cn"
    return "other"


def _parse_product_info(text: str) -> dict[str, str]:
    """解析"金融产品信息"section，返回 {symbol: 描述/全名} 映射。

    格式:
    金融产品信息,Data,股票,AVGO,BROADCOM INC,合约编号,证券号码,...
    parts[3]=代码, parts[4]=描述(全名)
    """
    lines = text.strip().split("\n")
    result: dict[str, str] = {}

    for line in lines:
        reader = csv.reader(io.StringIO(line))
        parts = next(reader, [])
        if len(parts) < 5:
            continue

        section = parts[0].strip()
        row_type = parts[1].strip()

        if section != "金融产品信息" or row_type != "Data":
            continue

        asset_class = parts[2].strip()
        if asset_class != "股票":
            continue

        symbol = parts[3].strip().upper()
        description = parts[4].strip()
        if symbol and description:
            result[symbol] = description

    return result


def _parse_open_positions(text: str) -> list[IBKROpenPosition]:
    """解析活动报表CSV的"未平仓持仓"section（Summary + Lot行）。

    自动兼容新旧两种Header:
    - 旧: ...,代码,数量,合约乘数,成本价格,...           (无"开盘"列)
    - 新: ...,代码,开盘,数量,合约乘数,成本价格,...       (多一列"开盘")

    新格式的Lot行包含逐批次的买入时间、数量、成本价、盈亏。
    """
    lines = text.strip().split("\n")
    positions: list[IBKROpenPosition] = []
    # 检测是否有"开盘"列
    has_open_col = False
    current_symbol = ""

    for line in lines:
        reader = csv.reader(io.StringIO(line))
        parts = next(reader, [])
        if len(parts) < 10:
            continue

        section = parts[0].strip()
        row_type = parts[1].strip()

        if section != "未平仓持仓":
            continue

        # 检测Header
        if row_type == "Header":
            header_text = ",".join(parts)
            has_open_col = "开盘" in header_text
            continue

        if row_type != "Data":
            continue

        discriminator = parts[2].strip() if len(parts) > 2 else ""
        asset_class = parts[3].strip() if len(parts) > 3 else ""
        if asset_class != "股票":
            continue

        currency = parts[4].strip() if len(parts) > 4 else "USD"
        symbol = parts[5].strip().upper() if len(parts) > 5 else ""

        o = 1 if has_open_col else 0  # 列偏移

        if discriminator == "Summary":
            if not symbol:
                continue
            current_symbol = symbol
            qty = _parse_number(parts[6 + o]) if len(parts) > 6 + o else None
            multiplier = _parse_number(parts[7 + o]) if len(parts) > 7 + o else 1.0
            cost_price = _parse_number(parts[8 + o]) if len(parts) > 8 + o else None
            cost_basis = _parse_number(parts[9 + o]) if len(parts) > 9 + o else None
            close_price = _parse_number(parts[10 + o]) if len(parts) > 10 + o else None
            market_value = _parse_number(parts[11 + o]) if len(parts) > 11 + o else None
            unrealized_pnl = _parse_number(parts[12 + o]) if len(parts) > 12 + o else None

            if qty is None or cost_price is None:
                continue

            positions.append(IBKROpenPosition(
                symbol=symbol,
                currency=currency,
                quantity=qty,
                multiplier=multiplier or 1.0,
                cost_price=cost_price,
                cost_basis=cost_basis or 0.0,
                close_price=close_price or 0.0,
                market_value=market_value or 0.0,
                unrealized_pnl=unrealized_pnl or 0.0,
                lots=[],
            ))

        elif discriminator == "Lot" and has_open_col:
            # Lot行: 逐批次明细（仅新格式有）
            open_datetime = parts[6].strip() if len(parts) > 6 else ""
            lot_qty = _parse_number(parts[7]) if len(parts) > 7 else None
            # Lot行合约乘数为空，跳过 parts[8]
            lot_cost_price = _parse_number(parts[9]) if len(parts) > 9 else None
            lot_cost_basis = _parse_number(parts[10]) if len(parts) > 10 else None
            lot_close_price = _parse_number(parts[11]) if len(parts) > 11 else None
            lot_market_value = _parse_number(parts[12]) if len(parts) > 12 else None
            lot_unrealized_pnl = _parse_number(parts[13]) if len(parts) > 13 else None

            if lot_qty is None or lot_cost_price is None:
                continue

            # 添加到最近的Summary位置
            if positions and positions[-1].symbol == current_symbol:
                positions[-1].lots.append(IBKRLot(
                    open_datetime=open_datetime,
                    quantity=lot_qty,
                    cost_price=lot_cost_price,
                    cost_basis=lot_cost_basis or 0.0,
                    close_price=lot_close_price or 0.0,
                    market_value=lot_market_value or 0.0,
                    unrealized_pnl=lot_unrealized_pnl or 0.0,
                ))

    return positions


def _parse_realized_pnl_total(text: str) -> float:
    """解析"已实现和未实现的表现总结"section中的已实现损益总数。

    在Total行取列4(已实现_短期)+列5(已实现_长期)，或直接在格式中找到总数行。
    实际格式:
    已实现和未实现的表现总结,Data,总数,,0,1540.96,-413.82,0,0,1127.14,...
    第6列(index 9) = 已实现总计 = 短期已实现 + 长期已实现
    """
    lines = text.strip().split("\n")

    for line in lines:
        reader = csv.reader(io.StringIO(line))
        parts = next(reader, [])
        if len(parts) < 10:
            continue

        section = parts[0].strip()
        row_type = parts[1].strip()

        if section != "已实现和未实现的表现总结" or row_type != "Data":
            continue

        # 总数行: parts[2] = "总数", parts[3] = "" (空)
        label = parts[2].strip() if len(parts) > 2 else ""
        category = parts[3].strip() if len(parts) > 3 else ""
        if label == "总数" and not category:
            # parts[9] = 已实现合计(短期+长期)
            realized_total = _parse_number(parts[9]) if len(parts) > 9 else None
            if realized_total is not None:
                return realized_total
            # fallback: 取 parts[4] + parts[5] (短期已实现 + 长期已实现)
            short_realized = _parse_number(parts[4]) if len(parts) > 4 else 0.0
            long_realized = _parse_number(parts[5]) if len(parts) > 5 else 0.0
            return (short_realized or 0.0) + (long_realized or 0.0)

    return 0.0


def _parse_realized_pnl_by_symbol(text: str) -> dict[str, float]:
    """解析"已实现和未实现的表现总结"section，返回每只股票的已实现损益。

    格式:
    已实现和未实现的表现总结,Data,股票,CEG,...,已实现总数,...
    parts[2]=资产分类, parts[3]=代码, parts[9]=已实现总数
    """
    lines = text.strip().split("\n")
    result: dict[str, float] = {}

    for line in lines:
        reader = csv.reader(io.StringIO(line))
        parts = next(reader, [])
        if len(parts) < 10:
            continue

        section = parts[0].strip()
        row_type = parts[1].strip()

        if section != "已实现和未实现的表现总结" or row_type != "Data":
            continue

        asset_class = parts[2].strip()
        symbol = parts[3].strip().upper()

        if asset_class != "股票" or not symbol or symbol == "总数":
            continue

        realized_total = _parse_number(parts[9])
        if realized_total is not None:
            result[symbol] = realized_total

    return result


def _make_fingerprint(symbol: str, tx_type: str, price: float,
                      quantity: float, datetime_str: str) -> tuple:
    """生成去重指纹：使用精确时间戳避免同日同价去重过度"""
    return (symbol, tx_type, round(price, 4), round(quantity, 4), datetime_str)


def _serialize_fingerprint(symbol: str, tx_type: str, price: float,
                           quantity: float, datetime_str: str) -> str:
    symbol = symbol.strip().upper()
    tx_type = tx_type.strip().lower()
    normalized_dt = datetime_str.strip().replace(", ", ",")
    return f"{symbol}|{tx_type}|{round(price, 4):.4f}|{round(quantity, 4):.4f}|{normalized_dt}"


def _parse_datetime(datetime_str: str) -> datetime | None:
    """解析活动报表中的精确时间戳: '2026-02-09, 12:27:40'"""
    datetime_str = datetime_str.strip()
    for fmt in ("%Y-%m-%d, %H:%M:%S", "%Y-%m-%d,%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(datetime_str, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


async def _build_preview_response(
    *,
    db: AsyncSession,
    user: User,
    trades: list[IBKRParsedRow],
    total_trade_lines: int,
    cash_flows: list[IBKRCashFlow],
    cash_balances: list[IBKRCashBalance],
    open_positions: list[IBKROpenPosition],
    ibkr_realized_pnl: float,
    ibkr_realized_by_symbol: dict[str, float],
    product_names: dict[str, str],
) -> IBKRPreviewResponse:
    result = await db.execute(select(Asset).where(Asset.user_id == user.id))
    user_assets = {a.symbol.upper(): a for a in result.scalars().all()}

    tx_result = await db.execute(
        select(Transaction).join(Asset).where(Asset.user_id == user.id)
    )
    existing_txs = tx_result.scalars().all()

    existing_fps: set[tuple] = set()
    id_to_symbol = {a.id: s for s, a in user_assets.items()}
    for tx in existing_txs:
        sym = id_to_symbol.get(tx.asset_id, "")
        if not sym:
            continue
        dt_str = tx.created_at.strftime("%Y-%m-%d, %H:%M:%S") if tx.created_at else ""
        existing_fps.add(_make_fingerprint(
            sym, tx.tx_type.value, float(tx.price), float(tx.quantity), dt_str,
        ))
        date_str = tx.created_at.strftime("%Y-%m-%d") if tx.created_at else ""
        existing_fps.add(_make_fingerprint(
            sym, tx.tx_type.value, float(tx.price), float(tx.quantity), date_str,
        ))

    file_fps: set[tuple] = set()
    new_rows: list[IBKRParsedRow] = []
    dup_rows: list[IBKRParsedRow] = []
    new_symbols: set[str] = set()
    existing_symbols: set[str] = set()

    for t in trades:
        fp = _make_fingerprint(t.symbol, t.tx_type, t.price, t.quantity, t.datetime_str)
        if fp in existing_fps or fp in file_fps:
            dup_rows.append(t)
        else:
            new_rows.append(t)
            file_fps.add(fp)

        if t.symbol in user_assets:
            existing_symbols.add(t.symbol)
        else:
            new_symbols.add(t.symbol)

    import uuid
    session_id = str(uuid.uuid4())[:12]
    if len(_ibkr_sessions) >= _MAX_SESSIONS:
        oldest = list(_ibkr_sessions.keys())[:10]
        for k in oldest:
            _ibkr_sessions.pop(k, None)
    _ibkr_sessions[session_id] = {
        "user_id": user.id,
        "new_rows": new_rows,
        "dup_rows": dup_rows,
        "cash_flows": cash_flows,
        "cash_balances": cash_balances,
        "open_positions": open_positions,
        "realized_by_symbol": ibkr_realized_by_symbol,
        "product_names": product_names,
    }

    skipped = total_trade_lines - len(trades)
    total_deposits = sum(cf.amount for cf in cash_flows if cf.amount > 0)
    total_withdrawals = sum(cf.amount for cf in cash_flows if cf.amount < 0)
    ibkr_total_cost_basis = sum(p.cost_basis for p in open_positions)
    ibkr_total_market_value = sum(p.market_value for p in open_positions)
    ibkr_total_unrealized_pnl = sum(p.unrealized_pnl for p in open_positions)

    return IBKRPreviewResponse(
        total_rows=total_trade_lines,
        trade_rows=len(trades),
        skipped_rows=skipped,
        duplicate_rows=len(dup_rows),
        new_assets=sorted(new_symbols),
        existing_assets=sorted(existing_symbols),
        rows=new_rows,
        duplicates=dup_rows,
        cash_flows=cash_flows,
        cash_balances=cash_balances,
        total_deposits=round(total_deposits, 2),
        total_withdrawals=round(total_withdrawals, 2),
        open_positions=open_positions,
        ibkr_total_cost_basis=round(ibkr_total_cost_basis, 2),
        ibkr_total_market_value=round(ibkr_total_market_value, 2),
        ibkr_total_unrealized_pnl=round(ibkr_total_unrealized_pnl, 2),
        ibkr_realized_pnl=round(ibkr_realized_pnl, 2),
        product_names=product_names,
        session_id=session_id,
    )


@router.post("/preview")
async def ibkr_preview(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IBKRPreviewResponse:
    """上传 IBKR 活动报表 CSV，自动解析并预览"""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "仅支持 .csv 文件")

    content = await file.read()
    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(400, "文件过大，最大支持 10MB")

    # 解码
    text = None
    for enc in ("utf-8-sig", "utf-8", "gbk", "gb2312", "latin-1"):
        try:
            text = content.decode(enc)
            break
        except (UnicodeDecodeError, LookupError):
            continue
    if text is None:
        raise HTTPException(400, "无法识别文件编码")

    # 验证是否为活动报表
    if "活动账单" not in text and "Activity Statement" not in text:
        raise HTTPException(400, "请上传IBKR活动报表(Activity Statement)，非交易记录(Transaction History)")

    # 解析
    trades, total_trade_lines = _parse_activity_statement(text)
    if not trades:
        raise HTTPException(400, "未找到股票交易记录，请确认活动报表包含交易数据")

    # 解析存取款
    cash_flows = _parse_cash_flows(text)
    cash_balances = _parse_cash_balances(text)

    # 解析未平仓持仓
    open_positions = _parse_open_positions(text)

    # 解析已实现损益总数和逐票明细
    ibkr_realized_pnl = _parse_realized_pnl_total(text)
    ibkr_realized_by_symbol = _parse_realized_pnl_by_symbol(text)

    # 解析金融产品信息（股票全名）
    product_names = _parse_product_info(text)

    return await _build_preview_response(
        db=db,
        user=user,
        trades=trades,
        total_trade_lines=total_trade_lines,
        cash_flows=cash_flows,
        cash_balances=cash_balances,
        open_positions=open_positions,
        ibkr_realized_pnl=ibkr_realized_pnl,
        ibkr_realized_by_symbol=ibkr_realized_by_symbol,
        product_names=product_names,
    )


@router.post("/preview-parsed")
async def ibkr_preview_parsed(
    body: IBKRParsedPreviewRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IBKRPreviewResponse:
    """接收前端本地解析后的股票交易 JSON，服务端仅做去重与预览。"""
    if not body.rows:
        raise HTTPException(400, "未找到可导入的股票交易记录")

    return await _build_preview_response(
        db=db,
        user=user,
        trades=body.rows,
        total_trade_lines=body.total_trade_lines or len(body.rows),
        cash_flows=body.cash_flows,
        cash_balances=body.cash_balances,
        open_positions=body.open_positions,
        ibkr_realized_pnl=sum(body.realized_by_symbol.values()),
        ibkr_realized_by_symbol=body.realized_by_symbol,
        product_names=body.product_names,
    )


@router.post("/confirm")
async def ibkr_confirm(
    body: IBKRConfirmRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IBKRConfirmResponse:
    """确认导入 IBKR 交易记录"""
    sess = _ibkr_sessions.get(body.session_id)
    if not sess or sess["user_id"] != user.id:
        raise HTTPException(400, "会话已过期，请重新上传文件")

    new_rows: list[IBKRParsedRow] = sess["new_rows"]
    dup_rows: list[IBKRParsedRow] = sess["dup_rows"]
    open_positions: list[IBKROpenPosition] = sess.get("open_positions", [])
    cash_flows: list[IBKRCashFlow] = sess.get("cash_flows", [])
    cash_balances: list[IBKRCashBalance] = sess.get("cash_balances", [])
    realized_by_symbol: dict[str, float] = sess.get("realized_by_symbol", {})
    product_names: dict[str, str] = sess.get("product_names", {})

    # 合并要导入的行
    rows_to_import = list(new_rows)
    if not body.skip_duplicates:
        rows_to_import.extend(dup_rows)

    # 过滤选中行
    if body.selected_indices is not None:
        selected = set(body.selected_indices)
        rows_to_import = [r for i, r in enumerate(rows_to_import) if i in selected]

    # 获取用户资产
    result = await db.execute(select(Asset).where(Asset.user_id == user.id))
    user_assets = {a.symbol.upper(): a for a in result.scalars().all()}
    tx_result = await db.execute(
        select(Transaction).join(Asset).where(Asset.user_id == user.id)
    )
    existing_txs = tx_result.scalars().all()
    existing_import_fps: set[str] = set()
    id_to_symbol = {a.id: s for s, a in user_assets.items()}
    for tx in existing_txs:
        if tx.import_fingerprint:
            existing_import_fps.add(tx.import_fingerprint)
            continue
        sym = id_to_symbol.get(tx.asset_id, "")
        if not sym:
            continue
        dt_str = tx.created_at.strftime("%Y-%m-%d, %H:%M:%S") if tx.created_at else ""
        existing_import_fps.add(_serialize_fingerprint(
            sym, tx.tx_type.value, float(tx.price), float(tx.quantity), dt_str,
        ))

    imported = 0
    skipped = 0
    new_assets_count = 0
    errors: list[str] = []
    affected_asset_ids: set[int] = set()
    inserted_fps: set[str] = set()

    # 按时间正序排列（活动报表有精确时间戳，直接排序即可）
    sorted_rows = sorted(rows_to_import, key=lambda r: r.datetime_str)

    for row in sorted_rows:
        symbol = row.symbol
        import_fp = _serialize_fingerprint(
            row.symbol, row.tx_type, row.price, row.quantity, row.datetime_str,
        )
        if import_fp in existing_import_fps or import_fp in inserted_fps:
            skipped += 1
            continue

        asset = user_assets.get(symbol)

        if not asset:
            market = detect_market(symbol, body.category)
            # 优先用金融产品信息中的全名
            asset_name = product_names.get(symbol, symbol)
            asset = Asset(
                user_id=user.id,
                symbol=symbol,
                name=asset_name,
                zone=body.zone,
                category=body.category,
                market=market,
            )
            db.add(asset)
            await db.flush()
            user_assets[symbol] = asset
            new_assets_count += 1
        else:
            # 已有资产：如果名称是symbol本身，用全名更新
            if symbol in product_names and (asset.name == symbol or asset.name == symbol.upper()):
                asset.name = product_names[symbol]

        # 解析精确时间戳
        tx_date = _parse_datetime(row.datetime_str)
        if not tx_date:
            tx_date = datetime.now(timezone.utc)

        tx_type = TransactionType.BUY if row.tx_type == "buy" else TransactionType.SELL
        tx = Transaction(
            asset_id=asset.id,
            tx_type=tx_type,
            price=row.price,
            quantity=row.quantity,
            fee=row.commission,
            note=f"IBKR导入 {row.trade_codes}",
            import_fingerprint=import_fp,
            created_at=tx_date,
        )
        db.add(tx)
        affected_asset_ids.add(asset.id)
        inserted_fps.add(import_fp)
        imported += 1

    await db.flush()

    # 重算所有受影响的资产
    for aid in affected_asset_ids:
        await recalc_asset(aid, user.id, db)
    await db.flush()

    # 用IBKR未平仓持仓的成本价格覆盖DB的broker_cost（修正SL特定批次导致的差异）
    # 同时用IBKR逐票已实现损益覆盖净已实现盈亏（修正FIFO vs Specific Lot差异）。
    # total_cashed 只保留“累计正利润”口径，不能再写入券商净盈亏。
    if open_positions or realized_by_symbol:
        ibkr_cost_map = {p.symbol: p.cost_price for p in open_positions}
        # 重新查询最新资产状态
        result2 = await db.execute(select(Asset).where(Asset.user_id == user.id))
        for asset in result2.scalars().all():
            sym = asset.symbol.upper()
            _apply_ibkr_asset_metrics(
                asset,
                cost_price=ibkr_cost_map.get(sym),
                realized_pnl=realized_by_symbol.get(sym),
            )

    # 存储 IBKR Lot 批次数据到数据库（每次导入覆盖同一资产的旧 lots）
    if open_positions:
        # 重新获取最新的 user_assets 映射
        result3 = await db.execute(select(Asset).where(Asset.user_id == user.id))
        latest_assets = {a.symbol.upper(): a for a in result3.scalars().all()}
        for pos in open_positions:
            asset_obj = latest_assets.get(pos.symbol)
            if not asset_obj or not pos.lots:
                continue
            # 删除该资产的旧 lots
            from sqlalchemy import delete
            await db.execute(
                delete(IBKRLotRecord).where(IBKRLotRecord.asset_id == asset_obj.id)
            )
            # 写入新 lots
            for lot in pos.lots:
                db.add(IBKRLotRecord(
                    asset_id=asset_obj.id,
                    symbol=pos.symbol,
                    open_datetime=lot.open_datetime,
                    quantity=lot.quantity,
                    cost_price=lot.cost_price,
                    cost_basis=lot.cost_basis,
                    close_price=lot.close_price,
                    market_value=lot.market_value,
                    unrealized_pnl=lot.unrealized_pnl,
                ))

    # 存储 IBKR 入金/出金流水。这个指标用于 dashboard 的“累计转入 IBKR”，
    # 不能用股票买入交易额替代。
    if cash_flows:
        existing_flow_result = await db.execute(
            select(IBKRCashFlowRecord.import_fingerprint).where(
                IBKRCashFlowRecord.user_id == user.id
            )
        )
        existing_flow_fps = set(existing_flow_result.scalars().all())
        inserted_flow_fps: set[str] = set()
        for flow in cash_flows:
            flow_fp = _make_cash_flow_fingerprint(flow)
            if flow_fp in existing_flow_fps or flow_fp in inserted_flow_fps:
                continue
            db.add(IBKRCashFlowRecord(
                user_id=user.id,
                date=flow.date.strip(),
                currency=flow.currency.strip().upper(),
                description=flow.description.strip(),
                amount=flow.amount,
                flow_type=flow.flow_type,
                import_fingerprint=flow_fp,
            ))
            inserted_flow_fps.add(flow_fp)

    cash_assets_synced = 0
    if cash_balances:
        cash_asset_result = await db.execute(
            select(Asset).where(
                Asset.user_id == user.id,
                Asset.is_cash == True,
            )
        )
        cash_asset_map = {asset.symbol.upper(): asset for asset in cash_asset_result.scalars().all()}

        # 清理旧版本曾错误同步到“储备现金账户”的 IBKR 现金，避免场内现金混入场外储备。
        stale_account_result = await db.execute(
            select(CashAccount).where(
                CashAccount.user_id == user.id,
                CashAccount.name.in_([f"IBKR {balance.currency.strip().upper()}" for balance in cash_balances]),
            )
        )
        for account in stale_account_result.scalars().all():
            if (account.note or "").startswith("IBKR活动报表同步"):
                await db.delete(account)

        for balance in cash_balances:
            currency = balance.currency.strip().upper()
            symbol = f"IBKR-{currency}-CASH"
            name = f"IBKR {currency} 现金"

            asset = cash_asset_map.get(symbol)
            if not asset:
                asset = Asset(
                    user_id=user.id,
                    symbol=symbol,
                    name=name,
                    zone=AssetZone.ACTIVE,
                    category=AssetCategory.STOCK,
                    market=_market_for_cash_currency(currency),
                    broker_cost=1,
                    mental_cost=1,
                    quantity=balance.ending_cash,
                    current_price=1,
                    total_invested=0,
                    actual_investment=0,
                    planned_investment=0,
                    is_cash=True,
                    archived=False,
                )
                db.add(asset)
                cash_asset_map[symbol] = asset
            else:
                asset.name = name
                asset.zone = AssetZone.ACTIVE
                asset.category = AssetCategory.STOCK
                asset.market = _market_for_cash_currency(currency)
                asset.broker_cost = 1
                asset.mental_cost = 1
                asset.quantity = balance.ending_cash
                asset.current_price = 1
                asset.is_cash = True
                asset.archived = False
                asset.archived_note = None
            cash_assets_synced += 1

    await db.commit()

    # 清理会话
    _ibkr_sessions.pop(body.session_id, None)

    dup_count = len(dup_rows)

    return IBKRConfirmResponse(
        imported_count=imported,
        skipped_count=skipped,
        duplicate_count=dup_count,
        new_assets_created=new_assets_count,
        cash_assets_synced=cash_assets_synced,
        errors=errors,
    )
