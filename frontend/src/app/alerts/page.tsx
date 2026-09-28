"use client";
import "./alerts.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import ConfirmModal from "@/components/ConfirmModal";
import { useI18n } from "@/components/I18nProvider";
import { api } from "@/lib/api";
import { alertBand, alertStatus, type AlertRule, type AlertRuleWrite } from "@/lib/alerts";
import AlertRuleForm, { type AlertStock } from "./AlertRuleForm";

type Filter = "all" | "enabled" | "paused" | "attention";
const needsAttention = (rule: AlertRule) => rule.enabled && (["provider_error", "insufficient_data", "invalid_data"].includes(rule.status) || (rule.unavailable_count ?? 0) > 0);
export default function AlertsPage() { return <AuthGuard><AlertsContent /></AuthGuard>; }
function AlertsContent() {
  const { localeTag } = useI18n();
  const zh = localeTag.startsWith("zh");
  const text = (cn: string, en: string) => zh ? cn : en;
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [stocks, setStocks] = useState<AlertStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{ id?: number; value: AlertRuleWrite } | null>(null);
  const [deleting, setDeleting] = useState<AlertRule | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const createRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const returnScroll = useRef(0);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [r, s] = await Promise.all([api.alertRules(), api.listWatchStocks()]);
      setRules(r); setStocks(s.map(item => ({ id: Number(item.id), symbol: String(item.symbol), name: String(item.name || "") })));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load alerts"); }
    finally { setLoading(false); }
  }, [setLoading, setError, setRules, setStocks]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    let alive = true;
    const timer = setInterval(async () => {
      if (document.hidden || editor || busy !== null || deleting || loading) return;
      try { const r = await api.alertRules(); if (alive) setRules(r); } catch { /* Manual refresh remains available. */ }
    }, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, [editor, busy, deleting, loading]);
  function openEditor(rule?: AlertRule) {
    returnFocus.current = document.activeElement as HTMLElement;
    returnScroll.current = window.scrollY;
    setFeedback("");
    setEditor(rule ? { id: rule.id, value: rule } : { value: { stock_id: stocks[0]?.id || null, scope: stocks.length ? "single" : "watchlist", name: "", period: 20, tolerance: 2, side: "both", cooldown_minutes: 1440, enabled: true } });
  }
  function closeEditor() {
    setEditor(null);
    requestAnimationFrame(() => {
      const editButton = editor?.id ? document.querySelector<HTMLElement>(`[data-rule-id="${editor.id}"] [data-edit-rule]`) : null;
      (editButton || (returnFocus.current?.isConnected ? returnFocus.current : createRef.current))?.focus({ preventScroll: true });
      window.scrollTo({ top: returnScroll.current });
    });
  }
  async function toggle(rule: AlertRule) {
    if (busy !== null) return;
    setBusy(rule.id); setError("");
    try {
      const updated = await api.updateAlertRule(rule.id, { ...rule, enabled: !rule.enabled });
      setRules(prev => prev.map(item => item.id === updated.id ? updated : item));
      setFeedback(updated.enabled ? text("提醒已启用，将在下一轮检测中生效。", "Alert enabled for the next check.") : text("提醒已暂停，历史通知仍然保留。", "Alert paused. Notification history retained."));
    } catch (e) { setError(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(null); }
  }
  const counts = { all: rules.length, enabled: rules.filter(r => r.enabled).length, paused: rules.filter(r => !r.enabled).length, attention: rules.filter(needsAttention).length };
  const statusLabel = (rule: AlertRule) => !rule.enabled ? text("已暂停，不再检测", "Paused · Checks stopped") : (rule.unavailable_count ?? 0) > 0 ? text(`${rule.unavailable_count} 只标的数据暂不可用`, `${rule.unavailable_count} stocks temporarily unavailable`) : alertStatus(rule.status, zh);
  const filters: [Filter, string][] = [["all", text("全部规则", "All rules")], ["enabled", text("已启用", "Enabled")], ["paused", text("已暂停", "Paused")], ["attention", text("需留意", "Needs attention")]];
  const visibleRules = rules.filter(rule => (filter === "all" || (filter === "enabled" && rule.enabled) || (filter === "paused" && !rule.enabled) || (filter === "attention" && needsAttention(rule))) && `${rule.name} ${rule.symbol} ${rule.stock_name} ${rule.scope === "watchlist" ? "全部自选股 all watchlist" : ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="page-shell alerts-workspace mx-auto max-w-6xl pb-24">
    <header className="alerts-heading">
      <div><p className="alerts-eyebrow">{text("价格观察", "PRICE WATCH")}</p><h1 className="page-title">{text("自定义提醒", "Custom alerts")}</h1><p className="page-description">{text("设好关注条件，不必反复盯盘。", "Set your conditions. Spend less time watching prices.")}</p></div>
      {!editor && <div className="alerts-heading-actions"><Link href="/notifications" className="ui-button min-h-11">{text("通知中心", "Notifications")} <span aria-hidden="true">↗</span></Link><button ref={createRef} disabled={loading || busy !== null} onClick={() => openEditor()} className="ui-button alerts-primary">＋ {text("新建提醒", "New alert")}</button></div>}
    </header>
    {error && <div role="alert" className="alerts-message is-error">{error}<button disabled={loading} onClick={() => void load()} className="ui-button">{text("重新加载", "Reload")}</button></div>}
    {feedback && <p role="status" className="alerts-message">{feedback}</p>}
    {editor ? <div className="alerts-editor-view"><AlertRuleForm key={editor.id ?? "new"} initial={editor.value} editing={!!editor.id} stocks={stocks} onCancel={closeEditor} onSave={async value => {
      const result = editor.id ? await api.updateAlertRule(editor.id, value) : await api.createAlertRule(value);
      setRules(prev => [result, ...prev.filter(item => item.id !== result.id)]);
      setFilter("all"); setQuery(""); closeEditor();
      setFeedback(result.enabled ? text("已保存，将在下一轮后台检测中生效。", "Saved. Checks begin on the next background cycle.") : text("已保存为暂停状态。", "Saved and paused."));
    }} /></div> : <>
      <section className="alerts-overview" aria-label={text("提醒概览", "Alert overview")}>
        <div><span>{text("启用中的规则", "Enabled rules")}</span><strong>{loading ? "—" : counts.enabled}<small>/ {counts.all}</small></strong></div>
        <div><span>{text("检测频率", "Check interval")}</span><strong>≈ 5 <small>{text("分钟", "min")}</small></strong></div>
        <div><span>{text("提醒方式", "Delivery")}</span><strong className="alerts-overview-text">{text("站内通知", "In-app")}</strong><Link href="/notifications">{text("查看提醒记录", "View notifications")} →</Link></div>
      </section>
      <section className="alerts-rulebook" aria-label={text("提醒规则", "Alert rules")}>
        <div className="alerts-toolbar"><div className="alerts-filters" role="group" aria-label={text("筛选规则", "Filter rules")}>{filters.map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<span>{counts[key]}</span></button>)}</div><div className="alerts-search-row"><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={text("搜索名称或股票代码", "Search name or symbol")} aria-label={text("搜索提醒", "Search alerts")} /><button className="ui-button" disabled={loading || busy !== null} onClick={() => void load()}>{loading ? text("加载中…", "Loading…") : text("刷新", "Refresh")}</button></div></div>
        {loading ? <div className="alerts-empty" role="status">{text("正在加载提醒…", "Loading alerts…")}</div> : rules.length === 0 && !error ? <div className="alerts-empty"><span className="alerts-empty-symbol" aria-hidden="true">◎</span><h2>{text("从一条值得关注的规则开始", "Start with a rule worth watching")}</h2><p>{text("例如：价格进入 20 日均线上下 2% 时提醒。可关注单只股票，也可覆盖全部自选股。", "For example: within 2% of the 20-session SMA. Watch one stock or your entire watchlist.")}</p><button className="ui-button alerts-primary" onClick={() => openEditor()}>{text("创建第一条提醒", "Create your first alert")}</button></div> : visibleRules.length === 0 ? <div className="alerts-empty"><h2>{text("没有匹配的提醒", "No matching alerts")}</h2><p>{text("试试其他关键词，或切换规则状态。", "Try another keyword or rule status.")}</p><button className="ui-button" onClick={() => { setFilter("all"); setQuery(""); }}>{text("清除筛选", "Clear filters")}</button></div> : <>
          <div className="alerts-list-labels" aria-hidden="true"><span>{text("规则 / 关注标的", "Rule / coverage")}</span><span>{text("触发条件", "Condition")}</span><span>{text("检测状态", "Check status")}</span><span>{text("操作", "Actions")}</span></div>
          {visibleRules.map(rule => <article key={rule.id} data-rule-id={rule.id} data-testid="alert-rule-card" className={`alerts-rule ${!rule.enabled ? "is-paused" : ""}`}>
            <div className="alerts-rule-identity"><h2>{rule.name}</h2>{rule.scope === "watchlist" ? <span className="alerts-coverage">{text("全部自选股", "All watchlist stocks")} · {rule.target_count ?? stocks.length}</span> : <Link className="alerts-coverage" href={`/watchlist/${rule.stock_id}`}><b>{rule.symbol}</b><span>{rule.stock_name}</span><span aria-hidden="true">↗</span></Link>}</div>
            <div className="alerts-condition"><strong><span>SMA</span> {rule.period}<small>{text("日", "sessions")}</small></strong><p>{alertBand(rule.side, rule.tolerance, zh)}</p><small>{text("冷却", "Cooldown")} {rule.cooldown_minutes / 60} {text("小时", "hours")}</small></div>
            <div className="alerts-rule-state"><span className={`alerts-status ${!rule.enabled ? "is-muted" : needsAttention(rule) ? "is-warning" : rule.status === "inside" ? "is-inside" : ""}`}><i aria-hidden="true" />{statusLabel(rule)}</span><small>{text("最近检测：", "Last checked: ")}{rule.checked_at ? new Date(rule.checked_at).toLocaleString(localeTag, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : text("尚未检测", "Not checked yet")}</small></div>
            <div className="alerts-rule-actions"><button role="switch" aria-checked={rule.enabled} aria-label={`${rule.name} ${text("启用提醒", "enable alert")}`} disabled={busy !== null} onClick={() => void toggle(rule)} className="alerts-switch"><span aria-hidden="true"><i /></span>{rule.enabled ? text("已启用", "On") : text("已暂停", "Paused")}</button><button data-edit-rule className="ui-button" disabled={busy !== null} onClick={() => openEditor(rule)}>{text("编辑", "Edit")}</button></div>
            <details className="alerts-rule-details"><summary>{text("检测详情与管理", "Details & management")}</summary><div className="alerts-detail-content"><div>{rule.scope === "watchlist" && <p data-testid="alert-scope-stats">{text("已检测", "Checked")} {rule.checked_count ?? 0}/{rule.target_count ?? stocks.length} · {text("范围内", "In range")} {rule.inside_count ?? 0} · {text("暂不可用", "Unavailable")} {rule.unavailable_count ?? 0}<br />{text("新增标的自动纳入；每只股票独立计算冷却时间。", "New additions join automatically; cooldowns are per stock.")}</p>}{rule.evidence && <p>{text("最近有效偏离", "Last valid distance")} {rule.evidence.gap_pct > 0 ? "+" : ""}{rule.evidence.gap_pct.toFixed(2)}% · SMA {rule.evidence.sma.toFixed(3)}</p>}<p>{text("进入范围时提醒；持续停留不重复。", "Notifies on entry, not on every check while in range.")}</p></div><button disabled={busy !== null} onClick={() => setDeleting(rule)} className="ui-button alerts-delete">{text("删除", "Delete")}</button></div></details>
          </article>)}
        </>}
      </section>
      <details className="alerts-method"><summary>{text("检测口径与提醒方式", "How checks and notifications work")}</summary><p>{text("使用最近 N 个已完成交易日收盘价计算简单均线（SMA），与最新有效价格比较。行情超过 20 分钟、休市、历史不足或供应商异常时不触发。行情非实时，采样之间短暂穿越可能遗漏。后台服务需保持运行，关闭网页不影响检测。提醒仅供研究关注，不代表买卖建议。", "Uses the last N completed daily closes and the latest valid quote. Stale quotes, closed markets, insufficient history and provider failures do not trigger. Data is not real-time; brief crossings may be missed. Keep the backend running; the page can be closed. Alerts are research prompts, not trading advice.")}</p></details>
    </>}
    <ConfirmModal open={!!deleting} title={text("删除提醒规则？", "Delete alert rule?")} message={text(`删除“${deleting?.name || ""}”后停止检测，已产生的通知仍会保留。`, `Stop checking “${deleting?.name || ""}”? Existing notifications will be kept.`)} confirmText={text("删除规则", "Delete rule")} cancelText={text("取消", "Cancel")} onCancel={() => setDeleting(null)} onConfirm={() => {
      if (!deleting || busy !== null) return;
      const id = deleting.id; setDeleting(null); setBusy(id);
      void api.deleteAlertRule(id).then(() => { setRules(prev => prev.filter(rule => rule.id !== id)); setFeedback(text("规则已删除，历史通知已保留。", "Rule deleted. Notification history retained.")); }).catch(e => setError(e.message)).finally(() => setBusy(null));
    }} />
  </div>;
}
