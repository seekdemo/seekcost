"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/Page";
import type {
  QuantCockpit,
  QuantCockpitDisposition,
  QuantCockpitEvidence,
  QuantCockpitStock,
} from "@/lib/types";

type Translate = (key: string, variables?: Record<string, string | number>) => string;
type Filter = "all" | QuantCockpitDisposition;

const filters: Filter[] = ["all", "entry", "watch", "extended", "risk", "data_issue"];

function dateLabel(value: string | null, locale: string, fallback: string) {
  if (!value) return fallback;
  const parsed = new Date(`${value.length === 10 ? `${value}T00:00:00` : value}`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function numberLabel(value: number | null, locale: string) {
  return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percentLabel(value: number | null) {
  return value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function dispositionTone(disposition: QuantCockpitDisposition) {
  return `quant-cockpit-disposition--${disposition.replace("_", "-")}`;
}

function dispositionLabel(disposition: QuantCockpitDisposition, t: Translate) {
  return t(`cockpit.lane.${disposition}`);
}

function filterLabel(filter: Filter, t: Translate) {
  if (filter === "all") return t("cockpit.filterAll");
  if (filter === "entry") return t("cockpit.filterEntry");
  if (filter === "watch") return t("cockpit.filterWatch");
  if (filter === "extended") return t("cockpit.filterExtended");
  if (filter === "risk") return t("cockpit.filterRisk");
  return t("cockpit.filterIssues");
}

function strategySignal(stock: QuantCockpitStock, strategyKey: string) {
  return stock.signals.find((signal) => signal.strategy_key === strategyKey) || null;
}

function decisionEvidence(stock: QuantCockpitStock) {
  const predicate: Record<QuantCockpitDisposition, (signal: QuantCockpitEvidence) => boolean> = {
    risk: (signal) => ["risk_exit", "anchor_risk"].includes(signal.signal),
    extended: (signal) => signal.signal === "anchor_target_zone"
      || (signal.signal === "market_baseline_deviation" && (signal.reference_gap_pct || 0) > 0),
    entry: (signal) => ["entry_pullback", "entry_breakout", "anchor_strike_zone"].includes(signal.signal),
    watch: (signal) => !["provider_error", "insufficient_data"].includes(signal.signal),
    data_issue: (signal) => ["provider_error", "insufficient_data"].includes(signal.signal),
  };
  return stock.signals.find(predicate[stock.disposition]) || stock.headline;
}

function EvidenceCell({ label, evidence, kind, t, localeTag }: {
  label: string;
  evidence: QuantCockpitEvidence | null;
  kind: "price" | "trend" | "volume";
  t: Translate;
  localeTag: string;
}) {
  let value = t(`cockpit.evidence.${kind === "price" ? "noAnchor" : kind === "trend" ? "noTrend" : "normalVolume"}`);
  let detail = "";
  if (evidence) {
    value = t(`quant.signal.${evidence.signal}`);
    if (kind === "price") {
      value = numberLabel(evidence.close, localeTag);
      detail = evidence.reference_price != null
        ? `${t("cockpit.reference")} ${numberLabel(evidence.reference_price, localeTag)}`
        : "";
    } else if (kind === "trend") {
      detail = evidence.ma5_bias_pct != null ? `MA5 ${percentLabel(evidence.ma5_bias_pct)}` : "";
    } else if (evidence.volume_ratio_3d != null) {
      detail = `${evidence.volume_ratio_3d.toFixed(2)}x`;
      value = evidence.unusual_volume
        ? t("cockpit.unusualVolume", { threshold: "1.45" })
        : t("cockpit.evidence.normalVolume");
    }
  }
  return (
    <div className={`quant-cockpit-proof quant-cockpit-proof--${kind}`} tabIndex={kind === "trend" ? 0 : undefined} data-tooltip={kind === "trend" ? t("cockpit.trendHelp") : undefined} aria-label={kind === "trend" ? `${value}. ${t("cockpit.trendHelp")}` : undefined}>
      <span>{label}</span>
      <strong>{kind === "trend" && ["risk_exit", "trend_warning"].includes(evidence?.signal || "") ? "⚠ " : ""}{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function StockProofs({ stock, t, localeTag }: { stock: QuantCockpitStock; t: Translate; localeTag: string }) {
  return (
    <div className="quant-cockpit-proofs">
      <EvidenceCell label={t("cockpit.close")} evidence={strategySignal(stock, "price-anchor-observation") || stock.headline} kind="price" t={t} localeTag={localeTag} />
      <EvidenceCell label={t("cockpit.evidence.trend")} evidence={strategySignal(stock, "chang-five-day-line")} kind="trend" t={t} localeTag={localeTag} />
      <EvidenceCell label={t("cockpit.evidence.volume")} evidence={strategySignal(stock, "three-day-volume-ratio")} kind="volume" t={t} localeTag={localeTag} />
    </div>
  );
}


function StockRow({ stock, t, localeTag }: { stock: QuantCockpitStock; t: Translate; localeTag: string }) {
  const headline = decisionEvidence(stock);
  return (
    <div className={`quant-monitor-item ${dispositionTone(stock.disposition)}`}>
    <a className="quant-cockpit-stock-row" href={`/watchlist/${stock.stock_id}`} target="_blank" rel="noreferrer">
      <div className="min-w-0 quant-cockpit-stock-row__identity">
        <div className="flex min-w-0 items-center gap-2">
          <span className="quant-cockpit-stock-row__symbol font-mono font-semibold tracking-wide text-primary">{stock.symbol}</span>
          {stock.has_position && <span className="quant-cockpit-position">{t("cockpit.positionHeld")}</span>}
        </div>
        <p className="quant-cockpit-stock-row__name truncate text-muted">{stock.name}</p>
      </div>
      <span className={`quant-cockpit-disposition ${dispositionTone(stock.disposition)}`}>{dispositionLabel(stock.disposition, t)}</span>
      <div className="quant-cockpit-decision-copy">
        <strong>{t(`cockpit.decisionReason.${stock.decision_reason}`)}</strong>
      </div>
      <StockProofs stock={stock} t={t} localeTag={localeTag} />
      <span className="quant-cockpit-row-arrow" aria-hidden="true">↗</span>
    </a>
    <details className="quant-monitor-detail"><summary>{t("cockpit.details")}</summary>
      <p>{t(`cockpit.nextStep.${stock.next_step}`)}</p>
      <small>{dateLabel(headline?.bar_date || null, localeTag, t("cockpit.noCompletedBar"))} · {t(`cockpit.market.${stock.market}`)}</small>
    </details>
    </div>
  );
}

export default function QuantCockpit({ cockpit, t, localeTag }: { cockpit: QuantCockpit; t: Translate; localeTag: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const queryValue = query.trim().toLowerCase();
  const filteredStocks = useMemo(() => cockpit.stocks.filter((stock) => {
    const matchesFilter = filter === "all"
      || stock.disposition === filter
      || (filter === "data_issue" && stock.has_data_issue);
    const matchesQuery = !queryValue || `${stock.symbol} ${stock.name}`.toLowerCase().includes(queryValue);
    return matchesFilter && matchesQuery;
  }), [cockpit.stocks, filter, queryValue]);

  if (!cockpit.enabled_strategy_count) {
    return (
      <section className="quant-cockpit-empty ui-surface">
        <EmptyState
          title={cockpit.watchlist_count ? t("cockpit.noStrategies") : t("cockpit.noStocks")}
          description={cockpit.watchlist_count ? t("cockpit.noStrategiesDescription") : t("cockpit.noStocksDescription")}
          action={<Link className="ui-button ui-button--primary" href={cockpit.watchlist_count ? "/quant" : "/watchlist"}>{cockpit.watchlist_count ? t("cockpit.configureStrategies") : t("cockpit.addStocks")}</Link>}
        />
      </section>
    );
  }

  const focusList = (disposition: Filter) => {
    setFilter(disposition);
    document.querySelector(".quant-cockpit-monitor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="quant-cockpit space-y-4 sm:space-y-5">
      <section className="quant-cockpit-sessions" aria-label={t("cockpit.sessions")}>
        <div className="quant-cockpit-sessions-label"><span className="quant-cockpit-live-dot" aria-hidden="true" /><span>{t("cockpit.sessions")}</span></div>
        <div className="quant-cockpit-session-list">
          {cockpit.market_sessions.length ? cockpit.market_sessions.map((session) => (
            <div key={session.market} className="quant-cockpit-session">
              <span className="text-xs font-medium text-primary">{t(`cockpit.market.${session.market}`)}</span>
              <span className="text-[11px] text-muted">{session.bar_date || t("cockpit.noCompletedBar")}</span>
              <span className="text-[11px] text-secondary">{t("cockpit.sessionCoverage", { scanned: session.scanned_count, total: session.total_count })}</span>
            </div>
          )) : <span className="text-xs text-muted">{t("cockpit.noCompletedBar")}</span>}
        </div>
      </section>


      {cockpit.summary.data_issue_count > 0 && (
        <button type="button" className="quant-cockpit-data-notice" onClick={() => focusList("data_issue")}>
          {t("cockpit.dataNotice", { count: cockpit.summary.data_issue_count })}
        </button>
      )}

      <section className="quant-cockpit-monitor ui-surface overflow-hidden">
        <div className="quant-cockpit-panel-heading quant-cockpit-monitor-heading">
          <div><h2>{t("cockpit.allTitle")}</h2><p>{t("cockpit.allDescription")}</p></div>
          <span className="quant-cockpit-count">{t("cockpit.resultCount", { visible: filteredStocks.length, total: cockpit.stocks.length })}</span>
        </div>
        <div className="quant-cockpit-monitor-controls">
          <label className="quant-cockpit-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("cockpit.search")} aria-label={t("cockpit.search")} /></label>
          <div className="quant-cockpit-filters" role="group" aria-label={t("cockpit.allTitle")}>
            {filters.map((item) => <button type="button" key={item} aria-pressed={filter === item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{filterLabel(item, t)} <span>{cockpit.stocks.filter(stock => item === "all" || (item === "data_issue" ? stock.has_data_issue : stock.disposition === item)).length}</span></button>)}
          </div>
        </div>
        <div className="quant-monitor-columns" aria-hidden="true"><span>{t("cockpit.columnStock")}</span><span>{t("cockpit.columnState")}</span><span>{t("cockpit.columnReason")}</span><span>{t("cockpit.evidence.price")}</span><span>{t("cockpit.evidence.trend")}</span><span>{t("cockpit.evidence.volume")}</span><span>↗</span></div>
        {filteredStocks.length ? <div className="divide-y divide-themed">{filteredStocks.map((stock) => <StockRow key={stock.stock_id} stock={stock} t={t} localeTag={localeTag} />)}</div> : (
          <div className="quant-cockpit-inline-empty"><p className="font-medium text-primary">{t("cockpit.noResults")}</p><p className="mt-1 text-xs text-muted">{t("cockpit.noResultsDescription")}</p></div>
        )}
      </section>
    </div>
  );
}
