"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { IntradayPreview as IntradayPreviewData, IntradayPreviewItem } from "@/lib/types";

type Translate = (key: string, variables?: Record<string, string | number>) => string;

function numberLabel(value: number | null, localeTag: string) {
  return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percentLabel(value: number | null) {
  return value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function warningTone(item: IntradayPreviewItem) {
  return `intraday-preview-item--${item.severity}`;
}

function PreviewRow({ item, t, localeTag }: { item: IntradayPreviewItem; t: Translate; localeTag: string }) {
  const evidence = item.evidence;
  const chips = [
    evidence.ma5_risk_line != null && `${t("intraday.evidence.ma5Risk")} ${numberLabel(evidence.ma5_risk_line, localeTag)}`,
    evidence.volume_ratio_3d != null && `${t("intraday.evidence.volumeRatio")} ${evidence.volume_ratio_3d.toFixed(2)}x`,
    evidence.strike_price != null && `${t("intraday.evidence.strike")} ${numberLabel(evidence.strike_price, localeTag)}`,
    evidence.fair_price != null && `${t("intraday.evidence.fair")} ${numberLabel(evidence.fair_price, localeTag)}`,
    evidence.target_price != null && `${t("intraday.evidence.target")} ${numberLabel(evidence.target_price, localeTag)}`,
    evidence.position_stop_price != null && `${t("intraday.evidence.positionStop")} ${numberLabel(evidence.position_stop_price, localeTag)}`,
  ].filter(Boolean) as string[];

  return (
    <article className={`intraday-preview-item ${warningTone(item)}`}>
      <div className="intraday-preview-item__identity">
        <div className="intraday-preview-item__symbol-line">
          <span className="intraday-preview-item__dot" aria-hidden="true" />
          <Link href={`/watchlist/${item.stock_id}`} target="_blank" rel="noreferrer" className="intraday-preview-item__symbol">
            {item.symbol}
          </Link>
          <span className="intraday-preview-item__market">{item.market.toUpperCase()}</span>
        </div>
        <p>{item.name}</p>
      </div>
      <div className="intraday-preview-item__signal">
        <div className="intraday-preview-item__signal-line">
          <span className="intraday-preview-badge">{t(`intraday.warning.${item.warning_code}`)}</span>
          <span className="intraday-preview-pending">{t("intraday.pendingClose")}</span>
        </div>
        <div className="intraday-preview-price">
          {t("intraday.evidence.price")} <strong>{numberLabel(item.current_price, localeTag)}</strong>
          {evidence.price_gap_to_strike_pct != null && <span>{percentLabel(evidence.price_gap_to_strike_pct)} {t("intraday.evidence.strike")}</span>}
        </div>
        {chips.length > 0 && <div className="intraday-preview-chips">{chips.slice(0, 4).map((chip) => <span key={chip}>{chip}</span>)}</div>}
        {item.error_code === "request_limit" && <p className="intraday-preview-note">{t("intraday.requestLimit")}</p>}
        {item.error_code === "intraday_bars_unavailable" && <p className="intraday-preview-note">{t("intraday.noData")}</p>}
      </div>
      <Link href={`/watchlist/${item.stock_id}`} target="_blank" rel="noreferrer" className="intraday-preview-open">{t("intraday.openDossier")} ↗</Link>
    </article>
  );
}

export default function IntradayPreview({
  data,
  loading,
  refreshing,
  onRefresh,
  t,
  localeTag,
}: {
  data: IntradayPreviewData | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  t: Translate;
  localeTag: string;
}) {
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, watch: 2, info: 3, neutral: 4 };
  const items = [...(data?.items || [])].sort((a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5));
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? items : items.slice(0, 2);
  const [cooldownNow, setCooldownNow] = useState(0);
  const refreshStartedAt = data?.refresh_started_at ?? data?.cached_at ?? data?.generated_at ?? null;
  useEffect(() => {
    if (!refreshStartedAt) return;
    const refreshClock = () => setCooldownNow(Date.now());
    const initialTimer = window.setTimeout(refreshClock, 0);
    const timer = window.setInterval(refreshClock, 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refreshStartedAt]);
  const lastRefresh = refreshStartedAt ? new Date(refreshStartedAt).getTime() : 0;
  const refreshBlocked = Number.isFinite(lastRefresh) && lastRefresh > 0 && cooldownNow > 0 && cooldownNow - lastRefresh < 5 * 60 * 1000;
  return (
    <section className="intraday-preview" aria-label={t("intraday.title")}>
      <div className="intraday-preview__header">
        <div className="intraday-preview__title-group">
          <div className="intraday-preview__title-row">
            <span className={`intraday-preview-status-dot ${data?.is_market_open ? "is-open" : ""} ${refreshing ? "is-refreshing" : ""}`} aria-hidden="true" />
            <h2>{t("intraday.title")}</h2>
            <span className="intraday-preview-provisional">{t("intraday.provisional")}</span>
          </div>
        </div>
        {data && <span className="intraday-preview__status">{data.is_market_open ? t("intraday.marketOpen") : t("intraday.marketClosed")}</span>}
        <div className="intraday-preview__actions">
          <button type="button" className="ui-button" onClick={onRefresh} disabled={loading || refreshing || refreshBlocked}>
            {loading || refreshing ? t("intraday.refreshing") : t("intraday.refresh")}
          </button>
        </div>
      </div>
      {refreshBlocked && <div className="intraday-preview-cooldown">{t("intraday.cooldown")}</div>}
      {data?.refresh_error && <div className="intraday-preview-refresh-error">{t("intraday.refreshError", { message: data.refresh_error })}</div>}
      {items.length > 2 && <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-themed px-4 py-2.5 sm:px-5">
        <span className="text-xs leading-5 text-secondary">{t("ux.previewSummary", { shown: visibleItems.length, count: items.length })}</span>
        <button type="button" className="ui-button shrink-0" aria-expanded={expanded} aria-controls="intraday-preview-rows" onClick={() => setExpanded(value => !value)}>{t(expanded ? "ux.collapsePreview" : "ux.expandPreview", { count: items.length })}</button>
      </div>}
      {(loading || refreshing) && !items.length ? (
        <div className="intraday-preview-loading"><span /><span /><span /></div>
      ) : items.length ? (
        <div id="intraday-preview-rows" className="intraday-preview-list">
          {visibleItems.map((item) => <PreviewRow key={item.stock_id} item={item} t={t} localeTag={localeTag} />)}
        </div>
      ) : (
        <div className="intraday-preview-empty">{t("intraday.noStocks")}</div>
      )}
      {data && data.total_count > data.requested_count && (
        <div className="intraday-preview-footer">{t("intraday.showing", { requested: data.requested_count, total: data.total_count })}</div>
      )}
    </section>
  );
}
