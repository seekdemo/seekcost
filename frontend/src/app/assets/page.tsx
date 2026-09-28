"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { cashSymbol, marketSymbol } from "@/lib/currency";
import type { Asset, AssetZone, AssetCategory, AssetMarket, Tag } from "@/lib/types";
import AuthGuard from "@/components/AuthGuard";
import ConfirmModal from "@/components/ConfirmModal";
import { useI18n } from "@/components/I18nProvider";

const ZONE_LABEL_KEYS: Record<AssetZone, string> = { active: "assets.zoneActive", base: "assets.zoneBase", invest: "assets.zoneInvest" };
const MARKET_LABEL_KEYS: Record<AssetMarket, string> = { us: "assets.marketUs", cn: "assets.marketCn", hk: "assets.marketHk", crypto: "assets.marketCrypto", cash: "assets.marketCash", other: "" };
const MARKET_COLORS: Record<AssetMarket, string> = {
  us: "bg-blue-500/20 text-blue-300",
  cn: "bg-red-500/20 text-red-300",
  hk: "bg-orange-500/20 text-orange-300",
  crypto: "bg-yellow-500/20 text-yellow-300",
  cash: "bg-cyan-500/15 text-cyan-300",
  other: "",
};
const MARKET_FLAG: Record<AssetMarket, string> = { us: "🇺🇸", cn: "🇨🇳", hk: "🇭🇰", crypto: "₿", cash: "", other: "" };
const CATEGORY_OPTIONS: { value: AssetCategory; labelKey: string; zone: AssetZone }[] = [
  { value: "stock", labelKey: "assets.categoryStock", zone: "active" }, { value: "etf", labelKey: "assets.categoryEtf", zone: "active" },
  { value: "deposit", labelKey: "assets.categoryDeposit", zone: "base" },
  { value: "bond_fund", labelKey: "assets.categoryBond", zone: "base" }, { value: "gold", labelKey: "assets.categoryGold", zone: "base" },
  { value: "collectible", labelKey: "assets.categoryCollectible", zone: "base" }, { value: "real_estate", labelKey: "assets.categoryRealEstate", zone: "base" },
  { value: "course", labelKey: "assets.categoryCourse", zone: "invest" },
  { value: "tool", labelKey: "assets.categoryTool", zone: "invest" },
  { value: "traffic", labelKey: "assets.categoryTraffic", zone: "invest" },
  { value: "other_invest", labelKey: "assets.categoryOther", zone: "invest" },
];
const CAT_KEY_MAP: Record<string, string> = {
  crypto: "assets.categoryCrypto",
  ...Object.fromEntries(CATEGORY_OPTIONS.map(c => [c.value, c.labelKey])),
};

const FAMILY_OPTIONS: { value: AssetZone; titleKey: string; descriptionKey: string; accent: string }[] = [
  { value: "active", titleKey: "assets.familyMarket", descriptionKey: "assets.familyMarketDesc", accent: "border-brand bg-brand-soft" },
  { value: "base", titleKey: "assets.familyBase", descriptionKey: "assets.familyBaseDesc", accent: "border-sky-500/60 bg-sky-500/[0.06]" },
  { value: "invest", titleKey: "assets.familyCapability", descriptionKey: "assets.familyCapabilityDesc", accent: "border-violet-500/60 bg-violet-500/[0.06]" },
];

interface QuickPreset {
  id: string;
  zone: AssetZone;
  category: AssetCategory;
  name?: string;
  description?: string;
  labelKey?: string;
  descriptionKey?: string;
}

const QUICK_PRESET_STORAGE_KEY = "seekcost_asset_quick_presets_v1";
const MAX_QUICK_PRESETS = 8;
const DEFAULT_QUICK_PRESETS: QuickPreset[] = [
  { id: "default-tool", zone: "invest", category: "tool", labelKey: "assets.presetSubscription", descriptionKey: "assets.presetSubscriptionDesc" },
  { id: "default-course", zone: "invest", category: "course", labelKey: "assets.presetCourse", descriptionKey: "assets.presetCourseDesc" },
  { id: "default-gold", zone: "base", category: "gold", labelKey: "assets.presetGold", descriptionKey: "assets.presetGoldDesc" },
  { id: "default-real-estate", zone: "base", category: "real_estate", labelKey: "assets.presetRealEstate", descriptionKey: "assets.presetRealEstateDesc" },
];

function loadQuickPresets(): QuickPreset[] {
  if (typeof window === "undefined") return DEFAULT_QUICK_PRESETS;
  try {
    const raw = localStorage.getItem(QUICK_PRESET_STORAGE_KEY);
    if (!raw) return DEFAULT_QUICK_PRESETS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_QUICK_PRESETS;
    const validCategories = new Set(CATEGORY_OPTIONS.map(option => option.value));
    return parsed
      .filter((preset): preset is QuickPreset => (
        preset && typeof preset.id === "string" && validCategories.has(preset.category)
      ))
      .slice(0, MAX_QUICK_PRESETS)
      .map(preset => ({
        ...preset,
        zone: CATEGORY_OPTIONS.find(option => option.value === preset.category)?.zone || "invest",
      }));
  } catch {
    return DEFAULT_QUICK_PRESETS;
  }
}

function persistQuickPresets(presets: QuickPreset[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(QUICK_PRESET_STORAGE_KEY, JSON.stringify(presets));
  }
}

// 价格时段标签
const SESSION_LABEL_KEYS: Record<string, string> = {
  pre_market: "assets.sessionPre",
  regular: "assets.sessionRegular",
  post_market: "assets.sessionPost",
  closed: "assets.sessionClosed",
};
const SESSION_COLOR: Record<string, string> = {
  pre_market: "text-amber-400",
  regular: "text-up",
  post_market: "text-info",
  closed: "text-zinc-400",
};

type ViewMode = "card" | "list";
type SortKey = "default" | "value_desc" | "pnl_desc" | "pnl_asc" | "qty_desc" | "pnl_pct_desc" | "name" | "updated";

const SORT_OPTIONS: { key: SortKey; labelKey: string }[] = [
  { key: "default", labelKey: "assets.sortDefault" },
  { key: "value_desc", labelKey: "assets.sortValueDesc" },
  { key: "pnl_desc", labelKey: "assets.sortPnlDesc" },
  { key: "pnl_asc", labelKey: "assets.sortPnlAsc" },
  { key: "qty_desc", labelKey: "assets.sortQuantity" },
  { key: "pnl_pct_desc", labelKey: "assets.sortPnlPercent" },
  { key: "name", labelKey: "assets.sortName" },
  { key: "updated", labelKey: "assets.sortUpdated" },
];

interface AssetPrefs {
  defaultZone: "all" | AssetZone;
  defaultMarket: "all" | AssetMarket;
  viewMode: ViewMode;
  sortKey: SortKey;
  hideEmpty: boolean;
}

const DEFAULT_PREFS: AssetPrefs = {
  defaultZone: "all", defaultMarket: "all", viewMode: "card", sortKey: "default", hideEmpty: false,
};

function loadPrefs(): AssetPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem("zb_asset_prefs");
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch { return DEFAULT_PREFS; }
}
function savePrefs(p: AssetPrefs) {
  if (typeof window !== "undefined") localStorage.setItem("zb_asset_prefs", JSON.stringify(p));
}

export default function AssetsPage() {
  return <AuthGuard><AssetsContent /></AuthGuard>;
}

function AssetsContent() {
  const { t, localeTag } = useI18n();
  const fmt = (n: number) => n.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [prefs, setPrefs] = useState<AssetPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [filter, setFilter] = useState<"all" | AssetZone>("all");
  const [marketFilter, setMarketFilter] = useState<"all" | AssetMarket>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [showPrefs, setShowPrefs] = useState(false);
  const [quickPresets, setQuickPresets] = useState<QuickPreset[]>(DEFAULT_QUICK_PRESETS);
  const [showQuickPresetManager, setShowQuickPresetManager] = useState(false);
  const [selectedQuickPresetId, setSelectedQuickPresetId] = useState<string | null>(null);
  const [quickPresetDraft, setQuickPresetDraft] = useState({
    id: null as string | null,
    name: "",
    description: "",
    category: "tool" as AssetCategory,
  });
  const [quickPresetError, setQuickPresetError] = useState("");
  const [form, setForm] = useState({
    symbol: "", name: "", zone: "active" as AssetZone,
    category: "stock" as AssetCategory, quantity: "",
    broker_cost: "", current_price: "", total_invested: "",
  });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [archiveId, setArchiveId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchArchiving, setBatchArchiving] = useState(false);
  const [batchConfirm, setBatchConfirm] = useState<"delete" | "archive" | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagFilter, setTagFilter] = useState<number | "all">("all");
  const [showTagMgr, setShowTagMgr] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [editTagColor, setEditTagColor] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [assetPage, setAssetPage] = useState({ key: "", limit: 18 });

  // 加载偏好设置
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const p = loadPrefs();
      setPrefs(p);
      setFilter(p.defaultZone);
      setMarketFilter(p.defaultMarket);
      setViewMode(p.viewMode);
      setSortKey(p.sortKey);
      setQuickPresets(loadQuickPresets());
      if (new URLSearchParams(window.location.search).get("create") === "1") {
        setShowForm(true);
      }
      setPrefsLoaded(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const updatePrefs = useCallback((patch: Partial<AssetPrefs>) => {
    setPrefs(prev => { const next = { ...prev, ...patch }; savePrefs(next); return next; });
  }, []);

  const quickPresetLabel = (preset: QuickPreset) => preset.name || (preset.labelKey ? t(preset.labelKey) : t("assets.quickUnnamed"));
  const quickPresetDescription = (preset: QuickPreset) => preset.description || (preset.descriptionKey ? t(preset.descriptionKey) : t(CAT_KEY_MAP[preset.category]));

  const resetQuickPresetDraft = () => {
    setQuickPresetDraft({ id: null, name: "", description: "", category: "tool" });
    setQuickPresetError("");
  };

  const editQuickPreset = (preset: QuickPreset) => {
    setQuickPresetDraft({
      id: preset.id,
      name: quickPresetLabel(preset),
      description: quickPresetDescription(preset),
      category: preset.category,
    });
    setQuickPresetError("");
  };

  const saveQuickPreset = () => {
    const name = quickPresetDraft.name.trim();
    if (!name) {
      setQuickPresetError(t("assets.quickNameRequired"));
      return;
    }
    if (!quickPresetDraft.id && quickPresets.length >= MAX_QUICK_PRESETS) {
      setQuickPresetError(t("assets.quickLimit", { count: MAX_QUICK_PRESETS }));
      return;
    }
    const categoryOption = CATEGORY_OPTIONS.find(option => option.value === quickPresetDraft.category);
    if (!categoryOption) return;
    const preset: QuickPreset = {
      id: quickPresetDraft.id || `custom-${Date.now()}`,
      zone: categoryOption.zone,
      category: categoryOption.value,
      name,
      description: quickPresetDraft.description.trim(),
    };
    setQuickPresets(current => {
      const next = quickPresetDraft.id
        ? current.map(item => item.id === quickPresetDraft.id ? preset : item)
        : [...current, preset];
      persistQuickPresets(next);
      return next;
    });
    resetQuickPresetDraft();
  };

  const removeQuickPreset = (id: string) => {
    setQuickPresets(current => {
      const next = current.filter(preset => preset.id !== id);
      persistQuickPresets(next);
      return next;
    });
    if (quickPresetDraft.id === id) resetQuickPresetDraft();
    if (selectedQuickPresetId === id) setSelectedQuickPresetId(null);
  };

  const restoreDefaultQuickPresets = () => {
    setQuickPresets(DEFAULT_QUICK_PRESETS);
    persistQuickPresets(DEFAULT_QUICK_PRESETS);
    setSelectedQuickPresetId(null);
    resetQuickPresetDraft();
  };

  const load = useCallback(() => api.listAssets(undefined, showArchived).then(setAssets), [showArchived]);
  useEffect(() => { void load(); }, [load]);

  const handleRefreshPrices = async () => {
    setRefreshing(true);
    setRefreshMsg("");
    try {
      const res = await api.refreshPrices();
      if (res.error) {
        setRefreshMsg(res.error);
      } else if (res.updated_count > 0) {
        const sessions = res.sessions || {};
        const sessionSet = [...new Set(Object.values(sessions))];
        const sessionInfo = sessionSet.length > 0 ? ` (${sessionSet.map(s => SESSION_LABEL_KEYS[s] ? t(SESSION_LABEL_KEYS[s]) : s).join("/")})` : "";
        setRefreshMsg(t("assets.updatedPrices", { count: res.updated_count, session: sessionInfo }));
        await load(); // 重新加载列表
      } else {
        setRefreshMsg(res.message || t("assets.noRefresh"));
      }
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : t("assets.refreshFailed"));
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(""), 3000);
    }
  };
  const loadTags = () => api.listTags().then(setTags).catch(() => {});
  useEffect(() => { loadTags(); }, []);

  const submit = async () => {
    const isInvest = form.zone === "invest";
    const name = form.name.trim();
    if (!name) { setFormError(t("assets.nameRequired")); return; }
    if (form.zone === "active" && !form.symbol.trim()) { setFormError(t("assets.symbolRequired")); return; }
    const generatedSymbol = name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toUpperCase()
      .slice(0, 32) || `${form.category.toUpperCase()}-${Date.now().toString().slice(-6)}`;
    const quantity = isInvest ? 1 : (parseFloat(form.quantity) || 0);
    const brokerCost = isInvest ? 0 : (parseFloat(form.broker_cost) || 0);
    const enteredTotal = parseFloat(form.total_invested) || 0;
    setSubmitting(true);
    setFormError("");
    try {
      await api.createAsset({
        ...form,
        symbol: (form.symbol.trim() || generatedSymbol).toUpperCase(),
        name,
        quantity,
        broker_cost: brokerCost,
        mental_cost: brokerCost,
        current_price: isInvest ? 0 : (parseFloat(form.current_price) || 0),
        total_invested: enteredTotal || (brokerCost * quantity),
      });
      setShowForm(false);
      setShowQuickPresetManager(false);
      setSelectedQuickPresetId(null);
      setForm({ symbol: "", name: "", zone: "active", category: "stock", quantity: "", broker_cost: "", current_price: "", total_invested: "" });
      await load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("assets.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (deleteId == null) return;
    setDeleteId(null);
    await api.deleteAsset(deleteId);
    load();
  };

  const handleArchive = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    setArchiveId(id);
  };

  const confirmArchive = async () => {
    if (archiveId == null) return;
    setArchiveId(null);
    await api.archiveAsset(archiveId);
    load();
  };

  const handleUnarchive = async (id: number) => {
    await api.unarchiveAsset(id);
    load();
  };

  // ---- 置顶 ----
  const togglePin = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    const asset = assets.find(a => a.id === id);
    if (!asset) return;
    await api.togglePin(id, !asset.pinned);
    load();
  };

  // ---- 拖拽排序 ----
  const handleDragStart = (id: number) => { setDragId(id); };
  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (dragId !== null && dragId !== id) setOverId(id);
  };
  const handleDragLeave = () => { setOverId(null); };
  const handleDrop = async (targetId: number) => {
    if (dragId === null || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const list = [...sorted];
    const fromIdx = list.findIndex(a => a.id === dragId);
    const toIdx = list.findIndex(a => a.id === targetId);
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); setOverId(null); return; }
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    // 乐观更新
    const newOrder = list.map((a, i) => ({ ...a, sort_order: i }));
    setAssets(prev => {
      const map = new Map(newOrder.map(a => [a.id, a.sort_order]));
      return prev.map(a => map.has(a.id) ? { ...a, sort_order: map.get(a.id)! } : a)
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.sort_order - b.sort_order);
    });
    setDragId(null);
    setOverId(null);
    // 持久化
    await api.reorderAssets(newOrder.map(a => ({ id: a.id, sort_order: a.sort_order })));
  };
  const handleDragEnd = () => { setDragId(null); setOverId(null); };

  // ---- 批量选择 ----
  const toggleBatchMode = () => {
    if (batchMode) { setBatchMode(false); setSelectedIds(new Set()); }
    else { setBatchMode(true); setEditMode(false); }
  };
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = () => {
    const ids = sorted.map(a => a.id);
    setSelectedIds(prev => prev.size === ids.length ? new Set() : new Set(ids));
  };
  const handleBatchDelete = async () => {
    setBatchConfirm(null);
    setBatchDeleting(true);
    const ids = [...selectedIds];
    for (const id of ids) {
      try { await api.deleteAsset(id); } catch { /* skip */ }
    }
    setSelectedIds(new Set());
    setBatchDeleting(false);
    setBatchMode(false);
    load();
  };
  const handleBatchArchive = async () => {
    setBatchConfirm(null);
    setBatchArchiving(true);
    const ids = [...selectedIds];
    for (const id of ids) {
      try { await api.archiveAsset(id); } catch { /* skip */ }
    }
    setSelectedIds(new Set());
    setBatchArchiving(false);
    setBatchMode(false);
    load();
  };

  const activeAssets = assets.filter(a => !a.archived);
  const archivedAssets = assets.filter(a => a.archived);

  const filtered = activeAssets.filter(a => {
    if (filter !== "all" && a.zone !== filter) return false;
    if (marketFilter === "cash" && !a.is_cash) return false;
    if (marketFilter !== "all" && marketFilter !== "cash" && (a.is_cash || a.market !== marketFilter)) return false;
    if (tagFilter !== "all" && !(a.tags || []).some(t => t.id === tagFilter)) return false;
    if (prefs.hideEmpty && a.zone !== "invest" && a.quantity === 0) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!a.symbol.toLowerCase().includes(q) && !a.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // 排序
  const sorted = [...filtered].sort((a, b) => {
    // 置顶始终优先
    if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
    switch (sortKey) {
      case "value_desc": return (b.current_price * b.quantity) - (a.current_price * a.quantity);
      case "pnl_desc": {
        const pa = a.current_price > 0 ? (a.current_price - a.mental_cost) * a.quantity : 0;
        const pb = b.current_price > 0 ? (b.current_price - b.mental_cost) * b.quantity : 0;
        return pb - pa;
      }
      case "pnl_asc": {
        const pa = a.current_price > 0 ? (a.current_price - a.mental_cost) * a.quantity : 0;
        const pb = b.current_price > 0 ? (b.current_price - b.mental_cost) * b.quantity : 0;
        return pa - pb;
      }
      case "qty_desc": return b.quantity - a.quantity;
      case "pnl_pct_desc": {
        const pctA = a.mental_cost > 0 && a.current_price > 0 ? (a.current_price - a.mental_cost) / a.mental_cost : 0;
        const pctB = b.mental_cost > 0 && b.current_price > 0 ? (b.current_price - b.mental_cost) / b.mental_cost : 0;
        return pctB - pctA;
      }
      case "name": return a.symbol.localeCompare(b.symbol);
      case "updated": return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      default: return a.sort_order - b.sort_order;
    }
  });
  const resultKey = `${filter}|${marketFilter}|${tagFilter}|${searchQuery}|${sortKey}|${prefs.hideEmpty}`;
  const visibleLimit = assetPage.key === resultKey ? assetPage.limit : 18;
  const visibleAssets = sorted.slice(0, visibleLimit);
  const activeCount = activeAssets.filter(a => a.zone === "active").length;
  const baseCount = activeAssets.filter(a => a.zone === "base").length;
  const investCount = activeAssets.filter(a => a.zone === "invest").length;

  const tradableAssets = activeAssets.filter(a => a.zone !== "invest");
  const pricedAssets = tradableAssets.filter(a => a.current_price > 0);
  const totalValue = pricedAssets.reduce((s, a) => s + a.current_price * a.quantity, 0);
  const capabilitySpend = activeAssets.filter(a => a.zone === "invest").reduce((s, a) => s + a.total_invested, 0);
  const noPriceCount = tradableAssets.length - pricedAssets.length;

  if (!prefsLoaded) return <div className="py-16 text-center text-muted">{t("common.loading")}</div>;

  return (
    <div className="page-shell page-shell--wide">
      {/* 页头 */}
      <header className="page-header">
        <div>
          <p className="page-eyebrow">{t("assets.eyebrow")}</p>
          <h1 className="page-title">{t("assets.title")}</h1>
          <p className="page-description">
            {t("assets.summary", { count: activeAssets.length, value: `$${fmt(totalValue)}`, missing: noPriceCount > 0 ? t("assets.missingPrices", { count: noPriceCount }) : "", invested: `$${fmt(capabilitySpend)}` })}
          </p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setShowQuickPresetManager(false); setSelectedQuickPresetId(null); }}
          className="ui-button ui-button--primary flex-shrink-0">
          {showForm ? t("assets.cancel") : `+ ${t("assets.addAsset")}`}
        </button>
      </header>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-themed bg-surface p-2.5 sm:p-3">
        {/* 搜索 */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder={t("assets.search")}
            className="w-full rounded-lg border border-themed bg-input py-2.5 pl-8 pr-3 text-sm text-primary outline-none transition focus:border-[var(--accent)]" />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary text-xs">✕</button>
          )}
        </div>

        {/* 排序 */}
        <select value={sortKey} onChange={e => { const k = e.target.value as SortKey; setSortKey(k); updatePrefs({ sortKey: k }); }}
          className="rounded-lg border border-themed bg-input px-2 py-1.5 text-xs text-secondary outline-none transition focus:border-[var(--accent)]">
          {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{t(o.labelKey)}</option>)}
        </select>

        {/* 视图切换 */}
        <div className="flex rounded-lg border border-themed overflow-hidden">
          <button onClick={() => { setViewMode("card"); updatePrefs({ viewMode: "card" }); }}
            className={`p-1.5 transition ${viewMode === "card" ? "bg-surface-hover text-primary" : "text-muted hover:text-secondary"}`} title={t("assets.cardView")}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
            </svg>
          </button>
          <button onClick={() => { setViewMode("list"); updatePrefs({ viewMode: "list" }); }}
            className={`p-1.5 transition ${viewMode === "list" ? "bg-surface-hover text-primary" : "text-muted hover:text-secondary"}`} title={t("assets.listView")}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          </button>
        </div>

        {/* 刷新现价 */}
        <button onClick={handleRefreshPrices} disabled={refreshing}
          className="rounded-lg border border-themed p-1.5 text-muted transition hover:text-primary hover:border-[var(--border-hover)] disabled:opacity-40" title={t("assets.refreshPrices")}>
          <svg className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
        </button>

        {/* 偏好设置 */}
        <button onClick={() => setShowPrefs(true)}
          className="rounded-lg border border-themed p-1.5 text-muted transition hover:text-primary hover:border-[var(--border-hover)]" title={t("assets.preferences")}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </button>

        {/* 拖拽排序 */}
        {assets.length > 1 && (
          <button onClick={() => setEditMode(!editMode)}
            className={`rounded-lg border p-1.5 transition ${editMode ? "border-[var(--accent)] text-accent" : "border-themed text-muted hover:text-primary hover:border-[var(--border-hover)]"}`}
            title={t(editMode ? "assets.finishSort" : "assets.manualSort")}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-6L16.5 15m0 0L12 10.5m4.5 4.5V6" />
            </svg>
          </button>
        )}

        {/* 批量操作 */}
        {assets.length > 1 && (
          <button onClick={toggleBatchMode}
            className={`rounded-lg border p-1.5 transition ${batchMode ? "border-[var(--accent)] text-accent" : "border-themed text-muted hover:text-primary hover:border-[var(--border-hover)]"}`}
            title={t(batchMode ? "assets.exitBatch" : "assets.batchSelect")}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </button>
        )}
      </div>

      {/* 刷新提示 */}
      {refreshMsg && (
        <div className="rounded-lg border border-themed bg-surface px-3 py-2 text-xs text-secondary animate-in fade-in">
          {refreshMsg}
        </div>
      )}

      {/* 添加表单 */}
      {showForm && (
        <section id="new-investment" className="scroll-mt-24 overflow-hidden rounded-[var(--radius-xl)] border border-themed bg-surface">
          <div className="border-b border-themed px-4 py-4 sm:px-6">
            <h2 className="text-base font-semibold text-primary">{t("assets.formTitle")}</h2>
            <p className="mt-1 text-xs leading-5 text-muted">{t("assets.formDescription")}</p>
          </div>
          <div className="space-y-5 p-4 sm:p-6">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted">{t("assets.quickStart")}</p>
                <button type="button" onClick={() => { resetQuickPresetDraft(); setShowQuickPresetManager(true); }}
                  className="text-xs font-medium text-muted transition hover:text-accent">
                  {t("assets.quickCustomize")}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {quickPresets.map((preset) => (
                  <button key={preset.id} type="button"
                    onClick={() => {
                      setSelectedQuickPresetId(preset.id);
                      setForm({ ...form, name: preset.name || "", zone: preset.zone, category: preset.category });
                      setFormError("");
                    }}
                    className={`min-h-[68px] rounded-lg border px-3 py-2 text-left transition hover:border-[var(--border-hover)] hover:bg-surface-hover ${selectedQuickPresetId === preset.id ? "border-[var(--accent)] bg-[var(--accent-bg)]" : "border-themed bg-input"}`}>
                    <strong className="block truncate text-xs font-semibold text-primary">{quickPresetLabel(preset)}</strong>
                    <span className="mt-1 line-clamp-2 block text-[10px] leading-4 text-muted">{quickPresetDescription(preset)}</span>
                  </button>
                ))}
                <button type="button" onClick={() => { resetQuickPresetDraft(); setShowQuickPresetManager(true); }}
                  className="flex min-h-[68px] items-center justify-center gap-2 rounded-lg border border-dashed border-themed bg-input px-3 py-2 text-xs font-medium text-muted transition hover:border-[var(--border-hover)] hover:bg-surface-hover hover:text-primary">
                  <span aria-hidden="true" className="text-base leading-none">+</span>
                  {t("assets.quickAddCustom")}
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted">{t("assets.zone")}</p>
              <div className="grid gap-2 md:grid-cols-3">
                {FAMILY_OPTIONS.map((family) => {
                  const selected = form.zone === family.value;
                  return (
                    <button key={family.value} type="button"
                      onClick={() => {
                        const defaultCategory = CATEGORY_OPTIONS.find(option => option.zone === family.value)?.value || "stock";
                        setSelectedQuickPresetId(null);
                        setForm({ ...form, zone: family.value, category: defaultCategory });
                        setFormError("");
                      }}
                      className={`rounded-lg border p-3 text-left transition ${selected ? family.accent : "border-themed bg-input hover:border-[var(--border-hover)]"}`}>
                      <span className="flex items-center gap-2 text-sm font-semibold text-primary">
                        <span className={`h-2 w-2 rounded-full ${family.value === "active" ? "bg-brand" : family.value === "base" ? "bg-sky-400" : "bg-violet-400"}`} />
                        {t(family.titleKey)}
                      </span>
                      <span className="mt-1.5 block text-xs leading-5 text-muted">{t(family.descriptionKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              <Input label={t("assets.name")} value={form.name} onChange={(v) => { setForm({ ...form, name: v }); setFormError(""); }} placeholder={form.category === "tool" ? "ChatGPT Plus" : t("assets.nameExample")} />
              <div>
                <Input label={t("assets.code")} value={form.symbol} onChange={(v) => { setForm({ ...form, symbol: v }); setFormError(""); }} placeholder={t("assets.symbolExample")} />
                {form.zone !== "active" && <p className="mt-1 text-[10px] leading-4 text-muted">{t("assets.identifierOptional")}</p>}
              </div>
              <div>
                <label className="text-xs text-muted">{t("assets.category")}</label>
                <select value={form.category} onChange={(e) => { setSelectedQuickPresetId(null); setForm({ ...form, category: e.target.value as AssetCategory }); }}
                  className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]">
                  {CATEGORY_OPTIONS.filter(c => c.zone === form.zone).map((c) => <option key={c.value} value={c.value}>{t(c.labelKey)}</option>)}
                </select>
              </div>
              {form.zone !== "invest" ? (
                <>
                  <Input label={t("assets.quantity")} type="number" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} />
                  <Input label={t("assets.costPrice")} type="number" value={form.broker_cost} onChange={(v) => setForm({ ...form, broker_cost: v })} />
                  <Input label={t("assets.currentPrice")} type="number" value={form.current_price} onChange={(v) => setForm({ ...form, current_price: v })} />
                  <Input label={t("assets.totalInvested")} type="number" value={form.total_invested} onChange={(v) => setForm({ ...form, total_invested: v })} />
                </>
              ) : (
                <Input label={t("assets.investmentAmount")} type="number" value={form.total_invested} onChange={(v) => setForm({ ...form, total_invested: v })} />
              )}
            </div>
            <div className={`rounded-lg border px-3 py-2.5 text-xs leading-5 ${form.zone === "invest" ? "border-violet-500/20 bg-violet-500/[0.05] text-violet-200/80" : "border-brand bg-brand-soft"}`}>
              {t(form.zone === "invest" ? "assets.netWorthExcluded" : "assets.netWorthIncluded")}
            </div>
            {formError && <p className="text-sm text-red-400" role="alert">{formError}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setShowForm(false); setShowQuickPresetManager(false); setSelectedQuickPresetId(null); setFormError(""); }} className="ui-button">{t("assets.cancel")}</button>
              <button onClick={submit} disabled={submitting} className="ui-button ui-button--primary disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? t("assets.adding") : t("assets.confirmAdd")}
              </button>
            </div>
          </div>
        </section>
      )}

      {showForm && showQuickPresetManager && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4" onClick={() => setShowQuickPresetManager(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="quick-preset-title"
            className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-themed bg-surface shadow-2xl"
            onClick={event => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-themed bg-surface px-4 py-4 sm:px-5">
              <div>
                <h3 id="quick-preset-title" className="text-base font-semibold text-primary">{t("assets.quickManagerTitle")}</h3>
                <p className="mt-1 text-xs leading-5 text-muted">{t("assets.quickManagerDescription", { count: MAX_QUICK_PRESETS })}</p>
              </div>
              <button type="button" onClick={() => setShowQuickPresetManager(false)} aria-label={t("assets.close")}
                className="rounded-lg p-1.5 text-muted transition hover:bg-surface-hover hover:text-primary">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-secondary">{t("assets.quickCurrent")}</p>
                  <span className="text-[10px] tabular-nums text-muted">{quickPresets.length}/{MAX_QUICK_PRESETS}</span>
                </div>
                <div className="space-y-2">
                  {quickPresets.length === 0 && (
                    <div className="rounded-lg border border-dashed border-themed px-3 py-6 text-center text-xs text-muted">{t("assets.quickEmpty")}</div>
                  )}
                  {quickPresets.map(preset => (
                    <div key={preset.id} className={`flex min-h-[58px] items-center gap-3 rounded-lg border px-3 py-2 ${quickPresetDraft.id === preset.id ? "border-[var(--accent)] bg-[var(--accent-bg)]" : "border-themed bg-input"}`}>
                      <button type="button" onClick={() => editQuickPreset(preset)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-xs font-semibold text-primary">{quickPresetLabel(preset)}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted">{t(CAT_KEY_MAP[preset.category])} · {quickPresetDescription(preset)}</span>
                      </button>
                      <button type="button" onClick={() => editQuickPreset(preset)} className="text-[10px] text-muted transition hover:text-accent">{t("assets.edit")}</button>
                      <button type="button" onClick={() => removeQuickPreset(preset.id)} className="text-[10px] text-muted transition hover:text-red-400">{t("assets.delete")}</button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={restoreDefaultQuickPresets} className="mt-3 text-xs text-muted transition hover:text-primary">
                  {t("assets.quickRestoreDefaults")}
                </button>
              </div>

              <div className="rounded-lg border border-themed bg-input p-3 sm:p-4">
                <h4 className="text-sm font-semibold text-primary">{t(quickPresetDraft.id ? "assets.quickEditTitle" : "assets.quickNewTitle")}</h4>
                <div className="mt-3 space-y-3">
                  <Input label={t("assets.quickName")} value={quickPresetDraft.name}
                    onChange={value => { setQuickPresetDraft(current => ({ ...current, name: value })); setQuickPresetError(""); }}
                    placeholder={t("assets.quickNamePlaceholder")} />
                  <Input label={t("assets.quickDescription")} value={quickPresetDraft.description}
                    onChange={value => setQuickPresetDraft(current => ({ ...current, description: value }))}
                    placeholder={t("assets.quickDescriptionPlaceholder")} />
                  <div>
                    <label className="text-xs text-muted">{t("assets.quickCategory")}</label>
                    <select value={quickPresetDraft.category}
                      onChange={event => setQuickPresetDraft(current => ({ ...current, category: event.target.value as AssetCategory }))}
                      className="mt-1 w-full rounded-lg border border-themed bg-surface px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]">
                      {CATEGORY_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{t(ZONE_LABEL_KEYS[option.zone])} · {t(option.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {quickPresetError && <p className="mt-3 text-xs text-red-400" role="alert">{quickPresetError}</p>}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {quickPresetDraft.id && <button type="button" onClick={resetQuickPresetDraft} className="ui-button">{t("assets.cancel")}</button>}
                  <button type="button" onClick={saveQuickPreset} className="ui-button ui-button--primary">
                    {t(quickPresetDraft.id ? "assets.quickSave" : "assets.quickAdd")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 筛选标签 — 区域 + 市场 合并一行 */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-wrap">
        {[
          { key: "all" as const, label: t("assets.all", { count: activeAssets.length }), color: "bg-accent" },
          { key: "active" as const, label: t("assets.activeShort", { count: activeCount }), color: "bg-accent" },
          { key: "base" as const, label: t("assets.baseShort", { count: baseCount }), color: "bg-blue-600" },
          { key: "invest" as const, label: t("assets.investShort", { count: investCount }), color: "bg-purple-600" },
        ].map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition whitespace-nowrap ${filter === tab.key
              ? `${tab.color} text-on-accent` : "text-secondary hover:text-primary"}`}>
            {tab.label}
          </button>
        ))}
        {/* 分隔线 + 市场筛选 */}
        {(() => {
          const markets = (["us", "cn", "hk", "crypto", "cash"] as AssetMarket[]).filter(m => (
            m === "cash" ? activeAssets.some(a => a.is_cash) : activeAssets.some(a => !a.is_cash && a.market === m)
          ));
          if (markets.length === 0) return null;
          return (
            <>
              <span className="w-px h-4 bg-[var(--border)] mx-1 flex-shrink-0" />
              {markets.map(m => {
                const count = activeAssets.filter(a => m === "cash" ? a.is_cash : !a.is_cash && a.market === m).length;
                const active = marketFilter === m;
                return (
                  <button key={m} onClick={() => setMarketFilter(active ? "all" : m)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition whitespace-nowrap flex items-center gap-1 ${active ? MARKET_COLORS[m] : "text-muted hover:text-secondary"}`}>
                    {MARKET_FLAG[m] && <span className="text-[11px]">{MARKET_FLAG[m]}</span>}{t(MARKET_LABEL_KEYS[m])} ({count})
                  </button>
                );
              })}
            </>
          );
        })()}

        {/* 标签筛选 */}
        {tags.length > 0 && (
          <>
            <span className="w-px h-4 bg-[var(--border)] mx-1 flex-shrink-0" />
            {tags.map(t => {
              const count = activeAssets.filter(a => (a.tags || []).some(at => at.id === t.id)).length;
              const active = tagFilter === t.id;
              return (
                <button key={t.id} onClick={() => setTagFilter(active ? "all" : t.id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition whitespace-nowrap flex items-center gap-1 ${active ? "outline outline-1 outline-offset-1" : "text-muted hover:text-secondary"}`}
                  style={active ? { backgroundColor: `${t.color}33`, color: t.color, outlineColor: t.color } : {}}>
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                  {t.name}{count > 0 ? ` (${count})` : ""}
                </button>
              );
            })}
            <button onClick={() => setShowTagMgr(true)}
              className="rounded-full border border-dashed border-[var(--border)] px-2 py-1 text-[11px] text-muted hover:text-primary hover:border-[var(--border-hover)] transition whitespace-nowrap"
              title={t("assets.manageTags")}>
              + {t("assets.tags")}
            </button>
          </>
        )}
        {tags.length === 0 && (
          <>
            <span className="w-px h-4 bg-[var(--border)] mx-1 flex-shrink-0" />
            <button onClick={() => setShowTagMgr(true)}
              className="rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 text-[11px] text-muted hover:text-primary hover:border-[var(--border-hover)] transition whitespace-nowrap flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>
              {t("assets.addTag")}
            </button>
          </>
        )}

        {/* 快捷切换：显示全部 + 回到默认 */}
        {(() => {
          const isAll = filter === "all" && marketFilter === "all" && tagFilter === "all";
          const isDefault = filter === prefs.defaultZone && marketFilter === prefs.defaultMarket;
          const hasCustomDefault = prefs.defaultZone !== "all" || prefs.defaultMarket !== "all";
          const showAll = !isAll;
          const showDefault = !isDefault && hasCustomDefault;
          if (!showAll && !showDefault) return null;
          const zoneLabel = prefs.defaultZone === "all" ? "" : t(ZONE_LABEL_KEYS[prefs.defaultZone]);
          const mktLabel = prefs.defaultMarket === "all" ? "" : t(MARKET_LABEL_KEYS[prefs.defaultMarket]);
          const hint = [zoneLabel, mktLabel].filter(Boolean).join(" · ");
          return (
            <>
              <span className="w-px h-4 bg-[var(--border)] mx-1 flex-shrink-0" />
              {showAll && (
                <button onClick={() => { setFilter("all"); setMarketFilter("all"); setTagFilter("all"); }}
                  className="rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 text-[11px] text-muted hover:text-primary hover:border-[var(--border-hover)] transition whitespace-nowrap flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                  {t("assets.showAll")}
                </button>
              )}
              {showDefault && (
                <button onClick={() => { setFilter(prefs.defaultZone); setMarketFilter(prefs.defaultMarket); }}
                  className="rounded-full border border-dashed border-amber-600/40 px-2.5 py-1 text-[11px] text-amber-400/80 hover:text-amber-300 hover:border-amber-500/60 transition whitespace-nowrap flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
                  {t("assets.backDefault", { hint: hint ? ` (${hint})` : "" })}
                </button>
              )}
            </>
          );
        })()}
      </div>

      {/* 编辑模式提示 */}
      {editMode && (
        <div className="flex items-center justify-between rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-bg)] px-4 py-2 text-xs text-secondary">
          <span>{t("assets.dragHint")}</span>
          <button onClick={() => setEditMode(false)} className="rounded px-2 py-0.5 text-accent hover:bg-accent/10 transition">{t("assets.done")}</button>
        </div>
      )}

      {/* 批量选择提示 */}
      {batchMode && (
        <div className="flex items-center justify-between rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-bg)] px-4 py-2 text-xs text-secondary">
          <div className="flex items-center gap-3">
            <button onClick={selectAll}
              className="rounded px-2 py-0.5 text-accent hover:bg-accent/10 transition font-medium">
              {t(selectedIds.size === sorted.length && sorted.length > 0 ? "assets.clearSelection" : "assets.selectAll")}
            </button>
            <span className="text-muted">
              {t("assets.selected", { selected: selectedIds.size, total: sorted.length })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <button onClick={() => setBatchConfirm("archive")}
                  disabled={batchArchiving}
                  className="rounded px-2.5 py-1 text-xs font-medium text-secondary hover:text-primary hover:bg-surface-hover border border-themed transition disabled:opacity-40">
                  {batchArchiving ? t("assets.archiving") : t("assets.archiveCount", { count: selectedIds.size })}
                </button>
                <button onClick={() => setBatchConfirm("delete")}
                  disabled={batchDeleting}
                  className="rounded px-2.5 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-700/50 transition disabled:opacity-40">
                  {batchDeleting ? t("assets.deleting") : t("assets.deleteCount", { count: selectedIds.size })}
                </button>
              </>
            )}
            <button onClick={toggleBatchMode} className="rounded px-2 py-0.5 text-accent hover:bg-accent/10 transition">{t("assets.exit")}</button>
          </div>
        </div>
      )}

      {/* 资产列表 */}
      {sorted.length === 0 ? (
        <div className="py-16 text-center">
          {searchQuery ? (
            <>
              <p className="text-lg text-muted">{t("assets.noMatch")}</p>
              <p className="mt-1 text-sm text-muted">{t("assets.tryFilters")}</p>
              <button onClick={() => { setSearchQuery(""); setFilter("all"); setMarketFilter("all"); setTagFilter("all"); }}
                className="mt-3 rounded-lg border border-themed px-4 py-1.5 text-xs text-secondary hover:text-primary transition">
                {t("assets.clearFilters")}
              </button>
            </>
          ) : (
            <>
              <p className="text-lg text-muted">{t("assets.empty")}</p>
              <p className="mt-1 text-sm text-muted">{t("assets.start")}</p>
            </>
          )}
        </div>
      ) : viewMode === "list" ? (
        /* 列表视图 */
        <div className="rounded-xl border border-themed bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-themed text-muted">
                  {batchMode && <th className="w-8 px-3 py-2.5"></th>}
                  <th className="text-left px-4 py-2.5 font-medium">{t("assets.asset")}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t("assets.price")}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t("assets.quantity")}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t("assets.marketValue")}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t("assets.pnl")}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t("assets.zeroCost")}</th>
                  <th className="text-right px-4 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-themed">
                {visibleAssets.map(a => <AssetRow key={a.id} asset={a} onDelete={handleDelete} onArchive={handleArchive}
                  batchMode={batchMode} isSelected={selectedIds.has(a.id)} onToggleSelect={() => toggleSelect(a.id)} />)}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* 卡片视图 */
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {visibleAssets.map(a => (
            <AssetCard key={a.id} asset={a}
              editMode={editMode}
              batchMode={batchMode}
              isSelected={selectedIds.has(a.id)}
              onToggleSelect={() => toggleSelect(a.id)}
              isDragging={dragId === a.id}
              isOver={overId === a.id}
              onDelete={handleDelete}
              onArchive={handleArchive}
              onTogglePin={togglePin}
              onDragStart={() => handleDragStart(a.id)}
              onDragOver={(e) => handleDragOver(e, a.id)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(a.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {sorted.length > visibleLimit && (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-themed px-4 py-5">
          <p className="text-xs text-muted">{t("assets.showing", { visible: visibleAssets.length, total: sorted.length })}</p>
          <button type="button" onClick={() => setAssetPage({ key: resultKey, limit: visibleLimit + 18 })} className="ui-button">
            {t("assets.showMore", { count: Math.min(18, sorted.length - visibleLimit) })}
          </button>
        </div>
      )}

      {/* 归档资产 */}
      {showArchived && archivedAssets.length > 0 && (
        <div className="mt-2">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-medium text-muted">{t("assets.archived", { count: archivedAssets.length })}</h3>
          </div>
          <div className="rounded-xl border border-themed bg-surface overflow-hidden opacity-60">
            <div className="divide-y divide-themed">
              {archivedAssets.map(a => (
                <div key={a.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">{a.symbol}</span>
                    <span className="text-muted">{a.name}</span>
                    {a.archived_note && <span className="text-[10px] text-muted/60">· {a.archived_note}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleUnarchive(a.id)} className="text-accent hover:underline">{t("assets.restore")}</button>
                    <button onClick={(e) => handleDelete(e, a.id)} className="text-red-400 hover:text-red-300">{t("assets.delete")}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* 底部：切换显示归档 */}
      {(archivedAssets.length > 0 || showArchived) && (
        <div className="text-center pt-2">
          <button onClick={() => setShowArchived(!showArchived)}
            className="text-xs text-muted hover:text-secondary transition">
            {showArchived ? t("assets.hideArchived") : t("assets.showArchived", { count: archivedAssets.length })}
          </button>
        </div>
      )}

      {/* 偏好设置弹窗 */}
      {showPrefs && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPrefs(false)}>
          <div className="bg-surface rounded-xl border border-themed p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1">{t("assets.preferencesTitle")}</h2>
            <p className="text-xs text-muted mb-5">{t("assets.preferencesDescription")}</p>
            <div className="space-y-5">
              <div>
                <label className="text-xs text-muted font-medium">{t("assets.defaultZone")}</label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {([["all", "assets.showAll"], ["active", "assets.zoneActive"], ["base", "assets.zoneBase"], ["invest", "assets.zoneInvest"]] as const).map(([k, labelKey]) => (
                    <button key={k} onClick={() => { setFilter(k); updatePrefs({ defaultZone: k }); }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${prefs.defaultZone === k ? "bg-accent text-on-accent" : "bg-surface-hover text-secondary hover:text-primary"}`}>
                      {t(labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted font-medium">{t("assets.defaultMarket")}</label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {([["all", "assets.allMarkets"], ["us", "assets.marketUs"], ["cn", "assets.marketCn"], ["hk", "assets.marketHk"], ["crypto", "assets.marketCrypto"], ["cash", "assets.marketCash"]] as const).map(([k, labelKey]) => (
                    <button key={k} onClick={() => { setMarketFilter(k); updatePrefs({ defaultMarket: k }); }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${prefs.defaultMarket === k ? "bg-accent text-on-accent" : "bg-surface-hover text-secondary hover:text-primary"}`}>
                      {k !== "all" && MARKET_FLAG[k]} {t(labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted font-medium">{t("assets.defaultView")}</label>
                <div className="flex gap-2 mt-2">
                  {([["card", "assets.card"], ["list", "assets.list"]] as const).map(([k, labelKey]) => (
                    <button key={k} onClick={() => { setViewMode(k); updatePrefs({ viewMode: k }); }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${prefs.viewMode === k ? "bg-accent text-on-accent" : "bg-surface-hover text-secondary hover:text-primary"}`}>
                      {t(labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted font-medium">{t("assets.defaultSort")}</label>
                <select value={prefs.sortKey} onChange={e => { const k = e.target.value as SortKey; setSortKey(k); updatePrefs({ sortKey: k }); }}
                  className="mt-2 w-full rounded-lg border border-themed bg-input px-3 py-2 text-sm text-primary outline-none">
                  {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{t(o.labelKey)}</option>)}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs text-muted font-medium">{t("assets.hideEmpty")}</label>
                  <p className="text-[10px] text-muted mt-0.5">{t("assets.hideEmptyDescription")}</p>
                </div>
                <button type="button" onClick={() => updatePrefs({ hideEmpty: !prefs.hideEmpty })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${prefs.hideEmpty ? "bg-ok" : "bg-gray-600"}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${prefs.hideEmpty ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => {
                const d = DEFAULT_PREFS;
                setPrefs(d); savePrefs(d);
                setFilter(d.defaultZone); setMarketFilter(d.defaultMarket);
                setViewMode(d.viewMode); setSortKey(d.sortKey);
              }} className="text-xs text-muted hover:text-primary transition">{t("assets.resetDefault")}</button>
              <button onClick={() => setShowPrefs(false)}
                className="rounded-lg bg-accent bg-accent-hover px-4 py-2 text-sm font-semibold text-on-accent transition">{t("assets.done")}</button>
            </div>
          </div>
        </div>
      )}

      {/* 标签管理弹窗 */}
      {showTagMgr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowTagMgr(false)}>
          <div className="w-full max-w-sm rounded-xl border border-themed bg-surface p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">{t("assets.manageTags")}</h3>
              <button onClick={() => setShowTagMgr(false)} className="rounded-lg p-1 text-muted hover:text-primary hover:bg-surface-hover transition">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {/* 现有标签 */}
            <div className="space-y-1.5 mb-4 max-h-64 overflow-y-auto">
              {tags.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-6 text-muted">
                  <svg className="h-8 w-8 opacity-40" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>
                  <p className="text-xs">{t("assets.noTags")}</p>
                </div>
              )}
              {tags.map(tag => editingTagId === tag.id ? (
                <div key={tag.id} className="rounded-lg border border-[var(--accent)] bg-surface-alt p-3 space-y-2.5">
                  <div className="flex gap-1.5 items-center">
                    {["#6366f1", "#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"].map(c => (
                      <button key={c} onClick={() => setEditTagColor(c)}
                        className={`h-4.5 w-4.5 rounded-full transition-all flex-shrink-0 ${editTagColor === c ? "ring-2 ring-white/60 ring-offset-1 ring-offset-[var(--bg-surface)] scale-110" : "hover:scale-110 opacity-60 hover:opacity-100"}`}
                        style={{ backgroundColor: c, width: 18, height: 18 }} />
                    ))}
                  </div>
                  <div className="flex gap-2 items-center">
                    <input value={editTagName} onChange={e => setEditTagName(e.target.value)}
                      className="flex-1 rounded-lg border border-themed bg-input px-2.5 py-1.5 text-xs text-primary outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                      autoFocus
                      onKeyDown={async e => {
                        if (e.key === "Enter" && editTagName.trim()) {
                          await api.updateTag(tag.id, { name: editTagName.trim(), color: editTagColor });
                          setEditingTagId(null); loadTags();
                        }
                        if (e.key === "Escape") setEditingTagId(null);
                      }} />
                    <button onClick={async () => {
                      if (!editTagName.trim()) return;
                      await api.updateTag(tag.id, { name: editTagName.trim(), color: editTagColor });
                      setEditingTagId(null); loadTags();
                    }} className="rounded-lg bg-accent hover:brightness-110 px-2.5 py-1.5 text-[10px] font-semibold text-on-accent transition-all">
                      {t("assets.save")}
                    </button>
                    <button onClick={() => setEditingTagId(null)}
                      className="text-[10px] text-muted hover:text-primary transition">{t("assets.cancel")}</button>
                  </div>
                </div>
              ) : (
                <div key={tag.id} className="group flex items-center justify-between rounded-lg bg-surface-alt px-3 py-2.5 hover:bg-surface-hover transition-colors">
                  <button className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                    onClick={() => { setEditingTagId(tag.id); setEditTagName(tag.name); setEditTagColor(tag.color); }}>
                    <span className="h-3.5 w-3.5 rounded-full flex-shrink-0 ring-1 ring-white/10" style={{ backgroundColor: tag.color }} />
                    <span className="text-sm text-primary truncate">{tag.name}</span>
                    <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-muted flex-shrink-0">{t("assets.items", { count: tag.asset_count })}</span>
                  </button>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => { setEditingTagId(tag.id); setEditTagName(tag.name); setEditTagColor(tag.color); }}
                      className="text-[10px] text-muted hover:text-accent transition">{t("assets.edit")}</button>
                    <button onClick={async () => { await api.deleteTag(tag.id); loadTags(); }}
                      className="text-[10px] text-muted hover:text-red-400 transition">{t("assets.delete")}</button>
                  </div>
                </div>
              ))}
            </div>
            {/* 新建标签 */}
            <div className="border-t border-themed pt-4">
              <p className="text-[10px] text-muted mb-2">{t("assets.newTag")}</p>
              <div className="flex gap-1.5 items-center mb-2.5">
                {["#6366f1", "#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"].map(c => (
                  <button key={c} onClick={() => setNewTagColor(c)}
                    className={`h-5 w-5 rounded-full transition-all flex-shrink-0 ${newTagColor === c ? "ring-2 ring-white/60 ring-offset-1 ring-offset-[var(--bg-surface)] scale-110" : "hover:scale-110 opacity-70 hover:opacity-100"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input value={newTagName} onChange={e => setNewTagName(e.target.value)}
                  placeholder={t("assets.tagName")}
                  className="flex-1 rounded-lg border border-themed bg-input px-3 py-2 text-xs text-primary outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                  onKeyDown={async e => {
                    if (e.key === "Enter" && newTagName.trim()) {
                      await api.createTag({ name: newTagName.trim(), color: newTagColor });
                      setNewTagName(""); setNewTagColor("#6366f1"); loadTags();
                    }
                  }} />
                <button onClick={async () => {
                  if (!newTagName.trim()) return;
                  await api.createTag({ name: newTagName.trim(), color: newTagColor });
                  setNewTagName(""); setNewTagColor("#6366f1"); loadTags();
                }} disabled={!newTagName.trim()}
                  className="rounded-lg bg-accent hover:brightness-110 px-4 py-2 text-xs font-semibold text-on-accent transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
                  {t("assets.add")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal open={deleteId !== null} title={t("assets.deleteTitle")}
        message={t("assets.deleteMessage")}
        confirmText={t("assets.delete")} onConfirm={confirmDelete} onCancel={() => setDeleteId(null)} />
      <ConfirmModal open={archiveId !== null} title={t("assets.archiveTitle")}
        message={t("assets.archiveMessage")}
        confirmText={t("assets.archive")} onConfirm={confirmArchive} onCancel={() => setArchiveId(null)} />
      <ConfirmModal open={batchConfirm === "delete"} title={t("assets.batchDeleteTitle", { count: selectedIds.size })}
        message={t("assets.batchDeleteMessage", { count: selectedIds.size })}
        confirmText={t("assets.deleteAll")} onConfirm={handleBatchDelete} onCancel={() => setBatchConfirm(null)} />
      <ConfirmModal open={batchConfirm === "archive"} title={t("assets.batchArchiveTitle", { count: selectedIds.size })}
        message={t("assets.batchArchiveMessage", { count: selectedIds.size })}
        confirmText={t("assets.archiveAll")} onConfirm={handleBatchArchive} onCancel={() => setBatchConfirm(null)} />
    </div>
  );
}

interface AssetCardProps {
  asset: Asset;
  editMode: boolean;
  batchMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  isDragging: boolean;
  isOver: boolean;
  onDelete: (e: React.MouseEvent, id: number) => void;
  onArchive: (e: React.MouseEvent, id: number) => void;
  onTogglePin: (e: React.MouseEvent, id: number) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function AssetCard({ asset: a, editMode, batchMode, isSelected, onToggleSelect, isDragging, isOver, onDelete, onArchive, onTogglePin, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }: AssetCardProps) {
  const { t, localeTag } = useI18n();
  const fmt = (n: number) => n.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isInvest = a.zone === "invest";
  const isCashAsset = a.is_cash;
  const hasPrice = a.current_price > 0;
  const pnl = hasPrice ? (a.current_price - a.mental_cost) * a.quantity : 0;
  const pnlPct = hasPrice && a.mental_cost > 0 ? ((a.current_price - a.mental_cost) / a.mental_cost) * 100 : 0;
  const marketValue = hasPrice ? a.current_price * a.quantity : 0;
  const isProfit = pnl >= 0;
  const progress = a.total_invested > 0 ? Math.min(a.total_cashed / a.total_invested, 1) * 100 : 0;
  const cs = isCashAsset ? cashSymbol(a.symbol) : marketSymbol(a.market);

  const zoneBorder = a.zone === "active" ? "border-l-emerald-500"
    : a.zone === "invest" ? "border-l-purple-500" : "border-l-blue-500";
  const hoverBorder = isInvest ? "hover:border-purple-700" : "hover:border-[var(--border-hover)]";
  const barColor = isInvest ? "bg-purple-500" : "bg-[var(--accent)]";

  const cardContent = (
    <>
      {/* 头部：代码 + 名称 + 小标签 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {batchMode && (
              <span className="flex-shrink-0" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(); }}>
                <span className={`inline-flex h-4 w-4 items-center justify-center rounded border transition cursor-pointer ${
                  isSelected ? "bg-accent border-accent text-on-accent" : "border-themed hover:border-[var(--accent)]"
                }`}>
                  {isSelected && <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>}
                </span>
              </span>
            )}
            {editMode && (
              <span className="cursor-grab text-muted hover:text-primary active:cursor-grabbing flex-shrink-0">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </span>
            )}
            {a.pinned && (
              <span className="text-amber-400 flex-shrink-0" title={t("assets.pinned")}>
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" /></svg>
              </span>
            )}
            <span className={`truncate text-base font-bold ${isInvest ? "font-sans" : "font-mono"}`}>{isInvest ? a.name : a.symbol}</span>
            {!isCashAsset && a.market && a.market !== "other" && (
              <span className="text-[10px] text-muted flex-shrink-0">{MARKET_FLAG[a.market]}</span>
            )}
            {a.is_zero_cost && <span className="rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[9px] font-bold text-yellow-300 flex-shrink-0">{t("assets.zeroCost")}</span>}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {isCashAsset ? `${a.name} · ${t("assets.brokerFunds")}` : isInvest ? `${t(CAT_KEY_MAP[a.category])} · ${a.symbol}` : `${a.name} · ${t(CAT_KEY_MAP[a.category])}`}
          </p>
          {(a.tags || []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {a.tags.map(t => (
                <span key={t.id} className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-medium"
                  style={{ backgroundColor: `${t.color}22`, color: t.color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {editMode && (
            <button onClick={(e) => onTogglePin(e, a.id)}
              className={`rounded p-1 transition ${a.pinned ? "text-amber-400 hover:text-amber-300" : "text-muted hover:text-amber-400"}`}
              title={t(a.pinned ? "assets.unpin" : "assets.pin")}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill={a.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth={a.pinned ? 0 : 1.5}>
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
              </svg>
            </button>
          )}
          {/* 盈亏主指标 — 右上角醒目展示 */}
          {isCashAsset ? (
            <span className="rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-semibold">{t("assets.brokerCash")}</span>
          ) : !isInvest && hasPrice ? (
            <span className={`text-sm font-bold tabular-nums ${isProfit ? "text-up" : "text-down"}`}>
              {isProfit ? "+" : ""}{pnlPct.toFixed(1)}%
            </span>
          ) : isInvest ? (
            <span className={`text-xs font-semibold ${progress > 0 ? "text-purple-400" : "text-muted"}`}>
              {Math.round(progress)}% {t("trade.recovered")}
            </span>
          ) : null}
        </div>
      </div>

      {/* 核心数据 */}
      {isCashAsset ? (
        <div className="mt-3">
          <span className="text-[10px] text-muted">{t("assets.brokerCashBalance")}</span>
          <p className="text-xl font-bold tabular-nums text-info">{cs}{fmt(a.quantity)}</p>
          <div className="mt-1.5 flex items-center justify-between text-[10px]">
            <span className="text-muted">{t("assets.enteredAccount")}</span>
            <span className="text-secondary font-medium">{t("assets.pricedAs", { currency: `1 ${cs}` })}</span>
          </div>
        </div>
      ) : isInvest ? (
        <div className="mt-3 flex items-end justify-between">
          <div>
            <span className="text-[10px] text-muted">{t("assets.totalInvested")}</span>
            <p className="text-lg font-bold tabular-nums">{cs}{fmt(a.total_invested)}</p>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-muted">{t("assets.attributedRecovery")}</span>
            <p className={`text-sm font-semibold tabular-nums ${a.total_cashed > 0 ? "text-purple-400" : "text-muted"}`}>
              {cs}{fmt(a.total_cashed)}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {/* 市值 — 大字体核心数据 */}
          <div className="flex items-end justify-between">
            <div>
              <span className="text-[10px] text-muted">{t("assets.marketValue")}</span>
              {hasPrice
                ? <p className="text-lg font-bold tabular-nums">{cs}{fmt(marketValue)}</p>
                : <p className="text-sm text-yellow-400/80">{t("assets.priceMissing")}</p>}
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted">{t("assets.decisionPnl")}</span>
              {hasPrice
                ? <p className={`text-sm font-semibold tabular-nums ${isProfit ? "text-up" : "text-down"}`}>
                    {isProfit ? "+" : ""}{fmt(pnl)}
                  </p>
                : <p className="text-sm text-muted">--</p>}
            </div>
          </div>
          {/* 辅助信息 */}
          <div className="mt-1.5 flex items-center justify-between text-[10px]">
            <span className="text-muted">{fmt(a.quantity)} {t(a.category === "stock" ? "trade.shares" : "assets.units")} × {fmt(a.mental_cost)}</span>
            {hasPrice && (
              <div className="flex items-center gap-1">
                <span className="text-secondary font-medium">{t("assets.price")} {cs}{fmt(a.current_price)}</span>
                {a.price_session && a.price_session !== "regular" && (
                  <span className={`text-[9px] font-medium px-1 rounded ${SESSION_COLOR[a.price_session] || "text-zinc-400"}`}>
                    {SESSION_LABEL_KEYS[a.price_session] ? t(SESSION_LABEL_KEYS[a.price_session]) : a.price_session}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 进度条 — 仅在 >0 或已回本时显示 */}
      {(progress > 0 || a.is_zero_cost) && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted mb-0.5">
            <span>{t(isInvest ? "assets.recoveryProgress" : "assets.zeroCostProgress")}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-progress">
            <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.max(progress, 2)}%` }} />
          </div>
        </div>
      )}

      {/* 底部操作 — hover 才显示 */}
      <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-themed pt-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <button onClick={(e) => onArchive(e, a.id)}
          className="text-[10px] text-muted transition hover:text-secondary">{t("assets.archive")}</button>
        <button onClick={(e) => onDelete(e, a.id)}
          className="text-[10px] text-muted transition hover:text-red-400">{t("assets.delete")}</button>
      </div>
    </>
  );

  const baseClass = `group block min-h-[220px] rounded-xl border-l-2 border border-themed bg-surface p-4 transition ${zoneBorder} ${hoverBorder}`;
  const dragClass = isDragging ? "opacity-50 scale-95 border-[var(--accent)]" :
                    isOver ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30 scale-[1.02]" :
                    "hover:bg-surface-hover";
  const selectClass = batchMode && isSelected ? "ring-2 ring-[var(--accent)]/40 bg-[var(--accent-bg)]" : "";

  if (editMode) {
    return (
      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={`${baseClass} ${dragClass} cursor-grab active:cursor-grabbing`}>
        {cardContent}
      </div>
    );
  }

  if (batchMode) {
    return (
      <div onClick={onToggleSelect}
        className={`${baseClass} ${selectClass} cursor-pointer`}>
        {cardContent}
      </div>
    );
  }

  return (
    <Link href={`/assets/${a.id}`} className={`${baseClass} ${dragClass}`}>
      {cardContent}
    </Link>
  );
}

function AssetRow({ asset: a, onDelete, onArchive, batchMode, isSelected, onToggleSelect }: {
  asset: Asset; onDelete: (e: React.MouseEvent, id: number) => void; onArchive: (e: React.MouseEvent, id: number) => void;
  batchMode: boolean; isSelected: boolean; onToggleSelect: () => void;
}) {
  const { t, localeTag } = useI18n();
  const fmt = (n: number) => n.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isInvest = a.zone === "invest";
  const isCashAsset = a.is_cash;
  const hasPrice = a.current_price > 0;
  const pnl = hasPrice ? (a.current_price - a.mental_cost) * a.quantity : 0;
  const pnlPct = hasPrice && a.mental_cost > 0 ? ((a.current_price - a.mental_cost) / a.mental_cost) * 100 : 0;
  const marketValue = hasPrice ? a.current_price * a.quantity : 0;
  const progress = a.total_invested > 0 ? Math.min(a.total_cashed / a.total_invested, 1) * 100 : 0;
  const zoneColor = a.zone === "active" ? "text-brand" : a.zone === "invest" ? "text-purple-400" : "text-blue-400";

  return (
    <tr className={`hover:bg-surface-hover transition group ${batchMode && isSelected ? "bg-[var(--accent-bg)]" : ""}`}
      onClick={batchMode ? onToggleSelect : undefined}
      style={batchMode ? { cursor: "pointer" } : undefined}>
      {batchMode && (
        <td className="px-3 py-2.5">
          <span className={`inline-flex h-4 w-4 items-center justify-center rounded border transition ${
            isSelected ? "bg-accent border-accent text-on-accent" : "border-themed"
          }`}>
            {isSelected && <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>}
          </span>
        </td>
      )}
      <td className="px-4 py-2.5">
        <Link href={`/assets/${a.id}`} className="block">
          <div className="flex items-center gap-2">
            {a.pinned && <span className="text-amber-400 text-[10px]">&#x1F4CC;</span>}
            <span className={isInvest ? "font-semibold" : "font-bold font-mono"}>{isInvest ? a.name : a.symbol}</span>
            {!isCashAsset && a.market && a.market !== "other" && (
              <span className={`text-[10px] ${MARKET_COLORS[a.market]} rounded px-1 py-0.5`}>
                {MARKET_FLAG[a.market]}
              </span>
            )}
            {isCashAsset && <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-300">{t("assets.brokerFunds")}</span>}
            <span className={`text-[10px] ${zoneColor}`}>{t(ZONE_LABEL_KEYS[a.zone])}</span>
          </div>
          <p className="text-[10px] text-muted">{isInvest ? `${t(CAT_KEY_MAP[a.category])} · ${a.symbol}` : a.name}</p>
        </Link>
      </td>
      <td className="text-right px-3 py-2.5 tabular-nums">
        {isCashAsset ? <span className="text-muted">{t("assets.cash")}</span> : isInvest ? <span className="text-muted">-</span> : hasPrice ? (
          <div className="flex flex-col items-end gap-0.5">
            <span>{fmt(a.current_price)}</span>
            {a.price_session && a.price_session !== "regular" && (
              <span className={`text-[9px] px-1 rounded ${SESSION_COLOR[a.price_session] || "text-zinc-400"}`}>
                {SESSION_LABEL_KEYS[a.price_session] ? t(SESSION_LABEL_KEYS[a.price_session]) : a.price_session}
              </span>
            )}
          </div>
        ) : <span className="text-yellow-400">{t("assets.notSet")}</span>}
      </td>
      <td className="text-right px-3 py-2.5 tabular-nums">
        {isCashAsset ? <span className="text-info">{fmt(a.quantity)}</span> : isInvest ? <span className="text-muted">-</span> : fmt(a.quantity)}
      </td>
      <td className="text-right px-3 py-2.5 tabular-nums font-medium">
        {isCashAsset ? `${fmt(a.quantity)}` : isInvest ? `${fmt(a.total_invested)}` : hasPrice ? `${fmt(marketValue)}` : <span className="text-muted">-</span>}
      </td>
      <td className="text-right px-3 py-2.5 tabular-nums">
        {isCashAsset ? (
          <span className="text-muted">-</span>
        ) : isInvest ? (
          <span className="text-purple-400">{a.total_cashed > 0 ? `${fmt(a.total_cashed)}` : "-"}</span>
        ) : hasPrice ? (
          <span className={pnl >= 0 ? "text-up" : "text-down"}>
            {pnl >= 0 ? "+" : ""}{fmt(pnl)} <span className="text-[10px]">({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)</span>
          </span>
        ) : <span className="text-muted">-</span>}
      </td>
      <td className="text-right px-3 py-2.5">
        {isCashAsset ? <span className="text-muted">-</span> : <div className="flex items-center justify-end gap-1.5">
          <div className="w-12 h-1 rounded-full bg-progress overflow-hidden">
            <div className={`h-full rounded-full ${isInvest ? "bg-purple-500" : "bg-[var(--accent)]"}`} style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[10px] text-muted w-7 text-right">{Math.round(progress)}%</span>
        </div>}
      </td>
      <td className="text-right px-4 py-2.5">
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
          <button onClick={(e) => onArchive(e, a.id)}
            className="text-[10px] text-muted hover:text-secondary">{t("assets.archive")}</button>
          <button onClick={(e) => onDelete(e, a.id)}
            className="text-[10px] text-muted hover:text-red-400">{t("assets.delete")}</button>
        </div>
      </td>
    </tr>
  );
}

function Input({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  const isNum = type === "number";
  return (
    <div>
      <label className="text-xs text-muted">{label}</label>
      <input type={isNum ? "number" : type} step={isNum ? "any" : undefined}
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
    </div>
  );
}
