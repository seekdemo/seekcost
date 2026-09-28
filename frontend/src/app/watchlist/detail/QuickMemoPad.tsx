"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import ConfirmModal from "@/components/ConfirmModal";
import type { WatchlistMemo } from "@/lib/types";
import "./quick-memo.css";

export default function QuickMemoPad({ memos, save, remove, pin, upgrade }: {
  memos: WatchlistMemo[];
  save: (content: string, id: number | null) => Promise<WatchlistMemo>;
  remove: (memo: WatchlistMemo) => Promise<void>;
  pin: (memo: WatchlistMemo) => Promise<void>;
  upgrade: (memo: WatchlistMemo) => Promise<void>;
}) {
  const { t, localeTag } = useI18n();
  const text = (cn: string, en: string) => localeTag.startsWith("zh") ? cn : en;
  const [value, setValue] = useState("");
  const [baseline, setBaseline] = useState("");
  const [id, setId] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [error, setError] = useState("");
  const [composing, setComposing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [deleting, setDeleting] = useState<WatchlistMemo | null>(null);
  const [isNew, setIsNew] = useState(true);
  const [pending, setPending] = useState<WatchlistMemo | null | undefined>(undefined);
  const input = useRef<HTMLTextAreaElement>(null);
  const dirty = value !== baseline;
  const locked = dirty || status === "saving" || actionBusy;

  useEffect(() => {
    if (pending === undefined || dirty || status === "saving" || status === "failed") return;
    const timer = setTimeout(() => {
      setId(pending?.id ?? null); setValue(pending?.content ?? ""); setBaseline(pending?.content ?? "");
      setIsNew(!pending); setStatus(pending ? "saved" : "idle"); setError(""); setPending(undefined);
      requestAnimationFrame(() => input.current?.focus());
    }, 0);
    return () => clearTimeout(timer);
  }, [pending, dirty, status]);

  useEffect(() => {
    if (!dirty || !value.trim() || composing || status === "saving" || status === "failed") return;
    const timer = setTimeout(() => {
      setStatus("saving");
      setError("");
      void save(value, id).then(memo => {
        setId(memo.id);
        setBaseline(value);
        setStatus("saved");
      }).catch(reason => {
        setError(reason instanceof Error ? reason.message : "Save failed");
        setStatus("failed");
      });
    }, pending !== undefined ? 0 : 900);
    return () => clearTimeout(timer);
  }, [value, baseline, id, status, composing, dirty, save, pending]);

  useEffect(() => {
    if (!dirty && status !== "saving") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const guardLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || link.origin !== location.origin || (link.pathname === location.pathname && link.search === location.search)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      setError(localeTag.startsWith("zh") ? "速记尚未保存，请等待保存完成，或先重试、撤销修改。" : "Your memo is not saved yet. Wait for saving, retry, or revert your changes before leaving.");
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", warn); window.removeEventListener("click", guardLink, true); };
  }, [dirty, status, localeTag]);

  const select = (memo?: WatchlistMemo) => {
    if (actionBusy || composing) return;
    if (dirty || status === "saving") {
      if (!value.trim()) { setError(text("内容为空，请先撤销修改；删除请使用更多菜单。", "Revert the empty edit first. Use More to delete a memo.")); return; }
      setPending(memo ?? null); return;
    }
    setId(memo?.id ?? null); setValue(memo?.content ?? ""); setBaseline(memo?.content ?? "");
    setIsNew(!memo);
    setStatus(memo ? "saved" : "idle"); setError("");
    requestAnimationFrame(() => { input.current?.focus(); input.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
  };
  const action = async (run: () => Promise<void>) => {
    if (locked) return;
    setActionBusy(true); setError("");
    try { await run(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Request failed"); }
    finally { setActionBusy(false); }
  };
  const sorted = [...memos].filter(memo => !(isNew && memo.id === id)).sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));
  const stateLabel = status === "saving" ? text("正在保存…", "Saving…") : status === "failed" ? text("保存失败，内容仍保留", "Save failed — draft retained") : dirty ? (value.trim() ? text("等待自动保存…", "Waiting to save…") : text("内容为空，未覆盖已保存记录", "Empty text will not overwrite the saved memo")) : status === "saved" ? text("✓ 已自动保存", "✓ Saved") : text("停笔后自动保存", "Saves after you pause");

  const composer = <div className="quick-memo-composer" data-state={status}>
      {!isNew && <p className="quick-memo-editing">{text("编辑速记", "Editing memo")}</p>}
      <textarea ref={input} disabled={actionBusy} readOnly={pending !== undefined && status !== "failed"} aria-label={t("dossier.quickMemos")} value={value} rows={2} placeholder={t("dossier.memoPlaceholder")} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); select(); } }} onChange={event => setValue(event.target.value)} />
      <div className="quick-memo-status"><span role="status">{stateLabel}</span>{status === "failed" && <button type="button" onClick={() => setStatus("idle")}>{text("重试", "Retry")}</button>}{dirty && status !== "saving" && <button type="button" onClick={() => { setPending(undefined); setValue(baseline); setStatus(id ? "saved" : "idle"); setError(""); }}>{text("撤销修改", "Revert changes")}</button>}{(value || !isNew) && <button type="button" className="quick-memo-done" disabled={composing || actionBusy || pending !== undefined} onClick={() => select()}>{pending !== undefined ? text("保存后继续…", "Finishing…") : text("完成", "Done")}</button>}</div>
      {error && <p role="alert" className="quick-memo-error">{error}</p>}
    </div>;
  return <div className="quick-memo-pad">
    <div className="quick-memo-heading"><div><h2 id="support-title">{t("dossier.quickMemos")}</h2><p>{text("随手记下观察与问题，自动保存。", "Capture observations and questions. Saved automatically.")}</p></div>{!isNew && <button type="button" disabled={actionBusy || pending !== undefined} onClick={() => select()}>{text("新建速记", "New memo")} ＋</button>}</div>
    {isNew && composer}
    {isNew && value && <p className="quick-memo-hint">{text("完成后可继续记下一条 · ⌘ / Ctrl + Enter", "Done starts a fresh memo · ⌘ / Ctrl + Enter")}</p>}
    <div className="quick-memo-list">{sorted.length ? sorted.map(memo => <article key={memo.id} className="quick-memo-card" data-active={id === memo.id}>
      {!isNew && id === memo.id ? composer : <><p>{memo.content}</p><div className="quick-memo-meta"><time dateTime={memo.updated_at}>{new Date(memo.updated_at).toLocaleString(localeTag, {month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</time>{memo.pinned && <span>{text("已置顶", "Pinned")}</span>}</div>
      <div className="quick-memo-actions"><button type="button" disabled={actionBusy || pending !== undefined} onClick={() => select(memo)}>{t("stock.edit")}</button><details><summary>{text("更多", "More")} ···</summary><div><button type="button" disabled={locked} onClick={() => void action(() => pin(memo))}>{memo.pinned ? t("dossier.unpin") : t("dossier.pin")}</button><button type="button" disabled={locked || memo.converted_note_id != null} onClick={() => void action(() => upgrade(memo))}>{memo.converted_note_id ? t("dossier.upgraded") : text("转为研究记录", "Convert to research")}</button><button type="button" disabled={locked} onClick={() => setDeleting(memo)}>{t("dossier.delete")}</button></div></details></div></>}
    </article>) : !value && <p className="quick-memo-empty">{text("写下第一条想法，不必整理成文章。", "Start with one thought — no need for a full article.")}</p>}</div>
    <ConfirmModal open={Boolean(deleting)} title={text("删除这条速记？", "Delete this memo?")} message={text("删除后无法恢复，已转为研究记录的内容不受影响。", "This cannot be undone. Converted research records are unaffected.")} confirmText={t("dossier.delete")} cancelText={t("dossier.cancel")} onCancel={() => setDeleting(null)} onConfirm={() => { const memo = deleting; setDeleting(null); if (memo) void action(async () => { await remove(memo); if (memo.id === id) { setId(null); setValue(""); setBaseline(""); setStatus("idle"); } }); }} />
  </div>;
}
