"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useRef } from "react";
import { useI18n } from "@/components/I18nProvider";
import { api } from "@/lib/api";
import type { WatchlistMemo, WatchlistResearchProfile } from "@/lib/types";
import QuickMemoPad from "./QuickMemoPad";

function mapMemo(raw: Record<string, unknown>): WatchlistMemo {
  return { id: Number(raw.id), user_id: Number(raw.user_id), stock_id: Number(raw.stock_id), content: String(raw.content || ""), pinned: Boolean(raw.pinned), converted_note_id: raw.converted_note_id == null ? null : Number(raw.converted_note_id), created_at: String(raw.created_at), updated_at: String(raw.updated_at) };
}

export default function ResearchSupportPanel({ profile, onChange }: { profile: WatchlistResearchProfile; onChange: (profile: WatchlistResearchProfile) => void }) {
  const { t } = useI18n();
  const current = useRef({ profile, onChange });
  useLayoutEffect(() => { current.current = { profile, onChange }; }, [profile, onChange]);
  const update = useCallback((transform: (profile: WatchlistResearchProfile) => WatchlistResearchProfile) => {
    const next = transform(current.current.profile);
    current.current.profile = next;
    current.current.onChange(next);
  }, []);
  const save = useCallback(async (content: string, id: number | null) => {
    const memo = mapMemo(await (id == null ? api.createStockMemo({ stock_id: current.current.profile.stock_id, content, pinned: false }) : api.updateStockMemo(id, { content })));
    update(profile => ({ ...profile, memos: [memo, ...profile.memos.filter(item => item.id !== memo.id)] }));
    return memo;
  }, [update]);
  const pin = async (memo: WatchlistMemo) => {
    const updated = mapMemo(await api.updateStockMemo(memo.id, { pinned: !memo.pinned }));
    update(profile => ({ ...profile, memos: profile.memos.map(item => item.id === memo.id ? updated : item) }));
  };
  const remove = async (memo: WatchlistMemo) => {
    await api.deleteStockMemo(memo.id);
    update(profile => ({ ...profile, memos: profile.memos.filter(item => item.id !== memo.id) }));
  };
  const upgrade = async (memo: WatchlistMemo) => {
    const note = await api.convertStockMemoToNote(memo.id);
    const linked = { id: note.id, title: note.title, kind: note.kind, status: note.status, starred: note.starred, updated_at: note.updated_at };
    update(profile => ({ ...profile, memos: profile.memos.map(item => item.id === memo.id ? { ...item, converted_note_id: note.id } : item), linked_research: [linked, ...profile.linked_research.filter(item => item.id !== note.id)] }));
  };
  return <section aria-labelledby="support-title" className="mt-12 border-t border-themed pt-8">
    <QuickMemoPad key={profile.stock_id} memos={profile.memos} save={save} remove={remove} pin={pin} upgrade={upgrade} />
    <div className="mt-10 border-t border-themed pt-6"><h2 className="text-base font-semibold text-primary">{t("dossier.linkedResearch")}</h2><p className="mt-2 text-sm text-muted">{t("dossier.linkedResearchDescription")}</p><div className="mt-4 space-y-2">{profile.linked_research.length === 0 ? <p className="text-sm text-muted">{t("dossier.noLinkedResearch")}</p> : profile.linked_research.map(item => <Link key={item.id} href={`/research/${item.id}`} className="flex min-h-12 items-center justify-between gap-3 border-b border-themed py-3 text-sm text-secondary"><span className="min-w-0 truncate">{item.title || t("watchlist.unnamedResearch")}</span><span className="text-xs text-muted">{item.kind}</span></Link>)}</div></div>
  </section>;
}
