"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { loadMarketQuote, type IntradayQuote } from "@/components/MarketQuote";
import { nearestIntradayIndex, normalizeIntradayPoints } from "./intradaySeries";

const TIMEZONES: Record<string, string> = {
  us: "America/New_York", hk: "Asia/Hong_Kong", cn: "Asia/Shanghai",
  cn_index: "Asia/Shanghai", tw: "Asia/Taipei", jp: "Asia/Tokyo", uk: "Europe/London",
};

export default function IntradayChart({ symbol, market }: { symbol: string; market: string }) {
  const { localeTag } = useI18n();
  const zh = localeTag.startsWith("zh");
  const text = (cn: string, en: string) => zh ? cn : en;
  const [quote, setQuote] = useState<IntradayQuote | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const [width, setWidth] = useState(640);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let alive = true;
    let busy = false;
    const refresh = async () => {
      if (busy || document.hidden) return;
      busy = true;
      setRefreshing(true);
      try {
        const result = await loadMarketQuote(symbol, market);
        if (alive) { setQuote(result); setFailed(false); setSelected(null); }
      } catch {
        if (alive) setFailed(true);
      } finally {
        busy = false;
        if (alive) setRefreshing(false);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [symbol, market, retry]);

  const points = quote?.status === "available"
    ? normalizeIntradayPoints(quote.points)
    : [];
  const available = points.length >= 2;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [available]);

  const timeZone = TIMEZONES[market] || "UTC";
  const time = (timestamp: number) => new Date(timestamp * 1000).toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
  const price = (value: number) => value.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  const index = Math.min(Math.max(selected ?? points.length - 1, 0), points.length - 1);
  const active = points[index];
  const baseline = quote?.previous_close != null && Number.isFinite(quote.previous_close) && quote.previous_close > 0 ? quote.previous_close : null;
  const plotLeft = 8;
  const plotRight = Math.max(width - 68, 100);
  const plotTop = 16;
  const plotBottom = 258;
  const values = points.map(p => p.price).concat(baseline == null ? [] : [baseline]);
  const low = available ? Math.min(...values) : 0;
  const high = available ? Math.max(...values) : 1;
  const padding = Math.max((high - low) * .12, high * .001, .001);
  const range = high - low + padding * 2;
  const first = points[0]?.timestamp ?? 0;
  const last = points.at(-1)?.timestamp ?? 1;
  const x = (stamp: number) => plotLeft + (stamp - first) / Math.max(last - first, 1) * (plotRight - plotLeft);
  const y = (value: number) => plotTop + (high + padding - value) / range * (plotBottom - plotTop);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.timestamp)},${y(p.price)}`).join(" ");
  const selectAt = (clientX: number) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const stamp = first + Math.min(1, Math.max(0, ((clientX - bounds.left) / bounds.width * width - plotLeft) / (plotRight - plotLeft))) * (last - first);
    setSelected(nearestIntradayIndex(points, stamp));
  };
  const direction = baseline && active ? active.price >= baseline ? "var(--up)" : "var(--down)" : "var(--accent)";

  return <div className="mt-4 min-w-0" data-testid="dossier-intraday">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 text-xs text-secondary">
        <p>{market === "crypto" ? text("24 小时市场 · 5 分钟采样 · 非实时", "24-hour market · 5-minute samples · Not real-time") : text("常规交易时段 · 5 分钟采样 · 非实时", "Regular session · 5-minute samples · Not real-time")}</p>
        {quote?.status === "available" && <p className="mt-1 text-muted">{quote.source} · {quote.currency} · {quote.session_date}{quote.as_of ? ` · ${text("更新于", "Updated")} ${time(quote.as_of)}` : ""} · {timeZone}</p>}
      </div>
      <button type="button" className="ui-button min-h-11" disabled={refreshing} onClick={() => setRetry(value => value + 1)}>{refreshing ? text("加载中…", "Loading…") : text("刷新分时", "Refresh")}</button>
    </div>
    {failed && available && <p role="alert" className="mb-3 text-sm text-warn">{text("刷新失败，正在显示上一次数据，请核对更新时间。", "Refresh failed. Showing the previous data; check its timestamp.")}</p>}
    {available && active ? <>
      <div className="mb-3 flex min-h-11 flex-wrap items-baseline gap-x-4 gap-y-1 tabular-nums">
        <span className="text-sm text-secondary">{time(active.timestamp)}</span>
        <strong className="text-2xl font-semibold text-primary">{price(active.price)}</strong>
        {baseline != null && <><span className="text-sm" style={{ color: direction }}>{active.price >= baseline ? "+" : ""}{((active.price / baseline - 1) * 100).toFixed(2)}%</span><span className="text-xs text-muted">{text("昨收", "Previous close")} {price(baseline)}</span></>}
      </div>
      <div className="min-w-0 rounded-md border border-themed bg-input p-3">
        <svg ref={svgRef} width="100%" height="300" viewBox={`0 0 ${width} 300`} role="img" aria-label={`${symbol} ${text("分时价格图，使用左右方向键查看价格", "intraday prices; use Left and Right arrows to inspect")}`} tabIndex={0}
          className="block w-full outline-offset-2" style={{ touchAction: "pan-y" }}
          onPointerMove={event => selectAt(event.clientX)} onPointerDown={event => selectAt(event.clientX)} onPointerLeave={() => setSelected(null)}
          onKeyDown={event => {
            const next = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : null;
            if (next != null) { event.preventDefault(); setSelected(Math.min(points.length - 1, Math.max(0, next))); }
          }}>
          <title>{symbol} {text("分时走势", "intraday prices")}</title>
          {[0, 1, 2, 3].map(i => {
            const value = high + padding - range * i / 3;
            const height = y(value);
            return <g key={i}><line x1={plotLeft} x2={plotRight} y1={height} y2={height} stroke="var(--border)" /><text x={plotRight + 8} y={height + 4} fill="var(--text-secondary)" fontSize="11">{price(value)}</text></g>;
          })}
          {baseline != null && <line data-testid="intraday-previous-close" x1={plotLeft} x2={plotRight} y1={y(baseline)} y2={y(baseline)} stroke="var(--text-muted)" strokeDasharray="4 4" />}
          <path d={path} fill="none" stroke={direction} strokeWidth="1.8" strokeLinejoin="round" />
          <line x1={x(active.timestamp)} x2={x(active.timestamp)} y1={plotTop} y2={plotBottom} stroke="var(--text-muted)" strokeDasharray="3 4" />
          <circle cx={x(active.timestamp)} cy={y(active.price)} r="3" fill={direction} />
          {[0, .5, 1].map(ratio => <text key={ratio} x={plotLeft + ratio * (plotRight - plotLeft)} y="285" textAnchor={ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"} fill="var(--text-secondary)" fontSize="11">{time(first + (last - first) * ratio)}</text>)}
        </svg>
      </div>
    </> : <div role={failed ? "alert" : "status"} className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-md bg-input px-4 text-center text-sm text-secondary">
      <p>{refreshing ? text("正在加载分时数据…", "Loading intraday data…") : failed || quote?.status === "unavailable" ? text("分时数据暂不可用，请稍后重试。", "Intraday data unavailable. Please retry later.") : text("分时数据不足，暂时无法绘图。", "Not enough intraday points to draw a chart.")}</p>
      {!refreshing && <p className="text-xs text-muted">{text("仍可切换到日 K 查看历史走势。", "Daily candles remain available in the other view.")}</p>}
    </div>}
  </div>;
}
