"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import AuthGuard from "@/components/AuthGuard";
import ConfirmModal from "@/components/ConfirmModal";
import { useI18n } from "@/components/I18nProvider";
import { EmptyState, InlineNotice, PageHeader, PageShell } from "@/components/ui/Page";
import { api } from "@/lib/api";
import type { InvestmentTool, InvestmentToolCategory, InvestmentToolWrite } from "@/lib/types";

import ToolCard from "./ToolCard";
import ToolFormDialog from "./ToolFormDialog";
import { TOOL_CATEGORIES } from "./toolDirectoryConfig";

function sortTools(items: InvestmentTool[]) {
  return [...items].sort((left, right) => Number(right.starred) - Number(left.starred) || new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime() || left.name.localeCompare(right.name));
}

export default function ToolsPage() {
  return <AuthGuard><ToolDirectory /></AuthGuard>;
}

function ToolDirectory() {
  const { t } = useI18n();
  const [tools, setTools] = useState<InvestmentTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | InvestmentToolCategory>("all");
  const [starredOnly, setStarredOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InvestmentTool | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvestmentTool | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTools(sortTools(await api.listInvestmentTools()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("tools.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let active = true;
    api.listInvestmentTools()
      .then((items) => {
        if (active) setTools(sortTools(items));
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : t("tools.loadError"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [t]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tools.filter((tool) => {
      if (category !== "all" && tool.category !== category) return false;
      if (starredOnly && !tool.starred) return false;
      if (!query) return true;
      return [tool.name, tool.description, tool.url, ...tool.tags].some((value) => value.toLowerCase().includes(query));
    });
  }, [category, search, starredOnly, tools]);

  const hasFilters = Boolean(search.trim() || category !== "all" || starredOnly);
  const starredCount = tools.filter((tool) => tool.starred).length;

  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setStarredOnly(false);
  };

  const saveTool = async (data: InvestmentToolWrite) => {
    const saved = editing
      ? await api.updateInvestmentTool(editing.id, data)
      : await api.createInvestmentTool(data);
    setTools((current) => sortTools(editing ? current.map((tool) => tool.id === saved.id ? saved : tool) : [saved, ...current]));
    setEditing(null);
    setFormOpen(false);
  };

  const toggleStar = async (tool: InvestmentTool) => {
    const nextValue = !tool.starred;
    setError("");
    setTools((current) => sortTools(current.map((item) => item.id === tool.id ? { ...item, starred: nextValue } : item)));
    try {
      const saved = await api.updateInvestmentTool(tool.id, { starred: nextValue });
      setTools((current) => sortTools(current.map((item) => item.id === saved.id ? saved : item)));
    } catch {
      setTools((current) => sortTools(current.map((item) => item.id === tool.id ? tool : item)));
      setError(t("tools.starFailed"));
    }
  };

  const deleteTool = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setError("");
    try {
      await api.deleteInvestmentTool(target.id);
      setTools((current) => current.filter((tool) => tool.id !== target.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("tools.deleteFailed"));
    }
  };

  return (
    <PageShell width="wide" className="tools-directory">
      <PageHeader
        className="tools-directory__header"
        eyebrow={t("tools.eyebrow")}
        title={t("tools.title")}
        description={t("tools.description")}
        meta={<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"><span>{t("tools.total", { count: tools.length })}</span><span>{t("tools.starredCount", { count: starredCount })}</span><span>{t("tools.private")}</span></div>}
        actions={<button type="button" onClick={() => { setEditing(null); setFormOpen(true); }} className="ui-button ui-button--primary">{t("tools.add")}</button>}
      />

      {error && <InlineNotice tone="warning"><span>{error}</span> <button type="button" onClick={() => void load()} className="ml-2 underline underline-offset-2">{t("tools.retry")}</button></InlineNotice>}

      <section aria-label={t("tools.eyebrow")} className="tools-directory__filters border-y border-themed py-4">
        <div className="sm:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label={t("tools.search")} placeholder={t("tools.search")} className="field-input min-h-11 min-w-0 flex-1" />
            <button type="button" onClick={() => setStarredOnly((value) => !value)} aria-label={t("tools.starredOnly")} title={t("tools.starredOnly")} aria-pressed={starredOnly} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border text-lg transition ${starredOnly ? "border-amber-400/35 bg-amber-400/10 text-amber-300" : "border-themed bg-surface text-muted"}`}><span aria-hidden="true">{starredOnly ? "★" : "☆"}</span></button>
            {hasFilters && <button type="button" onClick={clearFilters} aria-label={t("tools.clearFilters")} title={t("tools.clearFilters")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-themed bg-surface text-xl text-muted transition hover:text-primary"><span aria-hidden="true">&times;</span></button>}
          </div>
          <div className="tools-directory__categories mt-2 flex min-w-0 gap-2 overflow-x-auto pb-1" role="group" aria-label={t("tools.category")}>
            <button type="button" onClick={() => setCategory("all")} aria-pressed={category === "all"} className={`min-h-10 shrink-0 rounded-md border px-3 text-xs transition ${category === "all" ? "border-[var(--accent)]/35 bg-[var(--accent-bg)] text-accent" : "border-themed text-secondary"}`}>{t("tools.categoryAll")} · {tools.length}</button>
            {TOOL_CATEGORIES.map((item) => {
              const count = tools.filter((tool) => tool.category === item.value).length;
              return <button key={item.value} type="button" onClick={() => setCategory(item.value)} aria-pressed={category === item.value} className={`min-h-10 shrink-0 rounded-md border px-3 text-xs transition ${category === item.value ? item.tone : "border-themed text-secondary"}`}>{t(item.labelKey)} · {count}</button>;
            })}
          </div>
        </div>

        <div className="hidden flex-col gap-3 sm:flex lg:flex-row lg:items-center lg:justify-between">
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label={t("tools.search")} placeholder={t("tools.search")} className="field-input min-h-11 lg:max-w-md" />
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 lg:justify-end lg:pb-0">
            <button type="button" onClick={() => setStarredOnly((value) => !value)} aria-pressed={starredOnly} className={`min-h-10 shrink-0 rounded-md border px-3 text-xs font-medium transition ${starredOnly ? "border-amber-400/35 bg-amber-400/10 text-amber-300" : "border-themed text-secondary hover:bg-surface-hover hover:text-primary"}`}>{t("tools.starredOnly")}</button>
            {hasFilters && <button type="button" onClick={clearFilters} className="min-h-10 shrink-0 rounded-md px-3 text-xs text-muted transition hover:bg-surface-hover hover:text-primary">{t("tools.clearFilters")}</button>}
          </div>
        </div>
        <div className="hidden min-w-0 gap-2 overflow-x-auto pb-1 sm:mt-3 sm:flex" role="group" aria-label={t("tools.category")}>
          <button type="button" onClick={() => setCategory("all")} aria-pressed={category === "all"} className={`min-h-10 shrink-0 rounded-md border px-3 text-xs transition ${category === "all" ? "border-[var(--accent)]/35 bg-[var(--accent-bg)] text-accent" : "border-themed text-secondary hover:bg-surface-hover hover:text-primary"}`}>{t("tools.categoryAll")} · {tools.length}</button>
          {TOOL_CATEGORIES.map((item) => {
            const count = tools.filter((tool) => tool.category === item.value).length;
            return <button key={item.value} type="button" onClick={() => setCategory(item.value)} aria-pressed={category === item.value} className={`min-h-10 shrink-0 rounded-md border px-3 text-xs transition ${category === item.value ? item.tone : "border-themed text-secondary hover:bg-surface-hover hover:text-primary"}`}>{t(item.labelKey)} · {count}</button>;
          })}
        </div>
      </section>

      {loading ? (
        <div className="tools-directory__masonry grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">{[0, 1, 2, 3, 4, 5].map((item) => <span key={item} className="tools-directory__skeleton skeleton-block h-[250px] rounded-lg" />)}</div>
      ) : filtered.length ? (
        <section aria-live="polite">
          <p className="tools-directory__result-count mb-3 text-xs text-muted">{t("tools.resultCount", { visible: filtered.length, total: tools.length })}</p>
          <div className="tools-directory__masonry grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((tool) => <ToolCard key={tool.id} tool={tool} onStar={() => void toggleStar(tool)} onEdit={() => { setEditing(tool); setFormOpen(true); }} onDelete={() => setDeleteTarget(tool)} />)}
          </div>
        </section>
      ) : tools.length === 0 ? (
        <EmptyState title={t("tools.emptyTitle")} description={t("tools.emptyDescription")} action={<button type="button" onClick={() => setFormOpen(true)} className="ui-button ui-button--primary">{t("tools.addFirst")}</button>} />
      ) : (
        <EmptyState title={t("tools.noMatches")} description={t("tools.noMatchesDescription")} action={<button type="button" onClick={clearFilters} className="ui-button">{t("tools.clearFilters")}</button>} />
      )}

      {formOpen && <ToolFormDialog tool={editing} onClose={() => { setFormOpen(false); setEditing(null); }} onSave={saveTool} />}
      <ConfirmModal open={Boolean(deleteTarget)} title={t("tools.deleteTitle")} message={t("tools.deleteMessage")} confirmText={t("tools.deleteConfirm")} cancelText={t("tools.cancel")} onConfirm={() => void deleteTool()} onCancel={() => setDeleteTarget(null)} />
    </PageShell>
  );
}
