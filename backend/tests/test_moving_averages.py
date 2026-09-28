from app.core.moving_averages import build_moving_average_series
from app.schemas.prices import DailyBarInput


def _bars(count: int) -> list[DailyBarInput]:
    return [
        DailyBarInput(
            date=index,
            open=index + 1,
            high=index + 2,
            low=index,
            close=index + 1,
            volume=100,
        )
        for index in range(count)
    ]


def test_moving_average_series_is_aligned_and_uses_complete_windows():
    result = build_moving_average_series(_bars(260))

    assert len(result) == 260
    assert result[3].ma5 is None
    assert result[4].ma5 == 3
    assert result[9].ma10 == 5.5
    assert result[19].ma20 == 10.5
    assert result[59].ma60 == 30.5
    assert result[119].ma120 == 60.5
    assert result[249].ma250 == 125.5
    assert result[-1].date == 259


def test_moving_average_series_does_not_invent_long_averages():
    result = build_moving_average_series(_bars(20))

    assert result[-1].ma20 == 10.5
    assert result[-1].ma60 is None
    assert result[-1].ma120 is None
    assert result[-1].ma250 is None
