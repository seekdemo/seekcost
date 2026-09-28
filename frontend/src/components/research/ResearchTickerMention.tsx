"use client";

import Link from "next/link";
import { useId } from "react";
import { useI18n } from "@/components/I18nProvider";

export interface ResearchTickerSummary {
  id: string;
  symbol: string;
  name: string;
  stage: "radar" | "conviction" | "strike";
  currentPrice?: number;
  strikePrice?: number;
  fairPrice?: number;
  targetPrice?: number;
  thesis?: string;
}

function isPrice(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export default function ResearchTickerMention({ stock, label }: { stock: ResearchTickerSummary; label?: string }) {
  const { t, localeTag } = useI18n();
  const tooltipId = useId();
  const formatPrice = (value: number) => new Intl.NumberFormat(localeTag, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  const prices = [
    [t("research.tickerCurrent"), stock.currentPrice],
    [t("research.tickerStrike"), stock.strikePrice],
    [t("research.tickerFair"), stock.fairPrice],
    [t("research.tickerTarget"), stock.targetPrice],
  ] as const;
  const availablePrices = prices.filter((item): item is readonly [string, number] => isPrice(item[1]));

  return (
    <span className="research-ticker-mention" data-research-ticker={stock.symbol}>
      <Link
        href={`/watchlist/${encodeURIComponent(stock.id)}`}
        className="research-markdown-token is-stock"
        aria-describedby={tooltipId}
      >
        {label || `$${stock.symbol}`}
        {isPrice(stock.currentPrice) ? <small>{formatPrice(stock.currentPrice)}</small> : null}
      </Link>
      <span id={tooltipId} role="tooltip" className="research-ticker-mention__card">
        <span className="research-ticker-mention__heading">
          <span><strong>{stock.symbol}</strong><small>{stock.name}</small></span>
          <i data-stage={stock.stage}>{t(`research.tickerStage.${stock.stage}`)}</i>
        </span>
        {availablePrices.length ? <span className="research-ticker-mention__prices">
          {availablePrices.map(([priceLabel, value]) => <span key={priceLabel}><small>{priceLabel}</small><strong>{formatPrice(value)}</strong></span>)}
        </span> : null}
        {stock.thesis ? <span className="research-ticker-mention__thesis">{stock.thesis}</span> : null}
        <span className="research-ticker-mention__open">{t("research.openTicker")} <span aria-hidden="true">→</span></span>
      </span>
    </span>
  );
}
