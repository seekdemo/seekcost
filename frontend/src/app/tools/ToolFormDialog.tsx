"use client";

import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/components/I18nProvider";
import type { InvestmentTool, InvestmentToolCategory, InvestmentToolPricing, InvestmentToolWrite } from "@/lib/types";

import { TOOL_CATEGORIES, TOOL_PRICING } from "./toolDirectoryConfig";
import ToolIcon from "./ToolIcon";

function validUrl(value: string) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function initialDraft(tool: InvestmentTool | null): InvestmentToolWrite & { tagsText: string } {
  return {
    name: tool?.name || "",
    url: tool?.url || "",
    description: tool?.description || "",
    category: tool?.category || "research",
    pricing: tool?.pricing || "unknown",
    tags: tool?.tags || [],
    tagsText: tool?.tags.join(", ") || "",
    source_url: tool?.source_url || null,
    icon_url: tool?.icon_url || null,
    starred: tool?.starred || false,
  };
}

export default function ToolFormDialog({
  tool,
  onClose,
  onSave,
}: {
  tool: InvestmentTool | null;
  onClose: () => void;
  onSave: (data: InvestmentToolWrite) => Promise<void>;
}) {
  const { t, localeTag } = useI18n();
  const zh = localeTag.startsWith("zh");
  const nameRef = useRef<HTMLInputElement | null>(null);
  const savingRef = useRef(false);
  const [draft, setDraft] = useState(() => initialDraft(tool));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const title = t(tool ? "tools.editTitle" : "tools.addTitle");

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    nameRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    const url = draft.url.trim();
    const sourceUrl = draft.source_url?.trim() || "";
    if (!name) return setError(t("tools.nameRequired"));
    if (!url) return setError(t("tools.urlRequired"));
    if (!validUrl(url) || (sourceUrl && !validUrl(sourceUrl)) || (draft.icon_url && !validUrl(draft.icon_url.trim()))) return setError(t("tools.urlInvalid"));
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave({
        name,
        url,
        description: draft.description.trim(),
        category: draft.category,
        pricing: draft.pricing,
        tags: draft.tagsText.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).filter((tag, index, all) => all.indexOf(tag) === index).slice(0, 8),
        source_url: sourceUrl || null,
        icon_url: draft.icon_url?.trim() || null,
        starred: draft.starred,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("tools.saveFailed"));
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-5">
      <button type="button" tabIndex={-1} onClick={() => { if (!saving) onClose(); }} aria-label={t("tools.closeDialog")} className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <section role="dialog" aria-modal="true" aria-labelledby="tool-dialog-title"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')).filter(el => el.getClientRects().length > 0 && el.tabIndex >= 0);
          const first = controls[0], last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}
        className="relative z-10 flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-lg border border-themed bg-page shadow-2xl sm:max-h-[88dvh] sm:rounded-lg">
        <header className="flex items-center justify-between gap-4 border-b border-themed px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase text-muted">{t("tools.eyebrow")}</p>
            <h2 id="tool-dialog-title" className="mt-1 text-lg font-semibold text-primary">{title}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label={t("tools.closeDialog")} className="grid h-10 w-10 place-items-center rounded-md text-xl text-muted transition hover:bg-surface-hover hover:text-primary disabled:opacity-50"><span aria-hidden="true">&times;</span></button>
        </header>

        <form onSubmit={(event) => void submit(event)} className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-4 px-4 py-5 sm:grid-cols-2 sm:px-6">
            <label className="text-xs font-medium text-secondary">{t("tools.name")}<input ref={nameRef} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder={t("tools.namePlaceholder")} maxLength={120} className="field-input mt-1.5" /></label>
            <label className="text-xs font-medium text-secondary">{t("tools.url")}<input type="url" value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} placeholder={t("tools.urlPlaceholder")} className="field-input mt-1.5" /></label>
            <div className="flex items-start gap-3 rounded-md border border-themed p-3 sm:col-span-2">
              <ToolIcon url={draft.url} name={draft.name} customUrl={draft.icon_url} className="h-11 w-11 bg-surface-alt font-semibold text-accent" />
              <div className="min-w-0 flex-1 text-xs text-muted">
                <p>{zh ? "网站图标自动获取；不可用时显示首字母，不影响保存。" : "Website icon loads automatically; initials appear if unavailable. Saving is unaffected."}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-accent">{zh ? "自定义图标" : "Custom icon"}</summary>
                  <label className="mt-2 block">{zh ? "图标图片地址" : "Icon image URL"}<input type="url" maxLength={2048} value={draft.icon_url || ""} onChange={event => setDraft(current => ({ ...current, icon_url: event.target.value || null }))} placeholder="https://example.com/icon.png" className="field-input mt-1.5" /></label>
                  <button type="button" className="mt-2 min-h-9 text-accent" onClick={() => setDraft(current => ({ ...current, icon_url: null }))}>{zh ? "恢复自动获取" : "Use automatic icon"}</button>
                </details>
              </div>
            </div>
            <label className="text-xs font-medium text-secondary sm:col-span-2">{t("tools.descriptionLabel")}<textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder={t("tools.descriptionPlaceholder")} maxLength={800} rows={3} className="field-input mt-1.5 resize-y" /></label>
            <label className="text-xs font-medium text-secondary">{t("tools.category")}<select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as InvestmentToolCategory }))} className="field-input mt-1.5">{TOOL_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{t(item.labelKey)}</option>)}</select></label>
            <label className="text-xs font-medium text-secondary">{t("tools.pricing")}<select value={draft.pricing} onChange={(event) => setDraft((current) => ({ ...current, pricing: event.target.value as InvestmentToolPricing }))} className="field-input mt-1.5">{TOOL_PRICING.map((item) => <option key={item.value} value={item.value}>{t(item.labelKey)}</option>)}</select></label>
            <label className="text-xs font-medium text-secondary">{t("tools.tags")}<input value={draft.tagsText} onChange={(event) => setDraft((current) => ({ ...current, tagsText: event.target.value }))} placeholder={t("tools.tagsPlaceholder")} className="field-input mt-1.5" /></label>
            <label className="text-xs font-medium text-secondary">{t("tools.sourceUrl")}<input type="url" value={draft.source_url || ""} onChange={(event) => setDraft((current) => ({ ...current, source_url: event.target.value || null }))} placeholder={t("tools.sourceUrlPlaceholder")} className="field-input mt-1.5" /></label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-themed bg-input px-3 text-sm text-secondary sm:col-span-2"><input type="checkbox" checked={draft.starred} onChange={(event) => setDraft((current) => ({ ...current, starred: event.target.checked }))} className="h-4 w-4 accent-[var(--accent)]" />{t("tools.starredLabel")}</label>
            {error && <p role="alert" className="text-sm text-red-400 sm:col-span-2">{error}</p>}
          </div>
          <footer className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-themed bg-page/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur sm:px-6 sm:pb-4">
            <button type="button" onClick={onClose} disabled={saving} className="ui-button">{t("tools.cancel")}</button>
            <button type="submit" disabled={saving} className="ui-button ui-button--primary min-w-28">{saving ? t("tools.saving") : t("tools.save")}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
