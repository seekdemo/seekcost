"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { useI18n } from "@/components/I18nProvider";
import { api } from "@/lib/api";
import { ALERT_INBOX_CHANGED, alertBand, type AlertInbox } from "@/lib/alerts";

export default function NotificationsPage() { return <AuthGuard><Inbox /></AuthGuard>; }
function Inbox() {
  const { localeTag } = useI18n(); const zh = localeTag.startsWith("zh");
  const text = (cn: string, en: string) => zh ? cn : en;
  const [unread, setUnread] = useState(false), [data, setData] = useState<AlertInbox | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    const id = ++generation.current; setLoading(true); setError("");
    try { const result = await api.alertInbox(unread); if (id === generation.current) setData(result); }
    catch (e) { if (id === generation.current) setError(e instanceof Error ? e.message : "Could not load notifications"); }
    finally { if (id === generation.current) setLoading(false); }
  }, [unread]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); generation.current++; };
  }, [load]);
  async function markRead(id?: number) {
    if (busy) return; setBusy(true); setError("");
    try {
      if (id) await api.readAlert(id); else await api.readAllAlerts();
      window.dispatchEvent(new Event(ALERT_INBOX_CHANGED));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not mark read"); }
    finally { setBusy(false); }
  }
  return <div className="page-shell mx-auto max-w-4xl space-y-5 pb-24">
    <header className="page-header"><div><h1 className="page-title">{text("通知中心", "Notifications")}</h1><p className="page-description">{text("只在值得关注时提醒，保留每一次触发依据。", "Attention-worthy changes, with the evidence behind each alert.")}</p></div><Link href="/alerts" className="ui-button min-h-11">{text("管理提醒规则", "Manage alert rules")}</Link></header>
    <div className="flex flex-wrap justify-between gap-3 rounded-lg border border-themed bg-surface p-3"><div className="flex gap-2" role="group" aria-label={text("通知筛选", "Notification filter")}><button disabled={busy} onClick={() => setUnread(false)} aria-pressed={!unread} className={`ui-button min-h-11 ${!unread ? "text-accent bg-[var(--accent-bg)]" : ""}`}>{text("全部", "All")}</button><button disabled={busy} onClick={() => setUnread(true)} aria-pressed={unread} className={`ui-button min-h-11 ${unread ? "text-accent bg-[var(--accent-bg)]" : ""}`}>{text("未读", "Unread")} {data ? `(${data.unread_count})` : ""}</button></div><div className="flex gap-2"><button disabled={busy || loading} onClick={() => void load()} className="ui-button min-h-11">{text("刷新", "Refresh")}</button><button disabled={busy || !data?.unread_count || loading} onClick={() => void markRead()} className="ui-button min-h-11 disabled:opacity-40">{text("全部已读", "Mark all read")}</button></div></div>
    {error && <p role="alert" className="rounded-lg border border-red-400/30 p-4 text-sm text-red-400">{error}</p>}
    {loading ? <p role="status" className="p-10 text-center text-muted">{text("正在加载通知…", "Loading notifications…")}</p> : data?.items.length ? <div className="space-y-3">{data.items.map(note => <article key={note.id} data-testid="alert-notification" className={`min-w-0 rounded-xl border bg-surface p-5 sm:p-6 ${note.read_at ? "border-themed" : "border-[var(--accent)]/35"}`}>
      <div className="flex flex-wrap justify-between gap-2"><span className="text-sm font-semibold text-accent">{note.symbol} · {text("进入关注范围", "Entered attention range")}</span>{!note.read_at && <span className="rounded-full bg-[var(--accent-bg)] px-2 py-1 text-xs text-accent">{text("未读", "Unread")}</span>}</div><h2 className="mt-2 break-words text-lg font-semibold text-primary">{note.rule_name}</h2><p className="mt-2 text-sm text-secondary">SMA {note.evidence.period} · {alertBand(note.evidence.side, note.evidence.tolerance, zh)}</p>
      <dl className="my-4 grid grid-cols-3 gap-2 rounded-lg bg-input p-3 text-sm"><div><dt className="text-xs text-muted">{text("触发价格", "Price")}</dt><dd className="mt-1 break-all font-semibold tabular-nums text-primary">{note.evidence.price.toFixed(3)}</dd></div><div><dt className="text-xs text-muted">SMA {note.evidence.period}</dt><dd className="mt-1 break-all font-semibold tabular-nums text-primary">{note.evidence.sma.toFixed(3)}</dd></div><div><dt className="text-xs text-muted">{text("偏离幅度", "Distance")}</dt><dd className="mt-1 font-semibold tabular-nums text-accent">{note.evidence.gap_pct > 0 ? "+" : ""}{note.evidence.gap_pct.toFixed(2)}%</dd></div></dl>
      <p className="text-xs leading-5 text-muted">{note.evidence.source} · {note.evidence.currency} · {text("行情时间", "Quote time")} {new Date(note.evidence.quote_at * 1000).toLocaleString(localeTag)}</p><p className="mt-1 text-xs text-muted">{text("均线截至", "SMA through")} {note.evidence.sma_through}</p><p className="mt-1 text-xs text-muted">{text("通知生成于", "Created")} {new Date(note.created_at).toLocaleString(localeTag)}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">{!note.read_at && <button disabled={busy} onClick={() => void markRead(note.id)} className="ui-button min-h-11">{text("标为已读", "Mark read")}</button>}{note.stock_id && <Link href={`/watchlist/${note.stock_id}`} className="ui-button min-h-11 text-accent">{text("查看股票", "View stock")} →</Link>}</div>
    </article>)}{data.next_cursor && <button disabled={busy} className="ui-button min-h-11 w-full" onClick={async () => {
      if (!data.next_cursor || busy) return; setBusy(true); const id = generation.current;
      try { const result = await api.alertInbox(unread, data.next_cursor); if (id === generation.current) setData({ ...result, items: [...data.items, ...result.items] }); }
      catch (e) { setError(e instanceof Error ? e.message : "Could not load more"); } finally { setBusy(false); }
    }}>{busy ? text("加载中…", "Loading…") : text("加载更早通知", "Load earlier notifications")}</button>}</div> : !error && <section className="rounded-xl border border-dashed border-themed bg-surface p-10 text-center"><h2 className="text-lg font-semibold text-primary">{unread ? text("暂无未读通知", "You're all caught up") : text("暂无提醒通知", "No alerts yet")}</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">{text("规则触发后会出现在这里。行情异常不会被当成价格提醒，检测状态可在规则页查看。", "Triggered rules appear here. Data errors never become price alerts; check rule status for details.")}</p><Link href="/alerts" className="ui-button mt-5 min-h-11">{text("查看提醒规则", "View alert rules")}</Link></section>}
    <p className="text-xs leading-5 text-muted">{text("提醒仅供关注，不构成买卖建议。历史通知保留触发时的数据，不随当前行情变化。", "Alerts are for attention, not trading recommendations. Historical evidence stays fixed as prices change.")}</p>
  </div>;
}
