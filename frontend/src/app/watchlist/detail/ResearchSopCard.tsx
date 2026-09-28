"use client";

import { useState } from "react";

import { useI18n } from "@/components/I18nProvider";

const STEPS = [1, 2, 3, 4] as const;

export default function ResearchSopCard() {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);

  return (
    <section aria-labelledby="research-workflow-title" className="mt-7 border-y border-themed bg-surface/45 px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[.12em] text-muted">{t("dossier.workflowEyebrow")}</p>
          <h2 id="research-workflow-title" className="mt-1 text-lg font-semibold text-primary">{t("dossier.workflowTitle")}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary">{t("dossier.workflowDescription")}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="min-h-10 shrink-0 rounded-md border border-themed px-3 py-2 text-xs font-medium text-secondary transition hover:border-[var(--border-hover)] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {expanded ? t("dossier.hideWorkflow") : t("dossier.showWorkflow")}
        </button>
      </div>

      {expanded && (
        <>
          <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step} className="min-w-0 border border-themed bg-page/55 p-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-on-accent">{step}</span>
                  <span className="text-sm font-semibold text-primary">{t(`dossier.workflowStep${step}`)}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-secondary">{t(`dossier.workflowStep${step}Description`)}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4 border-l-2 border-[var(--accent)]/60 pl-3">
            <p className="text-xs font-medium text-primary">{t("dossier.workflowNextCheckTitle")}</p>
            <p className="mt-1 text-xs leading-5 text-secondary">{t("dossier.workflowNextCheckDescription")}</p>
          </div>
        </>
      )}
    </section>
  );
}
