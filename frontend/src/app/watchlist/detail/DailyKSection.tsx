"use client";

import { useMemo, useState } from "react";

import { useI18n } from "@/components/I18nProvider";
import type { DailyBar, KRange, MovingAveragePoint, PriceVolumeObservation, WatchlistStock } from "@/lib/types";

import KLineChart from "./KLineChart";
import MovingAverageLegend, { type MovingAveragePeriod } from "./MovingAverageLegend";

export type DailyKStatus = "loading" | "ready" | "empty" | "stale" | "error";

function day(value: number | string, locale: string) {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function money(value: number, locale: string) {
  return Number.isFinite(value) ? value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
}

export default function DailyKSection({
  stock,
  bars,
  movingAverages,
  range,
  onRangeChange,
  onRetry,
  status,
  asOf,
  source,
}: {
  stock: WatchlistStock;
  bars: DailyBar[];
  movingAverages: MovingAveragePoint[];
  observation: PriceVolumeObservation | null;
  range: KRange;
  onRangeChange: (range: KRange) => void;
  onRetry?: () => void;
  status: DailyKStatus;
  asOf: string | null;
  source: string;
}) {
  const { localeTag, t } = useI18n();
  const ranges: KRange[] = ["1mo", "3mo", "6mo", "1y"];
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [enabledPeriods, setEnabledPeriods] = useState<Set<MovingAveragePeriod>>(
    () => new Set([5, 10, 20]),
  );
  const [hoverVolumeRatioEnabled, setHoverVolumeRatioEnabled] = useState(true);

  const matchingIndex = activeDate == null ? -1 : bars.findIndex((bar) => String(bar.date) === activeDate);
  const activeIndex = matchingIndex >= 0 ? matchingIndex : Math.max(bars.length - 1, 0);
  const activeBar = bars[activeIndex] || null;
  const activeAverage = useMemo(() => {
    if (!activeBar) return null;
    const key = String(activeBar.date);
    return movingAverages.find((item) => String(item.date) === key) || null;
  }, [activeBar, movingAverages]);

  const activeVolumeRatio = useMemo(() => {
    if (!activeBar || activeIndex < 3) return null;
    const priorVolumes = bars.slice(activeIndex - 3, activeIndex).map((bar) => bar.volume);
    const priorAverage = priorVolumes.reduce((total, volume) => total + volume, 0) / priorVolumes.length;
    if (!Number.isFinite(priorAverage) || priorAverage <= 0) return null;
    return {
      latest: activeBar.volume,
      priorAverage,
      ratio: activeBar.volume / priorAverage,
    };
  }, [activeBar, activeIndex, bars]);

  const toggleAverage = (period: MovingAveragePeriod) => {
    setEnabledPeriods((current) => {
      const next = new Set(current);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      return next;
    });
  };
  const metrics = useMemo(() => {
    if (!bars.length) return null;
    const first = bars[0];
    const latest = bars.at(-1)!;
    return {
      performance: (latest.close / Math.max(first.open, 0.01) - 1) * 100,
      high: Math.max(...bars.map((bar) => bar.high)),
      low: Math.min(...bars.map((bar) => bar.low)),
      close: latest.close,
    };
  }, [bars]);

  return (
    <section aria-labelledby="daily-k-title" className="mb-8 min-w-0 rounded-xl border border-themed bg-surface p-4 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-themed pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0"><p className="text-xs font-medium uppercase text-muted">{t("dossier.marketBehavior")}</p><h2 id="daily-k-title" className="mt-1 text-xl font-semibold text-primary">{t("dossier.dailyKTitle")}</h2><p className="mt-1 text-xs text-muted">{stock.symbol}{asOf ? ` · ${t("dossier.asOf")} ${new Date(asOf).toLocaleDateString(localeTag)}` : ""}{source ? ` · ${source === "yahoo_finance" ? "Yahoo Finance" : source}` : ""}</p></div>
        <div aria-label={t("dossier.chartRange")} className="grid grid-cols-4 rounded-md border border-themed p-1">{ranges.map((item) => <button key={item} type="button" onClick={() => onRangeChange(item)} aria-pressed={range === item} className={`min-h-10 px-3 text-xs ${range === item ? "rounded bg-accent text-on-accent" : "text-secondary hover:text-primary"}`}>{t(`dossier.range${item}`)}</button>)}</div>
      </div>
      {metrics && <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 tabular-nums">
        <span className="text-xs text-secondary">{t("risk.dailyPrice")}</span>
        <strong className="text-3xl font-semibold text-primary">{money(metrics.close, localeTag)}</strong>
        <span className={`text-sm font-medium ${metrics.performance >= 0 ? "text-up" : "text-down"}`}>{t("dossier.period")} {metrics.performance >= 0 ? "+" : ""}{metrics.performance.toFixed(2)}%</span>
      </div>}
      <div className="mt-3 min-h-[360px] min-w-0">
        {status === "loading" ? <div className="flex h-[360px] items-center justify-center rounded-md bg-input text-sm text-muted">{t("dossier.dailyLoading")}</div>
          : status === "error" ? <div role="alert" className="flex h-[360px] flex-col items-center justify-center gap-4 rounded-md bg-input text-sm text-secondary"><p>{t("dossier.providerError")}</p>{onRetry && <button type="button" onClick={onRetry} className="ui-button min-h-11">{t("dossier.retry")}</button>}</div>
            : status === "empty" ? <div className="flex h-[360px] items-center justify-center rounded-md bg-input text-sm text-muted">{t("dossier.dailyEmpty")}</div>
              : (
                <div className="min-w-0 overflow-hidden rounded-md border border-themed bg-input p-3 sm:p-4">
                  <div className="mb-2 flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    {activeBar && (
                      <>
                        <span>{day(activeBar.date, localeTag)}</span>
                        <span>{t("dossier.openShort")} <b className="text-primary">{money(activeBar.open, localeTag)}</b></span>
                        <span>{t("dossier.highShort")} <b className="text-primary">{money(activeBar.high, localeTag)}</b></span>
                        <span>{t("dossier.lowShort")} <b className="text-primary">{money(activeBar.low, localeTag)}</b></span>
                        <span>{t("dossier.closeShort")} <b className="text-primary">{money(activeBar.close, localeTag)}</b></span>
                        <span>{t("dossier.volumeShort")} <b className="text-primary">{activeBar.volume.toLocaleString(localeTag)}</b></span>
                      </>
                    )}
                  </div>
                  <MovingAverageLegend activePoint={activeAverage} enabledPeriods={enabledPeriods} onToggle={toggleAverage} />
                  <KLineChart
                    bars={bars}
                    movingAverages={movingAverages}
                    enabledPeriods={enabledPeriods}
                    activeIndex={activeIndex}
                    onActiveIndexChange={(index) => setActiveDate(String(bars[index]?.date ?? ""))}
                    startLabel={bars[0] ? day(bars[0].date, localeTag) : ""}
                    endLabel={bars.at(-1) ? day(bars.at(-1)!.date, localeTag) : ""}
                  />
                  <details className="mt-3 border-t border-themed pt-2">
                    <summary className="cursor-pointer py-2 text-xs text-secondary">{t("dossier.hoverVolumeRatioToggle")}</summary>
                  <div className="mb-2 grid gap-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
                    <label className="flex min-h-10 cursor-pointer items-center gap-3 text-xs text-secondary">
                      <input
                        type="checkbox"
                        checked={hoverVolumeRatioEnabled}
                        onChange={(event) => setHoverVolumeRatioEnabled(event.target.checked)}
                        className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />
                      <span className="font-medium text-primary">{t("dossier.hoverVolumeRatioToggle")}</span>
                    </label>
                    {hoverVolumeRatioEnabled && (
                      <div data-testid="kline-hover-volume-ratio" className="min-w-0 text-xs text-muted sm:text-right">
                        {activeVolumeRatio ? (
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
                            <span>{t("dossier.volumeRatioLatest")} <b className="tabular-nums text-primary">{activeVolumeRatio.latest.toLocaleString(localeTag)}</b></span>
                            <span>{t("dossier.volumeRatioPriorAverage")} <b className="tabular-nums text-primary">{activeVolumeRatio.priorAverage.toLocaleString(localeTag, { maximumFractionDigits: 0 })}</b></span>
                            <span className="font-semibold text-accent">{activeVolumeRatio.ratio.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x</span>
                          </span>
                        ) : (
                          <span>{t("dossier.hoverVolumeRatioInsufficient")}</span>
                        )}
                      </div>
                    )}
                  </div>
                  </details>
                </div>
              )}
      </div>
      {status === "stale" && <p className="mt-2 text-xs text-amber-500">{t("dossier.dailyStale")}</p>}
      <p className="mt-3 text-xs text-muted">{t("risk.dailyNote")}</p>
      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-themed bg-[var(--border)] sm:grid-cols-4">
        {[
          [t("dossier.period"), metrics ? `${metrics.performance.toFixed(1)}%` : "--"],
          [t("dossier.high"), metrics ? money(metrics.high, localeTag) : "--"],
          [t("dossier.low"), metrics ? money(metrics.low, localeTag) : "--"],
          [t("risk.dailyPrice"), metrics ? money(metrics.close, localeTag) : "--"],
        ].map(([label, value]) => <div key={label} className="bg-page p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-sm font-semibold text-primary">{value}</p></div>)}
      </div>
    </section>
  );
}
