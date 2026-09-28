"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { useI18n } from "@/components/I18nProvider";
import { semanticColor } from "@/lib/semanticColor";
import type { DailyBar, MovingAveragePoint } from "@/lib/types";

import { MOVING_AVERAGES, type MovingAveragePeriod } from "./MovingAverageLegend";

const HEIGHT = 360;
const PRICE_TOP = 8;
const PRICE_HEIGHT = 250;
const VOLUME_TOP = 280;
const VOLUME_HEIGHT = 68;

function dateKey(value: number | string) {
  return String(value);
}

export default function KLineChart({
  bars,
  movingAverages,
  enabledPeriods,
  activeIndex,
  onActiveIndexChange,
  startLabel,
  endLabel,
}: {
  bars: DailyBar[];
  movingAverages: MovingAveragePoint[];
  enabledPeriods: ReadonlySet<MovingAveragePeriod>;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  startLabel: string;
  endLabel: string;
}) {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(1000);
  const WIDTH = width;
  const PLOT_WIDTH = Math.max(width - 70, 100);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [bars.length]);
  const alignedAverages = useMemo(() => {
    const byDate = new Map(movingAverages.map((item) => [dateKey(item.date), item]));
    return bars.map((bar) => byDate.get(dateKey(bar.date)) ?? null);
  }, [bars, movingAverages]);

  if (!bars.length) return null;

  const scaleValues = bars.flatMap((bar) => [bar.low, bar.high]);
  for (const { period, key } of MOVING_AVERAGES) {
    if (!enabledPeriods.has(period)) continue;
    for (const point of alignedAverages) {
      const value = point?.[key];
      if (value != null) scaleValues.push(value);
    }
  }
  const rawHigh = Math.max(...scaleValues);
  const rawLow = Math.min(...scaleValues);
  const padding = Math.max((rawHigh - rawLow) * 0.04, 0.01);
  const scaleHigh = rawHigh + padding;
  const scaleLow = rawLow - padding;
  const spread = Math.max(scaleHigh - scaleLow, 0.01);
  const volumeMax = Math.max(...bars.map((bar) => bar.volume), 1);
  const step = PLOT_WIDTH / bars.length;
  const candleWidth = Math.max(Math.min(step * 0.62, 7), 0.9);
  const xFor = (index: number) => (index + 0.5) * step;
  const yFor = (value: number) => PRICE_TOP + ((scaleHigh - value) / spread) * PRICE_HEIGHT;
  const selectedIndex = Math.min(Math.max(activeIndex, 0), bars.length - 1);

  const linePath = (key: "ma5" | "ma10" | "ma20" | "ma60" | "ma120" | "ma250") => {
    let path = "";
    let drawing = false;
    alignedAverages.forEach((point, index) => {
      const value = point?.[key];
      if (value == null) {
        drawing = false;
        return;
      }
      path += `${drawing ? " L" : " M"} ${xFor(index)} ${yFor(value)}`;
      drawing = true;
    });
    return path.trim();
  };

  const selectFromClientX = (clientX: number) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width * WIDTH / PLOT_WIDTH));
    onActiveIndexChange(Math.min(bars.length - 1, Math.floor(ratio * bars.length)));
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    selectFromClientX(event.clientX);
  };

  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    let nextIndex = selectedIndex;
    if (event.key === "ArrowLeft") nextIndex = Math.max(0, selectedIndex - 1);
    else if (event.key === "ArrowRight") nextIndex = Math.min(bars.length - 1, selectedIndex + 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = bars.length - 1;
    else return;
    event.preventDefault();
    onActiveIndexChange(nextIndex);
  };

  return (
    <div className="min-w-0">
      <span id="kline-keyboard-hint" className="sr-only">{t("dossier.klineKeyboardHint")}</span>
      <svg
        ref={svgRef}
        data-testid="kline-svg"
        data-active-index={selectedIndex}
        role="img"
        tabIndex={0}
        aria-label={t("dossier.klineChartAria")}
        aria-describedby="kline-keyboard-hint"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-[320px] w-full touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:h-[360px]"
        onPointerDown={handlePointerDown}
        onPointerMove={(event) => selectFromClientX(event.clientX)}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <g aria-hidden="true">
          {[0, 1, 2, 3, 4].map((tick) => {
            const value = scaleHigh - spread * tick / 4;
            const y = yFor(value);
            return <g key={tick}>
              <line x1={0} x2={PLOT_WIDTH} y1={y} y2={y} stroke="currentColor" opacity="0.09" vectorEffect="non-scaling-stroke" />
              <text x={PLOT_WIDTH + 10} y={y + 4} fill="currentColor" opacity="0.6" fontSize="12">{value.toFixed(2)}</text>
            </g>;
          })}
          {bars.map((bar, index) => {
            const rising = bar.close >= bar.open;
            const color = rising ? semanticColor("--up", "#f26d72") : semanticColor("--down", "#34d399");
            const bodyTop = yFor(Math.max(bar.open, bar.close));
            const bodyBottom = yFor(Math.min(bar.open, bar.close));
            return (
              <g key={`${bar.date}-${index}`} data-testid="kline-candle">
                <line x1={xFor(index)} x2={xFor(index)} y1={yFor(bar.high)} y2={yFor(bar.low)} stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <rect x={xFor(index) - candleWidth / 2} y={bodyTop} width={candleWidth} height={Math.max(bodyBottom - bodyTop, 1)} rx="0.5" fill={color} />
                <rect x={xFor(index) - candleWidth / 2} y={VOLUME_TOP + VOLUME_HEIGHT * (1 - bar.volume / volumeMax)} width={candleWidth} height={Math.max(VOLUME_HEIGHT * (bar.volume / volumeMax), 1)} fill={color} opacity="0.42" />
              </g>
            );
          })}
          {MOVING_AVERAGES.map(({ period, key, color }) => enabledPeriods.has(period) && (
            <path
              key={period}
              data-testid={`ma-line-${period}`}
              d={linePath(key)}
              fill="none"
              stroke={color}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line x1={xFor(selectedIndex)} x2={xFor(selectedIndex)} y1={PRICE_TOP} y2={VOLUME_TOP + VOLUME_HEIGHT} stroke="currentColor" strokeWidth="1" opacity="0.24" vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={PLOT_WIDTH} y1={yFor(bars[selectedIndex].close)} y2={yFor(bars[selectedIndex].close)} stroke="var(--accent)" strokeDasharray="4 4" opacity="0.65" vectorEffect="non-scaling-stroke" />
          <rect x={PLOT_WIDTH + 3} y={yFor(bars[selectedIndex].close) - 10} width={66} height={20} rx={3} fill="var(--accent)" />
          <text x={PLOT_WIDTH + 36} y={yFor(bars[selectedIndex].close) + 4} textAnchor="middle" fill="var(--on-accent, #10251d)" fontSize="12">{bars[selectedIndex].close.toFixed(2)}</text>
        </g>
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-muted"><span>{startLabel}</span><span>{endLabel}</span></div>
    </div>
  );
}
