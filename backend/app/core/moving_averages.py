"""Aligned simple moving averages for daily close prices."""

from app.schemas.prices import DailyBarInput, MovingAveragePoint

PERIODS = (5, 10, 20, 60, 120, 250)


def build_moving_average_series(items: list[DailyBarInput]) -> list[MovingAveragePoint]:
    closes = [float(item.close) for item in items]
    rolling = {period: 0.0 for period in PERIODS}
    rows: list[MovingAveragePoint] = []

    for index, item in enumerate(items):
        values: dict[str, float | None] = {}
        for period in PERIODS:
            rolling[period] += closes[index]
            if index >= period:
                rolling[period] -= closes[index - period]
            values[f"ma{period}"] = (
                round(rolling[period] / period, 6)
                if index + 1 >= period
                else None
            )
        rows.append(MovingAveragePoint(date=item.date, **values))

    return rows
