"use client";

import type { QuantStrategy } from "@/lib/types";
import { useState } from "react";

type Props = {
  strategy: QuantStrategy;
  busy: boolean;
  scanning: boolean;
  progress: { completed: number; total: number } | null;
  scannedCount: number;
  lastScanAt: string | null;
  canScan: boolean;
  localeTag: string;
  t: (key: string, variables?: Record<string, string | number>) => string;
  onToggle: (enabled: boolean) => void;
  onScan: () => void;
};

export default function QuantStrategyCard({
  strategy,
  busy,
  scanning,
  progress,
  scannedCount,
  lastScanAt,
  canScan,
  localeTag,
  t,
  onToggle,
  onScan,
}: Props) {
  const [showRules, setShowRules] = useState(false);
  const parameters = strategy.parameters;
  const isVolumeRatio = strategy.strategy_key === "three-day-volume-ratio";
  const isPriceAnchor = strategy.strategy_key === "price-anchor-observation";
  const parameterRows = isPriceAnchor
    ? [
      [t("quant.anchorProximity"), `${((parameters.anchor_proximity_pct || 0) * 100).toFixed(0)}%`],
      [t("quant.resistanceProximity"), `${((parameters.resistance_proximity_pct || 0) * 100).toFixed(0)}%`],
      [t("quant.baselineDeviation"), `${((parameters.baseline_deviation_pct || 0) * 100).toFixed(0)}%`],
      [t("quant.ma5UpperAtr"), `+${(parameters.ma5_upper_atr || 0).toFixed(1)} ATR14`],
      [t("quant.ma5LowerAtr"), `-${(parameters.ma5_lower_atr || 0).toFixed(1)} ATR14`],
      [t("quant.anchorRiskBuffer"), `${((parameters.risk_buffer_pct || 0) * 100).toFixed(1)}%`],
    ]
    : isVolumeRatio
    ? [[t("quant.volumeRatioLookback"), t("quant.sessions", { count: parameters.lookback_sessions || 3 })]]
    : [
      [t("quant.volumeThreshold"), `${(parameters.volume_multiplier || 0).toFixed(2)}x`],
      [t("quant.breakBuffer"), `${((parameters.break_buffer_pct || 0) * 100).toFixed(1)}%`],
      [t("quant.hardStop"), `${((parameters.hard_stop_pct || 0) * 100).toFixed(0)}%`],
      [t("quant.recoveryWindow"), t("quant.sessions", { count: parameters.recovery_sessions || 3 })],
      [t("quant.pullbackBias"), `${((parameters.pullback_max_bias_pct || 0) * 100).toFixed(0)}%`],
      [t("quant.trendLookback"), t("quant.sessions", { count: parameters.trend_lookback || 5 })],
    ];
  const titleKey = isPriceAnchor ? "quant.priceAnchorStrategyName" : isVolumeRatio ? "quant.volumeRatioStrategyName" : "quant.strategyName";
  const summaryKey = isPriceAnchor ? "quant.priceAnchorStrategyShortSummary" : isVolumeRatio ? "quant.volumeRatioStrategyShortSummary" : "quant.strategyShortSummary";
  const detailKey = isPriceAnchor ? "quant.priceAnchorStrategySummary" : isVolumeRatio ? "quant.volumeRatioStrategySummary" : "quant.strategySummary";
  const enableKey = isPriceAnchor ? "quant.enablePriceAnchorStrategy" : isVolumeRatio ? "quant.enableVolumeRatioStrategy" : "quant.enableStrategy";
  const dataBoundary = isPriceAnchor ? t("quant.priceAnchorDataBoundary") : isVolumeRatio ? t("quant.volumeRatioDataBoundary") : t("quant.dataBoundary");
  const titleId = `quant-strategy-title-${strategy.strategy_key}`;

  return (
    <section className="ui-surface overflow-hidden" aria-labelledby={titleId}>
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded-full border border-themed px-2 py-1">{t("quant.builtIn")}</span>
            <span>{t("quant.version", { version: strategy.strategy_version })}</span>
            <span className={`rounded-full px-2 py-1 ${strategy.enabled ? "bg-ok-soft" : "bg-[var(--surface-alt)] text-secondary"}`}>
              {strategy.enabled ? t("quant.enabled") : t("quant.disabled")}
            </span>
          </div>
          <h2 id={titleId} className="mt-2 text-lg font-semibold text-primary sm:text-xl">
            {t(titleKey)}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary">{t(summaryKey)}</p>
        </div>

        <div className="quant-strategy-actions flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center lg:justify-end">
          <div className="quant-strategy-toggle flex min-h-11 items-center justify-between gap-3 rounded-md border border-themed px-3 text-sm text-secondary sm:justify-start">
            <span className="min-w-0">
              <span className="block truncate">{t(enableKey)}</span>
              <span className={`mt-0.5 block text-xs ${strategy.enabled ? "text-ok" : "text-muted"}`}>
                {strategy.enabled && isPriceAnchor ? t("quant.autoMonitoringActive") : strategy.enabled ? t("quant.enabled") : t("quant.disabled")}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-label={t(enableKey)}
              aria-checked={strategy.enabled}
              disabled={busy || scanning}
              onClick={() => onToggle(!strategy.enabled)}
              className="quant-strategy-switch relative h-11 w-14 shrink-0 rounded-md bg-transparent p-0 transition focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className={`pointer-events-none absolute left-1/2 top-1/2 h-6 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${strategy.enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-hover)]"}`}>
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-[left] ${strategy.enabled ? "left-6" : "left-1"}`} />
              </span>
            </button>
          </div>
          <button
            type="button"
            className="quant-strategy-scan ui-button ui-button--primary min-h-11 whitespace-nowrap"
            disabled={!strategy.enabled || !canScan || busy || scanning}
            onClick={onScan}
          >
            {scanning ? t("quant.scanning") : t("quant.scanAll")}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-themed px-4 py-3 sm:px-5">
        <div className="min-w-0 text-xs text-muted" data-testid="quant-progress">
          {progress
            ? t("quant.progress", { completed: progress.completed, total: progress.total })
            : lastScanAt
              ? t("quant.lastScan", { count: scannedCount, date: new Date(lastScanAt).toLocaleString(localeTag) })
              : t("quant.notScanned")}
        </div>
        {progress && (
          <div
            className="quant-progress-bar h-1.5 w-full overflow-hidden rounded-full bg-[var(--progress-bg)] sm:w-48"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.completed}
            aria-label={t("quant.progress", { completed: progress.completed, total: progress.total })}
          >
            <span
              className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
              style={{ width: `${progress.total ? Math.min(100, (progress.completed / progress.total) * 100) : 0}%` }}
            />
          </div>
        )}
        <button
          type="button"
          className="text-xs font-medium text-accent hover:underline"
          aria-expanded={showRules}
          onClick={() => setShowRules((visible) => !visible)}
        >
          {showRules ? t("quant.hideRules") : t("quant.viewRules")}
        </button>
      </div>

      {showRules && (
        <div className="border-t border-themed bg-[var(--surface-alt)] px-4 py-4 sm:px-5">
          <p className="mb-4 max-w-3xl text-sm leading-6 text-secondary">{t(detailKey)}</p>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 md:grid-cols-3 xl:grid-cols-6">
            {parameterRows.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs leading-5 text-muted">{label}</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-primary">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="border-t border-themed bg-[var(--surface-alt)] px-4 py-3 text-xs leading-5 text-muted sm:px-5">
        <p>{dataBoundary}</p>
        <p className="mt-1">{t("quant.disclaimer")}</p>
      </div>
    </section>
  );
}
