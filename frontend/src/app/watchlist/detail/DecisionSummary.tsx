"use client";

import type { WatchlistResearchProfile } from "@/lib/types";
import { useI18n } from "@/components/I18nProvider";

export default function DecisionSummary({
  profile,
  contentCompleteness,
  contentCompleted,
  contentTotal,
  reviewReadiness,
  reviewCompleted,
  reviewTotal,
  alerts,
  quoteStatus,
  onSave,
  onEditAnchors,
}: {
  profile: WatchlistResearchProfile;
  contentCompleteness: number;
  contentCompleted: number;
  contentTotal: number;
  reviewReadiness: number;
  reviewCompleted: number;
  reviewTotal: number;
  alerts: string[];
  quoteStatus: "loading" | "live" | "cached";
  onSave: () => void;
  onEditAnchors: () => void;
}) {
  const { localeTag, t } = useI18n();
  const { stock } = profile;
  const price = (value: number) => value > 0 ? value.toLocaleString(localeTag, { maximumFractionDigits: 2 }) : t("dossier.notSet");
  const metrics = [
    { label: t("dossier.contentCompleteness"), value: `${contentCompleteness}%`, detail: t("dossier.contentCompletenessDetail", { completed: contentCompleted, total: contentTotal }), action: "" },
    { label: t("dossier.reviewReadiness"), value: `${reviewReadiness}%`, detail: t("dossier.reviewReadinessDetail", { completed: reviewCompleted, total: reviewTotal }), action: "" },
    { label: t("dossier.currentPrice"), value: quoteStatus === "loading" ? "…" : price(stock.current_price), detail: quoteStatus === "cached" ? t("dossier.providerError") : "", action: "" },
    { label: t("dossier.strike"), value: price(stock.strike_price), detail: "", action: stock.strike_price <= 0 ? "set" : "" },
    { label: t("dossier.fairTarget"), value: `${price(stock.fair_price)} / ${price(stock.target_price)}`, detail: "", action: stock.fair_price <= 0 || stock.target_price <= 0 ? "set" : "edit" },
  ];
  return (
    <section aria-labelledby="decision-summary-title" className="border-y border-themed bg-surface/60">
      <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-[minmax(260px,1.2fr)_repeat(5,minmax(110px,0.7fr))]">
        <div className="border-b border-themed p-5 sm:col-span-2 lg:col-span-1 lg:border-b-0 lg:border-r">
          <p className="text-xs font-medium uppercase text-muted">{t("dossier.nextAction")}</p>
          <h2 id="decision-summary-title" className="mt-2 text-base font-semibold text-primary">
            {alerts[0] || t("dossier.actionCurrent")}
          </h2>
          <button type="button" onClick={onSave} className="mt-3 min-h-10 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
            {t("dossier.startNextStep")}
          </button>
        </div>
        {metrics.map(({ label, value, detail, action }) => (
          <div key={label} className="border-b border-themed p-4 last:border-b-0 sm:p-5 lg:border-b-0 lg:border-r lg:last:border-r-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted">{label}</p>
              {action && <button type="button" onClick={onEditAnchors} aria-label={t(action === "set" ? "dossier.setAnchorFor" : "dossier.editAnchorsFor", { label })} className="min-h-8 shrink-0 rounded px-1.5 text-xs font-medium text-accent transition hover:bg-[var(--accent-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">{t(action === "set" ? "dossier.setAnchor" : "dossier.editAnchors")}</button>}
            </div>
            <p className="mt-2 text-base font-semibold text-primary">{value}</p>
            {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
