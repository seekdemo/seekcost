from app.api.v1.ibkr_import import (
    IBKROpenPosition,
    _compare_imported_positions,
    _infer_trade_symbol_aliases,
    _parse_activity_statement,
)
from app.models.asset import Asset, AssetCategory, AssetZone


def test_temporary_ticker_maps_only_with_matching_closed_lot_evidence():
    statement = "\n".join([
        "交易,Header,DataDiscriminator,资产分类,货币,代码,日期/时间,交易所,数量,交易价格,收盘价格,收益,佣金/税,基础,已实现的损益,按市值计算的损益,代码",
        '交易,Data,Order,股票,USD,SKHYV,"2026-07-10, 11:34:47",-,7,170,168,-1190,-0.35,1190.35,0,0,O',
        '交易,Data,Order,股票,USD,SKHYV,"2026-07-10, 11:35:28",-,14,174,168,-2436,-0.62,2436.62,0,0,O',
        '交易,Data,Order,股票,USD,SKHY,"2026-07-14, 10:55:21",-,-21,173,193,3633,-0.4,-3626.97,6.03,0,C',
        '交易,Data,ClosedLot,股票,USD,SKHY,2026-07-10,,7,170.05,,,,1190.35,20,,ST',
        '交易,Data,ClosedLot,股票,USD,SKHY,2026-07-10,,14,174.04,,,,2436.62,-14,,ST',
    ])
    assert _infer_trade_symbol_aliases(statement) == {"SKHYV": "SKHY"}
    trades, _ = _parse_activity_statement(statement)
    assert [(row.symbol, row.tx_type, row.quantity) for row in trades] == [
        ("SKHY", "buy", 7), ("SKHY", "buy", 14), ("SKHY", "sell", 21),
    ]
    assert trades[0].description.startswith("SKHYV BUY")
    assert _infer_trade_symbol_aliases(statement.replace("2436.62,-14", "2400,-14")) == {}


def test_snapshot_difference_is_reported_without_archiving():
    asset = Asset(
        id=1, user_id=1, symbol="SKHYV", name="SKHYV",
        zone=AssetZone.ACTIVE, category=AssetCategory.STOCK,
        quantity=21, is_cash=False, archived=False,
    )
    position = IBKROpenPosition(
        symbol="AVGO", currency="USD", quantity=5, multiplier=1,
        cost_price=100, cost_basis=500, close_price=100,
        market_value=500, unrealized_pnl=0, lots=[],
    )
    assert _compare_imported_positions({"SKHYV": asset}, {1}, [position]) == [
        "SKHYV: 交易流水 21 股，期末持仓 0 股",
    ]
    assert asset.archived is False
    assert asset.quantity == 21
