"use client";

import { useI18n } from "@/components/I18nProvider";

export type MarkdownAction = "bold" | "italic" | "heading" | "bullet" | "numbered" | "quote" | "code" | "link" | "table";

export default function MarkdownToolbar({ onAction, disabled = false }: { onAction: (action: MarkdownAction) => void; disabled?: boolean }) {
  const { t } = useI18n();
  const actions: Array<{ action: MarkdownAction; label: string; title: string }> = [
    { action: "bold", label: "B", title: t("stock.markImportant") },
    { action: "italic", label: "I", title: t("stock.emphasis") },
    { action: "heading", label: "H2", title: t("stock.heading") },
    { action: "bullet", label: "•", title: t("stock.list") },
    { action: "numbered", label: "1.", title: t("stock.numberedList") },
    { action: "quote", label: "❯", title: t("stock.quote") },
    { action: "code", label: "<>" , title: t("stock.codeBlock") },
    { action: "link", label: "↗", title: t("stock.link") },
    { action: "table", label: "▦", title: t("stock.table") },
  ];

  return (
    <div className="markdown-toolbar flex min-w-0 flex-wrap items-center gap-1" role="toolbar" aria-label={t("stock.markdownToolbar")}>
      {actions.map(({ action, label, title }) => (
        <button key={action} type="button" disabled={disabled} data-action={action} title={title} aria-label={title} onMouseDown={(event) => event.preventDefault()} onClick={() => onAction(action)} className="flex min-h-10 min-w-10 items-center justify-center rounded-md px-2 text-xs font-semibold text-secondary transition hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          {label}
        </button>
      ))}
    </div>
  );
}
