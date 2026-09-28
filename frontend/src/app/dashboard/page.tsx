"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { marketSymbol, convertToCNY, convertFromCNY, currencySymbol } from "@/lib/currency";
import type { Dashboard, AssetSummary, InvestSummary, CashAccount } from "@/lib/types";
import AuthGuard from "@/components/AuthGuard";
import { DashboardSkeleton } from "@/components/Skeleton";

const SESSION_LABEL: Record<string, string> = { pre_market: "盘前", regular: "盘中", post_market: "盘后", closed: "收盘" };
const SESSION_COLOR: Record<string, string> = { pre_market: "text-amber-400", regular: "text-up", post_market: "text-info", closed: "text-zinc-400" };

const DashCharts = dynamic(() => import("@/components/DashCharts"), { ssr: false });
const DASHBOARD_CURRENCIES = [
  { code: "CNY", label: "人民币" },
  { code: "HKD", label: "港币" },
  { code: "USD", label: "美金" },
] as const;
type DashboardCurrency = typeof DASHBOARD_CURRENCIES[number]["code"];
const DASHBOARD_CURRENCY_STORAGE_KEY = "seek_dashboard_display_currency";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isDashboardCurrency(value: string | null | undefined): value is DashboardCurrency {
  return value === "CNY" || value === "HKD" || value === "USD";
}

function loadDashboardCurrency(): DashboardCurrency {
  if (typeof window === "undefined") return "CNY";
  const saved = window.localStorage.getItem(DASHBOARD_CURRENCY_STORAGE_KEY);
  return isDashboardCurrency(saved) ? saved : "CNY";
}

export default function DashboardPage() {
  return <AuthGuard><DashboardContent /></AuthGuard>;
}

function DashboardContent() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [error, setError] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<{type: "success"|"error", text: string} | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<DashboardCurrency>(loadDashboardCurrency);

  useEffect(() => {
    api.getDashboard().then((result) => {
      const saved = window.localStorage.getItem(DASHBOARD_CURRENCY_STORAGE_KEY);
      if (!saved && isDashboardCurrency(result.default_currency)) {
        setDisplayCurrency(result.default_currency);
      }
      setData(result);
    }).catch((e) => setError(e.message));
    api.listCashAccounts().then(setCashAccounts).catch(() => {});
  }, []);

  if (error) return <p className="py-12 text-center text-red-400">加载失败: {error}</p>;
  if (!data) return <DashboardSkeleton />;

  const totalAssets = data.active_assets.length + data.base_assets.length;

  // 页面显示货币：内部仍以 CNY 汇总，展示时再转换，避免多币种直接相加。
  const dc = displayCurrency;
  const dcSym = currencySymbol(dc);
  const rates = data.exchange_rates || {};
  const totalCash = cashAccounts
    .filter(a => a.is_active)
    .reduce((s, a) => s + a.balance * (rates[a.currency] ?? 1), 0);

  // 将 CNY 金额转换为页面显示货币
  const toUserCurrency = (cny: number) => convertFromCNY(cny, dc, rates);
  const displayMoney = (cny: number) => `${dcSym}${fmt(toUserCurrency(cny))}`;

  // 判断是否有多币种资产（需要显示汇率信息）
  const allAssets = [...data.active_assets, ...data.base_assets];
  const usedCurrencies = new Set<string>();
  const marketToCurrency: Record<string, string> = { us: "USD", cn: "CNY", hk: "HKD", crypto: "USD", other: "CNY" };
  for (const a of allAssets) {
    usedCurrencies.add(marketToCurrency[a.market] || "CNY");
  }
  const hasMultiCurrency = usedCurrencies.size > 1 || (usedCurrencies.size === 1 && !usedCurrencies.has("CNY"));

  const changeDisplayCurrency = (currency: DashboardCurrency) => {
    setDisplayCurrency(currency);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DASHBOARD_CURRENCY_STORAGE_KEY, currency);
    }
    void api.updateProfile({ default_currency: currency }).catch(() => {
      // 本地偏好已保存；后端保存失败不打断用户当前浏览。
    });
  };

  // 按市场汇总各币种市值
  const marketSummaries: { market: string; flag: string; label: string; currency: string; sym: string; value: number }[] = [];
  const mktOrder = ["cn", "us", "hk", "crypto"];
  const mktLabels: Record<string, string> = { cn: "A股", us: "美股", hk: "港股", crypto: "加密" };
  const mktFlags: Record<string, string> = { cn: "🇨🇳", us: "🇺🇸", hk: "🇭🇰", crypto: "₿" };
  for (const m of mktOrder) {
    const group = allAssets.filter(a => a.market === m);
    if (group.length === 0) continue;
    const cur = marketToCurrency[m] || "CNY";
    const sym = marketSymbol(m);
    const val = group.reduce((s, a) => s + a.current_price * a.quantity, 0);
    marketSummaries.push({ market: m, flag: mktFlags[m] || "", label: mktLabels[m] || m, currency: cur, sym, value: val });
  }

  return (
    <div className="page-shell page-shell--wide">
      {/* 页头 */}
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Capital overview</p>
          <h1 className="page-title">资产总览</h1>
          <p className="page-description">汇总持仓、成本、盈亏和安全垫，快速确认整体风险敞口。</p>
          <div className="mt-2 inline-flex rounded-xl border border-themed bg-surface p-1">
            {DASHBOARD_CURRENCIES.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => changeDisplayCurrency(item.code)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  displayCurrency === item.code ? "bg-white/10 text-primary shadow-sm" : "text-muted hover:text-secondary"
                }`}
                title={item.label}
              >
                {item.code}
              </button>
            ))}
          </div>
        </div>
        <div className="page-actions">
          <Link href="/guide" className="ui-button">使用指南</Link>
          <button
            onClick={() => setResetConfirm(true)}
            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400 transition hover:border-red-500 hover:bg-red-500/10"
          >
            初始化数据
          </button>
          <Link href="/assets" className="rounded-lg border border-themed px-3 py-1.5 text-sm text-secondary transition hover:border-[var(--border-hover)] hover:text-primary">
            管理资产
          </Link>
          <Link href="/trade" className="rounded-lg bg-accent bg-accent-hover px-4 py-1.5 text-sm font-semibold text-on-accent transition">
            记一笔
          </Link>
        </div>
      </header>

      {/* 数据初始化确认弹窗 */}
      {resetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => !resetting && setResetConfirm(false)}>
          <div className="w-full max-w-sm rounded-xl border border-red-500/30 bg-surface p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            {resetMsg ? (
              <>
                <div className={`text-center py-4 ${resetMsg.type === "success" ? "text-ok" : "text-risk"}`}>
                  <div className="text-3xl mb-3">{resetMsg.type === "success" ? "✓" : "✗"}</div>
                  <p className="text-sm font-medium">{resetMsg.text}</p>
                </div>
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => { setResetConfirm(false); setResetMsg(null); if (resetMsg.type === "success") window.location.reload(); }}
                    className="rounded-lg bg-accent bg-accent-hover px-5 py-2 text-sm font-semibold text-on-accent transition"
                  >
                    {resetMsg.type === "success" ? "刷新页面" : "关闭"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-red-400">确认初始化数据</h3>
                <p className="mt-3 text-sm text-secondary leading-relaxed">
                  此操作将清除您的<span className="text-red-400 font-semibold">所有资产、交易记录、批次分配</span>数据，
                  并重置避风港和现金账户余额。
                </p>
                <p className="mt-2 text-xs text-muted">此操作不可撤销，通常用于重新导入数据前的清理。</p>
                <div className="mt-5 flex justify-end gap-3">
                  <button
                    disabled={resetting}
                    onClick={() => setResetConfirm(false)}
                    className="rounded-lg border border-themed px-4 py-2 text-sm text-secondary transition hover:text-primary"
                  >
                    取消
                  </button>
                  <button
                    disabled={resetting}
                    onClick={async () => {
                      setResetting(true);
                      try {
                        const res = await api.resetData();
                        setResetMsg({type: "success", text: res.message || "数据已清除"});
                      } catch (e: unknown) {
                        setResetMsg({type: "error", text: "重置失败: " + (e instanceof Error ? e.message : "未知错误")});
                      } finally {
                        setResetting(false);
                      }
                    }}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                  >
                    {resetting ? "清除中..." : "确认清除"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Card label={`持仓市值 (${dc})`} value={displayMoney(data.market_value_cny)} icon="chart"
          subtitle={hasMultiCurrency ? "已按汇率换算" : "当前持仓总市值"} accent="text-brand" />
        <Card label={`持仓成本 (${dc})`} value={displayMoney(data.holding_cost_cny)} icon="chart"
          subtitle="成本价 × 持仓数量" />
        <Card label="净已实现盈亏" value={displayMoney(data.total_realized_pnl_cny)}
          accent={toUserCurrency(data.total_realized_pnl_cny) >= 0 ? "text-up" : "text-down"} icon="target"
          subtitle="卖出盈利与亏损的净额" />
        <Card label="未实现浮盈" value={displayMoney(data.unrealized_pnl_cny)}
          accent={toUserCurrency(data.unrealized_pnl_cny) >= 0 ? "text-up" : "text-down"} icon="save"
          subtitle="持仓市值 - 持仓成本" />
        <Card label="总盈亏" value={displayMoney(data.total_pnl_cny)}
          accent={toUserCurrency(data.total_pnl_cny) >= 0 ? "text-up" : "text-down"} icon="chart"
          subtitle="已实现 + 未实现" />
      </div>

      {/* 第二行指标 */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card label="零成本资产" value={`${data.zero_cost_count} / ${totalAssets}`} accent="text-yellow-400" icon="target" />
        <Card label="心理安全分" value={`${data.safety_score}`} accent="text-brand" icon="score" />
        <Card label={`避风港余额 (${dc})`} value={displayMoney(data.harbor.balance)} accent="text-info" icon="shield" />
        <Card label={`累计入港 (${dc})`} value={displayMoney(data.harbor.total_in)} accent="text-info" icon="save" />
      </div>

      {/* 多币种市值分项 */}
      {hasMultiCurrency && marketSummaries.length > 1 && (
        <div className="flex flex-wrap gap-3">
          {marketSummaries.map(ms => (
            <div key={ms.market} className="flex items-center gap-2 rounded-lg border border-themed bg-surface px-3 py-2">
              <span className="text-sm">{ms.flag}</span>
              <div>
                <p className="text-[10px] text-muted">{ms.label} <span className="text-muted/60">{ms.currency}</span></p>
                <p className="text-sm font-bold text-primary tabular-nums">{ms.sym}{fmt(ms.value)}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-bg)] px-3 py-2">
            <span className="text-sm">Σ</span>
            <div>
              <p className="text-[10px] text-muted">合计 <span className="text-muted/60">{dc}</span></p>
              <p className="text-sm font-bold text-accent tabular-nums">{displayMoney(data.mental_net_worth)}</p>
            </div>
          </div>
        </div>
      )}

      {/* 汇率信息条 */}
      {hasMultiCurrency && data.exchange_rates && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-themed bg-surface-alt px-3 py-2 text-xs text-muted">
          <span className="font-medium text-secondary">实时汇率</span>
          {Object.entries(data.exchange_rates)
            .filter(([cur]) => cur !== "CNY" && usedCurrencies.has(cur))
            .map(([cur, rate]) => (
              <span key={cur} className="rounded bg-surface px-2 py-0.5">
                1 {cur} = ¥{rate.toFixed(4)}
              </span>
            ))}
        </div>
      )}

      {/* 数据总览：配置饼图 + 仓位分布 + 现金摘要 */}
      <DashCharts data={data} cashAccounts={cashAccounts} totalCash={totalCash} displayCurrency={displayCurrency} />

      {/* 动态博弈区 */}
      <AssetSection title="动态博弈区" titleColor="text-brand" assets={data.active_assets}
        emptyText="暂无博弈区资产" borderColor="border-l-emerald-500" exchangeRates={data.exchange_rates} />

      {/* 静态防御区 */}
      <AssetSection title="静态防御区" titleColor="text-blue-400" assets={data.base_assets}
        emptyText="暂无防御区资产" borderColor="border-l-blue-500" exchangeRates={data.exchange_rates} />

      {/* 能力投资区 */}
      <InvestSection assets={data.invest_assets} />
    </div>
  );
}

const MARKET_LABEL: Record<string, string> = { us: "美股", cn: "A股", hk: "港股", crypto: "加密", other: "其他" };
const MARKET_FLAG: Record<string, string> = { us: "🇺🇸", cn: "🇨🇳", hk: "🇭🇰", crypto: "₿", other: "" };

function AssetSection({ title, titleColor, assets, emptyText, borderColor, exchangeRates }: {
  title: string; titleColor: string; assets: AssetSummary[]; emptyText: string; borderColor: string; exchangeRates?: Record<string, number>;
}) {
  const router = useRouter();

  if (assets.length === 0) {
    return (
      <section>
        <h2 className={`mb-3 text-base font-semibold sm:text-lg ${titleColor}`}>{title}</h2>
        <p className="text-sm text-muted">{emptyText}，去<Link href="/assets" className="text-accent hover:underline mx-1">资产管理</Link>添加</p>
      </section>
    );
  }

  const rates = exchangeRates || {};

  // 按市场分组
  const marketOrder = ["cn", "us", "hk", "crypto", "other"];
  const byMarket: Record<string, AssetSummary[]> = {};
  for (const a of assets) {
    const m = a.market || "other";
    (byMarket[m] ??= []).push(a);
  }
  const usedMarkets = marketOrder.filter(m => byMarket[m]?.length);
  const isMultiMarket = usedMarkets.length > 1;
  const mobileAssets = assets.slice(0, 12);
  const mobileByMarket: Record<string, AssetSummary[]> = {};
  for (const asset of mobileAssets) {
    const market = asset.market || "other";
    (mobileByMarket[market] ??= []).push(asset);
  }
  const mobileUsedMarkets = marketOrder.filter((market) => mobileByMarket[market]?.length);

  // 合计 (CNY)
  const totalValueCNY = assets.reduce((s, a) => s + convertToCNY(a.current_price * a.quantity, a.market, rates), 0);
  const totalPnlCNY = assets.reduce((s, a) => s + convertToCNY(a.mental_pnl, a.market, rates), 0);

  return (
    <section>
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className={`text-base font-semibold sm:text-lg ${titleColor}`}>{title}</h2>
        {/* 按市场分组的小计 */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted items-center">
          {usedMarkets.map(m => {
            const group = byMarket[m];
            const sym = marketSymbol(m);
            const mv = group.reduce((s, a) => s + a.current_price * a.quantity, 0);
            const pnl = group.reduce((s, a) => s + a.mental_pnl, 0);
            return (
              <span key={m} className="flex items-center gap-1">
                <span className="text-[10px]">{MARKET_FLAG[m]}</span>
                <strong className="text-primary">{sym}{fmt(mv)}</strong>
                <span className={`text-[10px] ${pnl >= 0 ? "text-up" : "text-down"}`}>
                  {pnl >= 0 ? "+" : ""}{sym}{fmt(Math.abs(pnl))}
                </span>
              </span>
            );
          })}
          {isMultiMarket && (
            <span className="border-l border-themed pl-3 ml-1">
              合计 <strong className="text-primary">¥{fmt(totalValueCNY)}</strong>
              {" "}
              <span className={`${totalPnlCNY >= 0 ? "text-up" : "text-down"}`}>
                {totalPnlCNY >= 0 ? "+" : ""}¥{fmt(Math.abs(totalPnlCNY))}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* 桌面端：按市场分组表格 */}
      <div className="hidden sm:block space-y-3">
        {usedMarkets.map(m => {
          const group = byMarket[m];
          const sym = marketSymbol(m);
          const groupValue = group.reduce((s, a) => s + a.current_price * a.quantity, 0);
          const groupPnl = group.reduce((s, a) => s + a.mental_pnl, 0);
          return (
            <div key={m} className="overflow-x-auto rounded-xl border border-themed bg-surface-alt">
              {/* 市场分组头 */}
              {isMultiMarket && (
                <div className="flex items-center justify-between px-4 py-2 border-b border-themed bg-surface/50">
                  <span className="text-xs font-medium text-secondary flex items-center gap-1.5">
                    <span>{MARKET_FLAG[m]}</span> {MARKET_LABEL[m]}
                    <span className="text-[10px] text-muted font-normal">({group.length})</span>
                  </span>
                  <span className="text-xs text-muted">
                    市值 <strong className="text-primary">{sym}{fmt(groupValue)}</strong>
                    {" · "}
                    盈亏{" "}
                    <strong className={groupPnl >= 0 ? "text-up" : "text-down"}>
                      {groupPnl >= 0 ? "+" : ""}{sym}{fmt(Math.abs(groupPnl))}
                    </strong>
                  </span>
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-themed text-xs text-muted">
                    <th className="py-2.5 text-left pl-4 font-medium">代码</th>
                    <th className="text-left font-medium">名称</th>
                    <th className="text-right font-medium">现价</th>
                    <th className="text-right font-medium">心理成本</th>
                    <th className="text-right font-medium">持仓</th>
                    <th className="text-right font-medium">博弈盈亏</th>
                    <th className="text-right pr-4 font-medium">零成本进度</th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((a) => {
                    const hasPrice = a.current_price > 0;
                    const pnlColor = hasPrice ? (a.mental_pnl >= 0 ? "text-up" : "text-down") : "text-muted";
                    const progress = Math.round(a.zero_cost_progress * 100);
                    return (
                      <tr key={a.id} onClick={() => router.push(`/assets/${a.id}`)}
                        className="border-b border-themed last:border-b-0 hover:bg-surface-hover cursor-pointer transition">
                        <td className="py-3 pl-4 font-mono font-bold">{a.symbol}</td>
                        <td className="text-secondary">{a.name}</td>
                        <td className="text-right">
                          {hasPrice ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span>{sym}{fmt(a.current_price)}</span>
                              {a.price_session && a.price_session !== "regular" && (
                                <span className={`text-[9px] ${SESSION_COLOR[a.price_session] || "text-zinc-400"}`}>{SESSION_LABEL[a.price_session] || a.price_session}</span>
                              )}
                            </div>
                          ) : <span className="text-yellow-400 text-xs">未设置</span>}
                        </td>
                        <td className="text-right">{sym}{fmt(a.mental_cost)}</td>
                        <td className="text-right">{fmt(a.quantity)}</td>
                        <td className={`text-right font-semibold ${pnlColor}`}>
                          {hasPrice ? `${a.mental_pnl >= 0 ? "+" : ""}${sym}${fmt(Math.abs(a.mental_pnl))}` : "--"}
                        </td>
                        <td className="text-right pr-4">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-progress">
                              <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${progress}%` }} />
                            </div>
                            <span className="text-xs text-muted w-8 text-right">{progress}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* 移动端：卡片列表 */}
      <div className="sm:hidden space-y-2">
        {mobileUsedMarkets.map(m => {
          const group = mobileByMarket[m];
          const sym = marketSymbol(m);
          return (
            <div key={m}>
              {isMultiMarket && (
                <div className="flex items-center gap-1.5 text-xs text-secondary mb-1.5 mt-2 first:mt-0">
                  <span>{MARKET_FLAG[m]}</span>
                  <span className="font-medium">{MARKET_LABEL[m]}</span>
                </div>
              )}
              {group.map((a) => {
                const hasPrice = a.current_price > 0;
                const pnlColor = hasPrice ? (a.mental_pnl >= 0 ? "text-up" : "text-down") : "text-muted";
                const progress = Math.round(a.zero_cost_progress * 100);
                return (
                  <Link key={a.id} href={`/assets/${a.id}`}
                    className={`block rounded-xl border border-themed border-l-4 ${borderColor} bg-surface-alt p-3 transition active:bg-surface-hover mb-2`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-sm">{a.symbol}</span>
                        <span className="ml-2 text-xs text-muted">{a.name}</span>
                      </div>
                      <span className={`text-sm font-semibold ${pnlColor}`}>
                        {hasPrice ? `${a.mental_pnl >= 0 ? "+" : ""}${sym}${fmt(Math.abs(a.mental_pnl))}` : "--"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-secondary">
                      <span>现价 {hasPrice ? (
                        <span>
                          {sym}{fmt(a.current_price)}
                          {a.price_session && a.price_session !== "regular" && (
                            <span className={`ml-1 text-[10px] ${SESSION_COLOR[a.price_session] || "text-zinc-400"}`}>
                              {SESSION_LABEL[a.price_session]}
                            </span>
                          )}
                        </span>
                      ) : <span className="text-yellow-400">未设置</span>}</span>
                      <span>成本 {sym}{fmt(a.mental_cost)}</span>
                      <span>持仓 {fmt(a.quantity)}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-progress">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-[10px] text-muted">{progress}%</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })}
        {assets.length > mobileAssets.length && (
          <Link href="/assets" className="ui-button mt-3 w-full">查看全部 {assets.length} 项资产</Link>
        )}
      </div>
    </section>
  );
}

const INVEST_CAT_MAP: Record<string, string> = {
  course: "课程", tool: "工具", traffic: "流量", other_invest: "其他",
};

function InvestSection({ assets }: { assets: InvestSummary[] }) {
  if (assets.length === 0) {
    return (
      <section>
        <h2 className="mb-3 text-base font-semibold sm:text-lg text-purple-400">能力投资区</h2>
        <p className="text-sm text-muted">暂无能力投资，去<Link href="/assets" className="text-purple-400 hover:underline mx-1">资产管理</Link>添加（如课程、工具、流量等）</p>
      </section>
    );
  }

  const totalInvested = assets.reduce((s, a) => s + a.total_invested, 0);
  const totalCashed = assets.reduce((s, a) => s + a.total_cashed, 0);
  const overallRate = totalInvested > 0 ? Math.round((totalCashed / totalInvested) * 100) : 0;

  return (
    <section>
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold sm:text-lg text-purple-400">能力投资区</h2>
        <div className="flex gap-4 text-xs text-muted">
          <span>总投入 <strong className="text-primary">{fmt(totalInvested)}</strong></span>
          <span>已归因回本 <strong className="text-purple-400">{fmt(totalCashed)}</strong></span>
          <span>回本率 <strong className={overallRate >= 100 ? "text-ok" : "text-warn"}>{overallRate}%</strong></span>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((a) => {
          const progress = Math.round(a.return_rate * 100);
          const sym = marketSymbol(a.market);
          return (
            <Link key={a.id} href={`/assets/${a.id}`}
              className="block rounded-xl border border-themed border-l-4 border-l-purple-500 bg-surface-alt p-3 transition hover:border-purple-600 hover:bg-surface-hover">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-sm">{a.symbol}</span>
                  <span className="ml-2 text-xs text-muted">{a.name}</span>
                </div>
                <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300">
                  {INVEST_CAT_MAP[a.category] || a.category}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-secondary">
                <span>投入 <strong className="text-primary">{sym}{fmt(a.total_invested)}</strong></span>
                <span>回本 <strong className="text-purple-400">{sym}{fmt(a.total_cashed)}</strong></span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-progress">
                  <div className="h-full rounded-full bg-purple-500" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] text-muted">{progress}%</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Card({ label, value, accent = "text-primary", icon, subtitle }: { label: string; value: string; accent?: string; icon: string; subtitle?: string }) {
  const iconMap: Record<string, string> = {
    chart: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
    shield: "M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286z",
    target: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    score: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
    save: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  };
  return (
    <div className="card-glow rounded-xl border border-themed bg-surface p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 text-muted hidden sm:block" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={iconMap[icon] || ""} />
        </svg>
        <p className="text-[11px] text-muted sm:text-xs">{label}</p>
      </div>
      <p className={`mt-1.5 text-lg font-bold sm:text-xl ${accent}`}>{value}</p>
      {subtitle && <p className="mt-0.5 text-[10px] text-muted">{subtitle}</p>}
    </div>
  );
}
