"use client";

import { useI18n } from "@/components/I18nProvider";

import type { ResearchSaveState } from "./useResearchAutoSave";

export default function ResearchSaveStatus({ state, onRetry }: { state: ResearchSaveState; onRetry: () => void }) {
  const { t } = useI18n();
  if (state === "idle") return null;

  const label = {
    dirty: t("research.saveUnsaved"),
    saving: t("research.saveSaving"),
    saved: t("research.saveSaved"),
    failed: t("research.saveFailedShort"),
  }[state];

  return (
    <span className={`research-save-status is-${state}`} aria-live="polite" aria-atomic="true">
      <i aria-hidden="true" />
      <span>{label}</span>
      {state === "failed" && (
        <button type="button" onClick={onRetry}>{t("research.retrySave")}</button>
      )}
    </span>
  );
}
