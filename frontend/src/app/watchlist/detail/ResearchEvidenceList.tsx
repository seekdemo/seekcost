"use client";

import { useI18n } from "@/components/I18nProvider";
import type { ResearchEvidenceItem } from "@/lib/types";

const EMPTY_EVIDENCE: ResearchEvidenceItem = {
  label: "",
  value: "",
  source: null,
  url: null,
  excerpt: null,
  as_of: null,
};

export default function ResearchEvidenceList({
  items,
  onChange,
}: {
  items: ResearchEvidenceItem[];
  onChange: (items: ResearchEvidenceItem[]) => void;
}) {
  const { t } = useI18n();
  const update = (index: number, patch: Partial<ResearchEvidenceItem>) => {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  return (
    <fieldset className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <legend className="text-sm font-semibold text-primary">{t("dossier.supportingEvidence")}</legend>
        <button type="button" onClick={() => onChange([...items, { ...EMPTY_EVIDENCE }])} className="min-h-10 rounded-md border border-themed px-3 py-2 text-sm text-secondary hover:text-primary">{t("dossier.addEvidence")}</button>
      </div>
      {items.length === 0 && <p className="text-sm text-muted">{t("dossier.noEvidence")}</p>}
      {items.map((item, index) => {
        const invalidUrl = Boolean(item.url && !/^https?:\/\//i.test(item.url));
        return (
          <div key={index} className="grid gap-3 rounded-md border border-themed p-3 md:grid-cols-2">
            <label className="text-xs text-muted">{t("dossier.evidenceLabel")}<input value={item.label} onChange={(event) => update(index, { label: event.target.value })} className="mt-1 min-h-10 w-full rounded-md border border-themed bg-input px-3 text-sm text-primary outline-none focus:border-[var(--accent)]" /></label>
            <label className="text-xs text-muted">{t("dossier.evidenceSource")}<input value={item.source || ""} onChange={(event) => update(index, { source: event.target.value || null })} className="mt-1 min-h-10 w-full rounded-md border border-themed bg-input px-3 text-sm text-primary outline-none focus:border-[var(--accent)]" /></label>
            <label className="text-xs text-muted md:col-span-2">URL<input type="url" value={item.url || ""} aria-invalid={invalidUrl} onChange={(event) => update(index, { url: event.target.value || null })} placeholder="https://" className="mt-1 min-h-10 w-full rounded-md border border-themed bg-input px-3 text-sm text-primary outline-none focus:border-[var(--accent)] aria-[invalid=true]:border-red-400" />{invalidUrl && <span className="mt-1 block text-xs text-red-400">{t("dossier.invalidEvidenceUrl")}</span>}</label>
            <label className="text-xs text-muted md:col-span-2">{t("dossier.evidenceExcerpt")}<textarea value={item.excerpt || ""} onChange={(event) => update(index, { excerpt: event.target.value || null })} rows={2} className="mt-1 w-full resize-y rounded-md border border-themed bg-input px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)]" /></label>
            <button type="button" onClick={() => onChange(items.filter((_item, itemIndex) => itemIndex !== index))} className="min-h-10 justify-self-start rounded-md px-2 text-sm text-red-400 hover:bg-red-500/10">{t("dossier.removeEvidence")}</button>
          </div>
        );
      })}
    </fieldset>
  );
}
