"use client";

import { useI18n } from "@/components/I18nProvider";
import type { PriceRiskAssessment } from "@/lib/types";

export default function PriceRiskPanel({ assessment, currency }: { assessment: PriceRiskAssessment | null | undefined; currency: string }) {
  const { t, localeTag } = useI18n();
  if (!assessment) return null;
  const format = (value: number | null) => value == null ? "—" : value.toLocaleString(localeTag, { maximumFractionDigits: 2 });
  const asOf = assessment.as_of == null ? null : new Date(typeof assessment.as_of === "number" ? assessment.as_of * 1000 : assessment.as_of);
  return <section aria-labelledby="risk-title" className="mb-8 rounded-xl border border-themed bg-surface p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="risk-title" className="text-lg font-semibold text-primary">{t("risk.title")}</h2>
      <span className={`text-xs ${assessment.status === "triggered" ? "text-amber-500" : "text-secondary"}`}>{t(`risk.${assessment.status}`)}</span>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      {assessment.rules.map(rule => <article key={rule.code} className="rounded-lg border border-themed bg-input p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
          <h3 className="text-secondary">{t(`risk.${rule.code}`)}</h3>
          <span className={rule.triggered ? "text-amber-500" : "text-muted"}>{t(rule.triggered == null ? "risk.unknown" : rule.triggered ? "risk.hit" : "risk.pass")}</span>
        </div>
        <p className="mt-3 text-2xl font-semibold tabular-nums text-primary">{format(rule.value)}{rule.value != null && (rule.code === "support_break" ? ` ${currency}` : "%")}</p>
        {rule.code === "support_break" && <p className="mt-1 text-xs text-secondary">{t("risk.close")} · {t("risk.support")} {format(rule.threshold)} {currency}</p>}
        <p className="mt-3 text-xs leading-relaxed text-muted">{t(`risk.${rule.code}Rule`)}</p>
      </article>)}
    </div>
    <p className="mt-3 text-xs text-secondary">{t("risk.sample", { count: assessment.sample_count, version: assessment.version })}{asOf ? ` · ${asOf.toLocaleDateString(localeTag)}` : ""}</p>
    <p className="mt-2 text-xs leading-relaxed text-muted">{t("risk.scope")}</p>
  </section>;
}
