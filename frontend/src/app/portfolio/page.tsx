"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { useI18n } from "@/components/I18nProvider";
import { InlineNotice, PageShell } from "@/components/ui/Page";
import { api } from "@/lib/api";
import { convertFromCNY, convertToCNY, marketCurrency } from "@/lib/currency";
import type { Asset, Dashboard } from "@/lib/types";

type DisplayCurrency = "CNY" | "USD";
type SortMode = "cost" | "symbol";
const EMPTY_RATES: Record<string, number> = {};

function money(value: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function number(value: number, locale: string) {
  return value.toLocaleString(locale, { maximumFractionDigits: 4 });
}

function hasPrice(asset: Asset) {
  return Number.isFinite(asset.current_price) && asset.current_price > 0;
}

export default function PortfolioPage() {
  return <AuthGuard><CostWorkspace /></AuthGuard>;
}

function CostWorkspace() {
  const { t, localeTag } = useI18n();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("cost");
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("CNY");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getDashboard(), api.listAssets()])
      .then(([overview, rows]) => {
        if (cancelled) return;
        setDashboard(overview);
        setAssets(rows);
        const saved = window.localStorage.getItem("seek_dashboard_display_currency");
        setDisplayCurrency(saved === "USD" || saved === "CNY"
          ? saved
          : overview.default_currency === "USD" ? "USD" : "CNY");
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : t("investments.loadError"));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);

  const rates = dashboard?.exchange_rates ?? EMPTY_RATES;
  const holdings = useMemo(() => assets.filter((asset) =>
    !asset.archived && asset.zone === "active" && !asset.is_cash && asset.quantity > 0,
  ), [assets]);
  const totalCostCny = holdings.reduce((sum, asset) =>
    sum + convertToCNY(asset.broker_cost * asset.quantity, asset.market, rates), 0);
  const priced = holdings.filter(hasPrice);
  const unrealizedCny = priced.reduce((sum, asset) =>
    sum + convertToCNY((asset.current_price - asset.broker_cost) * asset.quantity, asset.market, rates), 0);
  const unpricedCount = holdings.length - priced.length;
  const shown = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return holdings.filter((asset) => !query ||
      asset.symbol.toLocaleLowerCase().includes(query) || asset.name.toLocaleLowerCase().includes(query))
      .sort((left, right) => sort === "symbol"
        ? left.symbol.localeCompare(right.symbol)
        : convertToCNY(right.broker_cost * right.quantity, right.market, rates)
          - convertToCNY(left.broker_cost * left.quantity, left.market, rates));
  }, [holdings, rates, search, sort]);

  const summaryMoney = (value: number) => money(
    convertFromCNY(value, displayCurrency, rates), displayCurrency, localeTag,
  );
  const changeCurrency = (currency: DisplayCurrency) => {
    setDisplayCurrency(currency);
    window.localStorage.setItem("seek_dashboard_display_currency", currency);
    void api.updateProfile({ default_currency: currency }).catch(() => {
      // The local preference remains usable when profile sync is unavailable.
    });
  };

  return (
    <PageShell width="wide">
      <header className="page-header min-w-0">
        <div className="min-w-0">
          <p className="page-eyebrow">{t("costReview.eyebrow")}</p>
          <h1 className="page-title">{t("costReview.title")}</h1>
          <p className="page-description max-w-2xl">{t("costReview.description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/trade" className="ui-button">{t("costReview.trades")}</Link>
          <Link href="/import/ibkr" className="ui-button ui-button--primary">{t("costReview.import")}</Link>
        </div>
      </header>

      {error && <InlineNotice tone="warning">{error}</InlineNotice>}

      {loading ? (
        <div className="space-y-4" aria-busy="true">
          <div className="h-28 animate-pulse rounded-xl border border-themed bg-surface" />
          <div className="h-72 animate-pulse rounded-xl border border-themed bg-surface" />
        </div>
      ) : dashboard ? (
        <>
          <section data-testid="cost-summary" className="grid grid-cols-2 overflow-hidden rounded-xl border border-themed bg-surface sm:grid-cols-3">
            <SummaryCell className="border-b border-r border-themed sm:border-b-0" label={t("costReview.holdings")} value={number(holdings.length, localeTag)} />
            <SummaryCell className="border-b border-themed sm:border-b-0 sm:border-r" label={t("costReview.totalCost")} value={summaryMoney(totalCostCny)} />
            <SummaryCell
              className="col-span-2 sm:col-span-1"
              label={t("costReview.unrealized")}
              value={summaryMoney(unrealizedCny)}
              tone={unrealizedCny}
              detail={unpricedCount ? t("costReview.unpriced", { count: unpricedCount }) : undefined}
            />
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-xs text-muted">
            <p>{t("costReview.summaryNote")}</p>
            <div role="group" aria-label={t("costReview.currency")} className="inline-flex items-center rounded-lg border border-themed bg-surface p-0.5">
              {(["CNY", "USD"] as const).map((currency) => (
                <button key={currency} type="button" aria-pressed={displayCurrency === currency}
                  onClick={() => changeCurrency(currency)}
                  className={`min-h-10 rounded-md px-3 text-xs font-medium transition ${displayCurrency === currency ? "bg-[var(--accent-bg)] text-accent" : "text-muted hover:text-primary"}`}>
                  {currency}
                </button>
              ))}
            </div>
          </div>

          <section className="min-w-0 overflow-hidden rounded-xl border border-themed bg-surface" aria-labelledby="holding-cost-heading">
            <div className="flex flex-col gap-3 border-b border-themed px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 id="holding-cost-heading" className="text-base font-semibold text-primary">{t("costReview.listTitle")}</h2>
                <p className="mt-1 text-xs text-muted">{t("costReview.listDescription")}</p>
              </div>
              {holdings.length > 0 && (
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("costReview.search")}
                    aria-label={t("costReview.search")}
                    className="min-h-10 min-w-0 rounded-lg border border-themed bg-input px-3 text-sm text-primary outline-none focus:border-[var(--accent)] sm:w-52"
                  />
                  <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}
                    aria-label={t("costReview.sort")}
                    className="min-h-10 rounded-lg border border-themed bg-input px-3 text-sm text-secondary outline-none focus:border-[var(--accent)]">
                    <option value="cost">{t("costReview.sortCost")}</option>
                    <option value="symbol">{t("costReview.sortSymbol")}</option>
                  </select>
                </div>
              )}
            </div>

            {holdings.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-5 py-8 text-center">
                <h3 className="text-base font-semibold text-primary">{t("costReview.empty")}</h3>
                <p className="max-w-md text-sm leading-6 text-muted">{t("costReview.emptyDescription")}</p>
                <Link href="/import/ibkr" className="ui-button ui-button--primary">{t("costReview.import")}</Link>
              </div>
            ) : shown.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted">{t("costReview.noMatches")}</p>
            ) : (
              <>
                <div className="hidden grid-cols-[minmax(145px,1.3fr)_minmax(72px,.45fr)_minmax(128px,1fr)_minmax(128px,1fr)_minmax(110px,.9fr)_minmax(125px,.9fr)] items-center gap-3 border-b border-themed bg-input px-5 py-2.5 text-[11px] font-medium text-muted lg:grid">
                  <span>{t("costReview.symbol")}</span>
                  <span className="text-right">{t("costReview.quantity")}</span>
                  <span className="text-right">{t("costReview.recordedCost")}</span>
                  <span className="text-right">{t("costReview.decisionCost")}</span>
                  <span className="text-right">{t("costReview.lastPrice")}</span>
                  <span className="text-right">{t("costReview.pnl")}</span>
                </div>
                <div className="divide-y divide-themed">
                  {shown.map((asset) => <HoldingRow key={asset.id} asset={asset} locale={localeTag} t={t} />)}
                </div>
              </>
            )}
            <div className="flex justify-end border-t border-themed px-4 py-3 sm:px-5">
              <Link href="/assets?zone=active" className="text-xs font-medium text-accent hover:underline">{t("costReview.more")} →</Link>
            </div>
          </section>

          <aside className="rounded-xl border border-themed bg-surface px-4 py-4 sm:px-5" aria-label={t("costReview.sourceTitle")}>
            <h2 className="text-sm font-semibold text-primary">{t("costReview.sourceTitle")}</h2>
            <p className="mt-2 max-w-4xl text-xs leading-5 text-muted">{t("costReview.sourceNote")}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{t("costReview.decisionNote")}</p>
          </aside>
        </>
      ) : null}
    </PageShell>
  );
}

function SummaryCell({ label, value, tone = 0, detail, className = "" }: { label: string; value: string; tone?: number; detail?: string; className?: string }) {
  const toneClass = tone > 0 ? "text-up" : tone < 0 ? "text-down" : "text-primary";
  return (
    <div className={`min-w-0 px-4 py-4 sm:px-5 ${className}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1.5 truncate font-mono text-xl font-semibold tabular-nums sm:text-2xl ${toneClass}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
    </div>
  );
}

function HoldingRow({ asset, locale, t }: { asset: Asset; locale: string; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const currency = marketCurrency(asset.market);
  const cost = asset.broker_cost * asset.quantity;
  const priced = hasPrice(asset);
  const pnl = priced ? (asset.current_price - asset.broker_cost) * asset.quantity : null;
  const decisionDiffers = Math.abs(asset.mental_cost - asset.broker_cost) > 0.005;
  return (
    <Link data-testid="cost-holding-row" href={`/assets/${asset.id}`}
      aria-label={`${asset.symbol} ${asset.name} · ${t("costReview.details")}`}
      className="block min-w-0 px-4 py-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] sm:px-5 lg:grid lg:grid-cols-[minmax(145px,1.3fr)_minmax(72px,.45fr)_minmax(128px,1fr)_minmax(128px,1fr)_minmax(110px,.9fr)_minmax(125px,.9fr)] lg:items-center lg:gap-3">
      <div className="flex min-w-0 items-start justify-between gap-3 lg:block">
        <div className="min-w-0">
          <strong className="font-mono text-sm font-semibold text-primary">{asset.symbol}</strong>
          <span className="mt-0.5 block truncate text-xs text-muted">{asset.name}</span>
        </div>
        <span className="shrink-0 text-sm text-accent lg:hidden" aria-hidden="true">↗</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-sm lg:mt-0 lg:contents">
        <ValueCell label={t("costReview.quantity")} value={number(asset.quantity, locale)} />
        <ValueCell
          label={t("costReview.recordedCost")}
          value={money(asset.broker_cost, currency, locale)}
          detail={t("costReview.totalInHolding", { amount: money(cost, currency, locale) })}
          prominent
        />
        <ValueCell label={t("costReview.decisionCost")} value={decisionDiffers ? money(asset.mental_cost, currency, locale) : "—"} />
        <ValueCell label={t("costReview.lastPrice")} value={priced ? money(asset.current_price, currency, locale) : t("costReview.priceMissing")} />
        <ValueCell label={t("costReview.pnl")} value={pnl == null ? "—" : money(pnl, currency, locale)} tone={pnl ?? 0} />
      </div>
    </Link>
  );
}

function ValueCell({ label, value, detail, prominent = false, tone = 0 }: { label: string; value: string; detail?: string; prominent?: boolean; tone?: number }) {
  const color = tone > 0 ? "text-up" : tone < 0 ? "text-down" : prominent ? "text-primary" : "text-secondary";
  return (
    <span className="min-w-0 lg:text-right">
      <span className="mb-1 block text-[11px] text-muted lg:hidden">{label}</span>
      <span className={`block truncate font-mono text-xs tabular-nums sm:text-sm ${prominent ? "font-semibold" : "font-medium"} ${color}`}>{value}</span>
      {detail && <span className="mt-0.5 block truncate text-[11px] text-muted">{detail}</span>}
    </span>
  );
}
