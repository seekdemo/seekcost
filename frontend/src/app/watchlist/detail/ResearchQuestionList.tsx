"use client";

import { useI18n } from "@/components/I18nProvider";
import type { ResearchQuestionItem } from "@/lib/types";

export default function ResearchQuestionList({
  items,
  onChange,
}: {
  items: ResearchQuestionItem[];
  onChange: (items: ResearchQuestionItem[]) => void;
}) {
  const { t } = useI18n();
  const update = (index: number, patch: Partial<ResearchQuestionItem>) => {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  return (
    <fieldset className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <legend className="text-sm font-semibold text-primary">{t("dossier.stillToConfirm")}</legend>
        <button type="button" onClick={() => onChange([...items, { question: "", status: "open", answer: "" }])} className="min-h-10 rounded-md border border-themed px-3 py-2 text-sm text-secondary hover:text-primary">{t("dossier.addQuestion")}</button>
      </div>
      {items.length === 0 && <p className="text-sm text-muted">{t("dossier.noOpenQuestions")}</p>}
      {items.map((item, index) => (
        <div key={index} className="grid gap-3 rounded-md border border-themed p-3 md:grid-cols-[minmax(0,1fr)_160px]">
          <label className="text-xs text-muted">{t("dossier.question")}<input value={item.question} onChange={(event) => update(index, { question: event.target.value })} className="mt-1 min-h-10 w-full rounded-md border border-themed bg-input px-3 text-sm text-primary outline-none focus:border-[var(--accent)]" /></label>
          <label className="text-xs text-muted">{t("dossier.state")}<select value={item.status} onChange={(event) => update(index, { status: event.target.value as ResearchQuestionItem["status"] })} className="mt-1 min-h-10 w-full rounded-md border border-themed bg-input px-3 text-sm text-primary outline-none focus:border-[var(--accent)]"><option value="open">{t("dossier.stateOpen")}</option><option value="validated">{t("dossier.stateValidated")}</option><option value="discarded">{t("dossier.stateDiscarded")}</option></select></label>
          <label className="text-xs text-muted md:col-span-2">{t("dossier.answer")}<textarea value={item.answer} onChange={(event) => update(index, { answer: event.target.value })} rows={2} className="mt-1 w-full resize-y rounded-md border border-themed bg-input px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)]" /></label>
          <button type="button" onClick={() => onChange(items.filter((_item, itemIndex) => itemIndex !== index))} className="min-h-10 justify-self-start rounded-md px-2 text-sm text-red-400 hover:bg-red-500/10">{t("dossier.removeQuestion")}</button>
        </div>
      ))}
    </fieldset>
  );
}
