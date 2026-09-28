from app.core.quant_strategies.volume_ratio import evaluate_volume_ratio
from app.schemas.prices import DailyBarInput


def bars(volumes: list[float]) -> list[DailyBarInput]:
    return [
        DailyBarInput(
            date=f"2026-08-{index + 1:02d}",
            open=10,
            high=11,
            low=9,
            close=10,
            volume=volume,
        )
        for index, volume in enumerate(volumes)
    ]


def test_latest_volume_is_compared_with_previous_three_sessions_only():
    result = evaluate_volume_ratio(bars([100, 200, 300, 400, 600]))

    assert result.signal == "volume_observation"
    assert result.bar_date == "2026-08-05"
    assert result.metrics.latest_volume == 600
    assert result.metrics.prior_average_volume == 300
    assert result.metrics.volume_ratio_3d == 2
    assert result.metrics.prior_volumes == [200, 300, 400]


def test_volume_ratio_needs_four_completed_sessions():
    result = evaluate_volume_ratio(bars([100, 200, 300]))

    assert result.signal == "insufficient_data"
    assert result.reason_codes == ["insufficient_volume_history"]
    assert result.metrics.volume_ratio_3d is None
