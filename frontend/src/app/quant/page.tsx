"use client";

import { useCallback, useEffect, useState } from "react";

import { useI18n } from "@/components/I18nProvider";
import { EmptyState, InlineNotice, PageHeader, PageShell } from "@/components/ui/Page";
import { api } from "@/lib/api";
import type { QuantStrategy, QuantStrategyStock } from "@/lib/types";

import QuantStockList from "./QuantStockList";
import QuantStrategyCard from "./QuantStrategyCard";

export default function QuantPage() {
  const { localeTag, t } = useI18n();
  const [strategies, setStrategies] = useState<QuantStrategy[]>([]);
  const [activeStrategyKey, setActiveStrategyKey] = useState<string | null>(null);
  const [stockQuery, setStockQuery] = useState("");
  const [stocksByStrategy, setStocksByStrategy] = useState<Record<string, QuantStrategyStock[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [scanningKey, setScanningKey] = useState<string | null>(null);
  const [progressByStrategy, setProgressByStrategy] = useState<Record<string, { completed: number; total: number } | null>>({});
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<Record<string, Record<number, string>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const strategies = await api.listQuantStrategies();
      const stockEntries = await Promise.all(strategies.map(async (strategy) => [strategy.strategy_key, await api.listQuantStrategyStocks(strategy.strategy_key)] as const));
      setStrategies(strategies);
      setStocksByStrategy(Object.fromEntries(stockEntries));
      setActiveStrategyKey((current) => {
        const requested = new URLSearchParams(window.location.search).get("strategy");
        if (requested && strategies.some((strategy) => strategy.strategy_key === requested)) return requested;
        if (current && strategies.some((strategy) => strategy.strategy_key === current)) return current;
        return strategies[0]?.strategy_key || null;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("quant.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  async function toggleStrategy(strategyKey: string, enabled: boolean) {
    setBusyKey(strategyKey);
    setError("");
    try {
      const updated = await api.updateQuantStrategy(strategyKey, enabled);
      setStrategies((current) => current.map((item) => item.strategy_key === strategyKey ? updated : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("quant.toggleError"));
    } finally {
      setBusyKey(null);
    }
  }

  async function scanAll(strategy: QuantStrategy) {
    const stocks = stocksByStrategy[strategy.strategy_key] || [];
    if (!strategy.enabled || scanningKey || stocks.length === 0) return;
    setScanningKey(strategy.strategy_key);
    setProgressByStrategy((current) => ({ ...current, [strategy.strategy_key]: { completed: 0, total: stocks.length } }));
    setRowErrors((current) => ({ ...current, [strategy.strategy_key]: {} }));
    setError("");
    let cursor = 0;
    const worker = async () => {
      while (cursor < stocks.length) {
        const index = cursor;
        cursor += 1;
        const stock = stocks[index];
        try {
          const snapshot = await api.scanQuantStock(strategy.strategy_key, stock.stock_id);
          setStocksByStrategy((current) => ({
            ...current,
            [strategy.strategy_key]: (current[strategy.strategy_key] || []).map((item) => item.stock_id === stock.stock_id ? { ...item, latest_snapshot: snapshot } : item),
          }));
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : t("quant.scanFailed");
          setRowErrors((current) => ({ ...current, [strategy.strategy_key]: { ...(current[strategy.strategy_key] || {}), [stock.stock_id]: message } }));
        } finally {
          setProgressByStrategy((current) => ({
            ...current,
            [strategy.strategy_key]: current[strategy.strategy_key] ? { ...current[strategy.strategy_key]!, completed: current[strategy.strategy_key]!.completed + 1 } : current[strategy.strategy_key],
          }));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, stocks.length) }, () => worker()));
    setScanningKey(null);
  }

  function selectStrategy(strategyKey: string) {
    setActiveStrategyKey(strategyKey);
    const url = new URL(window.location.href);
    url.searchParams.set("strategy", strategyKey);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  if (loading) {
    return <PageShell width="wide"><div className="grid gap-4"><span className="skeleton-block h-28" /><span className="skeleton-block h-80" /></div></PageShell>;
  }

  return (
    <PageShell width="wide" className="pb-12">
      <PageHeader
        eyebrow={t("quant.eyebrow")}
        title={t("quant.title")}
        description={t("quant.description")}
        meta={<span>{t("quant.private")}</span>}
      />

      {error && <InlineNotice tone="warning"><span>{error}</span> <button type="button" className="ml-2 underline underline-offset-2" onClick={() => void load()}>{t("quant.retry")}</button></InlineNotice>}

      {!strategies.length ? (
        <EmptyState title={t("quant.noStrategy")} description={t("quant.noStrategyDescription")} />
      ) : (
        <QuantStrategyWorkspace
          strategies={strategies}
          activeStrategyKey={activeStrategyKey}
          stocksByStrategy={stocksByStrategy}
          busyKey={busyKey}
          scanningKey={scanningKey}
          progressByStrategy={progressByStrategy}
          rowErrors={rowErrors}
          stockQuery={stockQuery}
          onStockQueryChange={setStockQuery}
          localeTag={localeTag}
          t={t}
          onSelect={selectStrategy}
          onToggle={toggleStrategy}
          onScan={scanAll}
        />
      )}
    </PageShell>
  );
}

function QuantStrategyWorkspace({
  strategies,
  activeStrategyKey,
  stocksByStrategy,
  busyKey,
  scanningKey,
  progressByStrategy,
  rowErrors,
  stockQuery,
  onStockQueryChange,
  localeTag,
  t,
  onSelect,
  onToggle,
  onScan,
}: {
  strategies: QuantStrategy[];
  activeStrategyKey: string | null;
  stocksByStrategy: Record<string, QuantStrategyStock[]>;
  busyKey: string | null;
  scanningKey: string | null;
  progressByStrategy: Record<string, { completed: number; total: number } | null>;
  rowErrors: Record<string, Record<number, string>>;
  stockQuery: string;
  onStockQueryChange: (value: string) => void;
  localeTag: string;
  t: (key: string, variables?: Record<string, string | number>) => string;
  onSelect: (strategyKey: string) => void;
  onToggle: (strategyKey: string, enabled: boolean) => Promise<void>;
  onScan: (strategy: QuantStrategy) => Promise<void>;
}) {
  const activeStrategy = strategies.find((strategy) => strategy.strategy_key === activeStrategyKey) || strategies[0];
  const stocks = stocksByStrategy[activeStrategy.strategy_key] || [];
  const snapshots = stocks.map((stock) => stock.latest_snapshot).filter(Boolean);
  const lastScanAt = snapshots.reduce<string | null>((latest, snapshot) => {
    if (!snapshot) return latest;
    return !latest || snapshot.evaluated_at > latest ? snapshot.evaluated_at : latest;
  }, null);

  const strategyTitle = (strategy: QuantStrategy) => {
    if (strategy.strategy_key === "price-anchor-observation") return t("quant.priceAnchorStrategyName");
    if (strategy.strategy_key === "three-day-volume-ratio") return t("quant.volumeRatioStrategyName");
    return t("quant.strategyName");
  };

  return (
    <div className="grid gap-4">
      <div className="ui-surface quant-strategy-switcher p-2" role="tablist" aria-label={t("quant.strategySwitcher")}>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {strategies.map((strategy) => {
            const selected = strategy.strategy_key === activeStrategy.strategy_key;
            const strategyStocks = stocksByStrategy[strategy.strategy_key] || [];
            const scanned = strategyStocks.filter((stock) => stock.latest_snapshot).length;
            return (
              <button
                key={strategy.strategy_key}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="active-quant-strategy"
                className={`quant-strategy-tab min-w-0 rounded-md border px-4 py-3 text-left transition ${selected ? "border-[var(--accent)]/40 bg-[var(--accent-bg)]" : "border-transparent hover:border-themed hover:bg-surface-hover"}`}
                onClick={() => onSelect(strategy.strategy_key)}
              >
                <span className="flex min-w-0 items-center justify-between gap-3">
                  <span className={`quant-strategy-tab__title min-w-0 text-sm font-semibold ${selected ? "text-accent" : "text-primary"}`}>{strategyTitle(strategy)}</span>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${strategy.enabled ? "bg-ok" : "bg-[var(--text-muted)]"}`} aria-hidden="true" />
                </span>
                <span className="mt-1 block text-xs text-muted">{t("quant.strategyProgress", { scanned, total: strategyStocks.length })}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div id="active-quant-strategy" role="tabpanel" className="grid gap-4">
        <QuantStrategyCard
          strategy={activeStrategy}
          busy={busyKey === activeStrategy.strategy_key}
          scanning={scanningKey === activeStrategy.strategy_key}
          progress={progressByStrategy[activeStrategy.strategy_key] || null}
          scannedCount={snapshots.length}
          lastScanAt={lastScanAt}
          canScan={stocks.length > 0}
          localeTag={localeTag}
          t={t}
          onToggle={(enabled) => void onToggle(activeStrategy.strategy_key, enabled)}
          onScan={() => void onScan(activeStrategy)}
        />
        <label className="quant-stock-search ui-surface flex min-h-12 min-w-0 items-center gap-3 px-4 py-2.5 sm:px-5">
          <span className="shrink-0 text-xs font-medium text-secondary">{t("quant.searchStocks")}</span>
          <input
            type="search"
            value={stockQuery}
            onChange={(event) => onStockQueryChange(event.target.value)}
            placeholder={t("quant.searchStocksPlaceholder")}
            aria-label={t("quant.searchStocks")}
            className="field-input min-h-10 min-w-0 flex-1 border-0 bg-transparent px-0 focus:ring-0"
          />
        </label>
        <QuantStockList key={activeStrategy.strategy_key} strategyKey={activeStrategy.strategy_key} stocks={stocks} rowErrors={rowErrors[activeStrategy.strategy_key] || {}} query={stockQuery} t={t} />
      </div>
    </div>
  );
}
