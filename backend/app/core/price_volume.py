"""Pure, provider-independent price-volume calculations."""
import math
from statistics import stdev

from app.schemas.prices import DailyBarInput, PriceAnchors, PriceVolumeObservation


def _mean(values: list[float]) -> float:
    return sum(values) / len(values)


def _moving_average(closes: list[float], window: int) -> float | None:
    return _mean(closes[-window:]) if len(closes) >= window else None


def _vwap(items: list[DailyBarInput], window: int) -> float | None:
    if len(items) < window:
        return None
    selected = items[-window:]
    total_volume = sum(float(item.volume) for item in selected)
    if total_volume <= 0:
        return None
    weighted_price = sum(
        ((float(item.high) + float(item.low) + float(item.close)) / 3) * float(item.volume)
        for item in selected
    )
    return weighted_price / total_volume


def _completed_range(items: list[DailyBarInput], window: int) -> tuple[float, float] | None:
    # Exclude the latest completed bar so a reference level does not include
    # the same close that is being evaluated.
    if len(items) < window + 1:
        return None
    selected = items[-(window + 1):-1]
    return (
        min(float(item.low) for item in selected),
        max(float(item.high) for item in selected),
    )


def build_price_volume_observation(
    items: list[DailyBarInput],
    anchors: PriceAnchors,
) -> PriceVolumeObservation:
    if not items:
        return PriceVolumeObservation()

    closes = [float(item.close) for item in items]
    ma5 = _moving_average(closes, 5)
    ma20 = _moving_average(closes, 20)
    ma60 = _moving_average(closes, 60)
    ma120 = _moving_average(closes, 120)
    vwap20 = _vwap(items, 20)
    vwap60 = _vwap(items, 60)
    range20 = _completed_range(items, 20)
    range60 = _completed_range(items, 60)

    returns = [closes[index] / closes[index - 1] - 1 for index in range(1, len(closes)) if closes[index - 1] != 0]
    annualized_volatility = stdev(returns) * math.sqrt(252) if len(returns) >= 2 else None

    true_ranges = [
        max(
            float(items[index].high) - float(items[index].low),
            abs(float(items[index].high) - closes[index - 1]),
            abs(float(items[index].low) - closes[index - 1]),
        )
        for index in range(1, len(items))
    ]
    atr14 = _mean(true_ranges[-14:]) if len(true_ranges) >= 14 else None

    peak = closes[0]
    max_drawdown = 0.0
    for close in closes:
        peak = max(peak, close)
        if peak:
            max_drawdown = min(max_drawdown, close / peak - 1)

    relative_volume20 = None
    if len(items) >= 21:
        prior_volume = _mean([float(item.volume) for item in items[-21:-1]])
        if prior_volume > 0:
            relative_volume20 = float(items[-1].volume) / prior_volume

    support20 = resistance20 = None
    if range20:
        support20, resistance20 = range20
    support60 = resistance60 = None
    if range60:
        support60, resistance60 = range60

    current = closes[-1]
    trend_basis = None
    if ma60:
        spread = (current / ma60 - 1) * 100
        alignment = "MA20 is above MA60" if ma20 is not None and ma20 >= ma60 else "MA20 is below MA60"
        trend_basis = f"Price is {abs(spread):.1f}% {'above' if spread >= 0 else 'below'} MA60; {alignment}."

    volume_basis = None
    if relative_volume20 is not None:
        volume_basis = f"Latest volume is {relative_volume20:.2f}x the mean of the prior 20 completed sessions."

    volatility_basis = None
    if annualized_volatility is not None:
        atr_text = f"; ATR14 is {atr14:.2f}" if atr14 is not None else ""
        volatility_basis = (
            f"Annualized volatility is {annualized_volatility * 100:.1f}% using sample standard deviation "
            f"of close-to-close returns scaled by sqrt(252){atr_text}."
        )

    drawdown_basis = f"Maximum drawdown across the loaded range is {max_drawdown * 100:.1f}% from a prior closing peak."

    position_parts = []
    if support60 is not None and resistance60 is not None:
        position_parts.append(f"60-session support {support60:.2f} and resistance {resistance60:.2f}")
    for label, value in (
        ("strike", anchors.strike_price),
        ("fair", anchors.fair_price),
        ("target", anchors.target_price),
    ):
        if value is not None:
            position_parts.append(f"{label} anchor {value:.2f}")
    position_basis = f"Latest close {current:.2f}; " + "; ".join(position_parts) + "." if position_parts else f"Latest close is {current:.2f}; no price anchors are set."

    divergence_basis = None
    if len(items) >= 21 and closes[-21] != 0:
        price_change = (current / closes[-21] - 1) * 100
        if relative_volume20 is None:
            divergence_basis = f"Price changed {price_change:.1f}% over 20 sessions; volume comparison is unavailable."
        elif price_change > 0 and relative_volume20 < 1:
            divergence_basis = f"Price rose {price_change:.1f}% over 20 sessions while latest volume is below its prior-20 mean."
        elif price_change < 0 and relative_volume20 > 1:
            divergence_basis = f"Price fell {abs(price_change):.1f}% over 20 sessions while latest volume is above its prior-20 mean."
        else:
            divergence_basis = f"Price changed {price_change:.1f}% over 20 sessions and latest relative volume is {relative_volume20:.2f}x."

    return PriceVolumeObservation(
        ma5=ma5,
        ma20=ma20,
        ma60=ma60,
        ma120=ma120,
        annualized_volatility=annualized_volatility,
        atr14=atr14,
        max_drawdown=max_drawdown,
        relative_volume20=relative_volume20,
        vwap20=vwap20,
        vwap60=vwap60,
        support20=support20,
        resistance20=resistance20,
        support60=support60,
        resistance60=resistance60,
        trend_basis=trend_basis,
        volume_basis=volume_basis,
        volatility_basis=volatility_basis,
        drawdown_basis=drawdown_basis,
        position_basis=position_basis,
        divergence_basis=divergence_basis,
    )
