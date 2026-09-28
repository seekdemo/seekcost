"use client";

import { useState } from "react";

import { useI18n } from "@/components/I18nProvider";
import MarkdownEditor from "@/components/MarkdownEditor";
import { htmlClipboardToMarkdown } from "@/lib/markdown";
import type { WatchResearchSection, WatchResearchSectionUpdate } from "@/lib/types";

import ResearchEvidenceList from "./ResearchEvidenceList";
import ResearchQuestionList from "./ResearchQuestionList";

function dateValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function apiDate(value: string) {
  return value ? `${value}T00:00:00Z` : null;
}

function markdownValue(value: string) {
  return /<\/?(?:p|div|h[1-6]|ul|ol|li|blockquote|strong|em|pre|code|br)\b/i.test(value)
    ? htmlClipboardToMarkdown(value)
    : value;
}

export default function ResearchSectionEditor({
  section,
  onSave,
  onCancel,
  autoFocusSummary = false,
}: {
  section: WatchResearchSection;
  onSave: (update: WatchResearchSectionUpdate) => Promise<void>;
  onCancel: () => void;
  autoFocusSummary?: boolean;
}) {
  const { t } = useI18n();
  const [summary, setSummary] = useState(() => markdownValue(section.summary));
  const [evidence, setEvidence] = useState(section.evidence);
  const [questions, setQuestions] = useState(section.open_questions);
  const [reviewedAt, setReviewedAt] = useState(dateValue(section.reviewed_at));
  const [nextReviewAt, setNextReviewAt] = useState(dateValue(section.next_review_at));
  const [reviewNote, setReviewNote] = useState(() => markdownValue(section.review_note));
  const [saveState, setSaveState] = useState<"unsaved" | "saving" | "saved" | "failed">("unsaved");
  const [error, setError] = useState("");

  const save = async () => {
    if (evidence.some((item) => item.url && !/^https?:\/\//i.test(item.url))) {
      setError(t("dossier.invalidEvidenceBeforeSave"));
      setSaveState("failed");
      return;
    }
    setSaveState("saving");
    setError("");
    try {
      await onSave({
        summary,
        evidence,
        open_questions: questions,
        reviewed_at: apiDate(reviewedAt),
        next_review_at: apiDate(nextReviewAt),
        review_note: reviewNote,
      });
      setSaveState("saved");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("dossier.couldNotSaveModule"));
      setSaveState("failed");
    }
  };

  return (
    <div className="mt-5 space-y-6" data-testid={`editor-${section.key}`}>
      <MarkdownEditor label={t("dossier.pasteCoreView")} value={summary} onChange={(value) => { setSummary(value); setSaveState("unsaved"); }} placeholder={t("dossier.pasteCoreViewPlaceholder")} minHeight="220px" saveState={saveState === "failed" ? "failed" : saveState} onSave={() => void save()} emptyLabel={t("dossier.noMarkdownPreview")} autoFocus={autoFocusSummary} />
      <ResearchEvidenceList items={evidence} onChange={(value) => { setEvidence(value); setSaveState("unsaved"); }} />
      <ResearchQuestionList items={questions} onChange={(value) => { setQuestions(value); setSaveState("unsaved"); }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-muted">{t("dossier.checkedOn")}<input type="date" value={reviewedAt} onChange={(event) => { setReviewedAt(event.target.value); setSaveState("unsaved"); }} className="mt-1 min-h-10 w-full rounded-md border border-themed bg-input px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)]" /></label>
        <label className="text-xs text-muted">{t("dossier.nextCheckDate")}<input type="date" value={nextReviewAt} onChange={(event) => { setNextReviewAt(event.target.value); setSaveState("unsaved"); }} className="mt-1 min-h-10 w-full rounded-md border border-themed bg-input px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)]" /></label>
      </div>
      <MarkdownEditor label={t("dossier.checkRecord")} value={reviewNote} onChange={(value) => { setReviewNote(value); setSaveState("unsaved"); }} placeholder={t("dossier.checkRecordPlaceholder")} minHeight="150px" saveState={saveState === "failed" ? "failed" : saveState} onSave={() => void save()} emptyLabel={t("dossier.noMarkdownPreview")} />
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-themed bg-page/95 py-3 backdrop-blur">
        <p aria-live="polite" className={`text-xs ${saveState === "failed" ? "text-red-400" : "text-muted"}`}>{error || ({ unsaved: t("dossier.unsavedChanges"), saving: t("dossier.saving"), saved: t("dossier.saved"), failed: t("dossier.saveFailed") }[saveState])}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={saveState === "saving"} className="min-h-10 rounded-md border border-themed px-4 py-2 text-sm text-secondary disabled:opacity-50">{t("dossier.cancel")}</button>
          <button type="button" onClick={() => void save()} disabled={saveState === "saving"} className="min-h-10 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50">{saveState === "saving" ? t("dossier.saving") : t("dossier.saveModule")}</button>
        </div>
      </div>
    </div>
  );
}
