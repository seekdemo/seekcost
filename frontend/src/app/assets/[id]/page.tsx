"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { cashSymbol, marketSymbol } from "@/lib/currency";
import type { Asset, AssetDetail, TransactionRecord, TransactionUpdate, AssetZone, AssetCategory, ProfitAllocationIn, AllocationType, TradePlan, PlanStatus, Tag, SellBatchItemIn } from "@/lib/types";
import AuthGuard from "@/components/AuthGuard";
import ConfirmModal from "@/components/ConfirmModal";
import MarkdownEditor from "@/components/MarkdownEditor";
import MarkdownPreview from "@/components/MarkdownPreview";
import QuickReviewPanel from "@/components/QuickReviewPanel";
import { RichTextContent, stripRichText } from "@/components/RichTextField";
import { isStoredRichText, storedTextToMarkdown } from "@/lib/markdown";
import { useI18n } from "@/components/I18nProvider";

const ZONE_KEY_MAP: Record<string, string> = { active: "assets.zoneActive", base: "assets.zoneBase", invest: "assets.zoneInvest" };
const MARKET_KEY_MAP: Record<string, string> = { us: "assets.marketUs", cn: "assets.marketCn", hk: "assets.marketHk", crypto: "assets.marketCrypto", cash: "assets.marketCash", other: "" };
const MARKET_COLORS: Record<string, string> = {
  us: "bg-blue-500/20 text-blue-300", cn: "bg-red-500/20 text-red-300",
  hk: "bg-orange-500/20 text-orange-300", crypto: "bg-yellow-500/20 text-yellow-300", cash: "bg-cyan-500/15 text-cyan-300", other: "",
};
const MARKET_FLAG: Record<string, string> = { us: "🇺🇸", cn: "🇨🇳", hk: "🇭🇰", crypto: "₿", cash: "", other: "" };
const CAT_KEY_MAP: Record<string, string> = {
  stock: "assets.categoryStock", etf: "assets.categoryEtf", crypto: "assets.categoryCrypto", deposit: "assets.categoryDeposit",
  bond_fund: "assets.categoryBond", pension: "assets.categoryPension", gold: "assets.categoryGold", collectible: "assets.categoryCollectible", real_estate: "assets.categoryRealEstate",
  course: "assets.categoryCourse", tool: "assets.categoryTool", traffic: "assets.categoryTraffic", other_invest: "assets.categoryOther",
};
const CAT_OPTIONS = Object.entries(CAT_KEY_MAP) as [AssetCategory, string][];
const CATEGORY_ZONE: Record<AssetCategory, AssetZone> = {
  stock: "active", etf: "active", crypto: "active",
  deposit: "base", bond_fund: "base", pension: "base", gold: "base", collectible: "base", real_estate: "base",
  course: "invest", tool: "invest", traffic: "invest", other_invest: "invest",
};
const TX_KEY_MAP: Record<string, string> = { buy: "review.buy", sell: "review.sell", t_trade: "review.tTrade" };
const ALLOC_KEY_MAP: Record<string, string> = {
  self_offset: "trade.selfOffset", cross_save: "trade.crossSave", to_harbor: "trade.toHarbor",
};

function remainingQty(tx: Pick<TransactionRecord, "quantity" | "sold_quantity">) {
  return Math.max(0, tx.quantity - tx.sold_quantity);
}
function isCurrentBuyBatch(tx: TransactionRecord) {
  return tx.tx_type === "buy" && remainingQty(tx) > 0.0001;
}
function isHistoricalBuyBatch(tx: TransactionRecord) {
  return tx.tx_type === "buy" && !isCurrentBuyBatch(tx);
}

export default function AssetDetailPage() {
  return <AuthGuard><AssetDetailContent /></AuthGuard>;
}

function AssetDetailContent() {
  const { t, localeTag } = useI18n();
  const fmt = (n: number) => n.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (value: string) => new Date(value).toLocaleString(localeTag, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [data, setData] = useState<AssetDetail | null>(null);
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    symbol: "", name: "", zone: "active" as AssetZone, category: "stock" as AssetCategory,
    current_price: "", mental_cost: "", quantity: "", total_invested: "",
  });
  const [activeTab, setActiveTab] = useState<"overview" | "investment" | "transactions">("overview");
  const [txViewMode, setTxViewMode] = useState<"grouped" | "timeline">("grouped");
  const [plannedInvestment, setPlannedInvestment] = useState("");
  const [includesInvested, setIncludesInvested] = useState(true);
  const [updatingInvestment, setUpdatingInvestment] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"archive" | "delete" | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");

  const reload = useCallback(() => api.getAsset(id).then((d) => {
    setData(d);
    setIncludesInvested(d.planned_includes_invested);
  }).catch((e) => setError(e.message)), [id]);

  useEffect(() => {
    if (id) reload();
    api.listAssets().then(setAllAssets).catch(() => {});
    api.listTags().then(setAllTags).catch(() => {});
  }, [id, reload]);

  const openEdit = () => {
    if (!data) return;
    setEditForm({
      symbol: data.symbol, name: data.name, zone: data.zone, category: data.category,
      current_price: String(data.current_price),
      mental_cost: String(data.mental_cost), quantity: String(data.quantity), total_invested: String(data.total_invested),
    });
    setEditing(true);
  };

  const updatePlannedInvestment = async () => {
    if (!data) return;
    setUpdatingInvestment(true);
    try {
      const amount = parseFloat(plannedInvestment) || 0;
      await api.updatePlannedInvestment(data.id, amount, includesInvested);
      await reload();
      setPlannedInvestment("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("assets.updateFailed"));
    } finally {
      setUpdatingInvestment(false);
    }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.updateAsset(id, {
        ...editForm,
        current_price: parseFloat(editForm.current_price) || 0,
        mental_cost: parseFloat(editForm.mental_cost) || 0,
        quantity: parseFloat(editForm.quantity) || 0,
        total_invested: parseFloat(editForm.total_invested) || 0,
      });
      setEditing(false);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("assets.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (error) return <div className="py-12 text-center text-red-400">{t("assets.loadFailed")}: {error}</div>;
  if (!data) return <div className="py-12 text-center text-muted animate-pulse">{t("common.loading")}</div>;

  const pnlColor = (v: number) => v >= 0 ? "text-up" : "text-down";
  const pnlSign = (v: number) => v >= 0 ? "+" : "";
  const progress = Math.round(data.zero_cost_progress * 100);

  return (
    <div className="page-shell page-shell--wide">
      {/* 面包屑 + 快捷操作 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Link href="/assets" className="hover:text-primary transition">{t("assets.eyebrow")}</Link>
          <span>/</span>
          <span className="text-primary font-semibold">{data.zone === "invest" ? data.name : data.symbol}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={openEdit}
            className="rounded-lg border border-themed px-3 py-1.5 text-sm text-secondary transition hover:border-[var(--border-hover)] hover:text-accent">
            {t("assets.edit")}
          </button>
          <Link href={`/trade?asset=${data.id}`}
            className="rounded-lg bg-accent bg-accent-hover px-3 py-1.5 text-sm font-semibold transition">
            {t(data.zone === "invest" ? "assets.recordInvestment" : "assets.recordTrade")}
          </Link>
          {/* 更多操作 */}
          <div className="relative">
            <button onClick={() => setShowActions(!showActions)}
              className="rounded-lg border border-themed px-2 py-1.5 text-sm text-secondary transition hover:text-primary">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
              </svg>
            </button>
            {showActions && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowActions(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-lg border border-themed bg-surface shadow-xl py-1">
                  {data.archived ? (
                    <button onClick={async () => { setShowActions(false); await api.unarchiveAsset(id); reload(); }}
                      className="w-full text-left px-3 py-2 text-xs text-secondary hover:bg-surface-hover transition">
                      {t("assets.restoreAsset")}
                    </button>
                  ) : (
                    <button onClick={() => { setShowActions(false); setConfirmAction("archive"); }}
                      className="w-full text-left px-3 py-2 text-xs text-secondary hover:bg-surface-hover transition">
                      {t("assets.archiveTitle")}
                    </button>
                  )}
                  <button onClick={() => { setShowActions(false); setConfirmAction("delete"); }}
                    className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-surface-hover transition">
                    {t("assets.deleteTitle")}
                  </button>
                </div>
              </>
            )}
          </div>
          <button onClick={() => router.back()}
            className="rounded-lg border border-themed px-3 py-1.5 text-sm text-secondary transition hover:text-primary">
            {t("assets.back")}
          </button>
        </div>
      </div>

      {/* 归档状态横幅 */}
      {data.archived && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-700/40 bg-amber-900/20 px-4 py-3">
          <span className="text-amber-400 text-sm">{t("assets.archivedBanner")}</span>
          {data.archived_note && <span className="text-xs text-secondary">— {data.archived_note}</span>}
          <button onClick={async () => { await api.unarchiveAsset(id); reload(); }}
            className="ml-auto rounded-lg border border-amber-600/40 px-3 py-1 text-xs text-amber-400 hover:bg-amber-800/30 transition">
            {t("assets.restoreAsset")}
          </button>
        </div>
      )}

      {/* 编辑面板 */}
      {editing && (
        <div className="rounded-2xl border border-[var(--accent)] bg-surface p-4 sm:p-6 space-y-4">
          <h2 className="text-lg font-bold text-accent">{t("assets.editAsset")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <Field label={t("assets.code")} value={editForm.symbol} onChange={v => setEditForm({ ...editForm, symbol: v })} />
            <Field label={t("assets.name")} value={editForm.name} onChange={v => setEditForm({ ...editForm, name: v })} />
            <div>
              <label className="text-xs text-muted">{t("assets.zone")}</label>
              <select value={editForm.zone} onChange={e => {
                const zone = e.target.value as AssetZone;
                const category = CAT_OPTIONS.find(([value]) => CATEGORY_ZONE[value] === zone)?.[0] || "stock";
                setEditForm({ ...editForm, zone, category });
              }}
                className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]">
                <option value="active">{t("assets.zoneActive")}</option>
                <option value="base">{t("assets.zoneBase")}</option>
                <option value="invest">{t("assets.zoneInvest")}</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted">{t("assets.category")}</label>
              <select value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value as AssetCategory })}
                className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]">
                {CAT_OPTIONS
                  .filter(([value]) => CATEGORY_ZONE[value] === editForm.zone && (value !== "crypto" || editForm.category === "crypto"))
                  .map(([value, labelKey]) => <option key={value} value={value}>{t(labelKey)}</option>)}
              </select>
            </div>
            {editForm.zone !== "invest" && (
              <>
                <Field label={t("assets.currentPrice")} type="number" value={editForm.current_price} onChange={v => setEditForm({ ...editForm, current_price: v })} />
                <Field label={t("assets.decisionCost")} type="number" value={editForm.mental_cost} onChange={v => setEditForm({ ...editForm, mental_cost: v })} />
                <Field label={t("assets.quantity")} type="number" value={editForm.quantity} onChange={v => setEditForm({ ...editForm, quantity: v })} />
              </>
            )}
            <Field label={t("assets.totalInvested")} type="number" value={editForm.total_invested} onChange={v => setEditForm({ ...editForm, total_invested: v })} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={saveEdit} disabled={saving}
              className="rounded-lg bg-accent bg-accent-hover px-6 py-2 text-sm font-semibold transition disabled:opacity-50">
              {saving ? t("assets.saving") : t("assets.save")}
            </button>
            <button onClick={() => setEditing(false)}
              className="rounded-lg border border-themed px-6 py-2 text-sm text-secondary transition hover:text-primary">
              {t("assets.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* 资产头部卡片 */}
      <div className="rounded-[var(--radius-xl)] border border-themed bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{data.zone === "invest" ? data.name : data.symbol}</h1>
              <span className="text-base text-secondary sm:text-lg">{data.zone === "invest" ? data.symbol : data.name}</span>
              {data.is_zero_cost && <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-bold text-yellow-300">{t("assets.zeroCost")}</span>}
            </div>
            <div className="mt-2 flex gap-2 flex-wrap">
              <span className={`rounded-full px-2 py-0.5 text-xs ${data.zone === "active" ? "bg-brand-soft" : data.zone === "invest" ? "bg-purple-500/20 text-purple-300" : "bg-blue-500/20 text-blue-300"}`}>
                {t(ZONE_KEY_MAP[data.zone])}
              </span>
              {data.is_cash ? (
                <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs font-medium text-cyan-300">
                  {t("assets.marketCash")}
                </span>
              ) : data.market && data.market !== "other" && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MARKET_COLORS[data.market] || ""}`}>
                  {MARKET_FLAG[data.market] || ""} {MARKET_KEY_MAP[data.market] ? t(MARKET_KEY_MAP[data.market]) : ""}
                </span>
              )}
              {!data.is_cash && <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-secondary">{t(CAT_KEY_MAP[data.category])}</span>}
              {/* 标签 */}
              {(data.tags || []).map(tag => (
                <span key={tag.id} className="group/tag inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all"
                  style={{ backgroundColor: `${tag.color}22`, color: tag.color }}>
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                  <button onClick={async (e) => { e.preventDefault(); e.stopPropagation(); await api.removeTagFromAsset(tag.id, data.id); reload(); }}
                    className="ml-0.5 rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-white/10 transition-all"
                    title={t("assets.removeTag")}>
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              <div className="relative">
                <button onClick={() => setShowTagPicker(!showTagPicker)}
                  className={`rounded-full border border-dashed px-2.5 py-0.5 text-[11px] transition-all ${showTagPicker ? "border-[var(--accent)] text-accent bg-[var(--accent-bg)]" : "border-[var(--border)] text-muted hover:text-primary hover:border-[var(--border-hover)]"}`}>
                  + {t("assets.tags")}
                </button>
                {showTagPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowTagPicker(false)} />
                    <div className="absolute top-8 left-0 z-50 w-64 rounded-xl border border-themed bg-surface p-3 shadow-2xl animate-in fade-in slide-in-from-top-1 duration-150">
                      {/* 已有标签列表 */}
                      {(() => {
                        const available = allTags.filter(t => !(data.tags || []).some(dt => dt.id === t.id));
                        return available.length > 0 ? (
                          <div className="space-y-0.5 max-h-44 overflow-y-auto mb-2.5 -mx-1 px-1">
                            {available.map(tag => (
                              <button key={tag.id} onClick={async () => { await api.addTagToAsset(tag.id, data.id); await reload(); api.listTags().then(setAllTags); }}
                                className="flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-xs hover:bg-surface-hover transition-colors group/item">
                                <span className="h-3 w-3 rounded-full flex-shrink-0 ring-1 ring-white/10" style={{ backgroundColor: tag.color }} />
                                <span className="flex-1 text-left text-secondary group-hover/item:text-primary transition-colors">{tag.name}</span>
                                <span className="text-[10px] text-muted opacity-0 group-hover/item:opacity-100 transition-opacity">{t("assets.clickToAdd")}</span>
                              </button>
                            ))}
                          </div>
                        ) : allTags.length > 0 ? (
                          <div className="flex items-center gap-2 py-3 mb-2.5 text-[11px] text-muted justify-center">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                            {t("assets.allTagsAdded")}
                          </div>
                        ) : null;
                      })()}
                      {/* 新建标签 */}
                      <div className="border-t border-themed pt-2.5">
                        <p className="text-[10px] text-muted mb-2">{t("assets.newTag")}</p>
                        <div className="flex gap-1.5 items-center mb-2">
                          {["#6366f1", "#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"].map(c => (
                            <button key={c} onClick={() => setNewTagColor(c)}
                              className={`h-5 w-5 rounded-full transition-all flex-shrink-0 ${newTagColor === c ? "ring-2 ring-white/60 ring-offset-1 ring-offset-[var(--bg-surface)] scale-110" : "hover:scale-110 opacity-70 hover:opacity-100"}`}
                              style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          <input value={newTagName} onChange={e => setNewTagName(e.target.value)}
                            placeholder={t("assets.tagName")}
                            className="flex-1 min-w-0 rounded-lg border border-themed bg-input px-2.5 py-1.5 text-xs text-primary outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                            onKeyDown={async e => {
                              if (e.key === "Enter" && newTagName.trim()) {
                                const tag = await api.createTag({ name: newTagName.trim(), color: newTagColor });
                                await api.addTagToAsset(tag.id, data.id);
                                setNewTagName(""); setNewTagColor("#6366f1");
                                api.listTags().then(setAllTags); reload();
                              }
                            }}
                            autoFocus />
                          <button onClick={async () => {
                            if (!newTagName.trim()) return;
                            const tag = await api.createTag({ name: newTagName.trim(), color: newTagColor });
                            await api.addTagToAsset(tag.id, data.id);
                            setNewTagName(""); setNewTagColor("#6366f1");
                            api.listTags().then(setAllTags); reload();
                          }} disabled={!newTagName.trim()}
                            className="rounded-lg bg-accent hover:brightness-110 px-3 py-1.5 text-xs font-semibold text-on-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
                            {t("assets.add")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="sm:text-right">
            {data.zone === "invest" ? (
              <>
                <p className="text-2xl font-bold text-purple-400 sm:text-3xl">{data.is_cash ? cashSymbol(data.symbol) : marketSymbol(data.market)}{fmt(data.total_invested)}</p>
                <p className="text-xs text-muted mt-1">{t("assets.totalInvested")}</p>
              </>
            ) : data.current_price > 0 ? (
              <>
                <p className="text-2xl font-bold sm:text-3xl flex items-baseline gap-2">
                  <span>{fmt(data.current_price)}</span>
                  {data.price_session && data.price_session !== "regular" && (
                    <span className={`text-base font-medium ${SESSION_COLOR[data.price_session] || "text-zinc-400"}`}>
                      {SESSION_LABEL_KEYS[data.price_session] ? t(SESSION_LABEL_KEYS[data.price_session]) : data.price_session}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted mt-1">{t("assets.currentPrice")} <span className="text-muted/50">{data.is_cash ? cashSymbol(data.symbol) : marketSymbol(data.market)}</span></p>
              </>
            ) : (
              <>
                <p className="text-lg text-yellow-400 sm:text-xl">{t("assets.priceMissing")}</p>
                <p className="text-xs text-muted mt-1">{t("assets.editAsset")}</p>
              </>
            )}
          </div>
        </div>

        {/* 核心指标网格 */}
        {data.zone === "invest" ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t("assets.totalInvested")} value={`${fmt(data.total_invested)}`} accent="text-purple-400" />
            <Stat label={t("assets.attributedRecovery")} value={`${fmt(data.total_cashed)}`} accent={data.total_cashed > 0 ? "text-brand" : "text-secondary"} />
            <Stat label={t("assets.returnRate")} value={data.total_invested > 0 ? `${Math.round(data.total_cashed / data.total_invested * 100)}%` : "0%"}
              accent={data.total_cashed >= data.total_invested ? "text-ok" : "text-warn"} />
            <Stat label={t("assets.investmentRecords")} value={String(data.transactions.length)} />
          </div>
        ) : (
          <>
            {/* 持仓基本面 */}
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label={t("assets.quantity")} value={fmt(data.quantity)} />
              <Stat label={t("assets.averageCost")} value={fmt(data.broker_cost)} accent="text-blue-400" />
              <Stat label={t("assets.decisionCost")} value={fmt(data.mental_cost)} />
              <Stat label={t("assets.currentValue")} value={data.current_price > 0 ? fmt(data.market_value) : "--"} accent={data.current_price > 0 ? undefined : "text-muted"} />
            </div>

            {/* 盈亏双视角 */}
            {data.current_price > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* 券商视角 — 基于持仓均价 */}
                <div className="rounded-xl border border-themed bg-surface-alt p-4">
                  <p className="text-[10px] text-muted mb-2 flex items-center gap-1">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>
                    {t("assets.actualPnl")} <span className="text-muted/50">{t("assets.basedOnAverage", { cost: fmt(data.broker_cost) })}</span>
                  </p>
                  <div className="flex items-baseline justify-between">
                    <span className={`text-xl font-bold tabular-nums ${pnlColor(data.broker_pnl)}`}>
                      {pnlSign(data.broker_pnl)}{fmt(data.broker_pnl)}
                    </span>
                    <span className={`text-sm font-semibold tabular-nums ${pnlColor(data.broker_pnl)}`}>
                      {data.broker_cost > 0 ? `${pnlSign(((data.current_price - data.broker_cost) / data.broker_cost) * 100)}${(((data.current_price - data.broker_cost) / data.broker_cost) * 100).toFixed(1)}%` : "--"}
                    </span>
                  </div>
                </div>
                {/* 心理视角 — 基于心理成本 */}
                <div className="rounded-xl border border-themed bg-surface-alt p-4">
                  <p className="text-[10px] text-muted mb-2 flex items-center gap-1">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" /></svg>
                    {t("assets.decisionPnl")} <span className="text-muted/50">{t("assets.basedOnDecision", { cost: fmt(data.mental_cost) })}</span>
                  </p>
                  <div className="flex items-baseline justify-between">
                    <span className={`text-xl font-bold tabular-nums ${pnlColor(data.mental_pnl)}`}>
                      {pnlSign(data.mental_pnl)}{fmt(data.mental_pnl)}
                    </span>
                    <span className={`text-sm font-semibold tabular-nums ${pnlColor(data.mental_pnl)}`}>
                      {data.mental_cost > 0 ? `${pnlSign(((data.current_price - data.mental_cost) / data.mental_cost) * 100)}${(((data.current_price - data.mental_cost) / data.mental_cost) * 100).toFixed(1)}%` : "--"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-themed bg-surface-alt p-4 text-center text-sm text-muted">
                {t("assets.setPriceForPnl")}
              </div>
            )}
          </>
        )}

        {/* 进度条 */}
        <div className="mt-6">
          <div className="flex flex-col gap-0.5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between mb-1">
            <span>{t(data.zone === "invest" ? "assets.recoveryProgress" : "assets.zeroCostProgress")}</span>
            <span>{t("assets.recoveredAmount", { recovered: `$${fmt(data.total_cashed)}`, invested: `$${fmt(data.total_invested)}` })}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-progress">
            <div className={`h-full rounded-full transition-all duration-500 ${data.zone === "invest" ? "bg-gradient-to-r from-purple-600 to-purple-400" : "bg-gradient-to-r from-[var(--accent-dark)] to-[var(--accent-light)]"}`}
              style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
          <p className={`mt-1 text-right text-sm font-bold ${data.zone === "invest" ? "text-purple-400" : "text-brand"}`}>{progress}%</p>
        </div>

        {/* 累计统计 */}
        {data.zone === "invest" ? (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-purple-900/20 border border-purple-800/30 p-3 sm:grid-cols-2 sm:gap-4 sm:p-4 text-center">
            <div>
              <p className="text-xs text-muted">{t("assets.totalInvested")}</p>
              <p className="text-lg font-bold text-purple-400">${fmt(data.total_invested)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">{t("assets.tradeCount")}</p>
              <p className="text-lg font-bold">{data.transactions.length}</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-surface-alt p-3 sm:grid-cols-3 sm:gap-4 sm:p-4 text-center">
            <div>
              <p className="text-xs text-muted">{t("assets.totalInvested")}</p>
              <p className="text-lg font-bold">${fmt(data.total_invested)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">{t("assets.realizedPnl")}</p>
              <p className={`text-lg font-bold ${data.total_realized > 0 ? "text-up" : data.total_realized < 0 ? "text-down" : "text-secondary"}`}>
                {data.total_realized > 0 ? "+" : ""}{fmt(data.total_realized)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">{t("assets.tradeCount")}</p>
              <p className="text-lg font-bold">{data.transactions.length}</p>
            </div>
          </div>
        )}
      </div>

      {/* 标签页导航 */}
      <div className="flex gap-1 border-b border-themed">
        {[
          { key: "overview" as const, label: t("assets.overview") },
          { key: "investment" as const, label: t("assets.capitalPlan") },
          { key: "transactions" as const, label: t(data.zone === "invest" ? "assets.investmentRecords" : "assets.transactions") },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-[var(--accent)] text-accent"
                : "border-transparent text-secondary hover:text-primary hover:border-[var(--border-hover)]"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== 概览 Tab ===== */}
      {activeTab === "overview" && (
        <>
          {/* 当前持仓批次 */}
          {data.zone === "active" && (() => {
            const cp = data.current_price;
            const hasPrice = cp > 0;
            const cs = data.is_cash ? cashSymbol(data.symbol) : marketSymbol(data.market);
            const currentIbkrLots = data.quantity > 0
              ? (data.ibkr_lots || []).filter((lot) => lot.quantity > 0.0001)
              : [];
            const hasIBKRLots = currentIbkrLots.length > 0;

            // 优先使用 IBKR Lot 数据（精确批次）
            if (hasIBKRLots) {
              const lots = currentIbkrLots;
              const totalQty = lots.reduce((s, l) => s + l.quantity, 0);
              const totalCost = lots.reduce((s, l) => s + l.cost_basis, 0);
              return (
                <div className="rounded-2xl border border-themed bg-surface p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold">{t("assets.currentLots")}</h2>
                    <span className="text-xs text-muted">{t("assets.lotSummary", { count: lots.length, quantity: fmt(totalQty) })}</span>
                  </div>
                  <div className="space-y-2">
                    {lots.map((lot, i) => {
                      const lotValue = hasPrice ? cp * lot.quantity : lot.market_value;
                      const lotPnl = hasPrice ? lotValue - lot.cost_basis : lot.unrealized_pnl;
                      const lotPnlPct = lot.cost_basis > 0 ? (lotPnl / lot.cost_basis) * 100 : 0;
                      const isProfit = lotPnl >= 0;
                      // 解析日期: "2026-02-09, 13:21:14" -> "02/09 13:21"
                      const dtParts = lot.open_datetime.split(", ");
                      const datePart = dtParts[0] || "";
                      const timePart = dtParts[1] || "";
                      const dp = datePart.split("-");
                      const shortDate = dp.length >= 3 ? `${dp[1]}/${dp[2]} ${timePart.slice(0, 5)}` : lot.open_datetime;
                      return (
                        <div key={i} className="flex items-center gap-3 rounded-lg bg-surface-alt px-3 py-2.5 border border-themed">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-secondary font-medium">{shortDate}</span>
                              <span className="text-muted">@</span>
                              <span className="text-primary font-medium">{cs}{fmt(lot.cost_price)}</span>
                            </div>
                            <div className="mt-0.5 text-[10px] text-muted">
                              {t("assets.holdingLine", { quantity: fmt(lot.quantity), cost: `${cs}${fmt(lot.cost_basis)}` })}
                            </div>
                          </div>
                          {hasPrice ? (
                            <div className="text-right shrink-0">
                              <div className={`text-sm font-bold tabular-nums ${isProfit ? "text-up" : "text-down"}`}>
                                {isProfit ? "+" : ""}{fmt(lotPnl)}
                              </div>
                              <div className={`text-[10px] font-medium tabular-nums ${isProfit ? "text-up opacity-70" : "text-down opacity-70"}`}>
                                {isProfit ? "+" : ""}{lotPnlPct.toFixed(1)}%
                              </div>
                            </div>
                          ) : (
                            <div className="text-right shrink-0 text-xs text-muted">--</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* 汇总 */}
                  {hasPrice && (() => {
                    const totalValue = cp * totalQty;
                    const totalPnl = totalValue - totalCost;
                    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
                    const isProfit = totalPnl >= 0;
                    return (
                      <div className="mt-3 pt-3 border-t border-themed flex items-center justify-between text-sm">
                        <span className="text-muted">{t("assets.totalHolding", { quantity: fmt(totalQty), cost: `${cs}${fmt(totalCost)}`, value: `${cs}${fmt(totalValue)}` })}</span>
                        <span className={`font-bold ${isProfit ? "text-up" : "text-down"}`}>
                          {isProfit ? "+" : ""}{fmt(totalPnl)} ({isProfit ? "+" : ""}{totalPnlPct.toFixed(1)}%)
                        </span>
                      </div>
                    );
                  })()}
                </div>
              );
            }

            // Fallback: 从交易记录推算批次
            const holdingTxs = data.transactions
              .filter(isCurrentBuyBatch)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            if (holdingTxs.length === 0) return null;
            return (
              <div className="rounded-2xl border border-themed bg-surface p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">{t("assets.currentLots")}</h2>
                  <span className="text-xs text-muted">{t("assets.lotSummary", { count: holdingTxs.length, quantity: fmt(holdingTxs.reduce((sum, tx) => sum + remainingQty(tx), 0)) })}</span>
                </div>
                <div className="space-y-2">
                  {holdingTxs.map((tx) => {
                    const remaining = remainingQty(tx);
                    const costPerShare = tx.price + tx.fee / tx.quantity;
                    const batchCost = costPerShare * remaining;
                    const batchValue = cp * remaining;
                    const pnl = hasPrice ? batchValue - batchCost : 0;
                    const pnlPct = hasPrice && costPerShare > 0 ? ((cp - costPerShare) / costPerShare) * 100 : 0;
                    const isProfit = pnl >= 0;
                    return (
                      <div key={tx.id} className="flex items-center gap-3 rounded-lg bg-surface-alt px-3 py-2.5 border border-themed">
                        {/* 左：日期+价格 */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-secondary font-medium">{fmtDate(tx.created_at)}</span>
                            <span className="text-muted">@</span>
                            <span className="text-primary font-medium">{cs}{fmt(tx.price)}</span>
                            {tx.sold_quantity > 0 && (
                              <span className="rounded-full bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 text-[10px]">
                                {t("assets.partiallySold")}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted">
                            {t("assets.holdingLine", { quantity: fmt(remaining), cost: `${cs}${fmt(batchCost)}` })}
                            {tx.note && <span className="ml-2">{tx.note}</span>}
                          </div>
                        </div>
                        {/* 右：浮盈 */}
                        {hasPrice ? (
                          <div className="text-right shrink-0">
                            <div className={`text-sm font-bold tabular-nums ${isProfit ? "text-up" : "text-down"}`}>
                              {isProfit ? "+" : ""}{fmt(pnl)}
                            </div>
                            <div className={`text-[10px] font-medium tabular-nums ${isProfit ? "text-up opacity-70" : "text-down opacity-70"}`}>
                              {isProfit ? "+" : ""}{pnlPct.toFixed(1)}%
                            </div>
                          </div>
                        ) : (
                          <div className="text-right shrink-0 text-xs text-muted">--</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* 汇总 */}
                {hasPrice && (() => {
                  const totalRemaining = holdingTxs.reduce((s, t) => s + remainingQty(t), 0);
                  const totalCost = holdingTxs.reduce((s, t) => {
                    const rem = remainingQty(t);
                    return s + (t.price + t.fee / t.quantity) * rem;
                  }, 0);
                  const totalValue = cp * totalRemaining;
                  const totalPnl = totalValue - totalCost;
                  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
                  const isProfit = totalPnl >= 0;
                  return (
                    <div className="mt-3 pt-3 border-t border-themed flex items-center justify-between text-sm">
                      <span className="text-muted">{t("assets.totalHolding", { quantity: fmt(totalRemaining), cost: `${cs}${fmt(totalCost)}`, value: `${cs}${fmt(totalValue)}` })}</span>
                      <span className={`font-bold ${isProfit ? "text-up" : "text-down"}`}>
                        {isProfit ? "+" : ""}{fmt(totalPnl)} ({isProfit ? "+" : ""}{totalPnlPct.toFixed(1)}%)
                      </span>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* 交易计划 — 仅博弈资产 (active/base) */}
          {data.zone !== "invest" && (
            <TradePlanSection assetId={data.id} plans={data.trade_plans || []} currentQty={data.quantity} currentPrice={data.current_price} onChanged={reload} />
          )}
        </>
      )}

      {/* ===== 资金规划 Tab ===== */}
      {activeTab === "investment" && (() => {
        const s = data.investment_summary;
        const effectiveTotal = s.effective_total;
        const remaining = s.remaining_to_invest;
        const progress = s.investment_progress;
        return (
        <div className="rounded-2xl border border-themed bg-surface p-4 sm:p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{t("assets.capitalPlan")}</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${data.planned_includes_invested ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"}`}>
              {t(data.planned_includes_invested ? "assets.totalMode" : "assets.additiveMode")}
            </span>
          </div>

          {/* 指标卡片 */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div>
              <p className="text-xs text-muted">{t("assets.plannedInvestment")}</p>
              <p className="mt-1 text-lg font-bold text-accent">${fmt(data.planned_investment)}</p>
              {!data.planned_includes_invested && (
                <p className="text-[10px] text-muted mt-0.5">{t("assets.totalBudget", { amount: `$${fmt(effectiveTotal)}` })}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted">{t("assets.alreadyInvested")}</p>
              <p className="mt-1 text-lg font-bold text-brand">${fmt(s.calculated_investment)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">{t("assets.remainingCapital")}</p>
              <p className={`mt-1 text-lg font-bold ${remaining > 0 ? "text-yellow-400" : "text-muted"}`}>${fmt(remaining)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">{t("assets.executionProgress")}</p>
              <p className="mt-1 text-lg font-bold">{effectiveTotal > 0 ? `${Math.round(progress * 100)}%` : "--"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">{t("assets.totalInvested")}</p>
              <p className="mt-1 text-lg font-bold text-secondary">${fmt(data.total_invested)}</p>
            </div>
          </div>

          {effectiveTotal > 0 && (
            <div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-progress">
                <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] transition-all duration-500"
                  style={{ width: `${Math.min(progress * 100, 100)}%` }} />
              </div>
            </div>
          )}

          {/* 模式说明 */}
          <div className="rounded-lg bg-surface-alt p-3 text-xs text-muted space-y-1">
            {data.planned_includes_invested ? (
              <>
                <p>{t("assets.totalModeExplanation", { invested: `$${fmt(s.calculated_investment)}`, remaining: `$${fmt(remaining)}`, total: `$${fmt(data.planned_investment)}` })}</p>
              </>
            ) : (
              <>
                <p>{t("assets.additiveModeExplanation", { invested: `$${fmt(s.calculated_investment)}`, total: `$${fmt(effectiveTotal)}` })}</p>
              </>
            )}
          </div>

          {/* 修改表单 */}
          <div className="border-t border-themed pt-4 space-y-4">
            <p className="text-sm font-semibold">{t("assets.editPlannedInvestment")}</p>

            {/* 模式切换 */}
            <div className="flex items-center gap-3 rounded-lg bg-surface-alt p-3">
              <button onClick={() => setIncludesInvested(true)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${includesInvested ? "bg-blue-600 text-white" : "text-secondary hover:text-primary"}`}>
                {t("assets.totalMode")}
              </button>
              <button onClick={() => setIncludesInvested(false)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${!includesInvested ? "bg-purple-600 text-white" : "text-secondary hover:text-primary"}`}>
                {t("assets.additiveMode")}
              </button>
            </div>
            <p className="text-xs text-muted">
              {t(includesInvested ? "assets.totalModeHint" : "assets.additiveModeHint")}
            </p>

            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted">{t(includesInvested ? "assets.totalPlannedAmount" : "assets.additionalAmount")}</label>
                <input type="number" step="any" value={plannedInvestment}
                  onChange={e => setPlannedInvestment(e.target.value)}
                  placeholder={String(data.planned_investment)}
                  className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
              </div>
              <button onClick={updatePlannedInvestment} disabled={updatingInvestment}
                className="rounded-lg bg-accent bg-accent-hover px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50">
                {updatingInvestment ? t("assets.saving") : t("assets.save")}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ===== 交易记录 Tab ===== */}
      {activeTab === "transactions" && (
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
      {/* 交易记录 */}
      {data.transactions.length === 0 ? (
        <div className="rounded-2xl border border-themed bg-surface p-6">
          <h2 className="mb-4 text-lg font-bold">{t(data.zone === "invest" ? "assets.investmentRecords" : "assets.transactions")}</h2>
          <div className="py-8 text-center text-muted">
            {t(data.zone === "invest" ? "assets.noInvestmentRecords" : "assets.noTransactions")} {" "}
            <Link href={`/trade?asset=${data.id}`} className="text-accent hover:underline">{t("assets.addOne")}</Link>
          </div>
        </div>
      ) : data.zone === "invest" ? (
        /* invest区：直接展示所有投入记录 */
        <div className="rounded-2xl border border-purple-800/30 bg-surface p-6">
          <h2 className="mb-4 text-lg font-bold text-purple-300">{t("assets.investmentRecords")}</h2>
          <div className="space-y-3">
            {data.transactions.map((tx) => <TxCard key={tx.id} tx={tx} allTxs={data.transactions} assetId={data.id} allAssets={allAssets} onChanged={reload} isInvest />)}
          </div>
        </div>
      ) : (
        <>
          {/* 视图切换 */}
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => setTxViewMode("grouped")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${txViewMode === "grouped" ? "bg-surface-alt text-accent" : "text-muted hover:text-secondary"}`}>
              {t("assets.byLot")}
            </button>
            <button onClick={() => setTxViewMode("timeline")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${txViewMode === "timeline" ? "bg-surface-alt text-accent" : "text-muted hover:text-secondary"}`}>
              {t("assets.byTime")}
            </button>
          </div>

          {txViewMode === "timeline" ? (
            /* 时间线视图：所有交易按时间倒序 */
            <div className="rounded-2xl border border-themed bg-surface p-6">
              <h2 className="mb-4 text-lg font-bold">{t("assets.allTransactions", { count: data.transactions.length })}</h2>
              <div className="space-y-3">
                {[...data.transactions]
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((tx) => <TxCard key={tx.id} tx={tx} allTxs={data.transactions} assetId={data.id} allAssets={allAssets} onChanged={reload} />)}
              </div>
            </div>
          ) : (
            <>
              {/* 持仓批次 */}
              {(() => {
                const buyTxs = data.transactions.filter(isCurrentBuyBatch);
                const sellTxs = data.transactions.filter(t => t.tx_type !== "buy");
                return buyTxs.length > 0 ? (
                  <div className="rounded-2xl border border-themed bg-surface p-6">
                    <h2 className="mb-4 text-lg font-bold">{t("assets.currentLots")}</h2>
                    <div className="space-y-3">
                      {buyTxs.map((tx) => <TxCard key={tx.id} tx={tx} allTxs={data.transactions} assetId={data.id} allAssets={allAssets} onChanged={reload} />)}
                    </div>
                    {sellTxs.length > 0 && (
                      <div className="mt-4 space-y-3">
                        <p className="text-xs text-muted border-t border-themed pt-3">{t("assets.transactions")}</p>
                        {sellTxs.map((tx) => <TxCard key={tx.id} tx={tx} allTxs={data.transactions} assetId={data.id} allAssets={allAssets} onChanged={reload} />)}
                      </div>
                    )}
                  </div>
                ) : null;
              })()}

              {/* 战绩回顾 — 已清仓批次 */}
              {(() => {
                const clearedTxs = data.transactions.filter(isHistoricalBuyBatch);
                return clearedTxs.length > 0 ? (
                  <div className="rounded-2xl border border-themed bg-surface p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <h2 className="text-lg font-bold">{t("assets.historicalLots")}</h2>
                      <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs text-secondary">{t("assets.closedLots", { count: clearedTxs.length })}</span>
                    </div>
                    <div className="space-y-3">
                      {clearedTxs.map((tx) => <TxCard key={tx.id} tx={tx} allTxs={data.transactions} assetId={data.id} allAssets={allAssets} onChanged={reload} />)}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* 如果没有买入只有卖出（极端情况）显示全部 */}
              {data.transactions.every(t => t.tx_type !== "buy") && (
                <div className="rounded-2xl border border-themed bg-surface p-6">
                  <h2 className="mb-4 text-lg font-bold">{t("assets.transactions")}</h2>
                  <div className="space-y-3">
                    {data.transactions.map((tx) => <TxCard key={tx.id} tx={tx} allTxs={data.transactions} assetId={data.id} allAssets={allAssets} onChanged={reload} />)}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
      </div>
      <QuickReviewPanel
        scope="asset"
        asset={{ id: data.id, symbol: data.symbol, name: data.name }}
        className="xl:sticky xl:top-28"
      />
      </div>)}

      {/* 归档/删除确认弹窗 */}
      <ConfirmModal
        open={confirmAction === "archive"}
        title={t("assets.archiveTitle")}
        message={t("assets.archiveDetailMessage", { symbol: data.symbol })}
        confirmText={t("assets.archive")}
        danger={false}
        onConfirm={async () => { setConfirmAction(null); await api.archiveAsset(id); reload(); }}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmModal
        open={confirmAction === "delete"}
        title={t("assets.permanentDeleteTitle")}
        message={t("assets.permanentDeleteMessage", { symbol: data.symbol })}
        confirmText={t("assets.permanentDelete")}
        danger
        onConfirm={async () => { setConfirmAction(null); await api.deleteAsset(id); router.push("/assets"); }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

const STATUS_MAP: Record<string, { labelKey: string; color: string }> = {
  holding: { labelKey: "assets.holding", color: "bg-brand-soft" },
  partial_sold: { labelKey: "assets.partiallySold", color: "bg-yellow-500/20 text-yellow-300" },
  cleared: { labelKey: "assets.cleared", color: "bg-gray-600/30 text-secondary" },
};

function TxCard({ tx, allTxs, assetId, allAssets, onChanged, isInvest }: {
  tx: TransactionRecord; allTxs: TransactionRecord[];
  assetId: number; allAssets: Asset[]; onChanged: () => void; isInvest?: boolean;
}) {
  const { t, localeTag } = useI18n();
  const fmt = (value: number) => value.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDate = (value: string) => new Date(value).toLocaleString(localeTag, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const isBuy = tx.tx_type === "buy";
  const isSell = !isBuy;
  const borderColor = isInvest
    ? "border-l-purple-500"
    : isBuy
      ? (tx.status === "cleared" ? "border-l-gray-500" : "border-l-emerald-500")
      : "border-l-red-400";
  const typeColor = isInvest ? "text-purple-400" : (isBuy ? "text-up" : "text-down");
  const total = tx.price * tx.quantity;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editF, setEditF] = useState({ price: "", quantity: "", fee: "", note: "" });
  const [editAllocs, setEditAllocs] = useState<ProfitAllocationIn[]>([]);
  const [allocRaws, setAllocRaws] = useState<string[]>([]);
  const [editBatchItems, setEditBatchItems] = useState<SellBatchItemIn[]>([]);
  const [txMsg, setTxMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  // 卖出记录关联的买入批次（兼容新旧两种方式）
  const sourceTx = tx.source_tx_id ? allTxs.find(t => t.id === tx.source_tx_id) : null;
  const batchSources = (tx.batch_items && tx.batch_items.length > 0)
    ? tx.batch_items.map(bi => ({ ...bi, buyTx: allTxs.find(t => t.id === bi.buy_tx_id) }))
    : [];

  // 还需要包含当前卖出已关联的买入批次（即使已清仓也要显示以便编辑）
  const editableBuyBatches = isSell
    ? allTxs.filter(t => {
        if (t.tx_type !== "buy") return false;
        // 包含仍有剩余数量的当前批次
        if (isCurrentBuyBatch(t)) return true;
        // 包含当前卖出已关联的
        if (tx.batch_items?.some(bi => bi.buy_tx_id === t.id)) return true;
        if (tx.source_tx_id === t.id) return true;
        return false;
      })
    : [];

  const openEdit = () => {
    setEditF({
      price: String(tx.price),
      quantity: String(tx.quantity),
      fee: String(tx.fee),
      note: tx.note || "",
    });
    // 卖出交易：加载现有利润分配
    if (isSell) {
      const allocs = tx.allocations.map(a => ({
        allocation_type: a.allocation_type as AllocationType,
        amount: a.amount,
        target_asset_id: a.target_asset_id,
      }));
      setEditAllocs(allocs);
      setAllocRaws(allocs.map(a => a.amount ? String(a.amount) : ""));
      // 加载现有批次分配
      if (tx.batch_items && tx.batch_items.length > 0) {
        setEditBatchItems(tx.batch_items.map(bi => ({ buy_tx_id: bi.buy_tx_id, quantity: bi.quantity })));
      } else {
        setEditBatchItems([]);
      }
    }
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    setTxMsg(null);
    try {
      const update: TransactionUpdate = {};
      const p = parseFloat(editF.price);
      const q = parseFloat(editF.quantity);
      const f = parseFloat(editF.fee);
      if (!isNaN(p) && p !== tx.price) update.price = p;
      if (!isNaN(q) && q !== tx.quantity) update.quantity = q;
      if (!isNaN(f) && f !== tx.fee) update.fee = f;
      if (editF.note !== (tx.note || "")) update.note = editF.note || undefined;
      // 卖出交易：始终发送 allocations（允许清空）
      if (isSell) {
        update.allocations = editAllocs.filter(a => a.amount > 0);
        update.batch_items = editBatchItems.filter(bi => bi.buy_tx_id > 0 && bi.quantity > 0);
      }
      await api.updateTransaction(tx.id, update);
      setEditing(false);
      setTxMsg({ ok: true, text: t("assets.saved") });
      onChanged();
      setTimeout(() => setTxMsg(null), 2000);
    } catch (e: unknown) {
      setTxMsg({ ok: false, text: e instanceof Error ? e.message : t("assets.saveFailed") });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setConfirmDel(false);
    setDeleting(true);
    setTxMsg(null);
    try {
      await api.deleteTransaction(tx.id);
      onChanged();
    } catch (e: unknown) {
      setTxMsg({ ok: false, text: e instanceof Error ? e.message : t("assets.deleteFailed") });
    } finally { setDeleting(false); }
  };

  const statusInfo = isBuy ? STATUS_MAP[tx.status] : null;

  return (
    <div className={`rounded-lg border border-themed border-l-4 ${borderColor} bg-surface-alt p-3 sm:p-4`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-bold ${typeColor}`}>{isInvest ? t("assets.invested") : t(TX_KEY_MAP[tx.tx_type])}</span>
          <span className="text-sm text-secondary">{formatDate(tx.created_at)}</span>
          {statusInfo && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusInfo.color}`}>
              {t(statusInfo.labelKey)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {tx.realized_profit !== 0 && (
            <span className={`text-sm font-bold ${tx.realized_profit >= 0 ? "text-up" : "text-down"}`}>
              {tx.realized_profit >= 0 ? "+" : ""}{fmt(tx.realized_profit)}
            </span>
          )}
          {!editing && (
            <>
              <button onClick={openEdit} className="text-xs text-muted hover:text-accent transition">{t("assets.edit")}</button>
              <button onClick={() => setConfirmDel(true)} disabled={deleting}
                className="text-xs text-muted hover:text-red-400 transition disabled:opacity-50">
                {deleting ? t("assets.deleting") : t("assets.delete")}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 操作反馈 */}
      {txMsg && (
        <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${txMsg.ok ? "bg-ok-soft" : "bg-risk-soft"}`}>
          {txMsg.text}
          {!txMsg.ok && <button onClick={() => setTxMsg(null)} className="ml-3 underline">{t("trade.close")}</button>}
        </div>
      )}

      {/* 买入批次的卖出进度 */}
      {!isInvest && isBuy && tx.sold_quantity > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          <span className="text-muted">{t("assets.sellProgress")}</span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-progress">
            <div className="h-full rounded-full bg-orange-500 transition-all"
              style={{ width: `${Math.min(tx.sold_quantity / tx.quantity, 1) * 100}%` }} />
          </div>
          <span className="text-secondary">{fmt(tx.sold_quantity)} / {fmt(tx.quantity)}</span>
          <span className="text-muted">{t("assets.remaining", { quantity: fmt(remainingQty(tx)) })}</span>
        </div>
      )}

      {/* 卖出记录关联的源买入 */}
      {!isBuy && batchSources.length > 0 ? (
        <div className="mt-1 space-y-0.5">
          {batchSources.map((bs) => (
            <div key={bs.id} className="text-[10px] text-muted">
              {t("assets.fromLot", { id: bs.buy_tx_id })}
              {bs.buyTx && (<> ({formatDate(bs.buyTx.created_at)} {t("review.buy")} @ {fmt(bs.buyTx.price)})</>)}
              × {fmt(bs.quantity)}
            </div>
          ))}
        </div>
      ) : !isBuy && sourceTx ? (
        <div className="mt-1 text-[10px] text-muted">
          {t("assets.fromLot", { id: sourceTx.id })} ({formatDate(sourceTx.created_at)} {t("review.buy")} @ {fmt(sourceTx.price)})
        </div>
      ) : null}

      {/* 编辑表单 */}
      {editing ? (
        <div className="mt-3 space-y-3">
          {isInvest ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TxField label={t("trade.investmentAmount")} value={editF.price} onChange={v => setEditF({ ...editF, price: v })} />
              <TxField label={t("trade.fee")} value={editF.fee} onChange={v => setEditF({ ...editF, fee: v })} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <TxField label={t("assets.price")} value={editF.price} onChange={v => setEditF({ ...editF, price:v })} />
              <TxField label={t("trade.quantity")} value={editF.quantity} onChange={v => setEditF({ ...editF, quantity: v })} />
              <TxField label={t("trade.fee")} value={editF.fee} onChange={v => setEditF({ ...editF, fee: v })} />
            </div>
          )}
          <div>
            <label className="text-xs text-muted">{t("cash.note")}</label>
            <input value={editF.note} onChange={e => setEditF({ ...editF, note: e.target.value })}
              className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              placeholder={t("trade.optional")} />
          </div>

          {/* 卖出交易：批次选择 */}
          {isSell && !isInvest && editableBuyBatches.length > 0 && (
            <div className="space-y-2 rounded-lg border border-themed bg-surface p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-secondary">{t("assets.linkedBuyLots")} <span className="text-muted font-normal">({t("trade.optional")})</span></p>
                <button onClick={() => setEditBatchItems([...editBatchItems, { buy_tx_id: 0, quantity: 0 }])}
                  className="text-xs text-accent hover:underline">+ {t("trade.addBatch")}</button>
              </div>
              {editBatchItems.length === 0 ? (
                <p className="text-[10px] text-muted">{t("trade.weightedCostHint")}</p>
              ) : (
                <>
                  {editBatchItems.map((bi, i) => {
                    const batch = allTxs.find(t => t.id === bi.buy_tx_id);
                    // 可卖数量 = 批次总量 - 已卖 + 当前编辑中分配给此批次的（因为保存时会先还原）
                    const currentBiQty = tx.batch_items?.find(x => x.buy_tx_id === bi.buy_tx_id)?.quantity ?? 0;
                    const remaining = batch ? remainingQty(batch) + currentBiQty : 0;
                    const usedIds = editBatchItems.filter((_, idx) => idx !== i).map(x => x.buy_tx_id);
                    const choosable = editableBuyBatches.filter(b => !usedIds.includes(b.id));
                    return (
                      <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2">
                        <div className="flex-1 min-w-0">
                          <label className="text-[10px] text-muted">{t("trade.buyBatch")}</label>
                          <select value={bi.buy_tx_id || ""} onChange={(e) => {
                            const newId = +e.target.value;
                            const newBatch = allTxs.find(t => t.id === newId);
                            const curBiQty = tx.batch_items?.find(x => x.buy_tx_id === newId)?.quantity ?? 0;
                            const rem = newBatch ? remainingQty(newBatch) + curBiQty : 0;
                            const newItems = [...editBatchItems];
                            newItems[i] = { buy_tx_id: newId, quantity: rem };
                            setEditBatchItems(newItems);
                          }} className="mt-0.5 w-full rounded border border-themed bg-input px-2 py-1.5 text-xs">
                            <option value="">{t("trade.selectBatch")}</option>
                            {choosable.map(b => {
                              const curBiQty2 = tx.batch_items?.find(x => x.buy_tx_id === b.id)?.quantity ?? 0;
                              const rem = remainingQty(b) + curBiQty2;
                              return (
                                <option key={b.id} value={b.id}>
                                  #{b.id} | {fmt(b.price)} x {fmt(b.quantity)} | {t("trade.available", { quantity: fmt(rem) })} | {formatDate(b.created_at)}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <div className="w-24">
                          <label className="text-[10px] text-muted">{t("trade.quantity")}</label>
                          <input type="number" step="any" value={bi.quantity || ""}
                            onChange={(e) => {
                              const newItems = [...editBatchItems];
                              newItems[i] = { ...bi, quantity: parseFloat(e.target.value) || 0 };
                              setEditBatchItems(newItems);
                            }}
                            className="mt-0.5 w-full rounded border border-themed bg-input px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                        </div>
                        {batch && <span className="mb-1 text-[10px] text-muted whitespace-nowrap">{t("trade.available", { quantity: fmt(remaining) })}</span>}
                        <button onClick={() => setEditBatchItems(editBatchItems.filter((_, idx) => idx !== i))}
                          className="text-xs text-red-400 hover:underline sm:mb-1">{t("trade.remove")}</button>
                      </div>
                    );
                  })}
                  {(() => {
                    const totalBatchQty = editBatchItems.reduce((s, bi) => s + bi.quantity, 0);
                    const sellQty = parseFloat(editF.quantity) || tx.quantity;
                    if (totalBatchQty <= 0) return null;
                    const diff = sellQty - totalBatchQty;
                    return Math.abs(diff) > 0.0001 ? (
                      <p className={`text-[10px] ${diff > 0 ? "text-yellow-400" : "text-red-400"}`}>
                        {t(diff > 0 ? "trade.allocateMore" : "trade.overAllocated", { quantity: fmt(Math.abs(diff)) })}
                      </p>
                    ) : (
                      <p className="text-[10px] text-accent">{t("trade.allocationComplete")}</p>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* 卖出交易：利润分配编辑 */}
          {isSell && (
            <div className="space-y-2 rounded-lg border border-yellow-800 bg-yellow-900/20 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-yellow-300">{t("trade.profitAllocation")}</p>
                <div className="flex items-center gap-3">
                  {tx.realized_profit !== 0 && (
                    <button onClick={() => {
                      if (editAllocs.length === 0) {
                        setEditAllocs([{ allocation_type: "self_offset" as AllocationType, amount: Math.abs(tx.realized_profit), target_asset_id: null }]);
                        setAllocRaws([String(Math.abs(tx.realized_profit))]);
                      } else {
                        const newAllocs = [...editAllocs];
                        const newRaws = [...allocRaws];
                        newAllocs[0] = { ...newAllocs[0], amount: Math.abs(tx.realized_profit) };
                        newRaws[0] = String(Math.abs(tx.realized_profit));
                        setEditAllocs(newAllocs);
                        setAllocRaws(newRaws);
                      }
                    }} className="text-xs text-yellow-300 hover:underline">
                      {t("trade.allProfit", { amount: fmt(Math.abs(tx.realized_profit)) })}
                    </button>
                  )}
                  <button onClick={() => {
                    setEditAllocs([...editAllocs, { allocation_type: "self_offset" as AllocationType, amount: 0, target_asset_id: null }]);
                    setAllocRaws([...allocRaws, ""]);
                  }} className="text-xs text-accent hover:underline">+ {t("assets.add")}</button>
                </div>
              </div>
              {editAllocs.map((a, i) => (
                <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted">{t("trade.destination")}</label>
                    <select value={a.allocation_type}
                      onChange={e => {
                        const newAllocs = [...editAllocs];
                        newAllocs[i] = { ...a, allocation_type: e.target.value as AllocationType };
                        setEditAllocs(newAllocs);
                      }}
                      className="mt-0.5 w-full rounded border border-themed bg-input px-2 py-1.5 text-xs">
                      <option value="self_offset">{t("trade.selfOffset")}</option>
                      <option value="cross_save">{t("trade.crossSave")}</option>
                      <option value="to_harbor">{t("trade.toHarbor")}</option>
                    </select>
                  </div>
                  {a.allocation_type === "cross_save" && (
                    <div className="flex-1">
                      <label className="text-[10px] text-muted">{t("trade.targetAsset")}</label>
                      <select value={a.target_asset_id ?? ""}
                        onChange={e => {
                          const newAllocs = [...editAllocs];
                          newAllocs[i] = { ...a, target_asset_id: +e.target.value || null };
                          setEditAllocs(newAllocs);
                        }}
                        className="mt-0.5 w-full rounded border border-themed bg-input px-2 py-1.5 text-xs">
                        <option value="">{t("trade.choose")}</option>
                        {allAssets.filter(x => x.id !== assetId).map(x => (
                          <option key={x.id} value={x.id}>{x.symbol} — {x.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="w-24">
                    <label className="text-[10px] text-muted">{t("trade.amount")}</label>
                    <input type="number" step="any" value={allocRaws[i] ?? ""}
                      onChange={e => {
                        const v = e.target.value;
                        const newRaws = [...allocRaws];
                        newRaws[i] = v;
                        setAllocRaws(newRaws);
                        const newAllocs = [...editAllocs];
                        newAllocs[i] = { ...a, amount: parseFloat(v) || 0 };
                        setEditAllocs(newAllocs);
                      }}
                      className="mt-0.5 w-full rounded border border-themed bg-input px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                  </div>
                  <button onClick={() => {
                    setEditAllocs(editAllocs.filter((_, idx) => idx !== i));
                    setAllocRaws(allocRaws.filter((_, idx) => idx !== i));
                  }} className="text-xs text-red-400 hover:underline sm:mb-1">{t("trade.remove")}</button>
                </div>
              ))}
              {editAllocs.length === 0 && (
                <p className="text-[10px] text-muted">{t("trade.noAllocationHint")}</p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={saveEdit} disabled={saving}
              className="rounded bg-accent bg-accent-hover px-4 py-1.5 text-xs font-semibold transition disabled:opacity-50">
              {saving ? t("assets.saving") : t("assets.save")}
            </button>
            <button onClick={() => setEditing(false)}
              className="rounded border border-themed px-4 py-1.5 text-xs text-secondary transition hover:text-primary">
              {t("assets.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-secondary">
            {isInvest ? (
              <>
                <span>{t("trade.investmentAmount")} <strong className="text-purple-300">${fmt(total)}</strong></span>
                {tx.fee > 0 && <span>{t("trade.fee")} <strong className="text-yellow-400">{fmt(tx.fee)}</strong></span>}
              </>
            ) : (
              <>
                <span>{t("assets.price")} <strong className="text-primary">{fmt(tx.price)}</strong></span>
                <span>{t("trade.quantity")} <strong className="text-primary">{fmt(tx.quantity)}</strong></span>
                <span>{t("trade.amount")} <strong className="text-primary">${fmt(total)}</strong></span>
                {tx.fee > 0 && <span>{t("trade.fee")} <strong className="text-yellow-400">{fmt(tx.fee)}</strong></span>}
              </>
            )}
          </div>
          {tx.note && <p className="mt-2 text-xs text-muted italic">{tx.note}</p>}
          {tx.allocations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {tx.allocations.map((a) => (
                <span key={a.id} className="rounded bg-yellow-900/30 px-2 py-0.5 text-xs text-yellow-300">
                  {t(ALLOC_KEY_MAP[a.allocation_type])} ${fmt(a.amount)}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      <ConfirmModal open={confirmDel} title={t("assets.deleteTransactionTitle")}
        message={t("assets.deleteTransactionMessage")}
        confirmText={t("assets.delete")} onConfirm={handleDelete} onCancel={() => setConfirmDel(false)} />
    </div>
  );
}

function TxField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted">{label}</label>
      <input type="number" step="any" value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
    </div>
  );
}

// 价格时段标签
const SESSION_LABEL_KEYS: Record<string, string> = { pre_market: "assets.sessionPre", regular: "assets.sessionRegular", post_market: "assets.sessionPost", closed: "assets.sessionClosed" };
const SESSION_COLOR: Record<string, string> = { pre_market: "text-amber-400", regular: "text-up", post_market: "text-info", closed: "text-zinc-400" };

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${accent || "text-primary"}`}>{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  const isNum = type === "number";
  return (
    <div>
      <label className="text-xs text-muted">{label}</label>
      <input type={isNum ? "number" : type} step={isNum ? "any" : undefined}
        value={value} onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
    </div>
  );
}

/* ================================================================
   交易计划板块
   ================================================================ */
const PLAN_STATUS_MAP: Record<string, { labelKey: string; color: string }> = {
  active: { labelKey: "plan.active", color: "bg-brand-soft" },
  completed: { labelKey: "plan.completed", color: "bg-blue-500/20 text-blue-300" },
  abandoned: { labelKey: "plan.abandoned", color: "bg-gray-600/30 text-secondary" },
};

function TradePlanSection({ assetId, plans, currentQty, currentPrice, onChanged }: {
  assetId: number; plans: TradePlan[]; currentQty: number; currentPrice: number; onChanged: () => void;
}) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelId, setConfirmDelId] = useState<number | null>(null);

  const emptyForm = {
    target_position: "", max_position: "",
    build_low: "", build_high: "",
    stop_loss: "",
    take_profit_1: "", take_profit_2: "", take_profit_3: "",
    support_1: "", support_2: "", resistance_1: "", resistance_2: "",
    buy_strategy: "", sell_strategy: "", note: "",
  };
  const [form, setForm] = useState(emptyForm);

  const activePlan = plans.find(p => p.status === "active");
  const historyPlans = plans.filter(p => p.status !== "active");

  const openCreate = () => {
    setForm(emptyForm);
    setEditId(null);
    setCreating(true);
    setMsg(null);
  };

  const openEdit = (p: TradePlan) => {
    setForm({
      target_position: p.target_position ? String(p.target_position) : "",
      max_position: p.max_position ? String(p.max_position) : "",
      build_low: p.build_low != null ? String(p.build_low) : "",
      build_high: p.build_high != null ? String(p.build_high) : "",
      stop_loss: p.stop_loss != null ? String(p.stop_loss) : "",
      take_profit_1: p.take_profit_1 != null ? String(p.take_profit_1) : "",
      take_profit_2: p.take_profit_2 != null ? String(p.take_profit_2) : "",
      take_profit_3: p.take_profit_3 != null ? String(p.take_profit_3) : "",
      support_1: p.support_1 != null ? String(p.support_1) : "",
      support_2: p.support_2 != null ? String(p.support_2) : "",
      resistance_1: p.resistance_1 != null ? String(p.resistance_1) : "",
      resistance_2: p.resistance_2 != null ? String(p.resistance_2) : "",
      buy_strategy: storedTextToMarkdown(p.buy_strategy || ""),
      sell_strategy: storedTextToMarkdown(p.sell_strategy || ""),
      note: storedTextToMarkdown(p.note || ""),
    });
    setEditId(p.id);
    setCreating(true);
    setMsg(null);
  };

  const n = (v: string) => v ? parseFloat(v) || null : null;

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        target_position: parseFloat(form.target_position) || 0,
        max_position: parseFloat(form.max_position) || 0,
        build_low: n(form.build_low), build_high: n(form.build_high),
        stop_loss: n(form.stop_loss),
        take_profit_1: n(form.take_profit_1), take_profit_2: n(form.take_profit_2), take_profit_3: n(form.take_profit_3),
        support_1: n(form.support_1), support_2: n(form.support_2),
        resistance_1: n(form.resistance_1), resistance_2: n(form.resistance_2),
        buy_strategy: form.buy_strategy || null, sell_strategy: form.sell_strategy || null,
        note: form.note || null,
      };
      if (editId) {
        await api.updateTradePlan(editId, payload);
      } else {
        await api.createTradePlan({ asset_id: assetId, ...payload });
      }
      setCreating(false);
      setMsg({ ok: true, text: t(editId ? "plan.updated" : "plan.created") });
      onChanged();
      setTimeout(() => setMsg(null), 2000);
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("assets.saveFailed") });
    } finally { setSaving(false); }
  };

  const handleStatusChange = async (planId: number, status: PlanStatus) => {
    try {
      await api.updateTradePlan(planId, { status });
      onChanged();
    } catch { /* ignore */ }
  };

  const handleDelete = async (planId: number) => {
    setConfirmDelId(null);
    try {
      await api.deleteTradePlan(planId);
      onChanged();
    } catch { /* ignore */ }
  };

  const positionProgress = activePlan && activePlan.target_position > 0
    ? Math.min(currentQty / activePlan.target_position, 1) * 100 : 0;

  return (
    <div className="rounded-2xl border border-amber-800/30 bg-surface p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-amber-300">{t("plan.title")}</h2>
        {!creating && !activePlan && (
          <button onClick={openCreate}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-amber-500">
            + {t("plan.create")}
          </button>
        )}
      </div>

      {msg && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-ok-soft" : "bg-risk-soft"}`}>
          {msg.text}
        </div>
      )}

      {/* 创建/编辑表单 */}
      {creating && (
        <div className="mb-4 space-y-4 rounded-xl border border-amber-700/50 bg-surface-alt p-4">
          <p className="text-sm font-semibold text-amber-300">{t(editId ? "plan.edit" : "plan.new")}</p>

          {/* 仓位规划 */}
          <div>
            <p className="text-xs text-muted mb-2">{t("plan.positionSizing")}</p>
            <div className="grid grid-cols-2 gap-3">
              <PlanField label={t("plan.targetPosition")} value={form.target_position} onChange={v => setForm({...form, target_position: v})} />
              <PlanField label={t("plan.maxPosition")} value={form.max_position} onChange={v => setForm({...form, max_position: v})} />
            </div>
          </div>

          {/* 建仓区间 */}
          <div>
            <p className="text-xs text-muted mb-2">{t("plan.buildRange")}</p>
            <div className="grid grid-cols-2 gap-3">
              <PlanField label={t("plan.lowerPrice")} value={form.build_low} onChange={v => setForm({...form, build_low: v})} />
              <PlanField label={t("plan.upperPrice")} value={form.build_high} onChange={v => setForm({...form, build_high: v})} />
            </div>
          </div>

          {/* 止盈止损 */}
          <div>
            <p className="text-xs text-muted mb-2">{t("plan.exits")}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PlanField label={t("plan.stopLoss")} value={form.stop_loss} onChange={v => setForm({...form, stop_loss: v})} accent="text-down" />
              <PlanField label={t("plan.takeProfit1")} value={form.take_profit_1} onChange={v => setForm({...form, take_profit_1: v})} accent="text-up" />
              <PlanField label={t("plan.takeProfit2")} value={form.take_profit_2} onChange={v => setForm({...form, take_profit_2: v})} accent="text-up" />
              <PlanField label={t("plan.takeProfit3")} value={form.take_profit_3} onChange={v => setForm({...form, take_profit_3: v})} accent="text-up" />
            </div>
          </div>

          {/* 支撑位/压力位 */}
          <div>
            <p className="text-xs text-muted mb-2">{t("plan.keyLevels")}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PlanField label={t("plan.support1")} value={form.support_1} onChange={v => setForm({...form, support_1: v})} accent="text-blue-400" />
              <PlanField label={t("plan.support2")} value={form.support_2} onChange={v => setForm({...form, support_2: v})} accent="text-blue-400" />
              <PlanField label={t("plan.resistance1")} value={form.resistance_1} onChange={v => setForm({...form, resistance_1: v})} accent="text-orange-400" />
              <PlanField label={t("plan.resistance2")} value={form.resistance_2} onChange={v => setForm({...form, resistance_2: v})} accent="text-orange-400" />
            </div>
          </div>

          {/* 策略文本 */}
          <div className="grid grid-cols-1 gap-4">
            <MarkdownEditor label={t("plan.buyStrategy")} value={form.buy_strategy} onChange={buy_strategy => setForm({...form, buy_strategy})} onSave={handleSave} saveState={saving ? "saving" : msg && !msg.ok ? "failed" : "unsaved"} placeholder={t("plan.buyPlaceholder")} minHeight="190px" />
            <MarkdownEditor label={t("plan.sellStrategy")} value={form.sell_strategy} onChange={sell_strategy => setForm({...form, sell_strategy})} onSave={handleSave} saveState={saving ? "saving" : msg && !msg.ok ? "failed" : "unsaved"} placeholder={t("plan.sellPlaceholder")} minHeight="190px" tone="warning" />
          </div>

          <MarkdownEditor label={t("plan.discipline")} value={form.note} onChange={note => setForm({...form, note})} onSave={handleSave} saveState={saving ? "saving" : msg && !msg.ok ? "failed" : "unsaved"} placeholder={t("plan.disciplinePlaceholder")} minHeight="170px" />

          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-on-accent transition hover:bg-amber-500 disabled:opacity-50">
              {saving ? t("plan.saving") : t("plan.save")}
            </button>
            <button onClick={() => setCreating(false)}
              className="rounded-lg border border-themed px-5 py-2 text-sm text-secondary transition hover:text-primary">
              {t("assets.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* 当前执行中的计划 */}
      {activePlan && !creating && (
        <PlanCard plan={activePlan} currentQty={currentQty} currentPrice={currentPrice}
          positionProgress={positionProgress}
          onEdit={() => openEdit(activePlan)}
          onStatusChange={handleStatusChange}
          onDelete={(id) => setConfirmDelId(id)} />
      )}

      {/* 暂无计划提示 */}
      {!activePlan && !creating && plans.length === 0 && (
        <p className="text-sm text-muted py-4 text-center">{t("plan.empty")}</p>
      )}

      {/* 历史计划 */}
      {historyPlans.length > 0 && !creating && (
        <div className="mt-4">
          <p className="text-xs text-muted mb-2 border-t border-themed pt-3">{t("plan.history")}</p>
          <div className="space-y-2">
            {historyPlans.map(p => (
              <PlanCard key={p.id} plan={p} currentQty={currentQty} currentPrice={currentPrice}
                positionProgress={0} compact
                onEdit={() => openEdit(p)}
                onStatusChange={handleStatusChange}
                onDelete={(id) => setConfirmDelId(id)} />
            ))}
          </div>
        </div>
      )}

      <ConfirmModal open={confirmDelId !== null} title={t("plan.deleteTitle")}
        message={t("plan.deleteMessage")}
        confirmText={t("assets.delete")} onConfirm={() => confirmDelId && handleDelete(confirmDelId)}
        onCancel={() => setConfirmDelId(null)} />
    </div>
  );
}

function PlanCard({ plan, currentQty, currentPrice, positionProgress, compact, onEdit, onStatusChange, onDelete }: {
  plan: TradePlan; currentQty: number; currentPrice: number; positionProgress: number;
  compact?: boolean;
  onEdit: () => void; onStatusChange: (id: number, s: PlanStatus) => void; onDelete: (id: number) => void;
}) {
  const { t, localeTag } = useI18n();
  const formatNumber = (value: number) => value.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const st = PLAN_STATUS_MAP[plan.status];
  const isActive = plan.status === "active";

  const priceTag = (label: string, val: number | null, color: string) => {
    if (val == null) return null;
    const diff = currentPrice > 0 ? ((currentPrice - val) / val * 100).toFixed(1) : null;
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted">{label}</span>
        <span className={`text-sm font-bold ${color}`}>{formatNumber(val)}</span>
        {diff && currentPrice > 0 && (
          <span className={`text-[10px] ${parseFloat(diff) >= 0 ? "text-up" : "text-down"}`}>
            ({parseFloat(diff) >= 0 ? "+" : ""}{diff}%)
          </span>
        )}
      </div>
    );
  };

  if (compact) {
    return (
      <div className="rounded-lg border border-themed bg-surface-alt p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.color}`}>{t(st.labelKey)}</span>
          <span className="text-xs text-secondary">
            {t("plan.target", { quantity: plan.target_position })}
            {plan.build_low && plan.build_high ? ` · ${t("plan.entry", { low: formatNumber(plan.build_low), high: formatNumber(plan.build_high) })}` : ""}
          </span>
          <span className="text-[10px] text-muted">{new Date(plan.created_at).toLocaleDateString(localeTag)}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit} className="text-[10px] text-muted hover:text-amber-400">{t("plan.view")}</button>
          <button onClick={() => onDelete(plan.id)} className="text-[10px] text-muted hover:text-red-400">{t("assets.delete")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 头部：状态 + 操作 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.color}`}>{t(st.labelKey)}</span>
          <span className="text-[10px] text-muted">{t("plan.createdAt", { date: new Date(plan.created_at).toLocaleDateString(localeTag) })}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit} className="text-xs text-muted hover:text-amber-400 transition">{t("assets.edit")}</button>
          {isActive && (
            <button onClick={() => onStatusChange(plan.id, "completed")} className="text-xs text-muted hover:text-blue-400 transition">{t("plan.complete")}</button>
          )}
          {isActive && (
            <button onClick={() => onStatusChange(plan.id, "abandoned")} className="text-xs text-muted hover:text-red-400 transition">{t("plan.abandon")}</button>
          )}
          <button onClick={() => onDelete(plan.id)} className="text-xs text-muted hover:text-red-400 transition">{t("assets.delete")}</button>
        </div>
      </div>

      {/* 仓位进度 */}
      {plan.target_position > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted">{t("plan.buildProgress")}</span>
            <span className="text-secondary">
              {t("plan.positionProgress", { current: formatNumber(currentQty), target: formatNumber(plan.target_position) })}
              {plan.max_position > 0 && <span className="text-muted ml-1">({t("plan.limit", { quantity: formatNumber(plan.max_position) })})</span>}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-progress">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500"
              style={{ width: `${Math.min(positionProgress, 100)}%` }} />
          </div>
          <p className="mt-1 text-right text-xs font-bold text-amber-400">{positionProgress.toFixed(0)}%</p>
        </div>
      )}

      {/* 价格地图 */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        {plan.build_low != null && plan.build_high != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted">{t("plan.buildRange")}</span>
            <span className="text-sm font-bold text-amber-400">{formatNumber(plan.build_low)} - {formatNumber(plan.build_high)}</span>
          </div>
        )}
        {priceTag(t("plan.stopLoss"), plan.stop_loss, "text-down")}
        {priceTag(t("plan.takeProfit1"), plan.take_profit_1, "text-up")}
        {priceTag(t("plan.takeProfit2"), plan.take_profit_2, "text-up")}
        {priceTag(t("plan.takeProfit3"), plan.take_profit_3, "text-up")}
        {priceTag(t("plan.support1"), plan.support_1, "text-blue-400")}
        {priceTag(t("plan.support2"), plan.support_2, "text-blue-400")}
        {priceTag(t("plan.resistance1"), plan.resistance_1, "text-orange-400")}
        {priceTag(t("plan.resistance2"), plan.resistance_2, "text-orange-400")}
      </div>

      {/* 策略文本 */}
      {(stripRichText(plan.buy_strategy || "") || stripRichText(plan.sell_strategy || "") || stripRichText(plan.note || "")) && (
        <div className="space-y-2 rounded-lg bg-surface-alt p-3">
          {stripRichText(plan.buy_strategy || "") && (
            <div>
              <p className="text-[10px] text-up font-semibold mb-0.5">{t("plan.buyStrategy")}</p>
              {isStoredRichText(plan.buy_strategy || "") ? <RichTextContent value={plan.buy_strategy || ""} className="text-xs leading-6" /> : <MarkdownPreview source={plan.buy_strategy || ""} className="text-xs leading-6" />}
            </div>
          )}
          {stripRichText(plan.sell_strategy || "") && (
            <div>
              <p className="text-[10px] text-down font-semibold mb-0.5">{t("plan.sellStrategy")}</p>
              {isStoredRichText(plan.sell_strategy || "") ? <RichTextContent value={plan.sell_strategy || ""} className="text-xs leading-6" /> : <MarkdownPreview source={plan.sell_strategy || ""} className="text-xs leading-6" />}
            </div>
          )}
          {stripRichText(plan.note || "") && (
            <div>
              <p className="text-[10px] text-amber-400 font-semibold mb-0.5">{t("plan.discipline")}</p>
              {isStoredRichText(plan.note || "") ? <RichTextContent value={plan.note || ""} className="text-xs leading-6" /> : <MarkdownPreview source={plan.note || ""} className="text-xs leading-6" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlanField({ label, value, onChange, accent }: {
  label: string; value: string; onChange: (v: string) => void; accent?: string;
}) {
  return (
    <div>
      <label className={`text-xs ${accent || "text-muted"}`}>{label}</label>
      <input type="number" step="any" value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-themed bg-input px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
    </div>
  );
}
