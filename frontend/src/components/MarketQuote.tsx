"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "./I18nProvider";

export interface IntradayQuote {
  status: "available" | "unavailable";
  price: number | null;
  previous_close: number | null;
  change_pct: number | null;
  points: { timestamp: number; price: number; volume?: number | null }[];
  as_of: number | null;
  source: string;
  currency?: string;
  session_date?: string;
}

const pending = new Map<string, Promise<IntradayQuote>>();
export const MarketQuoteUpdates = createContext<((symbol: string, market: string, quote: IntradayQuote) => void) | null>(null);
export function loadMarketQuote(symbol: string, market: string) {
  const key = `${market}:${symbol}`;
  if (!pending.has(key)) {
    pending.set(key, api.intradayQuote(symbol, market).finally(() => pending.delete(key)));
  }
  return pending.get(key)!;
}

export function MarketQuoteHeading({ sort = "default", onToggleSort }: { sort?: "default" | "change_desc" | "change_asc"; onToggleSort?: () => void }) {
  const { localeTag } = useI18n();
  const zh = localeTag.startsWith("zh");
  const label = zh ? "涨跌幅" : "Change %";
  const next = sort === "default" ? (zh ? "涨幅优先" : "Gainers first") : sort === "change_desc" ? (zh ? "跌幅优先" : "Losers first") : (zh ? "默认排序" : "Default order");
  return <span className="market-quote-grid market-quote-heading"><span>{zh ? "分时" : "Intraday"}</span><span>{zh ? "最新价" : "Last"}</span>{onToggleSort ? <button type="button" data-testid="quote-sort-heading" onClick={onToggleSort} aria-label={`${label}: ${next}`} title={next} className={`min-h-10 whitespace-nowrap text-right ${sort === "default" ? "text-muted hover:text-primary" : "text-accent"}`}>{label} <span aria-hidden="true">{sort === "default" ? "↕" : sort === "change_desc" ? "↓" : "↑"}</span></button> : <span>{label}</span>}</span>;
}

export default function MarketQuote({ symbol, market, fallbackPrice = 0 }: { symbol: string; market: string; fallbackPrice?: number }) {
  const { localeTag } = useI18n();
  const zh = localeTag.startsWith("zh");
  const root = useRef<HTMLSpanElement>(null);
  const onQuote = useContext(MarketQuoteUpdates);
  const gradient = useId().replace(/:/g, "");
  const [state, setState] = useState<{ key: string; quote?: IntradayQuote; failed?: boolean }>({ key: "" });
  const key = `${market}:${symbol}`;
  const quote = state.key === key ? state.quote : undefined;
  const failed = state.key === key && state.failed;

  useEffect(() => {
    let alive = true;
    let visible = false;
    let busy = false;
    const refresh = async () => {
      if (!visible || document.hidden || busy) return;
      busy = true;
      try {
        const result = await loadMarketQuote(symbol, market);
        if (alive) {
          setState({ key, quote: result });
          if (result.status === "available") onQuote?.(symbol, market, result);
        }
      } catch {
        if (alive) setState({ key, failed: true });
      } finally { busy = false; }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) void refresh();
    });
    if (root.current) observer.observe(root.current);
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { alive = false; observer.disconnect(); clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [symbol, market, key, onQuote]);

  const available = quote?.status === "available";
  const pct = available && Number.isFinite(quote.change_pct) ? quote.change_pct : null;
  const direction = pct === null || pct === 0 ? "flat" : pct > 0 ? "up" : "down";
  const price = available ? quote.price : fallbackPrice > 0 ? fallbackPrice : null;
  const points = quote?.points ?? [];
  const baseline = quote?.previous_close;
  const values = points.map(p => p.price).concat(baseline && baseline > 0 ? [baseline] : []);
  const low = Math.min(...values), high = Math.max(...values);
  const spread = high - low || high * 0.002 || 1;
  const y = (value: number) => 47 - (value - low) / spread * 40;
  const firstTime = points[0]?.timestamp ?? 0;
  const timeSpan = (points.at(-1)?.timestamp ?? 0) - firstTime || 1;
  const x = (timestamp: number) => 2 + (timestamp - firstTime) / timeSpan * 92;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.timestamp).toFixed(2)},${y(p.price).toFixed(2)}`).join(" ");
  const status = !quote && !failed ? (zh ? "加载分时…" : "Loading…") : (zh ? "分时暂不可用" : "Unavailable");
  const timestamp = available && quote.as_of ? new Date(quote.as_of * 1000).toLocaleString(localeTag, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const description = available
    ? `${quote.source} · ${quote.currency} · ${zh ? "常规时段 · 5分钟采样 · 非实时" : "Regular session · 5m · Not real-time"} · ${timestamp}`
    : `${status}${fallbackPrice > 0 ? (zh ? " · 显示已存价格" : " · Saved price") : ""}`;

  return <span ref={root} className="market-quote" data-testid="market-quote" data-direction={direction} title={description}>
    <span className="market-quote-grid">
      {points.length >= 2 ? <svg viewBox="0 0 98 54" className="market-sparkline" role="img" aria-label={`${symbol} ${zh ? "分时走势" : "intraday trend"}`}>
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop stopColor="currentColor" stopOpacity=".18"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
        {baseline != null && <line data-testid="previous-close" x1="0" x2="98" y1={y(baseline)} y2={y(baseline)} stroke="var(--text-muted)" strokeOpacity=".45" strokeDasharray="4 3"/>}
        <path d={`${path} L94,54 L2,54 Z`} fill={`url(#${gradient})`}/>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/>
      </svg> : <span className="market-sparkline-empty">{available ? (zh ? "分时数据不足" : "Insufficient data") : status}</span>}
      <span className="market-quote-number">{price != null ? price.toLocaleString(localeTag, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : "—"}</span>
      <span className="market-quote-number">{pct != null ? `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}</span>
    </span>
    <span className="market-quote-meta">{available ? `${quote.currency} · ${timestamp} · ${zh ? "非实时" : "Delayed"}` : fallbackPrice > 0 ? (zh ? "已存价格 · 涨跌未知" : "Saved price · Change unavailable") : status}</span>
  </span>;
}
