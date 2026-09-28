"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import AuthGuard from "@/components/AuthGuard";
import { useI18n } from "@/components/I18nProvider";
import { InlineNotice, PageShell } from "@/components/ui/Page";
import { api } from "@/lib/api";
import { convertFromCNY, convertToCNY } from "@/lib/currency";
import type { Asset, AssetCategory, AssetMarket, AssetZone, Dashboard } from "@/lib/types";

const CATEGORY_KEYS: Record<AssetCategory, string> = {
  stock: "assets.categoryStock",
  etf: "assets.categoryEtf",
  crypto: "assets.categoryCrypto",
  deposit: "assets.categoryDeposit",
  bond_fund: "assets.categoryBond",
  pension: "assets.categoryPension",
  gold: "assets.categoryGold",
  collectible: "assets.categoryCollectible",
  real_estate: "assets.categoryRealEstate",
  course: "assets.categoryCourse",
  tool: "assets.categoryTool",
  traffic: "assets.categoryTraffic",
  other_invest: "assets.categoryOther",
};

const MARKET_KEYS: Partial<Record<AssetMarket, string>> = {
  us: "assets.marketUs",
  cn: "assets.marketCn",
  hk: "assets.marketHk",
  crypto: "assets.marketCrypto",
};

const DISPLAY_CURRENCIES = ["CNY", "USD"] as const;
const DISPLAY_CURRENCY_STORAGE_KEY = "seek_dashboard_display_currency";
const HIDE_ZERO_STORAGE_KEY = "seek_portfolio_hide_zero";

type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
type AssetSort = "value" | "name";

function isDisplayCurrency(value: string | null | undefined): value is DisplayCurrency {
  return value === "CNY" || value === "USD";
}

function formatMoney(value: number, currency: DisplayCurrency, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, locale: string) {
  return value.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatPercent(value: number, locale: string) {
  const absolute = Math.abs(value).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${absolute}%`;
}

function pnlClass(value: number) {
  return value > 0 ? "text-up" : value < 0 ? "text-down" : "text-secondary";
}

function assetValueCny(asset: Asset, rates: Record<string, number>) {
  const nativeValue = Math.max(asset.current_price, 0) * Math.max(asset.quantity, 0);
  return convertToCNY(nativeValue, asset.market, rates);
}

function assetSpendCny(asset: Asset, rates: Record<string, number>) {
  return convertToCNY(Math.max(asset.total_invested, 0), asset.market, rates);
}

export default function PortfolioPage() {
  return <AuthGuard><InvestmentOverview /></AuthGuard>;
}

function InvestmentOverview() {
  const { t, localeTag } = useI18n();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("CNY");
  const [hideZero, setHideZero] = useState(true);
  const [sort, setSort] = useState<AssetSort>("value");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getDashboard(), api.listAssets()])
      .then(([overview, rows]) => {
        if (cancelled) return;
        const savedCurrency = window.localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY);
        const savedHideZero = window.localStorage.getItem(HIDE_ZERO_STORAGE_KEY);
        setDashboard(overview);
        setAssets(rows.filter((asset) => !asset.archived));
        setDisplayCurrency(isDisplayCurrency(savedCurrency)
          ? savedCurrency
          : isDisplayCurrency(overview.default_currency) ? overview.default_currency : "CNY");
        if (savedHideZero !== null) setHideZero(savedHideZero !== "false");
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : t("investments.loadError"));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);

  const rates = dashboard?.exchange_rates || {};
  const groups = useMemo(() => ({
    active: assets.filter((asset) => asset.zone === "active" && !asset.is_cash),
    base: assets.filter((asset) => asset.zone === "base" && !asset.is_cash),
    invest: assets.filter((asset) => asset.zone === "invest"),
  }), [assets]);
  const brokerCash = assets.filter((asset) => asset.is_cash);
  const marketRows = groups.active.map((asset) => ({ asset, valueCny: assetValueCny(asset, rates) }));
  const marketTotalCny = marketRows.reduce((sum, row) => sum + row.valueCny, 0);
  const zeroMarketCount = marketRows.filter((row) => row.valueCny <= 0).length;
  const visibleMarketRows = marketRows
    .filter((row) => !hideZero || row.valueCny > 0)
    .sort((a, b) => sort === "value"
      ? b.valueCny - a.valueCny
      : a.asset.symbol.localeCompare(b.asset.symbol));
  const capabilitySpendCny = groups.invest.reduce((sum, asset) => sum + assetSpendCny(asset, rates), 0);
  const capabilityReturnCny = groups.invest.reduce(
    (sum, asset) => sum + convertToCNY(asset.total_cashed, asset.market, rates),
    0,
  );
  const trackedCount = groups.active.length + groups.base.length + groups.invest.length;
  const trackedKinds = [groups.active, groups.base, groups.invest].filter((group) => group.length > 0).length;
  const pnlPercent = dashboard && dashboard.holding_cost_cny > 0
    ? dashboard.total_pnl_cny / dashboard.holding_cost_cny * 100
    : null;
  const secondaryCurrency: DisplayCurrency = displayCurrency === "CNY" ? "USD" : "CNY";

  const displayCny = (value: number, currency = displayCurrency) => (
    formatMoney(convertFromCNY(value, currency, rates), currency, localeTag)
  );

  const changeCurrency = (currency: DisplayCurrency) => {
    setDisplayCurrency(currency);
    window.localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, currency);
    void api.updateProfile({ default_currency: currency }).catch(() => {
      // The local display preference remains usable when profile sync is unavailable.
    });
  };

  const changeHideZero = (next: boolean) => {
    setHideZero(next);
    window.localStorage.setItem(HIDE_ZERO_STORAGE_KEY, String(next));
  };

  return (
    <PageShell width="wide">
      <header className="page-header min-w-0">
        <div className="min-w-0">
          <p className="page-eyebrow">{t("investments.eyebrow")}</p>
          <h1 className="page-title">{t("investments.title")}</h1>
          <p className="page-description">{t("investments.description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            data-testid="portfolio-currency-switcher"
            className="inline-flex min-h-10 items-center rounded-lg border border-themed bg-input p-1"
            role="group"
            aria-label={t("investments.currency")}
          >
            {DISPLAY_CURRENCIES.map((currency) => (
              <button
                key={currency}
                type="button"
                onClick={() => changeCurrency(currency)}
                aria-pressed={displayCurrency === currency}
                className={`min-h-10 rounded-md px-3 text-xs font-semibold transition ${displayCurrency === currency ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-primary"}`}
              >
                {currency}
              </button>
            ))}
          </div>
          <Link href="/assets" className="ui-button">{t("investments.manage")}</Link>
          <Link href="/assets?create=1" className="ui-button ui-button--primary">+ {t("investments.add")}</Link>
        </div>
      </header>

      {error && <InlineNotice tone="warning">{error}</InlineNotice>}

      {loading ? <OverviewSkeleton /> : dashboard ? (
        <>
          <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-themed bg-surface xl:grid-cols-4">
            <MetricCell
              label={t("investments.netWorth")}
              value={displayCny(dashboard.market_value_cny)}
              note={t("investments.equivalent", { value: displayCny(dashboard.market_value_cny, secondaryCurrency) })}
            />
            <MetricCell
              label={t("investments.totalPnl")}
              value={displayCny(dashboard.total_pnl_cny)}
              note={pnlPercent == null ? t("investments.totalPnlNote") : t("investments.pnlPercent", { value: formatPercent(pnlPercent, localeTag) })}
              tone={dashboard.total_pnl_cny}
            />
            <MetricCell
              label={t("investments.capabilitySpend")}
              value={displayCny(capabilitySpendCny)}
              note={t("investments.capabilitySpendNote")}
            />
            <MetricCell
              label={t("investments.catalog")}
              value={t("investments.items", { count: trackedCount })}
              note={t("investments.trackedKinds", { count: trackedKinds })}
            />
          </section>

          <section
            data-testid="investment-overview-grid"
            className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(300px,1fr)]"
          >
            <section data-testid="market-investments-panel" className="min-w-0 overflow-hidden rounded-lg border border-themed bg-surface">
              <div className="flex flex-col gap-3 border-b border-themed px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />
                    <h2 className="text-sm font-semibold text-primary">{t("investments.marketTitle")}</h2>
                    <span className="text-xs text-muted">{t("investments.items", { count: groups.active.length })}</span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted">{t("investments.marketDescription")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex min-h-10 items-center gap-2 text-xs text-secondary">
                    <span className="sr-only">{t("investments.sort")}</span>
                    <select
                      value={sort}
                      onChange={(event) => setSort(event.target.value as AssetSort)}
                      className="min-h-10 rounded-lg border border-themed bg-input px-2 text-xs text-secondary outline-none focus:border-[var(--accent)]"
                      aria-label={t("investments.sort")}
                    >
                      <option value="value">{t("investments.sortValue")}</option>
                      <option value="name">{t("investments.sortName")}</option>
                    </select>
                  </label>
                  <label data-testid="portfolio-zero-toggle" className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-themed px-2.5 text-xs text-secondary hover:border-[var(--border-hover)]">
                    <input
                      type="checkbox"
                      checked={hideZero}
                      onChange={(event) => changeHideZero(event.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span>{t("investments.hideZero")}</span>
                  </label>
                </div>
              </div>

              <div className="hidden grid-cols-[minmax(0,1.35fr)_minmax(150px,.75fr)_minmax(150px,.65fr)] gap-4 border-b border-themed bg-input px-4 py-2 text-[10px] font-semibold uppercase tracking-[.12em] text-muted sm:grid">
                <span>{t("investments.marketTitle")}</span>
                <span>{t("investments.position")}</span>
                <span className="text-right">{t("investments.currentValue")}</span>
              </div>

              {visibleMarketRows.length ? (
                <div className="divide-y divide-themed xl:max-h-[620px] xl:overflow-y-auto">
                  {visibleMarketRows.map(({ asset, valueCny }) => (
                    <MarketAssetRow
                      key={asset.id}
                      asset={asset}
                      valueCny={valueCny}
                      totalCny={marketTotalCny}
                      displayCurrency={displayCurrency}
                      rates={rates}
                    />
                  ))}
                </div>
              ) : (
                <CompactEmpty
                  title={t("investments.emptyMarket")}
                  description={hideZero && zeroMarketCount > 0
                    ? t("investments.zeroHidden", { count: zeroMarketCount })
                    : t("investments.marketDescription")}
                  action={<Link href="/assets?create=1" className="ui-button ui-button--primary">+ {t("investments.add")}</Link>}
                />
              )}

              <div className="flex min-h-11 items-center justify-between gap-3 border-t border-themed px-4 py-2.5">
                <span className="text-[10px] text-muted">
                  {hideZero && zeroMarketCount > 0 ? t("investments.zeroHidden", { count: zeroMarketCount }) : t("investments.valuedInNetWorth")}
                </span>
                <Link href="/assets" className="shrink-0 text-xs font-medium text-accent hover:underline">{t("investments.viewAll")} →</Link>
              </div>
            </section>

            <div data-testid="supporting-investments-column" className="grid min-w-0 content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
              <CompactDomain
                zone="base"
                title={t("investments.baseTitle")}
                description={t("investments.baseDescription")}
                assets={groups.base}
                displayCurrency={displayCurrency}
                rates={rates}
              />
              <CompactDomain
                zone="invest"
                title={t("investments.capabilityTitle")}
                description={t("investments.capabilityDescription")}
                assets={groups.invest}
                displayCurrency={displayCurrency}
                rates={rates}
                footer={groups.invest.length > 0
                  ? t("investments.capabilityFooter", { spend: displayCny(capabilitySpendCny), return: displayCny(capabilityReturnCny) })
                  : undefined}
              />
            </div>
          </section>

          <BrokerageLedger
            dashboard={dashboard}
            brokerCash={brokerCash}
            displayCurrency={displayCurrency}
            rates={rates}
          />
        </>
      ) : null}
    </PageShell>
  );
}

function MarketAssetRow({
  asset,
  valueCny,
  totalCny,
  displayCurrency,
  rates,
}: {
  asset: Asset;
  valueCny: number;
  totalCny: number;
  displayCurrency: DisplayCurrency;
  rates: Record<string, number>;
}) {
  const { t, localeTag } = useI18n();
  const marketKey = MARKET_KEYS[asset.market];
  const marketLabel = marketKey ? t(marketKey) : t(CATEGORY_KEYS[asset.category]);
  const costCny = convertToCNY(asset.broker_cost, asset.market, rates);
  const displayValue = convertFromCNY(valueCny, displayCurrency, rates);
  const displayCost = convertFromCNY(costCny, displayCurrency, rates);
  const weight = totalCny > 0 ? Math.min(100, Math.max(0, valueCny / totalCny * 100)) : 0;
  const zero = valueCny <= 0;

  return (
    <Link
      href={`/assets/${asset.id}`}
      className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-3 transition hover:bg-surface-hover sm:grid-cols-[minmax(0,1.35fr)_minmax(150px,.75fr)_minmax(150px,.65fr)] ${zero ? "opacity-45" : ""}`}
    >
      <span className="min-w-0">
        <span className="flex items-baseline gap-2">
          <strong className="shrink-0 font-mono text-sm font-semibold text-primary">{asset.symbol}</strong>
          <span className="truncate text-xs text-secondary">{asset.name}</span>
        </span>
        <span className="mt-1 block truncate text-[10px] text-muted">{marketLabel} · {t(CATEGORY_KEYS[asset.category])}</span>
      </span>
      <span className="hidden min-w-0 self-center text-xs text-secondary sm:block">
        <span className="block truncate">{t("investments.quantityAndCost", {
          quantity: formatNumber(asset.quantity, localeTag),
          cost: formatMoney(displayCost, displayCurrency, localeTag),
        })}</span>
      </span>
      <span className="min-w-[116px] self-center text-right">
        <strong className="block font-mono text-sm font-semibold text-primary">{formatMoney(displayValue, displayCurrency, localeTag)}</strong>
        <span className="mt-1.5 flex items-center justify-end gap-2">
          <span className="sr-only">{t("investments.portfolioWeight", { value: `${weight.toFixed(1)}%` })}</span>
          <span className="h-1 w-20 overflow-hidden rounded-full bg-[var(--progress-bg)]">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${weight}%` }} />
          </span>
          <span className="w-10 font-mono text-[9px] text-muted">{weight.toFixed(1)}%</span>
        </span>
      </span>
      <span className="col-span-2 text-[10px] text-muted sm:hidden">
        {t("investments.quantityAndCost", {
          quantity: formatNumber(asset.quantity, localeTag),
          cost: formatMoney(displayCost, displayCurrency, localeTag),
        })}
      </span>
    </Link>
  );
}

function CompactDomain({
  zone,
  title,
  description,
  assets,
  displayCurrency,
  rates,
  footer,
}: {
  zone: Exclude<AssetZone, "active">;
  title: string;
  description: string;
  assets: Asset[];
  displayCurrency: DisplayCurrency;
  rates: Record<string, number>;
  footer?: string;
}) {
  const { t, localeTag } = useI18n();
  const isBase = zone === "base";
  const dot = isBase ? "bg-sky-400" : "bg-violet-400";

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-themed bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-themed px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
            <h2 className="truncate text-sm font-semibold text-primary">{title}</h2>
            <span className="shrink-0 text-[10px] text-muted">{t("investments.items", { count: assets.length })}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-[10px] leading-4 text-muted">{description}</p>
        </div>
        <Link href="/assets?create=1" className="flex min-h-10 shrink-0 items-center text-xs font-medium text-accent hover:underline">
          + {t(isBase ? "investments.addBase" : "investments.addCapability")}
        </Link>
      </div>

      {assets.length ? (
        <div className="divide-y divide-themed">
          {assets.slice(0, 4).map((asset) => {
            const valueCny = isBase ? assetValueCny(asset, rates) : assetSpendCny(asset, rates);
            return (
              <Link key={asset.id} href={`/assets/${asset.id}`} className="flex min-h-[54px] items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-surface-hover">
                <span className="min-w-0">
                  <strong className="block truncate text-xs font-medium text-primary">{asset.name || asset.symbol}</strong>
                  <small className="mt-0.5 block truncate text-[10px] text-muted">{t(CATEGORY_KEYS[asset.category])}</small>
                </span>
                <span className="shrink-0 text-right">
                  <small className="block text-[9px] text-muted">{t(isBase ? "investments.currentValue" : "investments.cumulativeSpend")}</small>
                  <strong className="font-mono text-xs font-medium text-secondary">
                    {formatMoney(convertFromCNY(valueCny, displayCurrency, rates), displayCurrency, localeTag)}
                  </strong>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <CompactEmpty
          title={t(isBase ? "investments.emptyBase" : "investments.emptyCapability")}
          description={description}
        />
      )}

      <div className="flex min-h-10 items-center justify-between gap-3 border-t border-themed px-4 py-2">
        <span className="truncate text-[10px] text-muted">{footer || t(isBase ? "investments.valuedInNetWorth" : "investments.capabilityNotNetWorth")}</span>
        {assets.length > 4 && <Link href="/assets" className="shrink-0 text-xs text-accent hover:underline">{t("investments.viewAll")} →</Link>}
      </div>
    </section>
  );
}

function BrokerageLedger({
  dashboard,
  brokerCash,
  displayCurrency,
  rates,
}: {
  dashboard: Dashboard;
  brokerCash: Asset[];
  displayCurrency: DisplayCurrency;
  rates: Record<string, number>;
}) {
  const { t, localeTag } = useI18n();
  const display = (valueCny: number) => formatMoney(
    convertFromCNY(valueCny, displayCurrency, rates),
    displayCurrency,
    localeTag,
  );

  return (
    <section className="overflow-hidden rounded-lg border border-themed bg-surface">
      <div className="flex flex-col gap-3 border-b border-themed px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted">{t("investments.accountingEyebrow")}</p>
            <span className="h-1 w-1 rounded-full bg-[var(--border-hover)]" />
            <h2 className="text-sm font-semibold text-primary">{t("investments.accountingTitle")}</h2>
          </div>
          <p className="mt-1 truncate text-[10px] text-muted">{t("investments.accountingDescription")}</p>
        </div>
        <Link href="/import/ibkr" className="ui-button shrink-0">{t("investments.import")}</Link>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,.38fr)]">
        <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4 lg:border-r lg:border-themed">
          <LedgerCell label={t("portfolio.netDeposit")} value={display(dashboard.ibkr_net_deposit_cny)} />
          <LedgerCell label={t("portfolio.holdingCost")} value={display(dashboard.holding_cost_cny)} />
          <LedgerCell label={t("portfolio.unrealizedPnl")} value={display(dashboard.unrealized_pnl_cny)} tone={dashboard.unrealized_pnl_cny} />
          <LedgerCell label={t("portfolio.realizedPnl")} value={display(dashboard.total_realized_pnl_cny)} tone={dashboard.total_realized_pnl_cny} />
        </div>
        <aside className="border-t border-themed px-4 py-3 lg:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-primary">{t("portfolio.brokerCash")}</span>
            <Link href="/assets" className="text-xs text-accent hover:underline">{t("common.view")} →</Link>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {brokerCash.length ? brokerCash.map((asset) => (
              <span key={asset.id} className="flex min-w-0 items-baseline gap-2 text-[10px] text-muted">
                <span className="max-w-36 truncate">{asset.name}</span>
                <strong className="font-mono text-xs text-secondary">{display(assetValueCny(asset, rates))}</strong>
              </span>
            )) : <span className="text-[10px] text-muted">{t("portfolio.cashEmpty")}</span>}
          </div>
        </aside>
      </div>
      <p className="border-t border-themed px-4 py-2 text-[10px] leading-4 text-muted">{t("investments.accountingScope")}</p>
    </section>
  );
}

function MetricCell({ label, value, note, tone = 0 }: { label: string; value: string; note: string; tone?: number }) {
  return (
    <div className="min-w-0 border-b border-r border-themed px-3 py-3 [&:nth-child(2n)]:border-r-0 [&:nth-child(n+3)]:border-b-0 sm:px-4 xl:border-b-0 xl:[&:nth-child(2)]:border-r xl:last:border-r-0">
      <p className="truncate text-[10px] font-medium text-muted">{label}</p>
      <p className={`mt-1 truncate font-mono text-lg font-semibold sm:text-xl ${tone ? pnlClass(tone) : "text-primary"}`}>{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted">{note}</p>
    </div>
  );
}

function LedgerCell({ label, value, tone = 0 }: { label: string; value: string; tone?: number }) {
  return (
    <div className="min-w-0 bg-surface px-3 py-3">
      <p className="truncate text-[10px] text-muted">{label}</p>
      <p className={`mt-1 truncate font-mono text-sm font-semibold ${tone ? pnlClass(tone) : "text-primary"}`}>{value}</p>
    </div>
  );
}

function CompactEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-28 items-center justify-between gap-4 px-4 py-5">
      <div className="min-w-0 border-l-2 border-themed pl-3">
        <p className="text-xs font-medium text-secondary">{title}</p>
        <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-24 animate-pulse rounded-lg border border-themed bg-surface" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(300px,1fr)]">
        <div className="h-[520px] animate-pulse rounded-lg border border-themed bg-surface" />
        <div className="space-y-4">
          <div className="h-56 animate-pulse rounded-lg border border-themed bg-surface" />
          <div className="h-56 animate-pulse rounded-lg border border-themed bg-surface" />
        </div>
      </div>
    </div>
  );
}
