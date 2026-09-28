"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import MarkdownEditor from "@/components/MarkdownEditor";
import MarkdownPreview from "@/components/MarkdownPreview";
import { useI18n } from "@/components/I18nProvider";
import { api } from "@/lib/api";
import { markdownPlainText, storedTextToMarkdown } from "@/lib/markdown";
import type { ResearchNote, ResearchTopic } from "@/lib/types";

type Visibility = "private" | "workspace" | "public";

interface SeriesItem {
  id: string;
  userId: string;
  name: string;
  description: string;
  visibility: Visibility;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
  author: { id: string; nickname: string };
}

interface SeriesNote {
  id: string;
  title: string;
  content: string;
  format: "markdown" | "rich";
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  author: { nickname: string };
}

function mapSeries(raw: ResearchTopic, t: (key: string) => string): SeriesItem {
  const author = raw.author;
  return {
    id: String(raw.id),
    userId: String(raw.user_id),
    name: String(raw.name || t("research.topicUntitled")),
    description: storedTextToMarkdown(String(raw.description || "")),
    visibility: (raw.visibility as Visibility) || "private",
    noteCount: Number(raw.note_count || 0),
    createdAt: String(raw.created_at || ""),
    updatedAt: String(raw.updated_at || ""),
    author: { id: String(author.id), nickname: author.nickname },
  };
}

function mapNote(raw: ResearchNote, t: (key: string) => string): SeriesNote {
  return {
    id: String(raw.id),
    title: String(raw.title || t("research.untitled")),
    content: String(raw.content || ""),
    format: raw.format === "rich" ? "rich" : "markdown",
    createdAt: String(raw.created_at || ""),
    updatedAt: String(raw.updated_at || ""),
    commentCount: Number(raw.comment_count || 0),
    author: { nickname: t("research.you") },
  };
}

function plainText(note: SeriesNote) {
  return note.content.replace(/<[^>]*>/g, " ").replace(/[#>*_`~\[\]()!-]/g, " ").replace(/\s+/g, " ").trim();
}

function fmtDate(value: string, locale: string) {
  return value ? new Date(value).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" }) : "";
}

export default function Page() {
  return <ResearchTopicsPage />;
}

export function ResearchTopicsPage({ initialSeriesId }: { initialSeriesId?: string } = {}) {
  return <AuthGuard><SeriesContent initialSeriesId={initialSeriesId} /></AuthGuard>;
}

function SeriesContent({ initialSeriesId }: { initialSeriesId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, localeTag } = useI18n();
  const [mine, setMine] = useState<SeriesItem[]>([]);
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SeriesItem | null>(null);
  const [notes, setNotes] = useState<SeriesNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SeriesItem | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const loadLists = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [mineRows, favorites] = await Promise.all([
        api.listNoteSeries(),
        api.listNoteFavorites(),
      ]);
      setMine(mineRows.map((series) => mapSeries(series, t)));
      const favoriteNames = new Set(favorites.series.map(String));
      setFavoriteKeys(mineRows.filter((series) => favoriteNames.has(series.name) || series.starred).map((series) => `id:${series.id}`));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("research.topicLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLists(), 0);
    return () => window.clearTimeout(timer);
  }, [loadLists]);

  useEffect(() => {
    const seriesId = initialSeriesId || searchParams.get("series");
    if (!seriesId) {
      const timer = window.setTimeout(() => {
        setSelected(null);
        setNotes([]);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    Promise.all([api.getNoteSeries(seriesId), api.listNotesInSeries(seriesId)])
      .then(([seriesRow, noteRows]) => {
        if (cancelled) return;
        const item = mapSeries(seriesRow, t);
        setSelected(item);
        setNotes(noteRows.map((note) => mapNote(note, t)));
      })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : t("research.topicDetailLoadFailed")); });
    return () => { cancelled = true; };
  }, [initialSeriesId, searchParams, mine, t]);

  const visibleItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return mine
      .filter((series) => !keyword || `${series.name} ${series.description}`.toLowerCase().includes(keyword))
      .sort((a, b) => Number(favoriteKeys.includes(`id:${b.id}`)) - Number(favoriteKeys.includes(`id:${a.id}`)) || b.updatedAt.localeCompare(a.updatedAt));
  }, [mine, query, favoriteKeys]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setConfirmingDelete(false);
    setFormOpen(true);
  };

  const openEdit = (series: SeriesItem) => {
    setEditing(series);
    setName(series.name);
    setDescription(series.description);
    setConfirmingDelete(false);
    setFormOpen(true);
  };

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const payload = { name: name.trim(), description: description.trim(), visibility: "private" };
      const saved = editing ? await api.updateNoteSeries(editing.id, payload) : await api.createNoteSeries(payload);
      setFormOpen(false);
      await loadLists();
      router.push(`/research/topics/${encodeURIComponent(String(saved.id))}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("research.topicSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing || !confirmingDelete) return;
    setSaving(true);
    try {
      await api.deleteNoteSeries(editing.id);
      setFormOpen(false);
      setSelected(null);
      router.push("/research/topics");
      await loadLists();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("research.topicDeleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  const toggleFavorite = (series: SeriesItem) => {
    const key = `id:${series.id}`;
    const favorite = favoriteKeys.includes(key);
    setFavoriteKeys((current) => favorite ? current.filter((item) => item !== key) : [...current, key]);
    const request = favorite ? api.unfavoriteNoteSeries(series.name) : api.favoriteNoteSeries(series.name);
    void request.catch((favoriteError) => {
      setFavoriteKeys((current) => favorite ? [...new Set([...current, key])] : current.filter((item) => item !== key));
      setError(favoriteError instanceof Error ? favoriteError.message : t("research.topicStarFailed"));
    });
  };

  const selectedOwned = !!selected;

  return (
    <div className="page-shell page-shell--wide">
      <header className="page-header">
        <div>
          <Link href="/research" className="mb-3 inline-flex min-h-8 items-center text-xs text-muted transition hover:text-accent">← {t("research.backLibrary")}</Link>
          <p className="page-eyebrow">Research threads</p>
          <h1 className="page-title">{t("research.topicTitle")}</h1>
          <p className="page-description">{t("research.topicDescription")}</p>
        </div>
        {!selected && (
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:min-w-[440px]">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("research.topicSearch")} className="min-w-0 flex-1 rounded-lg border border-themed bg-input px-3 py-2 text-sm text-primary outline-none placeholder:text-muted focus:border-[var(--accent)]" />
            <button type="button" onClick={openCreate} className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-dark)]">{t("research.topicNew")}</button>
          </div>
        )}
      </header>

      {error && <div className="inline-notice inline-notice--danger">{error}</div>}

      {formOpen && (
        <section className="border-b border-themed pb-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-3">
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={128} placeholder={t("research.topicNamePlaceholder")} className="w-full border-b border-themed bg-transparent px-1 py-2 text-xl font-semibold text-primary outline-none placeholder:text-muted focus:border-[var(--accent)]" />
              <MarkdownEditor label={t("research.topicDescriptionLabel")} value={description} onChange={setDescription} onSave={save} saveState={saving ? "saving" : error ? "failed" : "unsaved"} placeholder={t("research.topicDescriptionPlaceholder")} minHeight="180px" maxLength={2000} emptyLabel={t("research.topicDescriptionPreview")} />
            </div>
            <div className="space-y-3">
              <div className="rounded-md border border-themed bg-surface px-3 py-2 text-xs leading-5 text-muted">{t("research.topicPrivate")}</div>
              <div className="flex flex-wrap justify-end gap-2">
                {editing && (confirmingDelete ? (
                  <button type="button" onClick={() => void remove()} disabled={saving} className="rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-300">{t("research.confirmDelete")}</button>
                ) : (
                  <button type="button" onClick={() => setConfirmingDelete(true)} className="rounded-md px-3 py-2 text-sm text-muted hover:bg-red-500/10 hover:text-red-300">{t("research.delete")}</button>
                ))}
                <button type="button" onClick={() => setFormOpen(false)} className="rounded-md border border-themed px-3 py-2 text-sm text-secondary">{t("research.cancel")}</button>
                <button type="button" onClick={() => void save()} disabled={saving || !name.trim()} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50">{saving ? t("research.saving") : t("research.save")}</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {selected ? (
        <section>
          <div className="flex flex-col gap-4 border-b border-themed pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <button type="button" onClick={() => router.push("/research/topics")} className="text-xs text-muted hover:text-accent">← {t("research.topicBackList")}</button>
              <h2 className="mt-3 text-2xl font-bold text-primary">{selected.name}</h2>
              {selected.description && <MarkdownPreview source={selected.description} className="mt-3 max-w-3xl" />}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
                <span>{t("research.privateOnly")}</span><span>{t("research.topicItems", { count: selected.noteCount })}</span><span>{t("research.topicUpdated", { date: fmtDate(selected.updatedAt, localeTag) })}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => toggleFavorite(selected)} className={`px-2 text-2xl leading-none transition ${favoriteKeys.includes(`id:${selected.id}`) ? "text-amber-400" : "text-muted hover:text-primary"}`} aria-label={favoriteKeys.includes(`id:${selected.id}`) ? t("research.topicUnstar") : t("research.topicStar")}>{favoriteKeys.includes(`id:${selected.id}`) ? "★" : "☆"}</button>
              {selectedOwned && <button type="button" onClick={() => openEdit(selected)} className="rounded-md border border-themed px-3 py-2 text-sm text-secondary hover:text-primary">{t("research.topicEdit")}</button>}
            </div>
          </div>
          <div className="divide-y divide-themed">
            {notes.length ? notes.map((note) => (
              <article key={note.id} className="py-5">
                <Link href={`/research/${encodeURIComponent(note.id)}`} className="group block">
                  <h3 className="text-lg font-semibold text-primary transition group-hover:text-accent">{note.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-secondary">{plainText(note) || t("research.noBody")}</p>
                </Link>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted"><span>{t("research.published")} {fmtDate(note.createdAt, localeTag)}</span><span>{t("research.updated")} {fmtDate(note.updatedAt, localeTag)}</span><span>{t("research.comments", { count: note.commentCount })}</span></div>
              </article>
            )) : <div className="py-20 text-center text-sm text-muted">{t("research.topicEmpty")}</div>}
          </div>
        </section>
      ) : loading ? (
        <div className="py-20 text-center text-sm text-muted">{t("research.topicLoading")}</div>
      ) : visibleItems.length ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((series) => (
            <article key={series.id} className="group flex min-h-48 flex-col rounded-[var(--radius-lg)] border border-themed bg-surface p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)]">
              <button type="button" onClick={() => router.push(`/research/topics/${encodeURIComponent(series.id)}`)} className="min-h-0 flex-1 text-left">
                <div className="flex items-start justify-between gap-3"><h2 className="line-clamp-2 text-lg font-semibold leading-7 text-primary">{series.name}</h2>{favoriteKeys.includes(`id:${series.id}`) && <span className="text-amber-400" aria-label={t("research.starredLabel")}>★</span>}</div>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-secondary">{markdownPlainText(series.description) || t("research.topicNoDescription")}</p>
              </button>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-themed pt-3 text-xs text-muted"><span className="truncate">{t("research.topicItems", { count: series.noteCount })}</span><span className="shrink-0">{t("research.privateOnly")}</span></div>
            </article>
          ))}
        </section>
      ) : (
        <div className="py-20 text-center text-sm text-muted">{t("research.topicNoMatches")}</div>
      )}
    </div>
  );
}
