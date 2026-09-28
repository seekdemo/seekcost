"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import QuickReviewPanel from "@/components/QuickReviewPanel";
import { useI18n } from "@/components/I18nProvider";
import { api } from "@/lib/api";
import type { ResearchNote, WorkbenchOverview } from "@/lib/types";
import "./decision.css";

const categories = ["all", "price", "due", "trade", "plan", "incomplete"] as const;
type Category = typeof categories[number];
type Tab = "pending" | "records" | "review";
type Task = { key: string; category: Category; title: string; detail: string; href: string; action: string };
const emptyOverview: WorkbenchOverview = {
  generated_at: "", strike_candidates: [], upcoming_events: [], due_research: [], stale_stocks: [],
  incomplete_stocks: [], active_plans: [], unreviewed_transactions: [],
};
function dateLabel(value: string | null | undefined, locale: string) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "—";
  return new Date(value).toLocaleDateString(locale, { month: "short", day: "numeric" });
}
export default function DecisionPage() { return <AuthGuard><DecisionInbox /></AuthGuard>; }

function DecisionInbox() {
  const { t, localeTag } = useI18n();
  const text = (cn: string, en: string) => localeTag.startsWith("zh") ? cn : en;
  const [overview, setOverview] = useState(emptyOverview);
  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("pending");
  const [reviewOpened, setReviewOpened] = useState(false);
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [recordQuery, setRecordQuery] = useState("");
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.getWorkbenchOverview(), api.listNotes({ sort: "updated_at", order: "desc" })]).then(([workbench, research]) => {
      if (cancelled) return;
      const errors: string[] = [];
      if (workbench.status === "fulfilled") setOverview({ ...emptyOverview, ...workbench.value }); else errors.push("pending");
      if (research.status === "fulfilled") setNotes(research.value); else errors.push("records");
      setFailed(errors); setLoading(false); setBusy(false);
    });
    return () => { cancelled = true; };
  }, [revision]);
  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash === "#investment-review") { setTab("review"); setReviewOpened(true); }
      else setTab(window.location.hash === "#records" ? "records" : "pending");
    };
    syncHash(); window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);
  const selectTab = (next: Tab) => {
    setTab(next); if (next === "review") setReviewOpened(true);
    window.history.replaceState(null, "", window.location.pathname + window.location.search + (next === "review" ? "#investment-review" : next === "records" ? "#records" : ""));
  };
  const refresh = () => { setBusy(true); setRevision(value => value + 1); };
  const labels: Record<Category, string> = {
    all: text("全部事项", "All tasks"), price: text("价格待确认", "Price checks"), due: text("判断待复核", "Due reviews"),
    trade: text("交易待复盘", "Trade reviews"), plan: text("执行中计划", "Active plans"), incomplete: text("资料待补充", "Missing evidence"),
  };
  const tasks = useMemo<Task[]>(() => {
    const price = (value: number) => value == null || !Number.isFinite(value) ? "—" : value.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return [
      ...overview.strike_candidates.map(item => ({ key: "price-" + item.id, category: "price" as const, title: item.symbol + " · " + item.name, detail: t("decision.priceDetail", { current: price(item.current_price), strike: price(item.strike_price) }), href: "/watchlist/" + item.id, action: t("decision.checkThesis") })),
      ...overview.due_research.map(item => ({ key: "due-" + item.id, category: "due" as const, title: item.title, detail: t("decision.dueDetail", { date: dateLabel(item.next_review_at, localeTag) }), href: "/research/" + item.id, action: t("decision.startReview") })),
      ...overview.unreviewed_transactions.map(item => ({ key: "trade-" + item.id, category: "trade" as const, title: item.symbol + " · " + item.name, detail: t("workbench.tradeCompleted", { date: dateLabel(item.created_at, localeTag) }), href: "/research/new?transaction=" + item.id + "&asset=" + item.asset_id, action: t("workbench.createReview") })),
      ...overview.active_plans.map(item => ({ key: "plan-" + item.id, category: "plan" as const, title: item.symbol + " · " + item.name, detail: t("workbench.updatedOn", { date: dateLabel(item.updated_at, localeTag) }), href: "/assets/" + item.asset_id, action: t("workbench.tradePlan") })),
      ...overview.incomplete_stocks.map(item => ({ key: "incomplete-" + item.id, category: "incomplete" as const, title: item.symbol + " · " + item.name, detail: t("decision.missingDetail", { fields: new Intl.ListFormat(localeTag).format(item.missing.map(field => t("workbench." + field))) }), href: "/watchlist/" + item.id, action: t("decision.complete") })),
    ];
  }, [overview, localeTag, t]);
  const filtered = tasks.filter(item => (category === "all" || item.category === category) && (item.title + " " + item.detail).toLowerCase().includes(query.trim().toLowerCase()));
  const records = notes.filter(note => (note.title + " " + (note.tags || []).join(" ")).toLowerCase().includes(recordQuery.trim().toLowerCase()));
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "pending", label: text("待处理", "Pending"), count: tasks.length },
    { key: "records", label: text("判断记录", "Records"), count: notes.length },
    { key: "review", label: t("quickReview.portfolioAction") },
  ];
  const resetFilters = () => { setQuery(""); setCategory("all"); setLimit(20); };

  return <div className="decision-inbox">
    <header className="decision-inbox__header"><div><h1>{t("decision.title")}</h1><p>{text("检查待办，记录判断，回顾结果。", "Check what needs attention. Record decisions. Review outcomes.")}</p></div><div className="decision-inbox__actions"><Link href="/watchlist">{text("股票池", "Watchlist")} ↗</Link><Link href="/research/new" className="ui-button ui-button--primary">{t("decision.record")}</Link></div></header>
    <div className="decision-tabs" role="tablist" aria-label={text("决策工作区", "Decision workspace")}>
      {tabs.map((item, index) => <button key={item.key} id={"decision-tab-" + item.key} type="button" role="tab" aria-selected={tab === item.key} aria-controls={"decision-panel-" + item.key} tabIndex={tab === item.key ? 0 : -1} onClick={() => selectTab(item.key)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); selectTab(tabs[next].key); document.getElementById("decision-tab-" + tabs[next].key)?.focus();
      }}>{item.label}{item.count !== undefined && !loading && !failed.includes(item.key) && <span>{item.count}</span>}</button>)}
    </div>
    {failed.length > 0 && <div className="decision-error" role="alert"><span>{text("部分内容未能更新：", "Could not update: ")}{failed.map(key => key === "pending" ? tabs[0].label : tabs[1].label).join(" / ")}。{text("已加载的内容仍可使用。", "Loaded content remains available.")}</span><button type="button" disabled={busy} onClick={refresh}>{busy ? text("重试中…", "Retrying…") : text("重试", "Retry")}</button></div>}

    <section id="decision-panel-pending" role="tabpanel" aria-labelledby="decision-tab-pending" hidden={tab !== "pending"}>
      <div className="decision-toolbar"><label><span className="sr-only">{text("搜索待办", "Search tasks")}</span><input type="search" placeholder={text("搜索标的或判断…", "Search a company or decision…")} value={query} onChange={event => { setQuery(event.target.value); setLimit(20); }} /></label><button className="decision-refresh" type="button" disabled={busy || loading} onClick={refresh}>{busy ? text("更新中…", "Updating…") : text("刷新", "Refresh")}</button></div>
      <div className="decision-workspace">
        <nav className="decision-filters" aria-label={text("事项分类", "Task categories")}>{categories.map(key => <button key={key} type="button" aria-pressed={category === key} onClick={() => { setCategory(key); setLimit(20); }}>{labels[key]}<span>{loading || failed.includes("pending") ? "—" : key === "all" ? tasks.length : tasks.filter(item => item.category === key).length}</span></button>)}</nav>
        <div className="decision-list" data-testid="decision-queue" aria-busy={busy || loading}>
          {loading ? <div className="decision-loading" role="status">{text("正在读取待办…", "Loading tasks…")}</div> : <>
            <div className="decision-list__heading"><h2>{labels[category]}</h2><span aria-live="polite">{failed.includes("pending") ? text("数据未更新", "Not up to date") : text(filtered.length + " 项待办", filtered.length + " tasks")}</span></div>
            {filtered.slice(0, limit).map(item => <Link key={item.key} href={item.href} className="decision-task" data-category={item.category}><span className="decision-task__kind">{labels[item.category]}</span><span className="decision-task__copy"><strong>{item.title}</strong><small>{item.detail}</small></span><span className="decision-task__action">{item.action}<span aria-hidden="true"> →</span></span></Link>)}
            {!filtered.length && <div className="decision-empty"><h3>{failed.includes("pending") ? text("待办暂不可用", "Tasks unavailable") : tasks.length ? text("没有匹配的事项", "No matching tasks") : text("暂时没有待办", "Nothing pending")}</h3><p>{failed.includes("pending") ? text("请重试，不代表当前没有待办。", "Retry to check your tasks.") : tasks.length ? text("换个关键词，或清除筛选。", "Try another search or clear filters.") : text("可以继续研究公司，也可以记录一个新判断。", "Continue your company research or record a decision.")}</p>{tasks.length > 0 && <button type="button" onClick={resetFilters}>{text("清除筛选", "Clear filters")}</button>}{!tasks.length && !failed.includes("pending") && <Link href="/watchlist">{text("查看股票池", "Open watchlist")} →</Link>}</div>}
            {filtered.length > limit && <button type="button" className="decision-more" onClick={() => setLimit(value => value + 20)}>{text("再显示 20 项", "Show 20 more")} · {limit}/{filtered.length}</button>}
          </>}
        </div>
      </div><p className="decision-footnote">{text("按事项列出，同一标的可能有多项待办。价格进入关注区间不代表买入建议。", "One row per task; a company may have several tasks. A price-zone alert is not a buy recommendation.")}</p>
    </section>
    <section id="decision-panel-records" role="tabpanel" aria-labelledby="decision-tab-records" hidden={tab !== "records"}>
      <div className="decision-toolbar"><label><span className="sr-only">{text("搜索记录", "Search records")}</span><input type="search" value={recordQuery} onChange={event => setRecordQuery(event.target.value)} placeholder={text("搜索标题或标签…", "Search titles or tags…")} /></label><Link href="/research">{text("打开研究库", "Research library")} ↗</Link></div>
      <div className="decision-list">{loading ? <div className="decision-loading" role="status">{text("正在读取记录…", "Loading records…")}</div> : records.length ? records.map(note => <Link key={note.id} href={"/research/" + note.id} className="decision-record"><span><strong>{note.title || t("research.untitled")}</strong><small>{(note.tags || []).join(" · ")}</small></span><span>{t("decision.status" + ({ active: "Active", draft: "Draft", validated: "Validated", invalidated: "Invalidated", archived: "Archived" }[note.status] || "Active"))}</span><time dateTime={note.updated_at}>{dateLabel(note.updated_at, localeTag)}</time></Link>) : <div className="decision-empty"><h3>{failed.includes("records") ? text("记录暂不可用", "Records unavailable") : recordQuery ? text("没有匹配的记录", "No matching records") : text("还没有判断记录", "No decisions recorded")}</h3>{recordQuery && <button onClick={() => setRecordQuery("")}>{text("清除搜索", "Clear search")}</button>}{!recordQuery && !failed.includes("records") && <Link href="/research/new">{t("decision.firstRecord")} →</Link>}</div>}</div>
    </section>
    <section id="decision-panel-review" role="tabpanel" aria-labelledby="decision-tab-review" hidden={tab !== "review"}>
      {reviewOpened && <QuickReviewPanel scope="portfolio" className="decision-review" onSaved={note => setNotes(current => [note, ...current.filter(item => item.id !== note.id)])} />}
    </section>
    <details className="decision-guidance"><summary>{text("做判断时检查什么？", "What should I check?")}</summary><h2>{t("decision.standardTitle")}</h2><dl>{["whyBuy", "whatWrong", "howMuch", "whenReview"].map(key => <div key={key}><dt>{t("decision." + key)}</dt><dd>{t("decision." + key + "Text")}</dd></div>)}</dl></details>
  </div>;
}
