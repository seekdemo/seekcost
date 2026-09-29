"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import QuickReviewPanel from "@/components/QuickReviewPanel";
import { useI18n } from "@/components/I18nProvider";
import { api } from "@/lib/api";
import type { ResearchNote, WorkbenchOverview } from "@/lib/types";
import "./decision.css";

type Tab = "pending" | "records" | "review";
type ThoughtCategory = "due" | "event" | "price" | "volume";
type Filter = "all" | ThoughtCategory;
type ThoughtItem = {
  key: string;
  category: ThoughtCategory;
  symbol: string;
  name: string;
  summary: string;
  context: string;
  href: string;
  stockHref?: string;
  actionHref: string;
};

const filters: Filter[] = ["all", "due", "event", "price", "volume"];
const emptyOverview: WorkbenchOverview = {
  generated_at: "", strike_candidates: [], upcoming_events: [], due_research: [], stale_stocks: [],
  incomplete_stocks: [], active_plans: [], unreviewed_transactions: [],
};

function dateLabel(value: string | null | undefined, locale: string) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "—";
  return new Date(value).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export default function DecisionPage() {
  return <AuthGuard><DecisionWorkspace /></AuthGuard>;
}

function DecisionWorkspace() {
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
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [recordQuery, setRecordQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [selectedKey, setSelectedKey] = useState("");
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [tradesOpen, setTradesOpen] = useState(false);
  const [volumeEditing, setVolumeEditing] = useState(false);
  const [volumeDraft, setVolumeDraft] = useState("1.5");
  const [volumeSaving, setVolumeSaving] = useState(false);
  const [volumeError, setVolumeError] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.getWorkbenchOverview(), api.listNotes({ sort: "updated_at", order: "desc" })]).then(([workbench, research]) => {
      if (cancelled) return;
      const errors: string[] = [];
      if (workbench.status === "fulfilled") {
        setOverview({ ...emptyOverview, ...workbench.value });
        setVolumeDraft(String(workbench.value.volume_watch?.threshold ?? 1.5));
      }
      else errors.push("pending");
      if (research.status === "fulfilled") setNotes(research.value);
      else errors.push("records");
      setFailed(errors);
      setLoading(false);
      setBusy(false);
    });
    return () => { cancelled = true; };
  }, [revision]);

  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash === "#investment-review") { setTab("review"); setReviewOpened(true); }
      else setTab(window.location.hash === "#records" ? "records" : "pending");
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (!mobilePreviewOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobilePreviewOpen(false);
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      lastTriggerRef.current?.focus();
    };
  }, [mobilePreviewOpen]);

  const selectTab = (next: Tab) => {
    setMobilePreviewOpen(false);
    setTab(next);
    if (next === "review") setReviewOpened(true);
    window.history.replaceState(null, "", window.location.pathname + window.location.search + (next === "review" ? "#investment-review" : next === "records" ? "#records" : ""));
  };
  const refresh = () => { setBusy(true); setRevision(value => value + 1); };
  const saveVolumeThreshold = async () => {
    const next = Number(volumeDraft);
    if (!Number.isFinite(next) || next < 1 || next > 20) {
      setVolumeError(text("请输入 1–20 之间的倍数。", "Enter a multiplier from 1 to 20."));
      return;
    }
    setVolumeSaving(true);
    setVolumeError("");
    try {
      await api.updateVolumeWatchSetting(next);
      const updated = await api.getWorkbenchOverview();
      setOverview({ ...emptyOverview, ...updated });
      setVolumeDraft(String(updated.volume_watch?.threshold ?? next));
      setVolumeEditing(false);
    } catch {
      setVolumeError(text("保存失败，请重试。", "Could not save. Please retry."));
    } finally { setVolumeSaving(false); }
  };

  const labels: Record<Filter, string> = {
    all: text("全部", "All"),
    due: text("到期检查", "Due checks"),
    event: text("事件提醒", "Events"),
    price: text("价格提醒", "Price alerts"),
    volume: text("放量关注", "Volume watch"),
  };

  const thoughts: ThoughtItem[] = (() => {
    const price = (value: number) => value == null || !Number.isFinite(value) ? "—" : value.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return [
      ...overview.due_research.map(item => {
        const linkedNote = notes.find(note => note.id === item.id);
        const symbol = linkedNote?.stock_symbols?.[0] || "";
        const stockId = linkedNote?.links?.find(link => link.entity_type === "watch_stock")?.entity_id;
        return {
          key: "due-" + item.id, category: "due" as const, symbol,
          name: item.title, summary: text("到期检查 · " + dateLabel(item.next_review_at, localeTag), "Review due · " + dateLabel(item.next_review_at, localeTag)),
          context: text("上次留下的研究主题", "Previous research topic"), href: "/research/" + item.id,
          stockHref: stockId ? "/watchlist/" + stockId : undefined,
          actionHref: "/research/" + item.id,
        };
      }),
      ...overview.upcoming_events.map(item => ({
        key: "event-" + item.stock_id + "-" + item.date + "-" + item.title,
        category: "event" as const, symbol: item.symbol, name: item.title || item.symbol,
        summary: text("事件临近 · " + dateLabel(item.date, localeTag), "Upcoming event · " + dateLabel(item.date, localeTag)),
        context: text("值得核对的新信息", "Information to check"), href: "/watchlist/" + item.stock_id,
        stockHref: "/watchlist/" + item.stock_id, actionHref: "/research/new?stock=" + item.stock_id,
      })),
      ...overview.strike_candidates.filter(item => item.current_price > 0 && item.strike_price > 0 && item.current_price <= item.strike_price * 1.02).map(item => ({
        key: "price-" + item.id, category: "price" as const, symbol: item.symbol, name: item.name,
        summary: text("现价在关注区间 · " + price(item.current_price) + " / 关注价 " + price(item.strike_price), "In watch-price zone · " + price(item.current_price) + " / Watch " + price(item.strike_price)),
        context: text("价格变化值得重新核对证据", "Price movement is a reason to recheck the evidence"),
        href: "/watchlist/" + item.id, stockHref: "/watchlist/" + item.id, actionHref: "/research/new?stock=" + item.id,
      })),
      ...(overview.volume_watch?.items || []).map(item => ({
        key: "volume-" + item.stock_id, category: "volume" as const, symbol: item.symbol, name: item.name,
        summary: text(`${item.bar_date} 成交量为前一交易日的 ${item.ratio.toFixed(2)} 倍`, `${item.bar_date} volume was ${item.ratio.toFixed(2)}× the previous session`),
        context: text("收盘后确认的成交量变化，值得核对原因与价格走势", "Post-close volume change; check the cause and price action"),
        href: "/watchlist/" + item.stock_id, stockHref: "/watchlist/" + item.stock_id,
        actionHref: "/research/new?stock=" + item.stock_id,
      })),
    ];
  })();

  const filtered = thoughts.filter(item =>
    (filter === "all" || item.category === filter) &&
    (item.symbol + " " + item.name + " " + item.summary).toLowerCase().includes(query.trim().toLowerCase())
  );
  const visible = filtered.slice(0, limit);
  const selected = visible.find(item => item.key === selectedKey) || visible[0];
  const records = notes.filter(note => (note.title + " " + (note.tags || []).join(" ")).toLowerCase().includes(recordQuery.trim().toLowerCase()));
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "pending", label: text("待思考", "To think about"), count: thoughts.length },
    { key: "records", label: text("思考记录", "Thinking notes") },
    { key: "review", label: text("阶段回顾", "Period review") },
  ];
  const resetFilters = () => { setFilter("all"); setQuery(""); setLimit(20); };
  const openThought = (item: ThoughtItem, trigger: HTMLButtonElement) => {
    setSelectedKey(item.key);
    lastTriggerRef.current = trigger;
    if (window.matchMedia("(max-width: 700px)").matches) setMobilePreviewOpen(true);
  };
  const closePreview = () => setMobilePreviewOpen(false);

  const preview = (item: ThoughtItem, mobile = false) => <>
    <div className="decision-preview__head">
      {mobile && <button ref={closeButtonRef} className="decision-preview__close" type="button" aria-label={text("关闭预览", "Close preview")} onClick={closePreview}>×</button>}
      <span className="decision-preview__eyebrow">{text("当前事项", "Current item")} · {labels[item.category]}</span>
      <h2>{item.symbol || item.name}</h2>
      {item.symbol && <p className="decision-preview__name">{item.name}</p>}
      <span className="decision-preview__state">{item.category === "due" ? text("研究待检查", "Research check") : text("观察中 · 无需交易", "Observing · no trade required")}</span>
    </div>
    <div className="decision-preview__body">
      <span className="decision-preview__label">{item.context}</span>
      <p>{item.category === "due" ? item.name : item.summary}</p>
      <span className="decision-preview__label">{text("继续思考时可以记下", "When thinking further, note")}</span>
      <ul>
        <li>{text("出现了什么新证据？", "What new evidence appeared?")}</li>
        <li>{text("原来的判断需要改变吗？", "Does the earlier view need to change?")}</li>
        <li>{text("下次需要验证什么？", "What should be checked next?")}</li>
      </ul>
      <Link className="decision-primary" href={item.actionHref}>{item.category === "due" ? text("继续这条思考", "Continue this thought") : text("记录这次思考", "Record this thought")} <span aria-hidden="true">→</span></Link>
    </div>
    {item.stockHref && <Link className="decision-preview__foot" href={item.stockHref}>{text("查看标的档案", "View company")} <span aria-hidden="true">↗</span></Link>}
  </>;

  return <div className="decision-inbox">
    <header className="decision-inbox__header">
      <div><h1>{t("decision.title")}</h1><p>{text("把观察变成有依据的判断，按自己的节奏继续思考。", "Turn observations into reasoned judgments, at your own pace.")}</p></div>
      <div className="decision-inbox__actions"><Link className="decision-inbox__watchlist" href="/watchlist">{text("前往股票池", "Watchlist")} ↗</Link><Link href="/research/new" className="decision-primary">＋ {text("记录思考", "Record thought")}</Link></div>
    </header>
    <div className="decision-tabs" role="tablist" aria-label={text("决策工作区", "Decision workspace")}>
      {tabs.map((item, index) => <button key={item.key} id={"decision-tab-" + item.key} type="button" role="tab" aria-selected={tab === item.key} aria-controls={"decision-panel-" + item.key} tabIndex={tab === item.key ? 0 : -1} onClick={() => selectTab(item.key)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); selectTab(tabs[next].key); document.getElementById("decision-tab-" + tabs[next].key)?.focus();
      }}>{item.label}{item.count !== undefined && !loading && !failed.includes("pending") && <span>{item.count}</span>}</button>)}
    </div>
    {failed.length > 0 && <div className="decision-error" role="alert"><span>{text("部分内容未能更新：", "Could not update: ")}{failed.map(key => key === "pending" ? tabs[0].label : tabs[1].label).join(" / ")}。{text("已加载的内容仍可使用。", "Loaded content remains available.")}</span><button type="button" disabled={busy} onClick={refresh}>{busy ? text("重试中…", "Retrying…") : text("重试", "Retry")}</button></div>}

    <section id="decision-panel-pending" role="tabpanel" aria-labelledby="decision-tab-pending" hidden={tab !== "pending"}>
      <div className="decision-intro"><div><h2>{text("有新信息，值得再想一遍", "New information worth a second look")}</h2><p>{text("到期检查、近期事件、价格提醒和收盘放量会出现在这里；其他标的继续安静观察。", "Due checks, events, price alerts and post-close volume changes appear here.")}</p></div><button type="button" className="decision-refresh" disabled={busy || loading} onClick={refresh}>{busy ? text("更新中…", "Updating…") : text("刷新", "Refresh")}</button></div>
      <div className="decision-volume-setting">
        <span>{text("收盘放量观察", "Post-close volume watch")}</span>
        {volumeEditing ? <form onSubmit={event => { event.preventDefault(); void saveVolumeThreshold(); }}>
          <label><span className="sr-only">{text("成交量倍数门槛", "Volume multiplier threshold")}</span><input type="number" min="1" max="20" step="0.1" inputMode="decimal" value={volumeDraft} onChange={event => setVolumeDraft(event.target.value)} disabled={volumeSaving} autoFocus /></label><span>×</span>
          <button type="submit" disabled={volumeSaving}>{volumeSaving ? text("保存中…", "Saving…") : text("保存", "Save")}</button>
          <button type="button" disabled={volumeSaving} onClick={() => { setVolumeEditing(false); setVolumeDraft(String(overview.volume_watch?.threshold ?? 1.5)); setVolumeError(""); }}>{text("取消", "Cancel")}</button>
        </form> : <button type="button" onClick={() => setVolumeEditing(true)} aria-label={text("修改放量观察门槛", "Edit volume threshold")} disabled={loading || failed.includes("pending")}>{text("前一交易日的", "Previous session ×")} {overview.volume_watch?.threshold ?? 1.5}× <span aria-hidden="true">✎</span></button>}
        <small>{text("完整日 K · 已扫描", "Completed daily bars · scanned")} {overview.volume_watch?.scanned_count ?? 0}/{overview.volume_watch?.total_count ?? overview.watchlist_summary?.total ?? 0}</small>
        {volumeError && <span role="alert" className="decision-volume-setting__error">{volumeError}</span>}
      </div>
      <div className="decision-workspace">
        <div className="decision-board" aria-busy={busy || loading}>
          <div className="decision-board__toolbar">
            <nav className="decision-filters" aria-label={text("思考事项分类", "Thinking categories")}>{filters.map(key => <button key={key} type="button" aria-pressed={filter === key} onClick={() => { setFilter(key); setLimit(20); }}>{labels[key]} <span>{loading || failed.includes("pending") ? "—" : key === "all" ? thoughts.length : thoughts.filter(item => item.category === key).length}</span></button>)}</nav>
            <label className="decision-search"><span className="sr-only">{text("搜索标的或问题", "Search company or question")}</span><input type="search" placeholder={text("搜索标的或问题", "Search company or question")} value={query} onChange={event => { setQuery(event.target.value); setLimit(20); }} /></label>
          </div>
          {loading ? <div className="decision-loading" role="status">{text("正在读取思考事项…", "Loading thoughts…")}</div> : failed.includes("pending") ? <div className="decision-empty"><h3>{text("待思考内容暂不可用", "Thinking items unavailable")}</h3><p>{text("请重试，不代表当前没有需要关注的变化。", "Please retry; this does not mean there is nothing to review.")}</p></div> : <>
            <div className="decision-board__heading"><strong>{text("值得再看", "Worth another look")}</strong><span>{filtered.length}</span><small>{text("从真实触发继续，不制造待办", "Real triggers only")}</small></div>
            {visible.map(item => <button className="decision-thought" data-selected={selected?.key === item.key} key={item.key} type="button" onClick={event => openThought(item, event.currentTarget)} aria-label={item.symbol + " " + item.name + " " + item.summary}>
              <span className="decision-thought__mark" aria-hidden="true">{(item.symbol || item.name).slice(0, 2).toUpperCase()}</span>
              <span className="decision-thought__copy"><strong>{item.symbol && <>{item.symbol}<span className="decision-thought__dot"> · </span></>}{item.name}</strong><small>{item.summary}</small></span>
              <span className="decision-thought__action">{text("继续思考", "Think further")} <span aria-hidden="true">→</span></span>
            </button>)}
            {!filtered.length && <div className="decision-empty"><h3>{filter === "volume" && !query.trim() ? (overview.volume_watch && overview.volume_watch.scanned_count < overview.volume_watch.total_count ? text("收盘数据尚未扫描完成", "Post-close scan is not complete") : text(`暂无达到 ${overview.volume_watch?.threshold ?? 1.5}× 的标的`, `No companies reached ${overview.volume_watch?.threshold ?? 1.5}×`)) : thoughts.length ? text("没有匹配的思考事项", "No matching thoughts") : text("暂时没有需要重新检查的变化", "No new changes to revisit")}</h3><p>{filter === "volume" && !query.trim() ? text("只按已完成的日 K 比较前一交易日成交量；可调整上方门槛。", "Only completed daily bars are compared with the previous session. Adjust the threshold above.") : thoughts.length ? text("换个关键词，或清除筛选。", "Try another search or clear filters.") : text("观察可以继续，记录想法也不必等到出现提醒。", "Keep observing, or record an idea whenever you want.")}</p>{thoughts.length ? <button type="button" onClick={resetFilters}>{text("清除筛选", "Clear filters")}</button> : <Link href="/watchlist">{text("查看股票池", "Open watchlist")} →</Link>}</div>}
            {filtered.length > limit && <button className="decision-more" type="button" onClick={() => setLimit(value => value + 20)}>{text("再显示 20 项", "Show 20 more")} · {limit}/{filtered.length}</button>}
          </>}
          {!loading && !failed.includes("pending") && <>
            <div className="decision-quiet"><div><strong>{text("持续观察", "Continue observing")}</strong><small>{overview.watchlist_summary?.total ? text("股票池共 " + overview.watchlist_summary.total + " 个标的，未触发的无需处理", overview.watchlist_summary.total + " companies in watchlist; no action without a trigger") : text("没有新触发，也可以随时记下想法", "No new trigger; record an idea anytime")}</small></div><Link href="/watchlist">{text("查看标的", "View companies")} ↗</Link></div>
            <div className="decision-quiet decision-quiet--trade"><div><strong>{text("交易后回顾", "After-trade review")} {overview.unreviewed_transactions.length > 0 && <span>{overview.unreviewed_transactions.length}</span>}</strong><small>{text("仅在实际发生交易后出现", "Only after a real transaction")}</small></div>{overview.unreviewed_transactions.length > 0 && <button type="button" aria-expanded={tradesOpen} onClick={() => setTradesOpen(value => !value)}>{tradesOpen ? text("收起", "Collapse") : text("展开列表", "Show list")} {tradesOpen ? "↑" : "↓"}</button>}</div>
            {tradesOpen && overview.unreviewed_transactions.length > 0 && <div className="decision-trades">{overview.unreviewed_transactions.map(item => <Link key={item.id} href={"/research/new?transaction=" + item.id + "&asset=" + item.asset_id}>{item.symbol} · {item.name}<span>{dateLabel(item.created_at, localeTag)} ↗</span></Link>)}</div>}
          </>}
        </div>
        {!loading && !failed.includes("pending") && selected && <aside className="decision-preview decision-preview--desktop" aria-label={text("思考预览", "Thought preview")}>{preview(selected)}</aside>}
      </div>
      <p className="decision-footnote">{text("资料未填满不会自动成为待办；价格提醒只提示核对证据，不构成买入建议。", "Incomplete research is not automatically a task. Price alerts invite evidence checks, not purchases.")}</p>
    </section>

    <section id="decision-panel-records" role="tabpanel" aria-labelledby="decision-tab-records" hidden={tab !== "records"}>
      <div className="decision-section-head"><div><h2>{text("留下思考的轨迹", "Your thinking trail")}</h2><p>{text("把判断、证据与改变判断的原因放在一起。", "Keep judgments, evidence and changes of mind together.")}</p></div><Link href="/research">{text("打开研究库", "Research library")} ↗</Link></div>
      <div className="decision-records">
        <label className="decision-records__search"><span className="sr-only">{text("搜索记录", "Search records")}</span><input type="search" value={recordQuery} onChange={event => setRecordQuery(event.target.value)} placeholder={text("搜索标题或标签", "Search titles or tags")} /></label>
        {loading ? <div className="decision-loading" role="status">{text("正在读取记录…", "Loading records…")}</div> : failed.includes("records") ? <div className="decision-empty"><h3>{text("记录暂不可用", "Records unavailable")}</h3></div> : records.length ? records.map(note => <Link key={note.id} href={"/research/" + note.id} className="decision-record"><span><strong>{note.title || t("research.untitled")}</strong><small>{(note.tags || []).join(" · ") || text("个人研究记录", "Personal research note")}</small></span><span>{t("decision.status" + ({ active: "Active", draft: "Draft", validated: "Validated", invalidated: "Invalidated", archived: "Archived" }[note.status] || "Active"))}</span><time dateTime={note.updated_at}>{dateLabel(note.updated_at, localeTag)}</time></Link>) : <div className="decision-empty"><h3>{recordQuery ? text("没有匹配的记录", "No matching records") : text("还没有思考记录", "No thinking notes yet")}</h3>{recordQuery ? <button type="button" onClick={() => setRecordQuery("")}>{text("清除搜索", "Clear search")}</button> : <Link href="/research/new">{text("记录第一条思考", "Record a first thought")} →</Link>}</div>}
      </div>
    </section>

    <section id="decision-panel-review" role="tabpanel" aria-labelledby="decision-tab-review" hidden={tab !== "review"}>
      <div className="decision-section-head"><div><h2>{text("阶段回顾", "Period review")}</h2><p>{text("有需要时再回看这一阶段的判断与执行，不必为了填表而复盘。", "Review your reasoning and actions when useful, not to fill a form.")}</p></div></div>
      {reviewOpened && <QuickReviewPanel scope="portfolio" className="decision-review" onSaved={note => setNotes(current => [note, ...current.filter(item => item.id !== note.id)])} />}
    </section>

    {mobilePreviewOpen && selected && tab === "pending" && <div className="decision-preview-overlay" onMouseDown={event => { if (event.target === event.currentTarget) closePreview(); }}><aside ref={dialogRef} className="decision-preview decision-preview--mobile" role="dialog" aria-modal="true" aria-label={(selected.symbol || selected.name) + text(" 思考预览", " thought preview")}>{preview(selected, true)}</aside></div>}
  </div>;
}
