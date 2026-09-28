"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useI18n } from "@/components/I18nProvider";
import { api } from "@/lib/api";
import type { QuantSignal, QuantSignalSnapshot, QuantStrategy, QuantStrategyStock } from "@/lib/types";

const DEFAULT_STRATEGY_KEY = "chang-five-day-line";

const REASON_KEYS: Record<string, string> = {
  breakout_volume: "quant.reason.breakout_volume",
  pullback_to_rising_ma5: "quant.reason.pullback_to_rising_ma5",
  hard_stop: "quant.reason.hard_stop",
  ma5_buffer_break: "quant.reason.ma5_buffer_break",
  three_day_ma5_failure: "quant.reason.three_day_ma5_failure",
  insufficient_ma5_history: "quant.reason.insufficient_ma5_history",
  qualification_incomplete: "quant.reason.qualification_incomplete",
  qualification_not_met: "quant.reason.qualification_not_met",
  ma5_trend_intact: "quant.reason.ma5_trend_intact",
  ma5_trend_warning: "quant.reason.ma5_trend_warning",
  market_data_unavailable: "quant.reason.market_data_unavailable",
  latest_volume_vs_prior_3d_average: "quant.reason.latest_volume_vs_prior_3d_average",
  insufficient_volume_history: "quant.reason.insufficient_volume_history",
};

function signalTone(signal: QuantSignal) {
  if (signal === "risk_exit") return "border-risk bg-risk-soft";
  if (signal === "entry_breakout" || signal === "entry_pullback") return "border-brand bg-brand-soft";
  if (signal === "hold_trend") return "border-sky-500/30 bg-sky-500/10 text-sky-600";
  if (signal === "volume_observation") return "border-violet-500/30 bg-violet-500/10 text-violet-600";
  return "border-themed bg-[var(--surface-alt)] text-secondary";
}

function metric(value: number | null | undefined, locale: string, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;
}

export default function QuantStrategyPanel({ stockId, strategyKey = DEFAULT_STRATEGY_KEY }: { stockId: number; strategyKey?: string }) {
  const { localeTag, t } = useI18n();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [strategy, setStrategy] = useState<QuantStrategy | null>(null);
  const [stock, setStock] = useState<QuantStrategyStock | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadPersistedEvidence = async () => {
      try {
        const strategies = await api.listQuantStrategies();
        const nextStrategy = strategies.find((item) => item.strategy_key === strategyKey) || null;
        const rows = nextStrategy ? await api.listQuantStrategyStocks(nextStrategy.strategy_key) : [];
        if (cancelled) return;
        setStrategy(nextStrategy);
        setStock(rows.find((item) => item.stock_id === stockId) || null);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    void loadPersistedEvidence();
    return () => { cancelled = true; };
  }, [stockId, strategyKey]);

  const scan = async () => {
    if (!strategy?.enabled || !stock || scanning) return;
    setScanning(true);
    setScanError(false);
    try {
      const latest = await api.scanQuantStock(strategy.strategy_key, stock.stock_id);
      setStock((current) => current ? { ...current, latest_snapshot: latest } : current);
    } catch {
      setScanError(true);
    } finally {
      setScanning(false);
    }
  };

  if (status === "loading") {
    return <section aria-label={t("quant.panelTitle")} className="mt-12 h-52 animate-pulse rounded-md bg-surface" />;
  }

  const snapshot: QuantSignalSnapshot | null = stock?.latest_snapshot || null;
  const isVolumeRatio = strategyKey === "three-day-volume-ratio";
  const canScan = Boolean(strategy?.enabled && stock);
  const reasons = snapshot?.reason_codes.map((code) => REASON_KEYS[code] ? t(REASON_KEYS[code]) : t("quant.panelUnknownReason")) || [];

  return (
    <section data-testid="quant-strategy-panel" aria-labelledby="quant-panel-title" className="mt-12 min-w-0 border-y border-themed py-7 sm:py-8">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted">{t("quant.panelEyebrow")}</p>
          <h2 id="quant-panel-title" className="mt-1 text-xl font-semibold text-primary">{isVolumeRatio ? t("quant.volumeRatioStrategyName") : t("quant.panelTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary">{isVolumeRatio ? t("quant.volumeRatioStrategySummary") : t("quant.panelDescription")}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 xs:flex-row sm:shrink-0">
          <Link href="/quant" className="ui-button min-h-10 justify-center text-xs">{t("quant.panelManage")}</Link>
          {canScan && (
            <button type="button" className="ui-button ui-button--primary min-h-10 text-xs" disabled={scanning} onClick={() => void scan()}>
              {scanning ? t("quant.panelScanning") : snapshot ? t("quant.panelRescan") : t("quant.panelScan")}
            </button>
          )}
        </div>
      </div>

      {status === "error" ? (
        <p className="mt-6 border-l-2 border-amber-500/50 pl-3 text-sm text-secondary">{t("quant.panelLoadError")}</p>
      ) : !strategy ? (
        <p className="mt-6 border-l-2 border-themed pl-3 text-sm text-secondary">{t("quant.panelUnavailable")}</p>
      ) : !strategy.enabled ? (
        <div className="mt-6 border-l-2 border-themed pl-3">
          <p className="text-sm font-medium text-primary">{t("quant.panelDisabled")}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{t("quant.panelDisabledDescription")}</p>
        </div>
      ) : !stock ? (
        <p className="mt-6 border-l-2 border-themed pl-3 text-sm text-secondary">{t("quant.panelStockUnavailable")}</p>
      ) : (
        <div className="mt-6 min-w-0">
          {!snapshot ? (
            <div className="rounded-md border border-themed bg-[var(--surface-alt)] p-4">
              <p className="text-sm font-medium text-primary">{t("quant.panelNoSnapshotTitle")}</p>
              <p className="mt-1 text-sm leading-6 text-secondary">{t("quant.panelNoSnapshot")}</p>
            </div>
          ) : (
            <>
              <div className={`rounded-md border p-4 ${signalTone(snapshot.signal)}`}>
                <p className="text-xs font-medium uppercase tracking-wide opacity-75">{t("quant.panelCurrentConclusion")}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{t(`quant.signal.${snapshot.signal}`)}</span>
                  {snapshot.execution_timing === "next_session_open" && (
                    <span className="text-xs opacity-80">{t("quant.panelNextOpen")}</span>
                  )}
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-themed bg-[var(--border)] sm:grid-cols-4">
                {isVolumeRatio ? <>
                  <div className="min-w-0 bg-page p-4"><dt className="text-xs text-muted">{t("quant.volumeRatioLatest")}</dt><dd className="mt-2 text-sm font-semibold tabular-nums text-primary">{metric(snapshot.metrics.volume_ratio_3d, localeTag, "x")}</dd></div>
                  <div className="min-w-0 bg-page p-4"><dt className="text-xs text-muted">{t("quant.volumeRatioPriorAverage")}</dt><dd className="mt-2 text-sm font-semibold tabular-nums text-primary">{metric(snapshot.metrics.prior_average_volume, localeTag)}</dd></div>
                  <div className="min-w-0 bg-page p-4"><dt className="text-xs text-muted">{t("quant.volume")}</dt><dd className="mt-2 text-sm font-semibold tabular-nums text-primary">{metric(snapshot.metrics.latest_volume, localeTag)}</dd></div>
                </> : <>
                  <div className="min-w-0 bg-page p-4"><dt className="text-xs text-muted">{t("quant.close")}</dt><dd className="mt-2 text-sm font-semibold tabular-nums text-primary">{metric(snapshot.metrics.close, localeTag)}</dd></div>
                  <div className="min-w-0 bg-page p-4"><dt className="text-xs text-muted">MA5</dt><dd className="mt-2 text-sm font-semibold tabular-nums text-primary">{metric(snapshot.metrics.ma5, localeTag)}</dd></div>
                  <div className="min-w-0 bg-page p-4"><dt className="text-xs text-muted">{t("quant.volumeRatio")}</dt><dd className="mt-2 text-sm font-semibold tabular-nums text-primary">{metric(snapshot.metrics.volume_ratio, localeTag, "x")}</dd></div>
                </>}
                <div className="min-w-0 bg-page p-4"><dt className="text-xs text-muted">{t("quant.panelBarDate")}</dt><dd className="mt-2 text-sm font-semibold text-primary">{snapshot.bar_date ? new Date(`${snapshot.bar_date}T12:00:00Z`).toLocaleDateString(localeTag, { year: "numeric", month: "short", day: "numeric" }) : "--"}</dd></div>
              </dl>

              {reasons.length > 0 && (
                <ul className="mt-5 grid gap-2 lg:grid-cols-2">
                  {reasons.map((reason, index) => <li key={`${reason}-${index}`} className="border-l-2 border-[var(--border-hover)] pl-3 text-sm leading-6 text-secondary">{reason}</li>)}
                </ul>
              )}

              <p className="mt-5 text-xs leading-5 text-muted">
                {t("quant.version", { version: snapshot.strategy_version })}
                {snapshot.source === "yahoo_finance" ? ` · ${t("quant.source.yahoo_finance")}` : snapshot.source === "manual_qualification" ? ` · ${t("quant.source.manual_qualification")}` : ""}
                {` · ${t("quant.panelEvaluated", { date: new Date(snapshot.evaluated_at).toLocaleString(localeTag) })}`}
              </p>
            </>
          )}
        </div>
      )}

      {scanError && <p role="alert" className="mt-4 text-sm text-red-500">{t("quant.panelScanError")}</p>}
    </section>
  );
}
