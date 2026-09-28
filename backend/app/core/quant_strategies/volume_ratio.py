"""Latest-volume observation relative to the preceding three sessions."""
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.prices import DailyBarInput

STRATEGY_KEY = "three-day-volume-ratio"
STRATEGY_VERSION = "1.0.0"
DEFAULT_MARKET_DATA_SOURCE = "market_data"


class VolumeRatioParameters(BaseModel):
    lookback_sessions: int = Field(default=3, frozen=True, ge=1)


DEFAULT_PARAMETERS = VolumeRatioParameters()


class VolumeRatioMetrics(BaseModel):
    bar_count: int
    latest_volume: float | None = None
    prior_average_volume: float | None = None
    volume_ratio_3d: float | None = None
    prior_volumes: list[float] = Field(default_factory=list)


class VolumeRatioResult(BaseModel):
    strategy_key: str = STRATEGY_KEY
    strategy_version: str = STRATEGY_VERSION
    source: str = DEFAULT_MARKET_DATA_SOURCE
    signal: Literal["volume_observation", "insufficient_data"]
    reason_codes: list[str] = Field(default_factory=list)
    execution_timing: None = None
    bar_date: int | str | None = None
    metrics: VolumeRatioMetrics


def evaluate_volume_ratio(
    bars: list[DailyBarInput],
    parameters: VolumeRatioParameters = DEFAULT_PARAMETERS,
    *,
    source: str = DEFAULT_MARKET_DATA_SOURCE,
) -> VolumeRatioResult:
    """Compare the latest completed bar with the previous three completed bars.

    The latest bar is deliberately excluded from the denominator. This makes
    the observation answer the question "how unusual is today's volume versus
    the three sessions before it?" rather than comparing a value with a
    moving average that already contains itself.
    """
    lookback = parameters.lookback_sessions
    volumes = [float(bar.volume) for bar in bars]
    latest_volume = volumes[-1] if volumes else None
    prior_volumes = volumes[-(lookback + 1):-1] if len(volumes) >= 2 else []
    prior_average = (
        sum(prior_volumes) / lookback
        if len(prior_volumes) == lookback
        else None
    )
    ratio = (
        latest_volume / prior_average
        if latest_volume is not None and prior_average and prior_average > 0
        else None
    )
    metrics = VolumeRatioMetrics(
        bar_count=len(bars),
        latest_volume=latest_volume,
        prior_average_volume=round(prior_average, 6) if prior_average is not None else None,
        volume_ratio_3d=round(ratio, 6) if ratio is not None else None,
        prior_volumes=prior_volumes,
    )
    if ratio is None:
        return VolumeRatioResult(
            source=source,
            signal="insufficient_data",
            reason_codes=["insufficient_volume_history"],
            bar_date=bars[-1].date if bars else None,
            metrics=metrics,
        )
    return VolumeRatioResult(
        source=source,
        signal="volume_observation",
        reason_codes=["latest_volume_vs_prior_3d_average"],
        bar_date=bars[-1].date,
        metrics=metrics,
    )
