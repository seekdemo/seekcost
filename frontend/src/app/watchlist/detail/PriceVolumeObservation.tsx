"use client";

import type { PriceVolumeObservation as Observation } from "@/lib/types";
import { useI18n } from "@/components/I18nProvider";
import type { TranslationVariables } from "@/lib/i18n";

export type ObservationStatus = "loading" | "ready" | "empty" | "error";

function number(value: number | null, locale: string, suffix = "") {
  return value == null ? "--" : `${value.toLocaleString(locale, { maximumFractionDigits: 2 })}${suffix}`;
}

type Translator = (key: string, variables?: TranslationVariables) => string;

// Keep the API's auditable basis text stable; translate only its known deterministic templates.
function localizeChineseBasis(item: string, t: Translator) {
  let match = item.match(/^Price (?:is )?([\d.]+)% (above|below) MA60; MA20 is (above|below) MA60\.$/);
  if (match) return t("dossier.trendBasis", { spread: match[1], direction: t(`dossier.${match[2]}`), alignment: t(`dossier.${match[3]}`) });
  match = item.match(/^Price (above|below) MA60 by ([\d.]+)%; MA20 is (above|below) MA60\.$/);
  if (match) return t("dossier.trendBasis", { spread: match[2], direction: t(`dossier.${match[1]}`), alignment: t(`dossier.${match[3]}`) });
  match = item.match(/^Latest volume is ([\d.]+)x the mean of the prior 20 completed sessions\.$/);
  if (match) return t("dossier.volumeBasis", { volume: match[1] });
  match = item.match(/^Annualized volatility is ([\d.]+)% using sample standard deviation(?: of close-to-close returns)? scaled by sqrt\(252\)(?:; ATR14 is ([\d.]+))?\.$/);
  if (match) return t("dossier.volatilityBasis", { volatility: match[1], atr: match[2] ? t("dossier.atrBasis", { atr: match[2] }) : "" });
  match = item.match(/^Maximum drawdown across the loaded range is ([\d.-]+)%(?: from a prior closing peak)?\.$/);
  if (match) return t("dossier.drawdownBasis", { drawdown: match[1] });
  match = item.match(/^Price changed ([\d.-]+)% over 20 sessions; volume comparison is unavailable\.$/);
  if (match) return t("dossier.priceChangeNoVolumeBasis", { change: match[1] });
  match = item.match(/^Price rose ([\d.]+)% over 20 sessions while latest volume is below its prior-20 mean\.$/);
  if (match) return t("dossier.priceRiseLowVolumeBasis", { change: match[1] });
  match = item.match(/^Price fell ([\d.]+)% over 20 sessions while latest volume is above its prior-20 mean\.$/);
  if (match) return t("dossier.priceFallHighVolumeBasis", { change: match[1] });
  if (item === "Price and volume moved in the same direction over 20 sessions.") return t("dossier.priceVolumeSameDirectionBasis");
  match = item.match(/^Price changed ([\d.-]+)% over 20 sessions and latest relative volume is ([\d.]+)x\.$/);
  if (match) return t("dossier.priceChangeVolumeBasis", { change: match[1], volume: match[2] });

  const position = item.replace(/\.$/, "").split("; ");
  const close = position[0]?.match(/^Latest close(?: is)? ([\d.]+)$/);
  if (close) {
    const parts = [t("dossier.latestCloseBasis", { close: close[1] })];
    for (const part of position.slice(1)) {
      const support = part.match(/^(?:60-session )?support ([\d.]+) and resistance ([\d.]+)$/);
      const anchor = part.match(/^(strike|fair|target) anchor ([\d.]+)$/);
      if (support) parts.push(t("dossier.supportResistanceBasis", { support: support[1], resistance: support[2] }));
      else if (anchor) parts.push(t(`dossier.${anchor[1]}AnchorBasis`, { value: anchor[2] }));
      else if (part === "no price anchors are set") parts.push(t("dossier.noAnchorsBasis"));
      else return item;
    }
    return `${parts.join("；")}。`;
  }
  return item;
}

export default function PriceVolumeObservation({ observation, status }: { observation: Observation | null; status: ObservationStatus }) {
  const { locale, localeTag, t } = useI18n();
  if (status === "loading") return <section aria-label={t("dossier.priceVolumeTitle")} className="mt-10 h-56 animate-pulse rounded-md bg-surface" />;
  if (status === "error") return <section aria-label={t("dossier.priceVolumeTitle")} className="mt-10 border-y border-themed py-8 text-sm text-amber-500">{t("dossier.priceVolumeError")}</section>;
  if (status === "empty" || !observation) return <section aria-label={t("dossier.priceVolumeTitle")} className="mt-10 border-y border-themed py-8 text-sm text-muted">{t("dossier.priceVolumeEmpty")}</section>;

  const metrics = [
    ["MA20", number(observation.ma20, localeTag)],
    ["MA60", number(observation.ma60, localeTag)],
    ["MA120", number(observation.ma120, localeTag)],
    [t("dossier.relativeVolume"), observation.relative_volume20 == null ? "--" : `${observation.relative_volume20.toFixed(2)}x`],
    [t("dossier.annualizedVolatility"), observation.annualized_volatility == null ? "--" : `${(observation.annualized_volatility * 100).toFixed(1)}%`],
    ["ATR14", number(observation.atr14, localeTag)],
    [t("dossier.maximumDrawdown"), observation.max_drawdown == null ? "--" : `${(observation.max_drawdown * 100).toFixed(1)}%`],
    [t("dossier.sessionRange"), observation.support60 == null || observation.resistance60 == null ? "--" : `${number(observation.support60, localeTag)} – ${number(observation.resistance60, localeTag)}`],
  ];
  const basis = [
    observation.trend_basis,
    observation.volume_basis,
    observation.volatility_basis,
    observation.drawdown_basis,
    observation.position_basis,
    observation.divergence_basis,
  ].filter((item): item is string => Boolean(item)).map((item) => locale === "zh-CN" ? localizeChineseBasis(item, t) : item);

  return (
    <section aria-labelledby="price-volume-title" className="mt-12 border-y border-themed py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-medium uppercase text-muted">{t("dossier.objectiveValidation")}</p><h2 id="price-volume-title" className="mt-1 text-xl font-semibold text-primary">{t("dossier.priceVolumeTitle")}</h2></div>
        <p className="text-xs text-muted">{t("dossier.transparentRule")}</p>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-themed bg-[var(--border)] sm:grid-cols-4">
        {metrics.map(([label, value]) => <div key={label} className="min-w-0 bg-page p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 break-words text-sm font-semibold text-primary">{value}</p></div>)}
      </div>
      {basis.length > 0 && <ul className="mt-6 grid gap-3 lg:grid-cols-2">{basis.map((item) => <li key={item} className="border-l-2 border-[var(--border-hover)] pl-3 text-sm leading-6 text-secondary">{item}</li>)}</ul>}
    </section>
  );
}
