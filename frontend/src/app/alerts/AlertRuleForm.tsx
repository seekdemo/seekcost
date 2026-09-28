"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { alertBand, type AlertRuleWrite, type AlertSide } from "@/lib/alerts";

export interface AlertStock { id: number; symbol: string; name: string }
export default function AlertRuleForm({ initial, stocks, editing, onSave, onCancel }: {
  initial: AlertRuleWrite; stocks: AlertStock[]; editing: boolean;
  onSave: (value: AlertRuleWrite) => Promise<void>; onCancel: () => void;
}) {
  const { localeTag } = useI18n();
  const zh = localeTag.startsWith("zh");
  const text = (cn: string, en: string) => zh ? cn : en;
  const [draft, setDraft] = useState(initial);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const lastStock = useRef(initial.stock_id);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); ref.current?.closest("section")?.scrollIntoView({ block: "start" }); }, []);
  const stock = stocks.find(item => item.id === draft.stock_id);
  const matches = stocks.filter(item => item.id === draft.stock_id || `${item.symbol} ${item.name}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="alerts-editor" aria-labelledby="rule-editor-title">
    <div className="alerts-editor-heading"><h2 id="rule-editor-title" className="text-lg font-semibold text-primary">{editing ? text("编辑提醒", "Edit alert") : text("新建提醒", "New alert")}</h2><p>{text("选择关注范围，设定价格条件。保存前可查看规则预览。", "Choose coverage and a price condition. Review the summary before saving.")}</p></div>
    <form className="mt-5 space-y-5" onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      setBusy(true); setError("");
      try { await onSave(draft); } catch (e) { setError(e instanceof Error ? e.message : text("保存失败，请重试", "Could not save. Retry.")); setBusy(false); }
    }}>
      <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2 disabled:opacity-60">
        <label className="grid gap-2 text-sm text-secondary sm:col-span-2">{text("提醒名称", "Alert name")}<input ref={ref} required maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="alert-input" placeholder={text("例如：回到中期均线附近", "e.g. Near the medium-term average")} /></label>
        <h3 className="alerts-form-section"><span>01</span>{text("关注哪些股票", "Choose your coverage")}</h3>
        <div className="grid gap-3 text-sm text-secondary sm:col-span-2">
          <span id="alert-scope-label">{text("检测范围", "Coverage")}</span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="alert-scope-label">
            <button type="button" aria-pressed={draft.scope !== "watchlist"} onClick={() => setDraft({ ...draft, scope: "single", stock_id: lastStock.current || stocks[0]?.id || null })} className={`min-h-12 rounded-lg border px-3 py-3 text-left ${draft.scope !== "watchlist" ? "border-[var(--accent)] bg-[var(--accent-bg)] text-accent" : "border-themed"}`}>{text("单只股票", "One stock")}</button>
            <button type="button" aria-pressed={draft.scope === "watchlist"} onClick={() => { lastStock.current = draft.stock_id ?? lastStock.current; setDraft({ ...draft, scope: "watchlist", stock_id: null }); }} className={`min-h-12 rounded-lg border px-3 py-3 text-left ${draft.scope === "watchlist" ? "border-[var(--accent)] bg-[var(--accent-bg)] text-accent" : "border-themed"}`}>{text("全部自选股", "All watchlist stocks")}</button>
          </div>
          {draft.scope === "watchlist" && <p className="text-sm leading-6 text-muted" data-testid="alert-coverage">{zh ? `当前覆盖 ${stocks.length} 只标的。以后新增的自选股自动纳入，每只股票独立触发、独立冷却。` : `Covers ${stocks.length} stocks. New watchlist additions join automatically. Each stock triggers and cools down independently.`}</p>}
        </div>
        {draft.scope !== "watchlist" && <div className="grid gap-2 text-sm text-secondary sm:col-span-2">
          <label htmlFor="alert-stock-search">{text("选择自选股", "Choose a watchlist stock")}</label>
          <div className="grid gap-2 sm:grid-cols-2"><input id="alert-stock-search" type="search" value={query} onChange={e => setQuery(e.target.value)} className="alert-input" placeholder={text("搜索代码或名称", "Search symbol or name")} />
            <select aria-label={text("提醒标的", "Alert stock")} className="alert-input" value={draft.stock_id || ""} required onChange={e => setDraft({ ...draft, stock_id: Number(e.target.value) })}><option value="" disabled>{text("请选择标的", "Select a stock")}</option>{matches.map(item => <option key={item.id} value={item.id}>{item.symbol} · {item.name}</option>)}</select></div>
        </div>}
        <h3 className="alerts-form-section"><span>02</span>{text("什么时候提醒", "Set the trigger")}</h3>
        <div className="grid gap-2 text-sm text-secondary"><label htmlFor="alert-period">{text("均线周期（交易日）", "SMA period (sessions)")}</label><input id="alert-period" className="alert-input" type="number" min={2} max={250} step={1} required value={draft.period || ""} onChange={e => setDraft({ ...draft, period: Number(e.target.value) })} />
          <div className="flex flex-wrap gap-2">{[5, 10, 20, 60, 120, 250].map(n => <button key={n} type="button" aria-pressed={draft.period === n} onClick={() => setDraft({ ...draft, period: n })} className={`min-h-10 rounded-md border px-3 ${draft.period === n ? "border-[var(--accent)] text-accent bg-[var(--accent-bg)]" : "border-themed"}`}>{n}</button>)}</div></div>
        <div className="grid content-start gap-2 text-sm text-secondary"><label htmlFor="alert-tolerance">{text("距均线百分比（%）", "Distance from SMA (%)")}</label><input id="alert-tolerance" type="number" min={0.1} max={20} step={0.1} required className="alert-input" value={draft.tolerance || ""} onChange={e => setDraft({ ...draft, tolerance: Number(e.target.value) })} /><span className="text-xs text-muted">{text("例如 2 表示距均线不超过 2%", "For example, 2 means within 2% of the SMA")}</span></div>
        <label className="grid content-start gap-2 text-sm text-secondary">{text("关注方向", "Direction")}<select className="alert-input" value={draft.side} onChange={e => setDraft({ ...draft, side: e.target.value as AlertSide })}><option value="both">{text("均线上下都关注", "Either side of SMA")}</option><option value="above">{text("仅均线上方", "Above SMA only")}</option><option value="below">{text("仅均线下方", "Below SMA only")}</option></select></label>
        <label className="grid gap-2 text-sm text-secondary">{text("提醒冷却时间", "Notification cooldown")}<select className="alert-input" value={draft.cooldown_minutes} onChange={e => setDraft({ ...draft, cooldown_minutes: Number(e.target.value) })}>{[[30, "30 分钟", "30 minutes"], [60, "1 小时", "1 hour"], [240, "4 小时", "4 hours"], [1440, "24 小时", "24 hours"], [10080, "7 天", "7 days"]].map(([value, cn, en]) => <option key={value} value={value}>{text(String(cn), String(en))}</option>)}</select></label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-secondary sm:col-span-2"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" />{text("保存后启用后台检测", "Enable background checks after saving")}</label>
      </fieldset>
      <div className="rounded-lg border border-themed bg-[var(--accent-bg)] p-4" data-testid="alert-summary"><p className="text-sm font-medium leading-6 text-primary">{zh ? `当 ${draft.scope === "watchlist" ? "全部自选股中任一标的" : stock?.symbol || "所选标的"} 的价格进入 ${draft.period || "N"} 日均线${alertBand(draft.side, draft.tolerance, zh)}范围时，提醒我关注。` : `Notify me when ${draft.scope === "watchlist" ? "any watchlist stock" : stock?.symbol || "the stock"} enters ${alertBand(draft.side, draft.tolerance, zh)} of its ${draft.period || "N"}-session SMA.`}</p><p className="mt-2 text-xs leading-5 text-muted">{text("首次已在范围内也会提醒；持续停留不重复。离开后再进入才会重新提醒，冷却期间的进入不补发。", "The first in-range check also notifies. Staying in range does not repeat. Re-entry during cooldown is suppressed, not deferred.")}</p></div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="alerts-form-actions"><button type="button" disabled={busy} onClick={onCancel} className="ui-button min-h-11">{text("取消", "Cancel")}</button><button type="submit" disabled={busy} className="ui-button alerts-primary">{busy ? text("正在保存…", "Saving…") : text("保存提醒", "Save alert")}</button></div>
    </form>
  </section>;
}
