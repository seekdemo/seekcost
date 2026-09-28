"use client";

import { useI18n } from "@/components/I18nProvider";
import type { InvestmentTool } from "@/lib/types";

import { categoryConfig, pricingLabelKey } from "./toolDirectoryConfig";
import ToolIcon from "./ToolIcon";

function domainFor(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function ToolCard({
  tool,
  onStar,
  onEdit,
  onDelete,
}: {
  tool: InvestmentTool;
  onStar: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const category = categoryConfig(tool.category);
  const productLabel = `${t("tools.openProduct")} · ${tool.name}`;

  return (
    <article data-testid="tool-card" className="tool-card mb-2 inline-flex min-w-0 w-full break-inside-avoid flex-col rounded-lg border border-themed bg-surface transition hover:border-[var(--border-hover)] hover:shadow-[0_16px_42px_rgba(0,0,0,.12)] sm:mb-0 sm:flex sm:min-h-[250px] sm:p-5">
      <div className={`tool-card__mobile-cover relative aspect-[4/3] overflow-hidden rounded-t-[7px] sm:hidden ${category.coverTone}`}>
        <a href={tool.url} target="_blank" rel="noreferrer" aria-label={productLabel} className="flex h-full w-full flex-col items-center justify-center px-3 text-center">
          <ToolIcon url={tool.url} name={tool.name} customUrl={tool.icon_url} className="h-14 w-14 border border-white/15 bg-black/10 text-lg font-bold shadow-sm" />
          <span className="mt-3 max-w-full truncate text-[11px] opacity-75">{domainFor(tool.url)}</span>
        </a>
        <span className="pointer-events-none absolute left-2 top-2 max-w-[calc(100%-3.5rem)] truncate rounded bg-black/20 px-2 py-1 text-[10px] font-medium backdrop-blur-sm">{t(category.labelKey)}</span>
        <button
          type="button"
          onClick={onStar}
          aria-label={t(tool.starred ? "tools.unstar" : "tools.star", { name: tool.name })}
          title={t(tool.starred ? "tools.unstar" : "tools.star", { name: tool.name })}
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-black/25 text-lg text-white backdrop-blur-sm transition active:scale-95"
        >
          <span aria-hidden="true">{tool.starred ? "★" : "☆"}</span>
        </button>
      </div>

      <div className="hidden min-w-0 items-start justify-between gap-3 sm:flex">
        <div className="flex min-w-0 items-center gap-3">
          <ToolIcon url={tool.url} name={tool.name} customUrl={tool.icon_url} className={`h-10 w-10 border text-xs font-bold ${category.tone}`} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-primary">{tool.name}</h2>
            <p className="mt-0.5 truncate text-xs text-muted">{domainFor(tool.url)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onStar}
          aria-label={t(tool.starred ? "tools.unstar" : "tools.star", { name: tool.name })}
          title={t(tool.starred ? "tools.unstar" : "tools.star", { name: tool.name })}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-md text-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${tool.starred ? "bg-amber-400/10 text-amber-300" : "text-muted hover:bg-surface-hover hover:text-primary"}`}
        >
          <span aria-hidden="true">{tool.starred ? "★" : "☆"}</span>
        </button>
      </div>

      <div className="tool-card__mobile-body min-w-0 p-3 sm:hidden">
        <a href={tool.url} target="_blank" rel="noreferrer" className="block rounded-sm focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          <h2 className="line-clamp-2 text-sm font-semibold leading-5 text-primary">{tool.name}</h2>
        </a>
        <p className="mt-1.5 line-clamp-3 text-xs leading-[1.15rem] text-secondary">{tool.description || t("tools.descriptionPlaceholder")}</p>
        {tool.tags.length > 0 && (
          <div className="mt-2 flex min-w-0 gap-1 overflow-hidden">
            {tool.tags.slice(0, 2).map((tag) => <span key={tag} className="max-w-[6.5rem] truncate rounded bg-input px-1.5 py-1 text-[10px] text-muted">#{tag}</span>)}
          </div>
        )}
        <div className="mt-3 flex min-w-0 items-center justify-between gap-2 border-t border-themed pt-2">
          <span className="min-w-0 truncate text-[10px] text-muted">{t(pricingLabelKey(tool.pricing))}</span>
          <details className="tool-card__mobile-menu relative shrink-0">
            <summary aria-label={`${t("tools.edit")} / ${t("tools.delete")}`} className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-full text-lg leading-none text-muted transition hover:bg-surface-hover hover:text-primary">•••</summary>
            <div className="absolute bottom-9 right-0 z-20 min-w-32 overflow-hidden rounded-md border border-themed bg-page p-1 shadow-[0_16px_42px_rgba(0,0,0,.28)]">
              <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onEdit(); }} className="flex min-h-10 w-full items-center rounded px-3 text-left text-xs text-secondary hover:bg-surface-hover hover:text-primary">{t("tools.edit")}</button>
              {tool.source_url && <a href={tool.source_url} target="_blank" rel="noreferrer" className="flex min-h-10 items-center rounded px-3 text-xs text-secondary hover:bg-surface-hover hover:text-primary">{t("tools.openSource")}</a>}
              <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onDelete(); }} className="flex min-h-10 w-full items-center rounded px-3 text-left text-xs text-muted hover:bg-red-500/10 hover:text-red-400">{t("tools.delete")}</button>
            </div>
          </details>
        </div>
      </div>

      <div className="mt-4 hidden flex-wrap items-center gap-2 text-[11px] sm:flex">
        <span className={`rounded border px-2 py-1 font-medium ${category.tone}`}>{t(category.labelKey)}</span>
        <span className="rounded border border-themed bg-surface-alt px-2 py-1 text-muted">{t(pricingLabelKey(tool.pricing))}</span>
      </div>

      <p className="mt-3 hidden line-clamp-3 min-h-[3.9rem] text-sm leading-[1.4rem] text-secondary sm:block">{tool.description || t("tools.descriptionPlaceholder")}</p>

      <div className="mt-3 hidden min-h-6 flex-wrap gap-1.5 sm:flex">
        {tool.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded bg-input px-2 py-1 text-[10px] text-muted">#{tag}</span>)}
        {tool.tags.length > 4 && <span className="px-1 py-1 text-[10px] text-muted">+{tool.tags.length - 4}</span>}
      </div>

      <div className="mt-auto hidden flex-wrap items-center justify-between gap-2 border-t border-themed pt-4 sm:flex">
        <div className="flex items-center gap-1">
          <button type="button" onClick={onEdit} className="min-h-10 rounded-md px-2.5 text-xs text-secondary transition hover:bg-surface-hover hover:text-primary">{t("tools.edit")}</button>
          <button type="button" onClick={onDelete} className="min-h-10 rounded-md px-2.5 text-xs text-muted transition hover:bg-red-500/10 hover:text-red-400">{t("tools.delete")}</button>
          {tool.source_url && <a href={tool.source_url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-md px-2.5 text-xs text-muted transition hover:bg-surface-hover hover:text-primary">{t("tools.openSource")}</a>}
        </div>
        <a
          href={tool.url}
          target="_blank"
          rel="noreferrer"
          aria-label={productLabel}
          className="inline-flex min-h-10 items-center rounded-md bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {t("tools.openProduct")} <span aria-hidden="true" className="ml-1">↗</span>
        </a>
      </div>
    </article>
  );
}
