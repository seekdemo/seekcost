"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { QuantSignal, QuantStrategyStock } from "@/lib/types";

type Filter = "attention" | "matches" | "risks" | "all";

type Props = {
  strategyKey: string;
  stocks: QuantStrategyStock[];
  rowErrors: Record<number, string>;
  query: string;
  t: (key: string, variables?: Record<string, string | number>) => string;
};

const ENTRY_SIGNALS = new Set<QuantSignal>(["entry_breakout", "entry_pullback"]);
const MATCH_SIGNALS = new Set<QuantSignal>(["entry_breakout", "entry_pullback", "hold_trend"]);
const ANCHOR_MATCH_SIGNALS = new Set<QuantSignal>([
  "anchor_strike_zone",
  "anchor_fair_zone",
  "anchor_target_zone",
  "market_baseline_deviation",
]);
const ATTENTION_SIGNALS = new Set<QuantSignal>([
  // Kept for legacy snapshots created before monitoring stopped using the manual gate.
  "needs_qualification",
  "not_eligible",
  "trend_warning",
  "insufficient_data",
  "provider_error",
  "risk_exit",
]);
const ANCHOR_ATTENTION_SIGNALS = new Set<QuantSignal>([
  ...ANCHOR_MATCH_SIGNALS,
  "anchor_risk",
  "insufficient_data",
  "provider_error",
]);

function signalTone(signal: QuantSignal | undefined) {
  if (signal === "risk_exit" || signal === "anchor_risk") return "border-risk bg-risk-soft";
  if (signal === "anchor_strike_zone") return "border-brand bg-brand-soft";
  if (signal === "anchor_target_zone") return "border-sky-500/35 bg-sky-500/10 text-sky-500";
  if (signal === "anchor_fair_zone") return "border-violet-500/35 bg-violet-500/10 text-violet-500";
  if (signal === "market_baseline_deviation") return "border-amber-500/35 bg-amber-500/10 text-amber-500";
  if (signal && ENTRY_SIGNALS.has(signal)) return "border-brand bg-brand-soft";
  if (signal === "hold_trend") return "border-sky-500/35 bg-sky-500/10 text-sky-500";
  if (signal === "volume_observation") return "border-violet-500/35 bg-violet-500/10 text-violet-500";
  return "border-themed bg-[var(--surface-alt)] text-secondary";
}

function number(value: number | null | undefined, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function percentage(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const percentageValue = value * 100;
  return `${percentageValue > 0 ? "+" : ""}${percentageValue.toFixed(1)}%`;
}

function matchesSignal(signal: QuantSignal | undefined, strategyKey: string) {
  if (!signal) return false;
  if (strategyKey === "price-anchor-observation") return ANCHOR_MATCH_SIGNALS.has(signal);
  if (strategyKey === "three-day-volume-ratio") return signal === "volume_observation";
  return MATCH_SIGNALS.has(signal);
}

function attentionSignal(signal: QuantSignal | undefined, strategyKey: string) {
  if (!signal) return true;
  return strategyKey === "price-anchor-observation"
    ? ANCHOR_ATTENTION_SIGNALS.has(signal)
    : ATTENTION_SIGNALS.has(signal);
}

function riskSignal(signal: QuantSignal | undefined) {
  return signal === "risk_exit" || signal === "anchor_risk";
}

export default function QuantStockList({ strategyKey, stocks, rowErrors, query, t }: Props) {
  const isVolumeRatio = strategyKey === "three-day-volume-ratio";
  const isPriceAnchor = strategyKey === "price-anchor-observation";
  const titleId = `quant-stock-list-title-${strategyKey}`;
  // A volume ratio is an observation for every scanned symbol, so showing all
  // rows by default keeps the measured values visible after a scan. The
  // five-day strategy keeps its action-first attention view.
  const [filter, setFilter] = useState<Filter>(isVolumeRatio ? "all" : "attention");
  const counts = useMemo(() => ({
    attention: stocks.filter((stock) => attentionSignal(stock.latest_snapshot?.signal, strategyKey)).length,
    matches: stocks.filter((stock) => matchesSignal(stock.latest_snapshot?.signal, strategyKey)).length,
    risks: stocks.filter((stock) => riskSignal(stock.latest_snapshot?.signal)).length,
    all: stocks.length,
  }), [stocks, strategyKey]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return stocks.filter((stock) => {
      const matchesFilter = filter === "all"
        || (filter === "matches" && matchesSignal(stock.latest_snapshot?.signal, strategyKey))
        || (filter === "risks" && riskSignal(stock.latest_snapshot?.signal))
        || (filter === "attention" && attentionSignal(stock.latest_snapshot?.signal, strategyKey));
      if (!matchesFilter) return false;
      return !normalizedQuery || `${stock.symbol} ${stock.name}`.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [filter, query, stocks, strategyKey]);

  const filterItems: Array<{ key: Filter; label: string }> = [
    { key: "all", label: t("quant.filterAll") },
    { key: "attention", label: t("quant.filterAttention") },
    { key: "matches", label: isPriceAnchor ? t("quant.filterTriggered") : isVolumeRatio ? t("quant.volumeRatioObservation") : t("quant.filterEntries") },
    { key: "risks", label: t("quant.filterRisks") },
  ];

  return (
    <section className="ui-surface overflow-hidden" aria-labelledby={titleId}>
      <div className="grid gap-4 border-b border-themed p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={titleId} className="text-base font-semibold text-primary">{t("quant.stockResults")}</h2>
            <span className="text-xs text-muted">{t("quant.actionCount", { count: counts.attention })}</span>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{t("quant.stockResultsDescription")}</p>
        </div>
        <div className="quant-stock-filters flex min-w-0 gap-2 overflow-x-auto pb-1" role="group" aria-label={t("quant.resultFilters")}>
          {filterItems.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={filter === item.key}
              className={`min-h-10 shrink-0 rounded-md border px-3 text-xs font-medium transition ${filter === item.key ? "border-[var(--accent)]/40 bg-[var(--accent-bg)] text-accent" : "border-themed text-secondary hover:bg-surface-hover"}`}
              onClick={() => setFilter(item.key)}
            >
              {item.label} · {counts[item.key]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm font-medium text-primary">{t("quant.noFilteredResults")}</p>
          <p className="mt-1 text-xs text-muted">{query ? t("quant.noSearchResultsDescription") : t("quant.noFilteredResultsDescription")}</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)]" data-testid="quant-stock-list">
          {filtered.map((stock) => {
            const snapshot = stock.latest_snapshot;
            const metrics = snapshot?.metrics;
            const signal = snapshot?.signal;
            return (
              <article
                key={stock.stock_id}
                data-testid="quant-stock-row"
                data-signal={signal || "unscanned"}
                className="quant-stock-row grid min-w-0 gap-4 p-4 transition-colors hover:bg-[var(--surface-alt)] sm:p-5 lg:grid-cols-[minmax(180px,1.25fr)_minmax(150px,.85fr)_minmax(210px,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link href={`/watchlist/${stock.stock_id}`} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-semibold text-primary hover:text-accent">
                      {stock.symbol}
                    </Link>
                    {stock.has_position && <span className="text-[11px] text-muted">{t("quant.held")}</span>}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">{stock.name || t("quant.unnamedStock")}</p>
                </div>

                <div className="min-w-0">
                  <span className={`inline-flex min-h-7 items-center rounded-md border px-2 py-1 text-xs font-medium ${signalTone(signal)}`}>
                    {signal ? t(`quant.signal.${signal}`) : t("quant.unscanned")}
                  </span>
                  <p className="mt-2 text-xs text-muted">
                    {snapshot?.bar_date || t("quant.noBarDate")}
                    {snapshot && <> · {t(`quant.source.${snapshot.source}`)}</>}
                  </p>
                </div>

                <div className="quant-stock-metrics grid min-w-0 grid-cols-3 gap-3 text-xs">
                  {isPriceAnchor ? <>
                    <div><p className="text-muted">{t("quant.close")}</p><p className="mt-1 font-medium tabular-nums text-primary">{number(metrics?.close)}</p></div>
                    <div><p className="text-muted">{metrics?.reference_code ? t(`quant.reference.${metrics.reference_code}`) : t("quant.relevantReference")}</p><p className="mt-1 font-medium tabular-nums text-primary">{number(metrics?.reference_price)}</p></div>
                    <div><p className="text-muted">{t("quant.referenceGap")}</p><p className="mt-1 font-medium tabular-nums text-primary">{percentage(metrics?.reference_gap_pct)}</p></div>
                  </> : isVolumeRatio ? <>
                    <div><p className="text-muted">{t("quant.volumeRatioLatest")}</p><p className="mt-1 font-medium tabular-nums text-primary">{metrics?.volume_ratio_3d == null ? "—" : `${number(metrics.volume_ratio_3d)}x`}</p></div>
                    <div><p className="text-muted">{t("quant.volumeRatioPriorAverage")}</p><p className="mt-1 font-medium tabular-nums text-primary">{number(metrics?.prior_average_volume, 0)}</p></div>
                    <div><p className="text-muted">{t("quant.volume")}</p><p className="mt-1 font-medium tabular-nums text-primary">{number(metrics?.latest_volume, 0)}</p></div>
                  </> : <>
                    <div><p className="text-muted">{t("quant.close")}</p><p className="mt-1 font-medium tabular-nums text-primary">{number(metrics?.close)}</p></div>
                    <div><p className="text-muted">MA5</p><p className="mt-1 font-medium tabular-nums text-primary">{number(metrics?.ma5)}</p></div>
                    <div><p className="text-muted">{t("quant.volumeRatio")}</p><p className="mt-1 font-medium tabular-nums text-primary">{metrics?.volume_ratio == null ? "—" : `${number(metrics.volume_ratio)}x`}</p></div>
                  </>}
                  <p className="col-span-3 line-clamp-2 leading-5 text-muted">
                    {rowErrors[stock.stock_id]
                      || snapshot?.reason_codes.map((reason) => t(`quant.reason.${reason}`)).join(" · ")
                      || t("quant.awaitingScan")}
                  </p>
                </div>

                <Link
                  href={`/watchlist/${stock.stock_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="quant-stock-link ui-button min-h-10 whitespace-nowrap text-xs"
                >
                  {t("quant.viewStock")} <span aria-hidden="true">→</span>
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
