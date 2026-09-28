"use client";

import type { ReactNode } from "react";

import MarkdownPreview from "@/components/MarkdownPreview";
import { RichTextContent, stripRichText } from "@/components/RichTextField";
import { useI18n } from "@/components/I18nProvider";
import type { WatchResearchSection } from "@/lib/types";

export interface ResearchSectionSop {
  goal: string;
  ai: string;
  finish: string;
  nextCheck: string;
}

export default function ResearchSectionCard({
  section,
  title,
  prompt,
  mode,
  onEdit,
  onAskAi,
  sop,
  children,
}: {
  section: WatchResearchSection;
  title: string;
  prompt: string;
  mode: "read" | "edit";
  onEdit: () => void;
  onAskAi: () => void;
  sop: ResearchSectionSop;
  children?: ReactNode;
}) {
  const { localeTag, t } = useI18n();
  const hasSummary = Boolean(stripRichText(section.summary));
  const hasSupportingMaterial = section.evidence.length > 0 || section.open_questions.length > 0;

  return (
    <section id={`research-${section.key}`} aria-labelledby={`${section.key}-title`} className="scroll-mt-24 border-b border-themed py-7 first:pt-0 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted">{t("dossier.companyResearch")}</p>
          <h2 id={`${section.key}-title`} className="mt-1 text-lg font-semibold text-primary">{title}</h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onAskAi}
            aria-label={t("dossier.askAiSection", { title })}
            className="min-h-10 rounded-md border border-[var(--accent)]/35 bg-[var(--accent)]/5 px-3 py-2 text-sm font-medium text-accent transition hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {t("dossier.askAi")}
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label={t("dossier.editSection", { title })}
            className="min-h-10 rounded-md border border-themed px-3 py-2 text-sm text-secondary transition hover:border-[var(--border-hover)] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {mode === "edit" ? t("dossier.editing") : t("dossier.edit")}
          </button>
        </div>
      </div>

      <details open={!hasSummary} className="mt-4 rounded-md border border-themed bg-surface/35">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-medium text-secondary marker:hidden [&::-webkit-details-marker]:hidden">
          <span>{t("dossier.sectionGuide")}</span>
          <span aria-hidden="true" className="text-muted">{hasSummary ? "+" : "-"}</span>
        </summary>
        <div className="grid gap-3 border-t border-themed px-3 py-3 text-xs sm:grid-cols-2">
          <div>
            <p className="font-medium text-primary">{t("dossier.sectionGoal")}</p>
            <p className="mt-1 leading-5 text-secondary">{sop.goal}</p>
          </div>
          <div>
            <p className="font-medium text-primary">{t("dossier.sectionAi")}</p>
            <p className="mt-1 leading-5 text-secondary">{sop.ai}</p>
          </div>
          <div>
            <p className="font-medium text-primary">{t("dossier.sectionDone")}</p>
            <p className="mt-1 leading-5 text-secondary">{sop.finish}</p>
          </div>
          <div>
            <p className="font-medium text-primary">{t("dossier.sectionNextCheck")}</p>
            <p className="mt-1 leading-5 text-secondary">{sop.nextCheck}</p>
          </div>
        </div>
      </details>

      {mode === "edit" && children ? children : hasSummary ? (
        /<\/?(?:p|div|h[1-6]|ul|ol|li|blockquote|strong|em|pre|code|br)\b/i.test(section.summary)
          ? <RichTextContent value={section.summary} className="mt-5 max-w-none text-sm leading-7" />
          : <MarkdownPreview source={section.summary} className="mt-5 max-w-none text-sm leading-7" />
      ) : (
        <div className="mt-5 border-l-2 border-[var(--border)] pl-4">
          <p className="text-sm leading-6 text-secondary">{prompt}</p>
          <p className="mt-1 text-xs text-muted">{t("dossier.supportingMaterialHint")}</p>
        </div>
      )}

      {mode !== "edit" && (hasSupportingMaterial || section.next_review_at) && (
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
          <span>{t("dossier.supportingEvidenceCount", { count: section.evidence.length })}</span>
          <span>{t("dossier.stillToConfirmCount", { count: section.open_questions.filter((item) => item.status === "open").length })}</span>
          <span>{section.next_review_at ? t("dossier.nextCheckOn", { date: new Date(section.next_review_at).toLocaleDateString(localeTag) }) : t("dossier.nextCheckUnset")}</span>
        </div>
      )}
      {mode !== "edit" && children}
    </section>
  );
}
