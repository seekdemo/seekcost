"use client";

import Link from "next/link";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { marketSymbol, convertToCNY, convertFromCNY, currencySymbol } from "@/lib/currency";
import { semanticColor } from "@/lib/semanticColor";
import type { Dashboard, CashAccount } from "@/lib/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (part / total) * 100));
}

const ZONE_COLORS: Record<string, string> = {
  active: "#6366f1", base: "#3b82f6", invest: "#a855f7", cash: "#facc15", harbor: "#38bdf8",
};

type DisplayCurrency = "CNY" | "HKD" | "USD";

export default function DashCharts({ data, cashAccounts, totalCash, displayCurrency }: {
  data: Dashboard; cashAccounts: CashAccount[]; totalCash: number; displayCurrency: DisplayCurrency;
}) {
  // --- 区域配置饼图（统一换算为 CNY）---
  const rates = data.exchange_rates || {};
  const activeValue = data.active_assets.reduce((s, a) => s + (a.current_price > 0 ? convertToCNY(a.current_price * a.quantity, a.market, rates) : 0), 0);
  const baseValue = data.base_assets.reduce((s, a) => s + (a.current_price > 0 ? convertToCNY(a.current_price * a.quantity, a.market, rates) : 0), 0);
  const investValue = data.invest_assets.reduce((s, a) => s + convertToCNY(a.total_invested, a.market, rates), 0);

  const pieData = [
    { name: "动态博弈区", value: activeValue, color: ZONE_COLORS.active },
    { name: "静态防御区", value: baseValue, color: ZONE_COLORS.base },
    { name: "能力投资区", value: investValue, color: ZONE_COLORS.invest },
    { name: "现金", value: totalCash, color: ZONE_COLORS.cash },
    { name: "避风港", value: data.harbor.balance, color: ZONE_COLORS.harbor },
  ].filter(d => d.value > 0);

  const totalPortfolio = pieData.reduce((s, d) => s + d.value, 0);

  // --- 仓位分布条形图 (Top 8, 统一换算为 CNY) ---
  const allTradable = [...data.active_assets, ...data.base_assets]
    .filter(a => a.current_price > 0 && a.quantity > 0)
    .map(a => ({
      symbol: a.symbol,
      value: convertToCNY(a.current_price * a.quantity, a.market, rates),
      originalValue: a.current_price * a.quantity,
      pnl: convertToCNY(a.mental_pnl, a.market, rates),
      originalPnl: a.mental_pnl,
      market: a.market,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // --- 现金账户 ---
  const activeCash = cashAccounts.filter(a => a.is_active);
  const ibkrDeposits = data.ibkr_deposits_cny ?? 0;
  const ibkrWithdrawals = data.ibkr_withdrawals_cny ?? 0;
  const ibkrNetDeposit = data.ibkr_net_deposit_cny ?? ibkrDeposits - ibkrWithdrawals;

  const hasPieData = pieData.length > 0;
  const hasBarData = allTradable.length > 0;
  const hasCash = activeCash.length > 0 || data.harbor.balance > 0 || ibkrDeposits > 0 || ibkrWithdrawals > 0;

  if (!hasPieData && !hasBarData && !hasCash) return null;

  return (
    <section className="grid gap-4 grid-cols-1 lg:grid-cols-3">
      {/* 饼图 — 资产配置 */}
      {hasPieData && (
        <div className="rounded-xl border border-themed bg-surface p-4">
          <h3 className="text-sm font-semibold text-primary mb-3">资产配置 <span className="text-muted font-normal text-[10px]">({displayCurrency})</span></h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={72}
                  dataKey="value" stroke="none" paddingAngle={2}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    const pct = totalPortfolio > 0 ? (d.value / totalPortfolio * 100).toFixed(1) : "0";
                    return (
                      <div className="rounded-lg border border-themed bg-surface px-3 py-2 text-xs shadow-lg">
                        <p className="font-semibold text-primary">{d.name}</p>
                        <p className="text-secondary">{formatDisplayMoney(d.value, displayCurrency, rates)} ({pct}%)</p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* 图例 */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-[11px] text-secondary">
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                {d.name} {totalPortfolio > 0 ? `${(d.value / totalPortfolio * 100).toFixed(0)}%` : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 条形图 — 仓位分布 */}
      {hasBarData && (
        <div className="rounded-xl border border-themed bg-surface p-4">
          <h3 className="text-sm font-semibold text-primary mb-3">持仓分布 <span className="text-muted font-normal">TOP {allTradable.length}</span> <span className="text-muted font-normal text-[10px]">({displayCurrency})</span></h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={allTradable} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  tickFormatter={v => `${(convertFromCNY(Number(v), displayCurrency, rates) / 1000).toFixed(0)}k`}
                />
                <YAxis type="category" dataKey="symbol" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} width={48} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    const isForex = d.market === "us" || d.market === "hk" || d.market === "crypto";
                    return (
                      <div className="rounded-lg border border-themed bg-surface px-3 py-2 text-xs shadow-lg">
                        <p className="font-semibold text-primary">{d.symbol}</p>
                        <p className="text-secondary">
                          {"市值"} {isForex ? `${marketSymbol(d.market)}${fmt(d.originalValue)} ≈ ` : ""}{formatDisplayMoney(d.value, displayCurrency, rates)}
                        </p>
                        <p className={d.pnl >= 0 ? "text-up" : "text-down"}>
                          {"盈亏"} {d.pnl >= 0 ? "+" : "-"}{formatDisplayMoney(Math.abs(d.pnl), displayCurrency, rates)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {allTradable.map((d, i) => (
                    <Cell key={i} fill={d.pnl >= 0 ? semanticColor("--up", "#e5484d") : semanticColor("--down", "#0f9d58")} fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 现金 & 避风港摘要 */}
      {hasCash && (
        <div className="rounded-xl border border-themed bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-primary">资金概览</h3>
            <Link href="/assets" className="text-[10px] text-accent hover:underline">查看投资目录 &rarr;</Link>
          </div>

          <CashInvestmentFlow
            totalCash={totalCash}
            deposits={ibkrDeposits}
            withdrawals={ibkrWithdrawals}
            netDeposit={ibkrNetDeposit}
            displayCurrency={displayCurrency}
            rates={rates}
          />

          {/* 避风港 */}
          <div className="rounded-lg bg-[var(--info-bg)] border border-[color-mix(in_srgb,var(--info)_25%,transparent)] p-3 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-info font-semibold inline-flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>
                避风港
              </span>
              <span className="text-sm font-bold text-info">{formatDisplayMoney(data.harbor.balance, displayCurrency, rates)}</span>
            </div>
            <div className="flex gap-4 mt-1.5 text-[10px] text-muted">
              <span>累计入港 {formatDisplayMoney(data.harbor.total_in, displayCurrency, rates)}</span>
              <span>累计出港 {formatDisplayMoney(data.harbor.total_out, displayCurrency, rates)}</span>
            </div>
          </div>

          {/* 现金账户列表 */}
          {activeCash.length > 0 ? (
            <div className="space-y-2">
              {activeCash.map(acc => (
                <div key={acc.id} className="flex items-center justify-between rounded-lg bg-surface-alt px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-primary truncate">{acc.name}</span>
                    <span className="text-[10px] text-muted">{acc.currency}</span>
                  </div>
                  <span className="text-xs font-semibold text-primary tabular-nums">
                    {formatAccountMoney(acc, displayCurrency, rates)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-themed">
                <span className="text-xs text-muted">现金总额 <span className="text-muted/60">{displayCurrency}</span></span>
                <span className="text-sm font-bold text-yellow-400">{formatDisplayMoney(totalCash, displayCurrency, rates)}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-xs text-muted">还没有现金账户</p>
              <Link href="/assets?create=1" className="text-xs text-accent hover:underline">添加投资</Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CashInvestmentFlow({
  totalCash,
  deposits,
  withdrawals,
  netDeposit,
  displayCurrency,
  rates,
}: {
  totalCash: number;
  deposits: number;
  withdrawals: number;
  netDeposit: number;
  displayCurrency: DisplayCurrency;
  rates: Record<string, number>;
}) {
  const flowBase = Math.max(deposits, withdrawals, Math.abs(netDeposit), 1);
  const depositsPct = pct(deposits, flowBase);
  const withdrawalsPct = pct(withdrawals, flowBase);

  return (
    <div className="mb-3 rounded-lg border border-[color-mix(in_srgb,var(--info)_25%,transparent)] bg-[var(--info-bg)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-info">IBKR Cash Flow</p>
          <p className="mt-1 text-xs text-muted">累计转入 IBKR</p>
          <p className="mt-0.5 text-[10px] text-muted/70">来自活动报表“存款和取款”</p>
        </div>
        <p className="text-right text-base font-black text-primary tabular-nums">{formatDisplayMoney(deposits, displayCurrency, rates)}</p>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
        <span className="block h-full rounded-full bg-info" style={{ width: `${depositsPct}%` }} />
      </div>
      {withdrawals > 0 && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.045]">
          <span className="block h-full rounded-full bg-amber-300/65" style={{ width: `${withdrawalsPct}%` }} />
        </div>
      )}
      <div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div className="flex items-center justify-between rounded-md bg-white/[0.035] px-2 py-1.5">
          <span className="flex items-center gap-1.5 text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-info" />累计入金</span>
          <span className="font-semibold text-primary tabular-nums">{formatDisplayMoney(deposits, displayCurrency, rates)}</span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-white/[0.035] px-2 py-1.5">
          <span className="flex items-center gap-1.5 text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />累计出金</span>
          <span className="font-semibold text-primary tabular-nums">{formatDisplayMoney(withdrawals, displayCurrency, rates)}</span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-white/[0.035] px-2 py-1.5">
          <span className="flex items-center gap-1.5 text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-info" />净转入</span>
          <span className="font-semibold text-primary tabular-nums">{formatDisplayMoney(netDeposit, displayCurrency, rates)}</span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-white/[0.035] px-2 py-1.5">
          <span className="flex items-center gap-1.5 text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />现金账户</span>
          <span className="font-semibold text-primary tabular-nums">{formatDisplayMoney(totalCash, displayCurrency, rates)}</span>
        </div>
      </div>
    </div>
  );
}

function formatDisplayMoney(amountCny: number, currency: DisplayCurrency, rates: Record<string, number>) {
  return `${currencySymbol(currency)}${fmt(convertFromCNY(amountCny, currency, rates))}`;
}

function formatAccountMoney(account: CashAccount, currency: DisplayCurrency, rates: Record<string, number>) {
  if (account.currency === currency) {
    return `${currencySymbol(account.currency)}${fmt(account.balance)}`;
  }
  const amountCny = account.balance * (rates[account.currency] ?? 1);
  return `${currencySymbol(currency)}${fmt(convertFromCNY(amountCny, currency, rates))}`;
}
