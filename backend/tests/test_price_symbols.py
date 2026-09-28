import pytest

from app.core.price_updater import get_market_session, to_yahoo_symbol


@pytest.mark.parametrize(
    ("symbol", "market", "expected"),
    [
        ("159516", "cn", "159516.SZ"),
        ("159967", "cn", "159967.SZ"),
        ("513310", "cn", "513310.SS"),
        ("000001", "cn_index", "000001.SS"),
        ("399001", "cn_index", "399001.SZ"),
        ("NQMAIN", "us", "NQ=F"),
        ("SPX", "us", "^GSPC"),
    ],
)
def test_yahoo_symbol_mapping_covers_etfs_indices_and_continuous_futures(symbol, market, expected):
    assert to_yahoo_symbol(symbol, market) == expected


def test_index_market_uses_a_share_trading_session():
    assert get_market_session("cn_index") in {"regular", "closed"}
