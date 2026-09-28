"""Descriptive monitoring defaults; no execution or personalized advice.

Caller supplies chronological completed daily bars, independent of chart range.
Unknown inputs deliberately never produce a 'clear' assessment.
"""
from math import isfinite

from app.schemas.prices import DailyBarInput, PriceRiskAssessment, PriceRiskRule


def assess_price_risk(history: list[DailyBarInput]) -> PriceRiskAssessment:
    bars = history[-126:]
    rules = [
        PriceRiskRule(code="peak_decline", threshold=20),
        PriceRiskRule(code="atr_ratio", threshold=4),
        PriceRiskRule(code="support_break"),
    ]
    result = PriceRiskAssessment(status="insufficient", sample_count=len(bars),
                                 as_of=bars[-1].date if bars else None, rules=rules)
    if not bars or any(
        not all(isfinite(v) and v > 0 for v in (b.open, b.high, b.low, b.close))
        or not b.low <= min(b.open, b.close) <= max(b.open, b.close) <= b.high
        for b in bars
    ):
        return result
    close = bars[-1].close
    if len(bars) == 126:
        peak = max(b.close for b in bars)
        rules[0].value = round((1 - close / peak) * 100, 6)
        rules[0].triggered = close <= peak * 0.8
    if len(bars) >= 15:
        ranges = [max(b.high - b.low, abs(b.high - previous.close), abs(b.low - previous.close))
                  for previous, b in zip(bars[-15:-1], bars[-14:])]
        ratio = sum(ranges) / 14 / close * 100
        rules[1].value = round(ratio, 6)
        rules[1].triggered = ratio >= 4
    if len(bars) >= 21:
        support = min(b.low for b in bars[-21:-1])
        rules[2].value = close
        rules[2].threshold = support
        rules[2].triggered = close < support
    result.status = ("triggered" if any(r.triggered is True for r in rules)
                     else "insufficient" if any(r.triggered is None for r in rules) else "clear")
    return result
