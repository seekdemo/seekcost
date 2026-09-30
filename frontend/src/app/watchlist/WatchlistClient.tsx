"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import MarketQuote, { loadMarketQuote, MarketQuoteHeading, MarketQuoteUpdates, type IntradayQuote } from "@/components/MarketQuote";
import { stripRichText } from "@/components/RichTextField";
import { api } from "@/lib/api";
import type {
  ResearchNote,
  WatchlistClassificationPreview,
  WatchlistClassificationSelection,
} from "@/lib/types";
import { useI18n } from "@/components/I18nProvider";

type Stage = "radar" | "conviction" | "strike";
type ViewMode = "funnel" | "sector" | "concept" | "price";
type ArchiveReason = "buy" | "invalidated";
type AssetClass = "all" | "index" | "futures" | "us" | "cn" | "hk" | "crypto" | "etf" | "other";
type MarketScope = "all" | "us" | "cn" | "hk";
type WatchSort = "default" | "change_desc" | "change_asc";
type ThemeFilter = { type: "all" } | { type: "industry" | "concept"; value: string };
type NoteVisibility = "private" | "workspace" | "public";

interface SymbolSearchItem {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  market: string;
}

interface Milestone {
  id: string;
  date: string;
  title: string;
  done: boolean;
}

interface WatchStock {
  id: string;
  symbol: string;
  name: string;
  stage: Stage;
  sector: string;
  industries?: string[];
  concepts?: string[];
  inspiration: string;
  entryReason?: string;
  businessSummary?: string;
  growthDrivers?: string;
  fundamentalRisks?: string;
  fundamentalMetrics?: { name: string; value: string; period?: string }[];
  thesis: string;
  invalidation: string;
  currentPrice: number;
  priceChange?: number;
  priceChangePct?: number;
  priceSession?: string;
  fairPrice: number;
  strikePrice: number;
  targetPrice: number;
  plannedCapital: number;
  tranches: number;
  firstEntryDrop: number;
  addOnDrop: number;
  notes: string;
  milestones: Milestone[];
  updatedAt: string;
  createdAt: string;
}

interface WatchNote {
  id: string;
  stockId?: string;
  stockIds?: string[];
  knowledgeTags?: string[];
  title: string;
  format?: "markdown" | "rich";
  visibility?: NoteVisibility;
  content: string;
  createdAt: string;
  updatedAt: string;
  links?: { entityType: "watch_stock" | "asset" | "trade_plan" | "transaction"; entityId: number }[];
}

interface ArchiveEntry {
  id: string;
  stock: WatchStock;
  reason: ArchiveReason;
  note: string;
  archivedAt: string;
}

const ARCHIVE_KEY = "seekcost_watchlist_archive_v1";
const STAGES: { key: Stage }[] = [{ key: "radar" }, { key: "conviction" }, { key: "strike" }];
const MARKET_SCOPES: { key: MarketScope }[] = [{ key: "all" }, { key: "us" }, { key: "cn" }, { key: "hk" }];
const US_ETF_SYMBOLS = new Set(["SPY", "QQQ", "VOO", "VTI", "IVV", "IWM", "DIA", "TLT", "GLD", "SLV", "ARKK", "SOXX", "SMH", "XLK", "XLE", "XLF"]);
const CRYPTO_SYMBOLS = new Set(["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "TON", "TRX", "DOT", "MATIC"]);
const US_INDEX_SYMBOLS = new Set(["SPX", "GSPC", "NDX", "DJI", "DJIA", "IXIC", "RUT", "VIX"]);
const US_FUTURES_SYMBOLS = new Set(["NQMAIN", "ESMAIN", "YMMAIN", "RTYMAIN", "CLMAIN", "GCMAIN", "SILMAIN"]);
const HK_INDEX_SYMBOLS = new Set(["HSI", "HSCEI"]);
const CN_INDEX_SYMBOLS = new Set(["000001", "399001", "399006", "000300", "000905", "000852"]);
const INDEX_SYMBOLS = new Set([...CN_INDEX_SYMBOLS, ...HK_INDEX_SYMBOLS, ...US_INDEX_SYMBOLS]);
function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function distanceToStrike(stock: WatchStock) {
  if (!stock.currentPrice || !stock.strikePrice) return 999;
  return ((stock.currentPrice - stock.strikePrice) / stock.strikePrice) * 100;
}

function safetyPosition(stock: WatchStock) {
  const high = Math.max(stock.targetPrice || 0, stock.fairPrice || 0, stock.currentPrice || 0);
  const low = Math.min(stock.strikePrice || 0, stock.fairPrice || 0, stock.currentPrice || 0);
  if (high <= low) return 50;
  return Math.max(0, Math.min(100, ((stock.currentPrice - low) / (high - low)) * 100));
}

function nextMilestone(stock: WatchStock) {
  const future = stock.milestones
    .filter((m) => !m.done)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!future) return null;
  const diff = Math.ceil((new Date(future.date).getTime() - Date.now()) / 86400000);
  return { ...future, diff };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const encodeCell = (value: string | number) => {
    const raw = String(value ?? "");
    const safe = typeof value === "string" && /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const content = `\uFEFF${rows.map((row) => row.map(encodeCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function localDateStamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().replace(/^"|"$/g, "").toUpperCase();
}

function formatSymbol(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return "";
  const withoutLeadingIndexDot = normalized.replace(/^\.(SPX|GSPC|NDX|DJI|DJIA|IXIC|RUT|VIX)$/i, "$1");
  return withoutLeadingIndexDot
    .replace(/\.US$/, "")
    .replace(/\.(HK|SH|SZ|SS|TW|TWO|BJ)$/, "");
}

function symbolKey(symbol: string) {
  return formatSymbol(symbol);
}

function inferAssetClass(stock: Pick<WatchStock, "symbol" | "name" | "sector">): AssetClass {
  const symbol = formatSymbol(stock.symbol);
  const rawSymbol = normalizeSymbol(stock.symbol);
  const name = (stock.name || "").toUpperCase();
  const sector = stock.sector || "";

  if (sector === "ETF" || US_ETF_SYMBOLS.has(symbol) || /ETF|基金|TRUST|ISHARES|VANGUARD|SPDR/.test(name)) return "etf";
  if (sector === "期货" || US_FUTURES_SYMBOLS.has(symbol) || /期货|FUTURE|FUTURES|主连|连续/.test(name) || /[A-Z]{1,3}\d{3,4}$/.test(rawSymbol)) return "futures";
  if (sector === "指数" || INDEX_SYMBOLS.has(symbol) || /指数|INDEX|COMPOSITE|NASDAQ|S&P|标普|恒生|中证|上证|深证|创业板/.test(name)) return "index";
  if (sector === "加密货币" || CRYPTO_SYMBOLS.has(symbol) || rawSymbol.includes("-USD") || /CRYPTO|BITCOIN|ETHEREUM|比特币|以太坊/.test(name)) return "crypto";
  if (sector === "港股" || /^\d{4,5}$/.test(symbol)) return "hk";
  if (sector === "A股" || /^\d{6}$/.test(symbol)) return "cn";
  if (sector === "美股" || /^[A-Z]{1,5}$/.test(symbol)) return "us";
  return "other";
}

function localizedAssetClassLabel(stock: Pick<WatchStock, "symbol" | "name" | "sector">, t: (key: string) => string) {
  const map: Record<AssetClass, string> = {
    all: "watchlist.assetClass", index: "watchlist.assetClassIndex", futures: "watchlist.assetClassFutures", us: "watchlist.assetClassUs", cn: "watchlist.assetClassCn", hk: "watchlist.assetClassHk", crypto: "watchlist.assetClassCrypto", etf: "watchlist.assetClassEtf", other: "watchlist.assetClassOther",
  };
  return t(map[inferAssetClass(stock)] || "watchlist.assetClassOther");
}

function localizedStageTitle(stage: Stage, t: (key: string) => string) {
  return t(stage === "radar" ? "watchlist.stageRadar" : stage === "conviction" ? "watchlist.stageConviction" : "watchlist.stageStrike");
}

function localizedMarketLabel(market: string, t: (key: string) => string) {
  const keys: Record<string, string> = { us: "watchlist.marketUs", cn: "watchlist.marketCn", hk: "watchlist.marketHk", tw: "watchlist.marketTw", crypto: "watchlist.marketCrypto", other: "watchlist.marketOther" };
  return keys[market] ? t(keys[market]) : market;
}

function inferMarketScope(stock: Pick<WatchStock, "symbol" | "name" | "sector">): Exclude<MarketScope, "all"> | "other" {
  const symbol = formatSymbol(stock.symbol);
  const rawSymbol = normalizeSymbol(stock.symbol);
  const name = (stock.name || "").toUpperCase();
  const sector = stock.sector || "";
  if (US_FUTURES_SYMBOLS.has(symbol) || (/纳斯达克|NASDAQ|S&P|DOW JONES|RUSSELL/.test(name) && /期货|FUTURE|FUTURES|主连|连续/.test(name))) return "us";
  if (sector === "港股" || /^\d{4,5}$/.test(symbol) || rawSymbol.endsWith(".HK")) return "hk";
  if (sector === "A股" || /^\d{6}$/.test(symbol) || rawSymbol.endsWith(".SS") || rawSymbol.endsWith(".SH") || rawSymbol.endsWith(".SZ")) return "cn";
  if (sector === "美股" || US_ETF_SYMBOLS.has(symbol) || /^[A-Z]{1,5}$/.test(symbol)) return "us";
  if (/上证|深证|创业板|中证|沪深|A股/.test(name)) return "cn";
  if (/恒生|港股|HANG SENG/.test(name)) return "hk";
  return "other";
}

function matchesMarketScope(stock: WatchStock, scope: MarketScope) {
  return scope === "all" || inferMarketScope(stock) === scope;
}

function quoteMarket(stock: WatchStock) {
  const cls = inferAssetClass(stock);
  const symbol = formatSymbol(stock.symbol);
  const rawSymbol = normalizeSymbol(stock.symbol);
  const name = (stock.name || "").toUpperCase();
  if (US_FUTURES_SYMBOLS.has(symbol)) return "us";
  if (cls === "index") {
    if (US_INDEX_SYMBOLS.has(symbol) || rawSymbol.startsWith(".") || /纳斯达克|NASDAQ|S&P|VIX|VOLATILITY|DOW JONES|RUSSELL/.test(name)) return "us";
    if (HK_INDEX_SYMBOLS.has(symbol) || /HANG SENG|恒生/.test(name)) return "hk";
    return "cn_index";
  }
  if (cls === "etf") {
    const market = inferMarketScope(stock);
    return market === "cn" || market === "hk" ? market : "us";
  }
  if (cls === "cn") return "cn";
  if (cls === "hk") return "hk";
  if (cls === "crypto") return "crypto";
  return "us";
}

function themeSummary(stock: WatchStock) {
  // A source classification can be both an industry and a concept.
  return [...new Set([...inferIndustryLabels(stock), ...inferConceptLabels(stock)])].join(" / ");
}

function decisionThesis(stock: WatchStock) {
  return stripRichText(stock.thesis || stock.entryReason || stock.inspiration).trim();
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)));
}

function parseWatchlistCommand(value: string): { type: "add" | "filter"; value: string } {
  const match = value.trim().match(/^(add|filter)\s+(.+)$/i);
  if (!match) return { type: "add", value: value.trim() };
  return { type: match[1].toLowerCase() as "add" | "filter", value: match[2].trim() };
}

function stockSearchText(stock: Pick<WatchStock, "symbol" | "name" | "sector" | "inspiration" | "entryReason" | "thesis" | "notes">) {
  const full = stock as WatchStock;
  return `${stock.symbol} ${stock.name} ${stock.sector} ${(full.industries || []).join(" ")} ${(full.concepts || []).join(" ")} ${stock.inspiration} ${stripRichText(stock.entryReason || "")} ${stripRichText(stock.thesis)} ${stripRichText(stock.notes)}`.toUpperCase();
}

function manualLabels(value: string) {
  const source = value.trim();
  if (
    !source
    || source.length > 256
    || /[\r\n]|<\/?[a-z][^>]*>|https?:\/\/|%[0-9a-f]{2}|^\s*#{1,6}\s/im.test(source)
  ) return [];
  return source
    .split(/[;；,，/|]/)
    .map(cleanClassificationLabel)
    .filter((item): item is string => Boolean(item))
    .filter((item) => !["A股", "美股", "港股", "其他", "ETF", "指数", "期货", "加密货币"].includes(item));
}

function cleanClassificationLabel(value: string) {
  const label = value.replace(/\s+/g, " ").trim();
  if (
    !label
    || label.length > 48
    || /[\r\n]|https?:\/\/|%[0-9a-f]{2}|^\s*(?:#{1,6}\s|[*_`>~]+|[()）])|[*_]{2}/i.test(label)
    || !/[\p{L}\p{N}]/u.test(label)
  ) return null;
  return label;
}

function cleanClassificationLabels(values: string[] | undefined) {
  return uniqueValues((values || []).map(cleanClassificationLabel).filter((item): item is string => Boolean(item)));
}

function inferIndustryLabels(stock: WatchStock) {
  const labels = cleanClassificationLabels(stock.industries);
  if (labels.length) return labels;
  const legacy = manualLabels(stock.sector);
  if (legacy.length) return legacy;
  return [];
}

function inferConceptLabels(stock: WatchStock) {
  return cleanClassificationLabels(stock.concepts);
}

function matchesTheme(stock: WatchStock, filter: ThemeFilter) {
  if (filter.type === "all") return true;
  const labels = filter.type === "industry" ? inferIndustryLabels(stock) : inferConceptLabels(stock);
  return labels.includes(filter.value);
}

function buildThemeCounts(stocks: WatchStock[], type: "industry" | "concept") {
  const map = new Map<string, number>();
  for (const stock of stocks) {
    const labels = type === "industry" ? inferIndustryLabels(stock) : inferConceptLabels(stock);
    for (const label of labels) map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractSymbolMentions(text: string) {
  const matches = text.matchAll(/\$([A-Za-z0-9.-]{1,12})/g);
  return uniqueValues([...matches].map((match) => formatSymbol(match[1])));
}

function allowedKnowledgeTags(stocks: WatchStock[]) {
  return uniqueValues(stocks.flatMap((stock) => [
    ...inferIndustryLabels(stock),
    ...inferConceptLabels(stock),
  ]));
}

function extractKnowledgeTags(text: string, allowedTags: string[]) {
  const allowed = new Set(allowedTags);
  const matches = text.matchAll(/@([\p{Script=Han}A-Za-z0-9][\p{Script=Han}A-Za-z0-9_-]{0,24})/gu);
  return uniqueValues([...matches].map((match) => match[1]).filter((tag) => allowed.has(tag)));
}

function normalizeNoteLinks(note: WatchNote, stocks: WatchStock[]) {
  const text = `${note.title || ""} ${note.content || ""}`;
  const explicitIds = new Set(note.stockIds || (note.stockId ? [note.stockId] : []));
  const allowedTags = allowedKnowledgeTags(stocks);
  const symbolMentions = extractSymbolMentions(text);
  for (const symbol of symbolMentions) {
    const stock = stocks.find((item) => symbolKey(item.symbol) === symbolKey(symbol));
    if (stock) explicitIds.add(stock.id);
  }
  return {
    ...note,
    stockIds: [...explicitIds],
    knowledgeTags: extractKnowledgeTags(text, allowedTags),
  };
}

function noteLinksStock(note: WatchNote, stock: WatchStock) {
  if (note.stockId === stock.id || note.stockIds?.includes(stock.id)) return true;
  return extractSymbolMentions(`${note.title || ""} ${note.content || ""}`)
    .some((symbol) => symbolKey(symbol) === symbolKey(stock.symbol));
}

function notePlainText(note: WatchNote) {
  return (note.content || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function migrateArchives(rawArchives: ArchiveEntry[]) {
  return rawArchives.map((entry) => ({
    ...entry,
    stock: {
      ...entry.stock,
      symbol: formatSymbol(entry.stock.symbol) || entry.stock.symbol,
      entryReason: entry.stock.entryReason ?? entry.stock.inspiration ?? "",
    },
  }));
}

function loadStoredArchives() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    return raw ? migrateArchives(JSON.parse(raw) as ArchiveEntry[]) : [];
  } catch {
    return [];
  }
}

function apiStockToWatchStock(raw: Record<string, unknown>): WatchStock {
  return {
    id: String(raw.id),
    symbol: formatSymbol(String(raw.symbol || "")),
    name: String(raw.name || raw.symbol || ""),
    stage: (raw.stage as Stage) || "radar",
    sector: String(raw.sector || ""),
    industries: Array.isArray(raw.industries) ? raw.industries.map(String) : [],
    concepts: Array.isArray(raw.concepts) ? raw.concepts.map(String) : [],
    inspiration: String(raw.inspiration || ""),
    entryReason: String(raw.entry_reason || ""),
    businessSummary: String(raw.business_summary || ""),
    growthDrivers: String(raw.growth_drivers || ""),
    fundamentalRisks: String(raw.fundamental_risks || ""),
    fundamentalMetrics: Array.isArray(raw.fundamental_metrics) ? raw.fundamental_metrics.map((item) => {
      const metric = item as Record<string, unknown>;
      return { name: String(metric.name || ""), value: String(metric.value || ""), period: metric.period ? String(metric.period) : undefined };
    }) : [],
    thesis: String(raw.thesis || ""),
    invalidation: String(raw.invalidation || ""),
    currentPrice: Number(raw.current_price || 0),
    priceChange: raw.price_change == null ? undefined : Number(raw.price_change),
    priceChangePct: raw.price_change_pct == null ? undefined : Number(raw.price_change_pct),
    priceSession: String(raw.price_session || ""),
    fairPrice: Number(raw.fair_price || 0),
    strikePrice: Number(raw.strike_price || 0),
    targetPrice: Number(raw.target_price || 0),
    plannedCapital: Number(raw.planned_capital || 0),
    tranches: Number(raw.tranches || 3),
    firstEntryDrop: Number(raw.first_entry_drop || 0),
    addOnDrop: Number(raw.add_on_drop || 10),
    notes: String(raw.notes || ""),
    milestones: Array.isArray(raw.milestones) ? raw.milestones as Milestone[] : [],
    createdAt: String(raw.created_at || new Date().toISOString()),
    updatedAt: String(raw.updated_at || new Date().toISOString()),
  };
}

function watchStockToApi(stock: Partial<WatchStock>) {
  const body: Record<string, unknown> = {};
  if (stock.symbol !== undefined) body.symbol = formatSymbol(stock.symbol);
  if (stock.name !== undefined) body.name = stock.name;
  if (stock.stage !== undefined) body.stage = stock.stage;
  if (stock.sector !== undefined) body.sector = stock.sector;
  if (stock.industries !== undefined) body.industries = stock.industries;
  if (stock.concepts !== undefined) body.concepts = stock.concepts;
  if (stock.inspiration !== undefined) body.inspiration = stock.inspiration;
  if (stock.entryReason !== undefined) body.entry_reason = stock.entryReason;
  if (stock.businessSummary !== undefined) body.business_summary = stock.businessSummary;
  if (stock.growthDrivers !== undefined) body.growth_drivers = stock.growthDrivers;
  if (stock.fundamentalRisks !== undefined) body.fundamental_risks = stock.fundamentalRisks;
  if (stock.fundamentalMetrics !== undefined) body.fundamental_metrics = stock.fundamentalMetrics;
  if (stock.thesis !== undefined) body.thesis = stock.thesis;
  if (stock.invalidation !== undefined) body.invalidation = stock.invalidation;
  if (stock.currentPrice !== undefined) body.current_price = stock.currentPrice;
  if (stock.priceChange !== undefined) body.price_change = stock.priceChange;
  if (stock.priceChangePct !== undefined) body.price_change_pct = stock.priceChangePct;
  if (stock.priceSession !== undefined) body.price_session = stock.priceSession;
  if (stock.fairPrice !== undefined) body.fair_price = stock.fairPrice;
  if (stock.strikePrice !== undefined) body.strike_price = stock.strikePrice;
  if (stock.targetPrice !== undefined) body.target_price = stock.targetPrice;
  if (stock.plannedCapital !== undefined) body.planned_capital = stock.plannedCapital;
  if (stock.tranches !== undefined) body.tranches = stock.tranches;
  if (stock.firstEntryDrop !== undefined) body.first_entry_drop = stock.firstEntryDrop;
  if (stock.addOnDrop !== undefined) body.add_on_drop = stock.addOnDrop;
  if (stock.notes !== undefined) body.notes = stock.notes;
  if (stock.milestones !== undefined) body.milestones = stock.milestones;
  return body;
}

function apiNoteToWatchNote(raw: ResearchNote, stocks: WatchStock[]): WatchNote {
  const symbols = raw.stock_symbols.map(formatSymbol);
  return normalizeNoteLinks({
    id: String(raw.id),
    stockIds: symbols.map((symbol) => stocks.find((stock) => symbolKey(stock.symbol) === symbolKey(symbol))?.id).filter(Boolean) as string[],
    knowledgeTags: raw.knowledge_tags,
    title: raw.title || "Untitled research",
    format: raw.format === "rich" ? "rich" : "markdown",
    visibility: (raw.visibility as NoteVisibility) || "private",
    content: raw.content,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    links: raw.links.map((link) => ({ entityType: link.entity_type, entityId: link.entity_id })),
  }, stocks);
}

export default function WatchlistPage() {
  return <AuthGuard><WatchlistContent /></AuthGuard>;
}

function WatchlistContent() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const classificationInputRef = useRef<HTMLInputElement | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);
  const [stocks, setStocks] = useState<WatchStock[]>([]);
  // Keep displayed anchor distances and sorting on the same quote as the strip.
  // This updates presentation only; it never writes quote data to the database.
  const acceptQuote = useCallback((symbol: string, market: string, quote: IntradayQuote) => {
    setStocks(previous => previous.map(stock => stock.symbol === symbol && quoteMarket(stock) === market
      ? { ...stock, currentPrice: quote.price ?? stock.currentPrice, priceChangePct: quote.change_pct ?? undefined,
          priceChange: quote.previous_close == null || quote.price == null ? undefined : quote.price - quote.previous_close }
      : stock));
  }, []);
  const [archives] = useState<ArchiveEntry[]>(loadStoredArchives);
  const [notes, setNotes] = useState<WatchNote[]>([]);
  const [view, setView] = useState<ViewMode>("funnel");
  const [marketScope, setMarketScope] = useState<MarketScope>("all");
  const [decisionStockId, setDecisionStockId] = useState<string | null>(null);
  const [funnelCommandQuery, setFunnelCommandQuery] = useState<{ value: string; nonce: number } | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState("");
  const [quickMsg, setQuickMsg] = useState("");
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [classificationLoading, setClassificationLoading] = useState(false);
  const [classificationApplying, setClassificationApplying] = useState(false);
  const [classificationPreview, setClassificationPreview] = useState<WatchlistClassificationPreview | null>(null);
  const [classificationSelections, setClassificationSelections] = useState<WatchlistClassificationSelection[]>([]);
  const [classificationError, setClassificationError] = useState("");
  const [backendMsg, setBackendMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadBackend = async () => {
      try {
        setBackendMsg("");
        const backendStocks = (await api.listWatchStocks()).map(apiStockToWatchStock);
        const noteRows = await api.listNotes();
        if (cancelled) return;
        setStocks(backendStocks);
        setNotes(noteRows.map((row) => apiNoteToWatchNote(row, backendStocks)));
      } catch (error) {
        if (!cancelled) setBackendMsg(error instanceof Error ? error.message : t("watchlist.backendFallback"));
      }
    };
    void loadBackend();
    return () => { cancelled = true; };
  }, [t]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuickOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toolsMenuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!toolsMenuRef.current?.contains(event.target as Node)) setToolsMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setToolsMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [toolsMenuOpen]);

  useEffect(() => {
    const symbol = searchParams.get("symbol");
    const deepView = searchParams.get("view") as ViewMode | null;
    const addTimer = searchParams.get("add") === "1"
      ? window.setTimeout(() => {
        setQuickOpen(true);
        router.replace("/watchlist", { scroll: false });
      }, 0)
      : null;
    const viewTimer = deepView && ["funnel", "sector", "concept", "price"].includes(deepView)
      ? window.setTimeout(() => setView(deepView), 0)
      : null;
    if (symbol) {
      const stock = stocks.find((item) => symbolKey(item.symbol) === symbolKey(symbol));
      if (stock) {
        const fromNote = searchParams.get("fromNote");
        router.replace(`/watchlist/${encodeURIComponent(stock.id)}${fromNote ? `?fromNote=${encodeURIComponent(fromNote)}` : ""}`);
      }
    }
    return () => {
      if (viewTimer) window.clearTimeout(viewTimer);
      if (addTimer) window.clearTimeout(addTimer);
    };
  }, [router, searchParams, stocks]);

  const visibleStocks = stocks.filter((stock) => matchesMarketScope(stock, marketScope));
  const decisionStock = stocks.find((stock) => stock.id === decisionStockId) || null;
  const openStock = (id: string) => {
    router.push(`/watchlist/${encodeURIComponent(id)}`);
  };
  const openQuickDecision = (id: string) => setDecisionStockId(id);
  const filterFromCommand = (value: string) => {
    const query = value.trim();
    if (!query) return;
    setView("funnel");
    setFunnelCommandQuery({ value: query, nonce: Date.now() });
    setQuickOpen(false);
  };
  const strikeStocks = visibleStocks.filter((s) => s.stage === "strike");
  const strikeSectorCount = new Set(strikeStocks.map((s) => s.sector)).size;
  const concentrationWarning = strikeStocks.length >= 2 && strikeSectorCount === 1;
  const activeAlerts = visibleStocks.filter((s) => {
    const m = nextMilestone(s);
    return (s.stage === "strike" && distanceToStrike(s) <= 2)
      || (s.stage === "conviction" && m && m.diff >= 0 && m.diff <= 7);
  });

  const updateStock = (id: string, patch: Partial<WatchStock>) => {
    const now = new Date().toISOString();
    setStocks((prev) => prev.map((s) => (
      s.id === id ? { ...s, ...patch, updatedAt: now } : s
    )));
    void api.updateWatchStock(id, watchStockToApi(patch)).then((raw) => {
      setStocks((prev) => prev.map((s) => (s.id === id ? apiStockToWatchStock(raw) : s)));
    }).catch((error) => {
      setBackendMsg(error instanceof Error ? error.message : t("watchlist.updateFailed"));
    });
  };

  const addQuick = async (result: SymbolSearchItem, inspiration: string) => {
    if (!result) return;
    const resultKey = symbolKey(result.symbol);
    const existing = stocks.find((s) => symbolKey(s.symbol) === resultKey);
    if (existing) {
      const stageName = localizedStageTitle(existing.stage, t);
      setQuickMsg(t("watchlist.alreadyAdded", { symbol: existing.symbol, stage: stageName }));
      openStock(existing.id);
      return;
    }
    const stock: WatchStock = {
      id: uid(),
      symbol: formatSymbol(result.symbol),
      name: result.name || result.symbol,
      stage: "radar",
      sector: "",
      industries: [],
      concepts: [],
      inspiration: inspiration,
      entryReason: "",
      thesis: "",
      invalidation: "",
      currentPrice: 0,
      fairPrice: 0,
      strikePrice: 0,
      targetPrice: 0,
      plannedCapital: 0,
      tranches: 3,
      firstEntryDrop: 0,
      addOnDrop: 10,
      notes: "",
      milestones: [],
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    try {
      const created = apiStockToWatchStock(await api.createWatchStock(watchStockToApi(stock)));
      setStocks((prev) => [created, ...prev.filter((item) => symbolKey(item.symbol) !== symbolKey(created.symbol))]);
      setQuickMsg("");
      setQuickOpen(false);
      openStock(created.id);
    } catch (error) {
      setQuickMsg(error instanceof Error ? error.message : t("watchlist.addFailed"));
    }
  };

  const onDropStage = (stage: Stage) => {
    if (!dragId) return;
    updateStock(dragId, { stage });
    setDragId(null);
  };

  const deleteStocks = (ids: string[]) => {
    if (!ids.length) return;
    setStocks((prev) => prev.filter((stock) => !ids.includes(stock.id)));
    setNotes((prev) => prev.map((note) => ({
      ...note,
      stockId: note.stockId && ids.includes(note.stockId) ? undefined : note.stockId,
      stockIds: (note.stockIds || []).filter((id) => !ids.includes(id)),
    })));
    void Promise.all(ids.map((id) => api.deleteWatchStock(id).catch((error) => {
      setBackendMsg(error instanceof Error ? error.message : t("watchlist.batchDeleteSyncFailed"));
    })));
  };

  const importRadarCsv = async (file: File) => {
    setImportMsg("");
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setImportMsg(t("watchlist.emptyCsv"));
      return;
    }
    const header = rows[0].map((h) => h.trim());
    const codeIdx = header.findIndex((value) => ["代码", "Symbol"].includes(value));
    const nameIdx = header.findIndex((value) => ["名称", "Name"].includes(value));
    const marketIdx = header.findIndex((value) => ["市场", "Market"].includes(value));
    if (codeIdx < 0 || nameIdx < 0) {
      setImportMsg(t("watchlist.csvColumns"));
      return;
    }

    const existing = new Set(stocks.map((s) => symbolKey(s.symbol)));
    const incoming = new Set<string>();
    const now = new Date().toISOString();
    const imported: WatchStock[] = [];
    let skipped = 0;

    for (const row of rows.slice(1)) {
      const symbol = formatSymbol(row[codeIdx] || "");
      const key = symbolKey(symbol);
      const name = (row[nameIdx] || symbol).trim();
      const marketRaw = marketIdx >= 0 ? (row[marketIdx] || "").trim() : "";
      if (!symbol || !key || existing.has(key) || incoming.has(key)) {
        skipped += symbol ? 1 : 0;
        continue;
      }
      incoming.add(key);
      imported.push({
        id: uid(),
        symbol,
        name,
        stage: "radar",
        sector: "",
        industries: [],
        concepts: [],
        inspiration: marketRaw ? `Imported from watchlist · ${marketRaw}` : "Imported from watchlist",
        entryReason: "",
        thesis: "",
        invalidation: "",
        currentPrice: 0,
        fairPrice: 0,
        strikePrice: 0,
        targetPrice: 0,
        plannedCapital: 0,
        tranches: 3,
        firstEntryDrop: 0,
        addOnDrop: 10,
        notes: "",
        milestones: [],
        updatedAt: now,
        createdAt: now,
      });
    }

    if (imported.length) {
      try {
        const res = await api.bulkImportWatchStocks(imported.map((stock) => watchStockToApi(stock)));
        const created = res.items.map(apiStockToWatchStock);
        setStocks((prev) => [...created, ...prev.filter((stock) => !created.some((item) => symbolKey(item.symbol) === symbolKey(stock.symbol)))]);
        setImportMsg(t("watchlist.imported", { count: res.imported, skipped: skipped + res.skipped }));
      } catch (error) {
        setImportMsg(error instanceof Error ? error.message : t("watchlist.importFailed"));
      }
    } else {
      setImportMsg(t("watchlist.imported", { count: 0, skipped }));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const previewClassification = async (files: File[]) => {
    if (!files.length) return;
    setClassificationLoading(true);
    setClassificationError("");
    setImportMsg("");
    try {
      const preview = await api.previewWatchlistClassification(files);
      setClassificationPreview(preview);
      setClassificationSelections(preview.groups.map((group) => ({
        key: group.key,
        label: group.suggested_name,
        selected: group.matched_count > 0,
      })));
    } catch (error) {
      setClassificationError(error instanceof Error ? error.message : t("watchlist.classificationPreviewFailed"));
    } finally {
      setClassificationLoading(false);
      if (classificationInputRef.current) classificationInputRef.current.value = "";
    }
  };

  const closeClassification = () => {
    if (classificationApplying) return;
    setClassificationPreview(null);
    setClassificationSelections([]);
    setClassificationError("");
  };

  const applyClassification = async () => {
    if (!classificationPreview) return;
    const selectedGroups = classificationSelections.filter((group) => group.selected && group.label.trim());
    if (!selectedGroups.length) {
      setClassificationError(t("watchlist.classificationSelectOne"));
      return;
    }
    setClassificationApplying(true);
    setClassificationError("");
    try {
      const result = await api.applyWatchlistClassification(classificationPreview.session_id, classificationSelections);
      const updated = new Map(result.items.map((raw) => {
        const stock = apiStockToWatchStock(raw);
        return [stock.id, stock] as const;
      }));
      setStocks((current) => current.map((stock) => updated.get(stock.id) || stock));
      setView("concept");
      setImportMsg(t("watchlist.classificationApplied", {
        stocks: result.updated_count,
        assignments: result.assignments_added,
        unchanged: result.unchanged_count,
      }));
      setClassificationPreview(null);
      setClassificationSelections([]);
    } catch (error) {
      setClassificationError(error instanceof Error ? error.message : t("watchlist.classificationApplyFailed"));
    } finally {
      setClassificationApplying(false);
    }
  };

  const refreshWatchlistPrices = async () => {
    const tradable = stocks.filter((stock) => {
      const assetClass = inferAssetClass(stock);
      return assetClass !== "other" && (assetClass !== "futures" || US_FUTURES_SYMBOLS.has(formatSymbol(stock.symbol)));
    });
    if (!tradable.length) {
      setImportMsg(t("watchlist.noRefreshable"));
      return;
    }
    setRefreshingPrices(true);
    setImportMsg("");
    try {
      const res = await api.refreshWatchlistPrices(
        tradable.map((stock) => ({ symbol: stock.symbol, market: quoteMarket(stock) }))
      );
      if (res.error) {
        setImportMsg(res.error);
      } else {
        const nextStocks = stocks.map((stock) => {
          const price = res.prices[stock.symbol];
          return typeof price === "number" ? {
            ...stock,
            currentPrice: price,
            priceChange: res.changes?.[stock.symbol],
            priceChangePct: res.change_pcts?.[stock.symbol],
            priceSession: res.sessions?.[stock.symbol],
            updatedAt: new Date().toISOString(),
          } : stock;
        });
        setStocks(nextStocks);
        void Promise.all(nextStocks
          .filter((stock) => typeof res.prices[stock.symbol] === "number")
          .map((stock) => api.updateWatchStock(stock.id, watchStockToApi({
            currentPrice: stock.currentPrice,
            priceChange: stock.priceChange,
            priceChangePct: stock.priceChangePct,
            priceSession: stock.priceSession,
          })).catch(() => null)));
        setImportMsg(res.message || t("watchlist.refreshDone", { count: res.updated_count }));
      }
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : t("watchlist.refreshFailed"));
    } finally {
      setRefreshingPrices(false);
    }
  };

  return (
    <MarketQuoteUpdates.Provider value={acceptQuote}>
    <div className={`page-shell page-shell--wide relative min-h-[calc(100vh-112px)] ${concentrationWarning ? "shadow-[inset_0_0_60px_rgba(245,158,11,0.10)]" : ""}`}>
      <header className="border-b border-themed pb-4 pt-1">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">{t("watchlist.eyebrow")}</p>
            <h1 className="mt-1 text-2xl font-semibold text-primary sm:text-[1.75rem]">{t("watchlist.title")}</h1>
            <p className="mt-1.5 hidden max-w-2xl text-sm leading-6 text-muted sm:line-clamp-1 sm:block">{t("watchlist.description")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              className="ui-button border-[var(--accent)]/30 bg-[var(--accent-bg)] px-3 text-accent hover:bg-[var(--accent-bg-hover)]"
              aria-label={t("watchlist.openCommandPalette")}
            >
              <span className="hidden sm:inline">{t("watchlist.quickCapture")}</span>
              <kbd className="rounded border border-[var(--accent)]/25 bg-black/10 px-1.5 py-0.5 text-[11px] font-medium">⌘ K</kbd>
            </button>
            <div ref={toolsMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setToolsMenuOpen((open) => !open)}
                className="icon-button"
                aria-label={t("watchlist.tools")}
                title={t("watchlist.tools")}
                aria-haspopup="menu"
                aria-expanded={toolsMenuOpen}
              >
                <span aria-hidden="true" className="text-xl leading-none">⋯</span>
              </button>
              {toolsMenuOpen && (
                <div role="menu" aria-label={t("watchlist.tools")} className="absolute right-0 top-[calc(100%+8px)] z-40 w-56 overflow-hidden rounded-lg border border-themed bg-page p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.48)]">
                  <button type="button" role="menuitem" onClick={() => { setToolsMenuOpen(false); fileInputRef.current?.click(); }} className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-secondary transition hover:bg-surface-hover hover:text-primary">
                    <span aria-hidden="true" className="w-7 text-center text-[10px] font-semibold text-muted">CSV</span>{t("watchlist.import")}
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setToolsMenuOpen(false); classificationInputRef.current?.click(); }} disabled={classificationLoading} className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-secondary transition hover:bg-surface-hover hover:text-primary disabled:cursor-wait disabled:opacity-50">
                    <span aria-hidden="true" className="w-7 text-center text-[10px] font-semibold text-muted">AI</span>{classificationLoading ? t("watchlist.classificationReading") : t("watchlist.classificationAction")}
                  </button>
                  <Link role="menuitem" href="/watchlist/earnings" onClick={() => setToolsMenuOpen(false)} className="flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm text-secondary transition hover:bg-surface-hover hover:text-primary">
                    <span aria-hidden="true" className="w-7 text-center text-base text-muted">□</span>{t("watchlist.earningsTitle")}
                  </Link>
                  <div className="my-1 border-t border-themed" />
                  <button type="button" role="menuitem" onClick={() => { setToolsMenuOpen(false); void refreshWatchlistPrices(); }} disabled={refreshingPrices} className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-secondary transition hover:bg-surface-hover hover:text-primary disabled:cursor-wait disabled:opacity-50">
                    <span aria-hidden="true" className="w-7 text-center text-base text-muted">↻</span>{refreshingPrices ? t("watchlist.refreshing") : t("watchlist.refresh")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <MarketScopeToggle stocks={stocks} value={marketScope} setValue={setMarketScope} />
          <div className="min-w-0 overflow-x-auto"><ViewToggle view={view} setView={setView} /></div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importRadarCsv(file);
          }}
        />
        <input
          ref={classificationInputRef}
          type="file"
          multiple
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            if (files.length) void previewClassification(files);
          }}
        />
      </header>

      {importMsg && (
        <div className="inline-notice inline-notice--success">
          {importMsg}
        </div>
      )}
      {backendMsg && (
        <div className="inline-notice inline-notice--warning">
          {backendMsg}
        </div>
      )}
      {classificationError && !classificationPreview && (
        <div className="inline-notice inline-notice--warning">
          {classificationError}
        </div>
      )}

      <AlertStrip stocks={activeAlerts} concentrationWarning={concentrationWarning} />

      {view === "funnel" && (
          <FunnelView
          stocks={visibleStocks}
          notes={notes}
          marketScope={marketScope}
          externalQuery={funnelCommandQuery}
          dragId={dragId}
          setDragId={setDragId}
          onDropStage={onDropStage}
          updateStock={updateStock}
          deleteStocks={deleteStocks}
          onSelect={openQuickDecision}
        />
      )}

      {view === "sector" && <SectorView stocks={visibleStocks} activeLabel={searchParams.get("tag")} updateStock={updateStock} onSelect={openStock} />}
      {view === "concept" && <ConceptView stocks={visibleStocks} activeLabel={searchParams.get("tag")} updateStock={updateStock} onSelect={openStock} />}
      {view === "price" && <PriceView stocks={visibleStocks} onSelect={openStock} />}

      {archives.length > 0 && (
        <section className="mt-8 border-t border-themed pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-secondary">{t("watchlist.archiveLog")}</h2>
            <span className="text-xs text-muted">{t("watchlist.archiveCount", { count: archives.length })}</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {archives.slice(0, 4).map((entry) => (
              <div key={entry.id} className="rounded-lg border border-themed bg-surface/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-primary">{entry.stock.symbol} · {entry.stock.name}</p>
                  <span className={entry.reason === "buy" ? "text-xs text-down" : "text-xs text-amber-400"}>
                    {entry.reason === "buy" ? t("watchlist.archiveBuy") : t("watchlist.archiveInvalidated")}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{stripRichText(entry.note || entry.stock.thesis || entry.stock.inspiration)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {classificationPreview && (
        <ClassificationPreviewModal
          preview={classificationPreview}
          selections={classificationSelections}
          setSelections={setClassificationSelections}
          error={classificationError}
          applying={classificationApplying}
          onClose={closeClassification}
          onApply={() => void applyClassification()}
        />
      )}

      {quickOpen && (
        <QuickCapture
          message={quickMsg}
          setMessage={setQuickMsg}
          onClose={() => setQuickOpen(false)}
          onSubmit={addQuick}
          onFilter={filterFromCommand}
        />
      )}

      {decisionStock && (
        <QuickDecisionDrawer
          key={decisionStock.id}
          stock={decisionStock}
          notes={notes.filter((note) => noteLinksStock(note, decisionStock))}
          onClose={() => setDecisionStockId(null)}
          onSave={(patch) => updateStock(decisionStock.id, patch)}
          onMoveStage={(stage) => updateStock(decisionStock.id, { stage })}
        />
      )}

    </div>
    </MarketQuoteUpdates.Provider>
  );
}

function ViewToggle({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  const { t } = useI18n();
  const items: { key: ViewMode; label: string }[] = [
    { key: "funnel", label: t("watchlist.viewFunnel") },
    { key: "sector", label: t("watchlist.viewIndustry") },
    { key: "concept", label: t("watchlist.viewConcept") },
    { key: "price", label: t("watchlist.viewPrice") },
  ];
  return (
    <div className="flex w-max min-w-full rounded-lg border border-themed bg-surface p-1 sm:min-w-0">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => setView(item.key)}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            view === item.key ? "bg-accent text-on-accent" : "text-secondary hover:bg-surface-hover hover:text-primary"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function MarketScopeToggle({
  stocks,
  value,
  setValue,
}: {
  stocks: WatchStock[];
  value: MarketScope;
  setValue: (value: MarketScope) => void;
}) {
  const { t } = useI18n();
  const localizedScopes: Record<MarketScope, string> = { all: t("watchlist.allMarkets"), us: t("watchlist.marketUs"), cn: t("watchlist.marketCn"), hk: t("watchlist.marketHk") };
  const counts = MARKET_SCOPES.map((scope) => ({
    ...scope,
    label: localizedScopes[scope.key],
    count: scope.key === "all" ? stocks.length : stocks.filter((stock) => matchesMarketScope(stock, scope.key)).length,
  }));
  return (
    <div className="flex min-w-0 overflow-x-auto rounded-full bg-white/[0.045] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur">
      {counts.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => setValue(item.key)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition ${
            value === item.key ? "bg-white/[0.12] text-primary shadow-[0_8px_28px_rgba(0,0,0,0.18)]" : "text-secondary hover:bg-white/[0.06] hover:text-primary"
          }`}
        >
          {item.label}
          <span className={value === item.key ? "ml-1 text-accent" : "ml-1 text-muted"}>{item.count}</span>
        </button>
      ))}
    </div>
  );
}

function AlertStrip({ stocks, concentrationWarning }: { stocks: WatchStock[]; concentrationWarning: boolean }) {
  const { t } = useI18n();
  if (!stocks.length && !concentrationWarning) return null;
  return (
    <div className="mb-5 rounded-lg border border-[var(--accent)]/20 bg-surface-alt px-4 py-3">
      <div className="flex flex-col gap-2 text-sm text-secondary md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          {stocks.slice(0, 3).map((stock) => {
            const m = nextMilestone(stock);
            const d = distanceToStrike(stock);
            return (
              <p key={stock.id}>
                <span className="font-semibold text-accent">{stock.symbol}</span>
                {d <= 2
                  ? ` ${t("watchlist.nearStrike", { distance: Math.max(d, 0).toFixed(1) })}`
                  : m ? ` ${t("watchlist.milestoneIn", { title: m.title, days: m.diff })}` : ""}
              </p>
            );
          })}
          {concentrationWarning && (
            <p className="text-amber-300">{t("watchlist.concentrationWarning")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function FunnelView({
  stocks,
  notes,
  marketScope,
  externalQuery,
  dragId,
  setDragId,
  onDropStage,
  updateStock,
  deleteStocks,
  onSelect,
}: {
  stocks: WatchStock[];
  notes: WatchNote[];
  marketScope: MarketScope;
  externalQuery?: { value: string; nonce: number } | null;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onDropStage: (stage: Stage) => void;
  updateStock: (id: string, patch: Partial<WatchStock>) => void;
  deleteStocks: (ids: string[]) => void;
  onSelect: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const [stageFilter, setStageFilter] = useState<Stage>("radar");
  const [themeFilter, setThemeFilter] = useState<ThemeFilter>({ type: "all" });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<WatchSort>("default");
  const acceptQuote = useContext(MarketQuoteUpdates);
  const [sortProgress, setSortProgress] = useState({ key: "", done: 0 });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkIndustry, setBulkIndustry] = useState("");
  const [bulkConcept, setBulkConcept] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setSelectedIds([]), 0);
    return () => window.clearTimeout(timer);
  }, [marketScope]);
  useEffect(() => {
    if (!externalQuery) return;
    const timer = window.setTimeout(() => {
      setQuery(externalQuery.value);
      searchInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [externalQuery]);
  const stageStocks = stocks.filter((stock) => stock.stage === stageFilter);
  const filtered = stageStocks
    .filter((stock) => matchesTheme(stock, themeFilter))
    .filter((stock) => {
      const q = query.trim().toUpperCase();
      if (!q) return true;
      return stockSearchText(stock).includes(q);
    })
    .sort((a, b) => {
      if (sort !== "default") {
        const aChange = a.priceChangePct;
        const bChange = b.priceChangePct;
        const aMissing = aChange == null || !Number.isFinite(aChange);
        const bMissing = bChange == null || !Number.isFinite(bChange);
        if (aMissing !== bMissing) return aMissing ? 1 : -1;
        if (!aMissing && !bMissing && aChange !== bChange) {
          return sort === "change_desc" ? bChange - aChange : aChange - bChange;
        }
        return a.symbol.localeCompare(b.symbol);
      }
      const da = daysSince(a.updatedAt);
      const db = daysSince(b.updatedAt);
      return db - da || a.symbol.localeCompare(b.symbol);
    });
  const industryCounts = buildThemeCounts(stageStocks, "industry");
  // Fetch off-screen candidates as well, otherwise a lazy list cannot rank the full pool.
  const sortCandidates = JSON.stringify(filtered.map(stock => [stock.symbol, quoteMarket(stock)]).sort((a, b) => a[0].localeCompare(b[0])));
  const sortEnabled = sort !== "default";
  useEffect(() => {
    if (!sortEnabled || !acceptQuote) return;
    const candidates: [string, string][] = JSON.parse(sortCandidates);
    let cancelled = false;
    let cursor = 0;
    let done = 0;
    async function worker() {
      while (!cancelled && cursor < candidates.length) {
        const [symbol, market] = candidates[cursor++];
        try {
          const quote = await loadMarketQuote(symbol, market);
          if (!cancelled) acceptQuote!(symbol, market, quote);
        } catch {
          if (!cancelled) acceptQuote!(symbol, market, { status: "unavailable", price: null, previous_close: null, change_pct: null, points: [], as_of: null, source: "" });
        }
        done++;
        if (!cancelled) setSortProgress({ key: sortCandidates, done });
      }
    }
    for (let i = 0; i < Math.min(4, candidates.length); i++) void worker();
    return () => { cancelled = true; };
  }, [sortEnabled, sortCandidates, acceptQuote]);
  const conceptCounts = buildThemeCounts(stageStocks, "concept");
  const filteredIds = filtered.map((stock) => stock.id);
  const selectedInView = selectedIds.filter((id) => filteredIds.includes(id));
  const allFilteredSelected = filtered.length > 0 && selectedInView.length === filtered.length;
  const visibleActiveId = activeId && filteredIds.includes(activeId) ? activeId : null;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (key === "/" && !isEditableTarget(event.target)) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (isEditableTarget(event.target)) {
        if (key === "escape") (event.target as HTMLElement).blur();
        return;
      }
      if (document.querySelector('[role="dialog"][aria-modal="true"]') || !filtered.length) return;
      const activeIndex = filtered.findIndex((stock) => stock.id === visibleActiveId);
      if (key === "j" || key === "k") {
        event.preventDefault();
        const nextIndex = activeIndex < 0
          ? (key === "j" ? 0 : filtered.length - 1)
          : Math.max(0, Math.min(filtered.length - 1, activeIndex + (key === "j" ? 1 : -1)));
        const next = filtered[nextIndex];
        setActiveId(next.id);
        document.querySelector(`[data-watch-stock-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "nearest" });
        return;
      }
      const activeStock = activeIndex >= 0 ? filtered[activeIndex] : null;
      if (!activeStock) return;
      const stage = ({ "1": "radar", "2": "conviction", "3": "strike" } as Record<string, Stage | undefined>)[key];
      if (stage) {
        event.preventDefault();
        const adjacent = filtered[activeIndex + 1] || filtered[activeIndex - 1] || null;
        setActiveId(adjacent?.id || null);
        updateStock(activeStock.id, { stage });
        return;
      }
      if (key === "e" || key === " ") {
        event.preventDefault();
        onSelect(activeStock.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, onSelect, updateStock, visibleActiveId]);
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };
  const clearSelection = () => setSelectedIds([]);
  const bulkMoveStage = (stage: Stage) => {
    selectedInView.forEach((id) => updateStock(id, { stage }));
    clearSelection();
  };
  const bulkAddLabel = (type: "industry" | "concept", label: string) => {
    const value = label.trim();
    if (!value) return;
    for (const id of selectedInView) {
      const stock = stocks.find((item) => item.id === id);
      if (!stock) continue;
      if (type === "industry") {
        const next = uniqueValues([...(stock.industries || []), value]);
        updateStock(id, { industries: next, sector: next.join(";") });
      } else {
        updateStock(id, { concepts: uniqueValues([...(stock.concepts || []), value]) });
      }
    }
    setBulkIndustry("");
    setBulkConcept("");
    clearSelection();
  };
  const bulkDelete = () => {
    deleteStocks(selectedInView);
    clearSelection();
  };
  const exportSelected = () => {
    const selectedStocks = selectedInView
      .map((id) => stocks.find((stock) => stock.id === id))
      .filter((stock): stock is WatchStock => !!stock);
    if (!selectedStocks.length) return;
    const rows: Array<Array<string | number>> = locale === "zh-CN" ? [[
      "代码", "名称", "市场", "资产类型", "阶段", "行业", "概念", "灵感来源", "入选理由", "研究逻辑", "失效条件", "当前价", "合理价", "击球价", "目标价", "计划资金", "分批数", "首次建仓跌幅(%)", "加仓跌幅(%)", "备注", "里程碑", "创建时间", "更新时间",
    ]] : [["Symbol", "Name", "Market", "Asset class", "Stage", "Industry", "Concept", "Inspiration", "Entry reason", "Thesis", "Invalidation", "Current price", "Fair value", "Strike", "Target", "Planned capital", "Tranches", "First entry drop (%)", "Add-on drop (%)", "Notes", "Milestones", "Created at", "Updated at"]];
    for (const stock of selectedStocks) {
      rows.push([
        stock.symbol,
        stock.name,
        locale === "zh-CN" ? ({ hk: "港股", cn: "A股", us: "美股", other: "其他" }[inferMarketScope(stock)] || "其他") : ({ hk: "Hong Kong", cn: "China A", us: "US", other: "Other" }[inferMarketScope(stock)] || "Other"),
        localizedAssetClassLabel(stock, t),
        localizedStageTitle(stock.stage, t),
        (stock.industries || []).join(";"),
        (stock.concepts || []).join(";"),
        stock.inspiration,
        stock.entryReason || "",
        stock.thesis,
        stock.invalidation,
        stock.currentPrice,
        stock.fairPrice,
        stock.strikePrice,
        stock.targetPrice,
        stock.plannedCapital,
        stock.tranches,
        stock.firstEntryDrop,
        stock.addOnDrop,
        stock.notes,
        stock.milestones.map((milestone) => `${milestone.date} ${milestone.title}${milestone.done ? ` [${locale === "zh-CN" ? "完成" : "Done"}]` : ""}`).join("; "),
        stock.createdAt,
        stock.updatedAt,
      ]);
    }
    const stageName = localizedStageTitle(stageFilter, t);
    downloadCsv(`SeekCost-${stageName}-${localDateStamp()}.csv`, rows);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
      <aside className="space-y-4 overflow-hidden xl:sticky xl:top-32 xl:max-h-[calc(100dvh-9rem)] xl:overflow-auto xl:pr-1">
        <div className="rounded-lg border border-white/10 bg-surface/45 p-2 backdrop-blur">
          <p className="px-2 pb-2 text-[11px] uppercase tracking-[0.18em] text-muted">{t("watchlist.workflow")}</p>
          <div className="grid grid-cols-3 gap-1 sm:flex sm:gap-2 sm:overflow-x-auto sm:pb-1 xl:block xl:space-y-1 xl:overflow-visible xl:pb-0">
          {STAGES.map((stage) => {
            const count = stocks.filter((stock) => stock.stage === stage.key).length;
            const isStrikeActive = stage.key === "strike" && count > 0;
            return (
              <button
                key={stage.key}
                aria-label={localizedStageTitle(stage.key, t)}
                onClick={() => {
                  setStageFilter(stage.key);
                  setThemeFilter({ type: "all" });
                  setSort("default");
                  setActiveId(null);
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (dragId) setDragOverStage(stage.key);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverStage(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  onDropStage(stage.key);
                  setDragOverStage(null);
                }}
                className={`group min-w-0 rounded-md px-2 py-2.5 text-left transition sm:min-w-[180px] sm:px-2.5 xl:w-full ${dragOverStage === stage.key ? "scale-[1.015] bg-[var(--accent-bg)] ring-1 ring-[var(--accent)]" : ""} ${
                  stageFilter === stage.key
                    ? "bg-white/[0.07] text-primary shadow-[inset_2px_0_0_var(--accent)]"
                    : "text-secondary hover:bg-white/[0.045] hover:text-primary"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`relative hidden h-6 w-6 shrink-0 items-center justify-center rounded-md border sm:flex ${
                      stage.key === "radar" ? "border-sky-300/20 text-sky-200" : stage.key === "conviction" ? "border-cyan-300/20 text-cyan-200" : "border-ok text-ok"
                    }`}>
                      {isStrikeActive && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-ok shadow-[0_0_14px_rgba(45,212,191,0.6)]" />}
                      <span className="h-2.5 w-2.5 rounded-full border border-current" />
                    </span>
                    <span className="truncate text-xs font-semibold sm:text-sm">
                      <span className="sm:hidden">{stage.key === "strike" ? t("watchlist.stageStrikeShort") : localizedStageTitle(stage.key, t)}</span>
                      <span className="hidden sm:inline">{localizedStageTitle(stage.key, t)}</span>
                    </span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${isStrikeActive ? "bg-ok-soft" : "bg-white/[0.05] text-muted"}`}>{count}</span>
                </div>
                <p className="mt-1 hidden line-clamp-2 pl-8 text-xs leading-5 text-muted sm:block">{t(`watchlist.stage${stage.key === "radar" ? "Radar" : stage.key === "conviction" ? "Conviction" : "Strike"}Desc`)}</p>
              </button>
            );
          })}
          </div>
        </div>

        <div className="hidden gap-3 md:grid md:grid-cols-2 xl:block xl:space-y-4">
          <ThemeNav
            title={t("watchlist.industry")}
            type="industry"
            items={industryCounts}
            active={themeFilter}
            onSelect={setThemeFilter}
          />
          <ThemeNav
            title={t("watchlist.concept")}
            type="concept"
            items={conceptCounts}
            active={themeFilter}
            onSelect={setThemeFilter}
          />
        </div>
      </aside>

      <section className="ui-surface min-w-0 rounded-lg border border-themed bg-surface">
        <div className="border-b border-themed p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-primary">
                {localizedStageTitle(stageFilter, t)}
                <span className="ml-2 text-sm font-normal text-muted">{filtered.length} / {stageStocks.length}</span>
              </h2>
              <p className="mt-1 text-xs text-muted">
                {themeFilter.type === "all" ? t("watchlist.funnelHint") : t("watchlist.currentFilter", { value: themeFilter.value })}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
              <label className="relative shrink-0">
                <span className="sr-only">{t("watchlist.sortAria")}</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as WatchSort)}
                  className="h-10 w-full appearance-none rounded-lg border border-themed bg-input py-2 pl-3 pr-9 text-sm text-secondary outline-none transition hover:text-primary focus:border-[var(--accent)] sm:w-40"
                  aria-label={t("watchlist.sortAria")}
                >
                  <option value="default">{t("watchlist.sortDefault")}</option>
                  <option value="change_desc">{t("watchlist.sortGain")}</option>
                  <option value="change_asc">{t("watchlist.sortLoss")}</option>
                </select>
                <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">▾</span>
              </label>
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("watchlist.search")}
                aria-label={t("watchlist.searchAria")}
                className="h-10 w-full rounded-lg border border-themed bg-input px-3 py-2 text-sm text-primary outline-none transition placeholder:text-muted focus:border-[var(--accent)] xl:w-80"
              />
            </div>
          </div>
          {sortEnabled && <p className="mt-2 text-xs text-muted" role="status" data-testid="quote-sort-status">
            {(sortProgress.key === sortCandidates ? sortProgress.done : 0) < filtered.length
              ? (locale.startsWith("zh") ? `正在补齐排序行情 ${sortProgress.key === sortCandidates ? sortProgress.done : 0}/${filtered.length}` : `Updating quotes ${sortProgress.key === sortCandidates ? sortProgress.done : 0}/${filtered.length}`)
              : (locale.startsWith("zh") ? "按已获取涨跌幅排序 · 无行情的标的置后" : "Sorted by available change · Missing quotes last")}
          </p>}
          {selectedInView.length > 0 && (
            <div className="mt-4 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-bg)] p-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <p className="text-sm font-medium text-accent">{t("watchlist.selected", { count: selectedInView.length })}</p>
                <div className="flex flex-wrap gap-2">
                  {STAGES.map((stage) => (
                    <button key={stage.key} onClick={() => bulkMoveStage(stage.key)} className="rounded-md border border-themed bg-surface px-2 py-1.5 text-xs text-secondary transition hover:border-[var(--border-hover)] hover:text-primary">
                      {t("watchlist.moveTo", { stage: localizedStageTitle(stage.key, t) })}
                    </button>
                  ))}
                  <button onClick={exportSelected} className="rounded-md border border-themed bg-surface px-2 py-1.5 text-xs text-secondary transition hover:border-[var(--border-hover)] hover:text-primary" title={t("watchlist.exportSelectedTitle")}>
                    ↓ {t("watchlist.export")}
                  </button>
                  <button onClick={bulkDelete} className="rounded-md border border-red-500/30 px-2 py-1.5 text-xs text-red-300 transition hover:bg-red-500/10">
                    {t("watchlist.deleteSelected")}
                  </button>
                  <button onClick={clearSelection} className="rounded-md border border-themed px-2 py-1.5 text-xs text-secondary transition hover:border-[var(--border-hover)] hover:text-primary">
                    {t("watchlist.clearSelection")}
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="flex gap-2">
                  <input value={bulkIndustry} onChange={(event) => setBulkIndustry(event.target.value)} placeholder={t("watchlist.addIndustry")} className="min-w-0 flex-1 rounded-md border border-themed bg-input px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)]" />
                  <button onClick={() => bulkAddLabel("industry", bulkIndustry)} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent">{t("watchlist.add")}</button>
                </div>
                <div className="flex gap-2">
                  <input value={bulkConcept} onChange={(event) => setBulkConcept(event.target.value)} placeholder={t("watchlist.addConcept")} className="min-w-0 flex-1 rounded-md border border-themed bg-input px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)]" />
                  <button onClick={() => bulkAddLabel("concept", bulkConcept)} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent">{t("watchlist.add")}</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="watchlist-scroll-region max-h-[68vh] overflow-auto">
          <div className="watchlist-market-header hidden items-center gap-3 border-b border-themed bg-page px-4 py-2 text-xs text-muted md:grid">
            <button
              type="button"
              onClick={() => setSelectedIds(allFilteredSelected ? selectedIds.filter((id) => !filteredIds.includes(id)) : uniqueValues([...selectedIds, ...filteredIds]))}
              role="checkbox"
              aria-checked={allFilteredSelected ? true : selectedInView.length > 0 ? "mixed" : false}
              aria-label={allFilteredSelected ? t("watchlist.clearSelection") : t("watchlist.selectAll")}
              title={allFilteredSelected ? t("watchlist.clearSelection") : t("watchlist.selectAll")}
              disabled={filtered.length === 0}
              className={`inline-flex h-5 w-5 items-center justify-center rounded border text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                allFilteredSelected ? "border-[var(--accent)] bg-accent text-on-accent" : "border-themed text-muted hover:border-[var(--border-hover)]"
              }`}
            >
              {allFilteredSelected ? "✓" : selectedInView.length > 0 ? "−" : null}
            </button>
            <span>{t("watchlist.symbol")}</span>
            <span>{t("watchlist.nameClue")}</span>
            <span>{t("watchlist.tags")}</span>
            <MarketQuoteHeading sort={sort} onToggleSort={() => setSort(current => current === "default" ? "change_desc" : current === "change_desc" ? "change_asc" : "default")} />
            <span className="text-right">{t("watchlist.priceSpace")}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="px-4 py-16 text-center text-sm text-muted">{t("watchlist.noFilteredStocks")}</div>
          ) : filtered.map((stock) => (
            <FunnelRow
              key={stock.id}
              stock={stock}
              notes={notes.filter((note) => noteLinksStock(note, stock)).slice(0, 3)}
              dragging={dragId === stock.id}
              active={visibleActiveId === stock.id}
              selected={selectedIds.includes(stock.id)}
              onToggleSelected={() => toggleSelected(stock.id)}
              onDragStart={() => {
                setDragId(stock.id);
                setActiveId(stock.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDragOverStage(null);
              }}
              onSelect={() => {
                setActiveId(stock.id);
                onSelect(stock.id);
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ThemeNav({
  title,
  type,
  items,
  active,
  onSelect,
}: {
  title: string;
  type: "industry" | "concept";
  items: [string, number][];
  active: ThemeFilter;
  onSelect: (filter: ThemeFilter) => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const compactLimit = 6;
  const activeItem = active.type === type ? items.find(([label]) => label === active.value) : undefined;
  const compact = items.slice(0, compactLimit);
  const visible = expanded || items.length <= compactLimit
    ? items
    : activeItem && !compact.some(([label]) => label === activeItem[0])
      ? [...compact.slice(0, compactLimit - 1), activeItem]
      : compact;
  const headingId = `watchlist-${type}-filters`;
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-themed bg-surface p-3 shadow-[0_12px_34px_-30px_var(--shadow-color)]">
      <div className="mb-2 flex min-h-8 items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={headingId} className="truncate text-sm font-semibold text-primary">{title}</h3>
          <span className="shrink-0 rounded-full bg-input px-2 py-0.5 font-mono text-[10px] text-muted">{t("watchlist.groupCount", { count: items.length })}</span>
        </div>
        {active.type === type && (
          <button type="button" onClick={() => onSelect({ type: "all" })} aria-label={t("watchlist.clear")} title={t("watchlist.clear")} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-lg text-muted transition hover:bg-surface-hover hover:text-primary">×</button>
        )}
      </div>
      <div className="space-y-0.5">
        {visible.map(([label, count]) => {
          const selected = active.type === type && active.value === label;
          return (
            <button
              key={`${type}-${label}`}
              onClick={() => onSelect(selected ? { type: "all" } : { type, value: label })}
              className={`group flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition ${
                selected ? "bg-[var(--accent-bg)] font-medium text-accent shadow-[inset_2px_0_0_var(--accent)]" : "text-secondary hover:bg-surface-hover hover:text-primary"
              }`}
            >
              <span className="min-w-0 truncate" title={label}>{label}</span>
              <span className={`min-w-6 shrink-0 rounded-full px-1.5 py-0.5 text-center font-mono text-[10px] ${selected ? "bg-[var(--accent-bg-hover)] text-accent" : "bg-input text-muted group-hover:text-secondary"}`}>{count}</span>
            </button>
          );
        })}
      </div>
      {items.length > compactLimit && (
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="mt-2 flex min-h-10 w-full items-center justify-center gap-1 rounded-md border-t border-themed px-2 pt-2 text-xs font-medium text-muted transition hover:text-primary">
          {expanded ? t("watchlist.showFewerGroups") : t("watchlist.showAllGroups", { count: items.length })}
          <span aria-hidden="true" className={`transition-transform ${expanded ? "rotate-180" : ""}`}>⌄</span>
        </button>
      )}
    </section>
  );
}

function FunnelRow({
  stock,
  notes,
  dragging,
  active,
  selected,
  onToggleSelected,
  onDragStart,
  onDragEnd,
  onSelect,
}: {
  stock: WatchStock;
  notes: WatchNote[];
  dragging?: boolean;
  active?: boolean;
  selected?: boolean;
  onToggleSelected: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onSelect: () => void;
}) {
  const { t, localeTag } = useI18n();
  const distance = distanceToStrike(stock);
  const milestone = nextMilestone(stock);
  const classLabel = localizedAssetClassLabel(stock, t);
  const marketLabel = localizedAssetClassLabel(stock, t);
  return (
    <button
      draggable
      data-watch-stock-id={stock.id}
      data-active={active ? "true" : "false"}
      aria-current={active ? "true" : undefined}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={`watchlist-market-row group relative grid w-full grid-cols-[24px_72px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-b border-themed px-4 py-3 text-left transition last:border-b-0 hover:bg-surface-hover md:items-center md:gap-3 md:py-2.5 ${
        stock.stage === "strike" && distance <= 2 ? "bg-[var(--ok-bg)]" : ""
      } ${active ? "z-[1] bg-white/[0.055] shadow-[inset_3px_0_0_var(--accent)]" : ""} ${selected ? "bg-[var(--accent-bg)]" : ""} ${dragging ? "opacity-30" : ""}`}
    >
      <span
        onClick={(event) => {
          event.stopPropagation();
          onToggleSelected();
        }}
        className={`flex h-5 w-5 items-center justify-center rounded border text-xs transition ${
          selected ? "border-[var(--accent)] bg-accent text-on-accent" : "border-themed text-muted hover:border-[var(--border-hover)]"
        }`}
      >
        {selected ? "✓" : ""}
      </span>
      <span className="font-mono text-sm font-semibold text-primary md:block">{stock.symbol}</span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-primary">{stock.name}</span>
          <span className="shrink-0 rounded border border-white/10 bg-white/[0.045] px-1.5 py-0.5 text-[10px] text-muted">{marketLabel}</span>
        </span>
        <span className="block truncate text-xs leading-5 text-muted">
          {decisionThesis(stock) || (milestone ? `${milestone.title} · ${milestone.diff} ${localeTag.startsWith("zh") ? "天" : milestone.diff === 1 ? "day" : "days"}` : t("watchlist.noClue"))}
        </span>
      </span>
      <span className="hidden truncate text-xs text-muted md:block">
        {themeSummary(stock) || t("watchlist.unclassified")}
      </span>
      <QuoteCell stock={stock} />
      <PriceSpaceCell stock={stock} />
      <StockResearchPeek notes={notes} />
      <span className="col-span-2 col-start-2 flex flex-wrap gap-1.5 md:hidden">
        <span className="rounded-md bg-surface-alt px-2 py-1 text-[10px] text-secondary">{classLabel}</span>
        {(themeSummary(stock) ? themeSummary(stock).split(" / ") : [t("watchlist.unclassified")]).slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-md bg-surface-alt px-2 py-1 text-[10px] text-muted">{tag}</span>
        ))}
      </span>
    </button>
  );
}

function PriceSpaceCell({ stock }: { stock: WatchStock }) {
  const { t } = useI18n();
  const distance = distanceToStrike(stock);
  const executable = stock.stage === "strike";
  const ready = executable && distance !== 999 && distance <= 2;
  const progress = distance === 999 ? 0 : Math.max(4, Math.min(100, 100 - Math.max(0, distance)));
  if (stock.stage === "radar") {
    return (
      <span className="col-start-3 row-start-2 text-right md:col-span-1 md:col-start-auto md:row-start-auto">
        <span className="block text-xs text-muted">{stock.strikePrice || stock.fairPrice ? t("watchlist.anchorSet") : t("watchlist.anchorUnset")}</span>
      </span>
    );
  }
  return (
    <span className={`col-start-3 row-start-2 rounded-md px-2 py-1.5 text-right md:col-span-1 md:col-start-auto md:row-start-auto ${ready ? "bg-ok-soft ring-ok-soft" : "text-secondary"}`}>
      <span className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted">{t("watchlist.toStrike")}</span>
        <span className={ready ? "font-semibold text-ok" : "text-secondary"}>{distance === 999 ? t("watchlist.pending") : `${distance.toFixed(1)}%`}</span>
      </span>
      <span className="block h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <span className={`block h-full rounded-full ${ready ? "bg-ok" : "bg-cyan-300/[0.55]"}`} style={{ width: `${progress}%` }} />
      </span>
    </span>
  );
}

function StockResearchPeek({ notes }: { notes: WatchNote[] }) {
  const { t } = useI18n();
  if (!notes.length) return null;
  return (
    <span className="pointer-events-none absolute right-4 top-[calc(100%-4px)] z-20 hidden w-[360px] rounded-lg border border-white/10 bg-black/55 p-3 text-left shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl group-hover:block">
      <span className="mb-2 block text-xs font-semibold text-primary">{t("watchlist.associatedResearch")}</span>
      <span className="space-y-2">
        {notes.map((note) => (
          <span key={note.id} className="block rounded-md border border-white/[0.08] bg-white/[0.045] px-3 py-2">
            <span className="block truncate text-xs font-medium text-primary">{note.title || t("watchlist.unnamedResearch")}</span>
            <span className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">{notePlainText(note) || t("watchlist.emptyResearch")}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

function QuoteCell({ stock }: { stock: WatchStock }) {
  return <MarketQuote symbol={stock.symbol} market={quoteMarket(stock)} fallbackPrice={stock.currentPrice} />;
}

function QuickDecisionDrawer({
  stock,
  notes,
  onClose,
  onSave,
  onMoveStage,
}: {
  stock: WatchStock;
  notes: WatchNote[];
  onClose: () => void;
  onSave: (patch: Partial<WatchStock>) => void;
  onMoveStage: (stage: Stage) => void;
}) {
  const { t, localeTag } = useI18n();
  const [thesis, setThesis] = useState(stock.thesis || stock.entryReason || stock.inspiration || "");
  const [invalidation, setInvalidation] = useState(stock.invalidation || "");
  const [strikePrice, setStrikePrice] = useState(stock.strikePrice ? String(stock.strikePrice) : "");
  const [fairPrice, setFairPrice] = useState(stock.fairPrice ? String(stock.fairPrice) : "");
  const [targetPrice, setTargetPrice] = useState(stock.targetPrice ? String(stock.targetPrice) : "");
  const milestone = nextMilestone(stock);
  const checks = [
    { label: t("watchlist.goodCompany"), complete: Boolean(stripRichText(stock.businessSummary || "").trim() || thesis.trim()) },
    { label: t("watchlist.goodPrice"), complete: Boolean(Number(strikePrice) || Number(fairPrice)) },
    { label: t("watchlist.catalyst"), complete: Boolean(milestone || stripRichText(stock.growthDrivers || stock.inspiration || "").trim()) },
  ];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const save = () => {
    onSave({
      thesis: thesis.trim(),
      invalidation: invalidation.trim(),
      strikePrice: Number(strikePrice) || 0,
      fairPrice: Number(fairPrice) || 0,
      targetPrice: Number(targetPrice) || 0,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[95] flex justify-end bg-black/55 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label={t("watchlist.quickDecision")} className="flex h-full w-full flex-col border-l border-themed bg-page shadow-[-24px_0_80px_rgba(0,0,0,0.38)] sm:w-[min(460px,42vw)]">
        <header className="flex items-start justify-between gap-4 border-b border-themed px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{t("watchlist.quickDecision")}</p>
            <h2 id="quick-decision-title" className="mt-1 truncate text-lg font-semibold text-primary">{stock.symbol} · {stock.name}</h2>
            <p className="mt-1 text-xs text-muted">{localizedStageTitle(stock.stage, t)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("watchlist.closeQuickDecision")} title={t("watchlist.closeQuickDecision")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg text-muted transition hover:bg-surface-hover hover:text-primary">×</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <section aria-labelledby="quick-stage-title" className="border-b border-themed pb-5">
            <h3 id="quick-stage-title" className="text-xs font-semibold text-secondary">{t("watchlist.decisionStage")}</h3>
            <div className="mt-3 grid grid-cols-3 gap-1 rounded-md bg-input p-1">
              {STAGES.map((item) => (
                <button key={item.key} type="button" onClick={() => onMoveStage(item.key)} aria-pressed={stock.stage === item.key} className={`min-h-10 rounded px-2 text-xs font-medium transition ${stock.stage === item.key ? "bg-[var(--accent-bg)] text-accent" : "text-muted hover:bg-surface hover:text-primary"}`}>
                  {localizedStageTitle(item.key, t)}
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="quick-anchor-title" className="border-b border-themed py-5">
            <div className="flex items-center justify-between gap-3">
              <h3 id="quick-anchor-title" className="text-xs font-semibold text-secondary">{t("watchlist.priceAnchors")}</h3>
            </div>
            <div className="mt-3"><MarketQuoteHeading /><QuoteCell stock={stock} /></div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className="text-[11px] text-muted">{t("stock.strikePrice")}<input inputMode="decimal" value={strikePrice} onChange={(event) => setStrikePrice(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-themed bg-input px-2.5 text-sm tabular-nums text-primary outline-none focus:border-[var(--accent)]" /></label>
              <label className="text-[11px] text-muted">{t("stock.fairPrice")}<input inputMode="decimal" value={fairPrice} onChange={(event) => setFairPrice(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-themed bg-input px-2.5 text-sm tabular-nums text-primary outline-none focus:border-[var(--accent)]" /></label>
              <label className="text-[11px] text-muted">{t("stock.targetPrice")}<input inputMode="decimal" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-themed bg-input px-2.5 text-sm tabular-nums text-primary outline-none focus:border-[var(--accent)]" /></label>
            </div>
          </section>

          <section aria-labelledby="quick-logic-title" className="border-b border-themed py-5">
            <h3 id="quick-logic-title" className="text-xs font-semibold text-secondary">{t("watchlist.logicValidation")}</h3>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {checks.map((check) => <div key={check.label} className="min-w-0 text-center"><span aria-hidden="true" className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${check.complete ? "border-ok bg-ok-soft" : "border-themed text-muted"}`}>{check.complete ? "✓" : "·"}</span><p className="mt-1.5 truncate text-[11px] text-muted" title={check.label}>{check.label}</p></div>)}
            </div>
            <label className="mt-4 block text-[11px] text-muted">{t("watchlist.coreThesis")}<textarea value={thesis} onChange={(event) => setThesis(event.target.value)} rows={3} className="mt-1.5 w-full resize-y rounded-md border border-themed bg-input px-3 py-2.5 text-sm leading-6 text-primary outline-none focus:border-[var(--accent)]" /></label>
            <label className="mt-3 block text-[11px] text-muted">{t("stock.invalidation")}<textarea value={invalidation} onChange={(event) => setInvalidation(event.target.value)} rows={2} className="mt-1.5 w-full resize-y rounded-md border border-themed bg-input px-3 py-2.5 text-sm leading-6 text-primary outline-none focus:border-[var(--accent)]" /></label>
          </section>

          <section aria-labelledby="quick-record-title" className="py-5">
            <h3 id="quick-record-title" className="text-xs font-semibold text-secondary">{t("watchlist.decisionRecord")}</h3>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
              <dt className="text-muted">{t("watchlist.created")}</dt><dd className="text-right text-secondary">{new Date(stock.createdAt).toLocaleString(localeTag)}</dd>
              <dt className="text-muted">{t("watchlist.lastDecisionUpdate")}</dt><dd className="text-right text-secondary">{new Date(stock.updatedAt).toLocaleString(localeTag)}</dd>
              {milestone && <><dt className="text-muted">{t("watchlist.nextCatalyst")}</dt><dd className="text-right text-secondary">{milestone.title}</dd></>}
            </dl>
            {notes.length > 0 && <div className="mt-4 space-y-1.5">{notes.slice(0, 3).map((note) => <Link key={note.id} href={`/research/${encodeURIComponent(note.id)}`} className="flex min-h-10 items-center justify-between gap-3 border-t border-themed py-2 text-xs text-secondary transition hover:text-accent"><span className="truncate">{note.title || t("watchlist.unnamedResearch")}</span><span aria-hidden="true">→</span></Link>)}</div>}
          </section>
        </div>

        <footer className="flex items-center gap-2 border-t border-themed bg-page/95 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Link href={`/watchlist/${encodeURIComponent(stock.id)}`} target="_blank" rel="noopener noreferrer" className="ui-button min-w-0 flex-1 justify-center">{t("watchlist.openFullResearch")}</Link>
          <button type="button" onClick={save} className="ui-button ui-button--primary min-w-0 flex-1">{t("watchlist.saveDecision")}</button>
        </footer>
      </aside>
    </div>
  );
}
function SectorView({
  stocks,
  activeLabel,
  updateStock,
  onSelect,
}: {
  stocks: WatchStock[];
  activeLabel?: string | null;
  updateStock: (id: string, patch: Partial<WatchStock>) => void;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <ThemeGroupView
      type="industry"
      title={t("watchlist.industryView")}
      description={t("watchlist.industryViewDescription")}
      stocks={stocks}
      activeLabel={activeLabel}
      updateStock={updateStock}
      onSelect={onSelect}
      getLabels={inferIndustryLabels}
    />
  );
}

function ConceptView({
  stocks,
  activeLabel,
  updateStock,
  onSelect,
}: {
  stocks: WatchStock[];
  activeLabel?: string | null;
  updateStock: (id: string, patch: Partial<WatchStock>) => void;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <ThemeGroupView
      type="concept"
      title={t("watchlist.conceptView")}
      description={t("watchlist.conceptViewDescription")}
      stocks={stocks}
      activeLabel={activeLabel}
      updateStock={updateStock}
      onSelect={onSelect}
      getLabels={inferConceptLabels}
    />
  );
}

function ThemeGroupView({
  type,
  title,
  description,
  stocks,
  activeLabel,
  updateStock,
  onSelect,
  getLabels,
}: {
  type: "industry" | "concept";
  title: string;
  description: string;
  stocks: WatchStock[];
  activeLabel?: string | null;
  updateStock: (id: string, patch: Partial<WatchStock>) => void;
  onSelect: (id: string) => void;
  getLabels: (stock: WatchStock) => string[];
}) {
  const { t } = useI18n();
  const [expandedUnclassified, setExpandedUnclassified] = useState(false);
  const [hoverStockId, setHoverStockId] = useState<string | null>(null);
  const [dragStockId, setDragStockId] = useState<string | null>(null);
  const groups = useMemo(() => {
    const map = new Map<string, WatchStock[]>();
    for (const stock of stocks) {
      const labels = getLabels(stock);
      if (labels.length === 0) {
        map.set(t("watchlist.unclassified"), [...(map.get(t("watchlist.unclassified")) || []), stock]);
      } else {
        for (const label of labels) {
          map.set(label, [...(map.get(label) || []), stock]);
        }
      }
    }
    const entries = [...map.entries()].sort((a, b) => {
      if (a[0] === t("watchlist.unclassified")) return 1;
      if (b[0] === t("watchlist.unclassified")) return -1;
      return b[1].length - a[1].length || a[0].localeCompare(b[0]);
    });
    return activeLabel ? entries.filter(([label]) => label === activeLabel) : entries;
  }, [stocks, getLabels, activeLabel, t]);
  const assignLabel = (stockId: string | null, label: string) => {
    if (!stockId || label === t("watchlist.unclassified")) return;
    const stock = stocks.find((item) => item.id === stockId);
    if (!stock) return;
    if (type === "industry") {
      const next = uniqueValues([...(stock.industries || []), label]);
      updateStock(stock.id, { industries: next, sector: next.join(";") });
    } else {
      updateStock(stock.id, { concepts: uniqueValues([...(stock.concepts || []), label]) });
    }
    setDragStockId(null);
  };
  const removeLabel = (stock: WatchStock, label: string) => {
    if (label === t("watchlist.unclassified")) return;
    if (type === "industry") {
      const next = (stock.industries || []).filter((item) => item !== label);
      updateStock(stock.id, { industries: next, sector: next.join(";") });
    } else {
      updateStock(stock.id, { concepts: (stock.concepts || []).filter((item) => item !== label) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-themed bg-surface px-4 py-3">
        <h1 className="text-lg font-semibold text-primary">{title}</h1>
        <p className="mt-1 text-xs text-muted">{activeLabel ? t("watchlist.currentIndex", { value: activeLabel }) : description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map(([label, items]) => (
        <section
          key={label}
          onDragOver={(event) => {
            if (label !== t("watchlist.unclassified")) event.preventDefault();
          }}
          onDrop={() => assignLabel(dragStockId, label)}
          className={`rounded-lg border p-4 transition-all duration-300 ${
            dragStockId && label !== t("watchlist.unclassified")
              ? "border-[var(--accent)] bg-[var(--accent-bg)]"
              : label === t("watchlist.unclassified") ? "border-themed bg-surface/40" : "border-themed bg-surface/70"
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-primary">{label}</h2>
              {label === t("watchlist.unclassified") && (
                <p className="mt-1 text-[11px] text-muted">{t("watchlist.unclassifiedHint")}</p>
              )}
            </div>
            <span className="rounded-md bg-input px-2 py-1 text-xs text-muted">{t("watchlist.itemsCount", { count: items.length })}</span>
          </div>
          <div className="space-y-3">
            {(label === t("watchlist.unclassified") && !expandedUnclassified && !activeLabel ? items.slice(0, 5) : items).map((stock) => (
              <StockCard
                key={`${label}-${stock.id}`}
                stock={stock}
                compact
                draggableCard={label === t("watchlist.unclassified")}
                highlighted={hoverStockId === stock.id}
                removeLabel={label !== t("watchlist.unclassified") ? label : undefined}
                removeLabelType={type}
                onRemoveLabel={() => removeLabel(stock, label)}
                onHover={(id) => setHoverStockId(id)}
                onDragStart={() => setDragStockId(stock.id)}
                onDragEnd={() => setDragStockId(null)}
                onSelect={() => onSelect(stock.id)}
              />
            ))}
            {label === t("watchlist.unclassified") && !activeLabel && items.length > 5 && (
              <button
                onClick={() => setExpandedUnclassified((prev) => !prev)}
                className="w-full rounded-lg border border-dashed border-themed px-3 py-3 text-sm text-secondary transition hover:border-[var(--border-hover)] hover:text-primary"
              >
                {expandedUnclassified ? t("watchlist.collapse") : t("watchlist.expandMore", { count: items.length - 5 })}
              </button>
            )}
          </div>
        </section>
      ))}
      </div>
    </div>
  );
}

function PriceView({ stocks, onSelect }: { stocks: WatchStock[]; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const sorted = [...stocks].sort((a, b) => distanceToStrike(a) - distanceToStrike(b));
  return (
    <div className="overflow-hidden rounded-lg border border-themed bg-surface animate-[fadeIn_220ms_ease-out]">
      <div className="hidden grid-cols-[minmax(100px,1fr)_minmax(260px,1.5fr)_80px_100px_100px] gap-3 border-b border-themed px-4 py-3 text-xs text-muted lg:grid">
        <span>{t("watchlist.symbol")}</span>
        <MarketQuoteHeading />
        <span>{t("watchlist.stage")}</span>
        <span>{t("watchlist.distance")}</span>
        <span>{t("watchlist.safety")}</span>
      </div>
      {sorted.map((stock) => {
        const distance = distanceToStrike(stock);
        return (
          <button
            key={stock.id}
            onClick={() => onSelect(stock.id)}
            className="grid w-full gap-3 border-b border-themed px-4 py-4 text-left transition-all duration-300 last:border-b-0 hover:bg-surface-hover lg:grid-cols-[minmax(100px,1fr)_minmax(260px,1.5fr)_80px_100px_100px] lg:items-center lg:py-3"
          >
            <span>
              <span className="block text-sm font-semibold text-primary">{stock.symbol}</span>
              <span className="block text-xs text-muted">{stock.name} · {localizedAssetClassLabel(stock, t)}</span>
            </span>
            <QuoteCell stock={stock} />
            <span className="text-sm text-secondary"><span className="md:hidden text-xs text-muted">{t("watchlist.stage")} </span>{localizedStageTitle(stock.stage, t)}</span>
            <span className={distance <= 2 ? "text-sm font-semibold text-accent" : "text-sm text-secondary"}>
              <span className="md:hidden text-xs text-muted">{t("watchlist.distance")} </span>
              {distance === 999 ? t("watchlist.noPrice") : `${distance.toFixed(1)}%`}
            </span>
            <SafetyBar stock={stock} />
          </button>
        );
      })}
    </div>
  );
}

function StockCard({
  stock,
  dragging,
  compact,
  draggableCard,
  highlighted,
  removeLabel,
  removeLabelType,
  onDragStart,
  onDragEnd,
  onHover,
  onRemoveLabel,
  onSelect,
}: {
  stock: WatchStock;
  dragging?: boolean;
  compact?: boolean;
  draggableCard?: boolean;
  highlighted?: boolean;
  removeLabel?: string;
  removeLabelType?: "industry" | "concept";
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onHover?: (id: string | null) => void;
  onRemoveLabel?: () => void;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const staleDays = daysSince(stock.updatedAt);
  const distance = distanceToStrike(stock);
  const milestone = nextMilestone(stock);
  const inStrike = distance <= 2 || stock.stage === "strike";

  return (
    <article
      draggable={!!onDragStart || draggableCard}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => onHover?.(stock.id)}
      onMouseLeave={() => onHover?.(null)}
      onClick={onSelect}
      className={`cursor-pointer rounded-lg border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--border-hover)] ${
        inStrike ? "border-[var(--accent)]/45 bg-[var(--accent-bg)]" : "border-themed bg-surface"
      } ${highlighted ? "border-[var(--accent)] shadow-[0_0_28px_var(--accent-bg-hover)]" : ""} ${dragging ? "opacity-30" : ""}`}
    >
      <div className="grid min-w-0 gap-3">
        <div className="min-w-0">
          <h3 className="break-all font-mono text-lg font-bold leading-6 text-primary" title={stock.symbol}>{stock.symbol}</h3>
          <p className="mt-1 truncate text-xs text-muted" title={stock.name}>{stock.name}</p>
        </div>
        <div className="min-w-24 text-right">
          <QuoteCell stock={stock} />
          <p className={distance <= 2 ? "text-[10px] text-accent" : "text-[10px] text-muted"}>
            {distance === 999 ? t("watchlist.noPrice") : `${distance.toFixed(1)}% ${t("watchlist.toStrike")}`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(themeSummary(stock) ? themeSummary(stock).split(" / ") : [t("watchlist.unclassified")]).slice(0, compact ? 4 : 6).map((tag) => (
          <span key={tag} className="rounded-md bg-surface-alt px-2 py-1 text-[10px] leading-none text-muted">
            {tag}
          </span>
        ))}
      </div>
      {removeLabel && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemoveLabel?.();
          }}
          title={t("watchlist.removeFrom", { type: removeLabel || "" })}
          className="mt-3 rounded-md border border-themed px-2 py-1 text-xs text-muted transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
        >
          {t("watchlist.removeFrom", { type: removeLabelType === "industry" ? t("watchlist.industry") : t("watchlist.concept") })}
        </button>
      )}
      {!compact && (
        <>
          <p className="mt-3 line-clamp-2 text-sm leading-6 text-secondary">{stripRichText(stock.inspiration || stock.thesis) || t("watchlist.noClue")}</p>
          <div className="mt-4">
            <SafetyBar stock={stock} />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted">
            <span>{staleDays > 30 ? t("watchlist.sleeping", { days: staleDays }) : milestone ? `${milestone.title} · ${milestone.diff} ${milestone.diff === 1 ? "day" : "days"}` : t("watchlist.noMilestone")}</span>
            <span>{stripRichText(stock.thesis) && stripRichText(stock.invalidation) ? t("watchlist.completeThree") : t("watchlist.pendingThree")}</span>
          </div>
        </>
      )}
    </article>
  );
}

function SafetyBar({ stock }: { stock: WatchStock }) {
  const { t } = useI18n();
  const pos = safetyPosition(stock);
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-gradient-to-r from-[var(--ok)] via-[var(--accent-light)] to-[var(--up)]">
        <div className="h-full w-0 border-r-2 border-white/90" style={{ marginLeft: `${pos}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{t("stock.strike")}</span>
        <span>{t("stock.fair")}</span>
        <span>{t("stock.target")}</span>
      </div>
    </div>
  );
}

function ClassificationPreviewModal({
  preview,
  selections,
  setSelections,
  error,
  applying,
  onClose,
  onApply,
}: {
  preview: WatchlistClassificationPreview;
  selections: WatchlistClassificationSelection[];
  setSelections: (groups: WatchlistClassificationSelection[]) => void;
  error: string;
  applying: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  const { t } = useI18n();
  const previewByKey = new Map(preview.groups.map((group) => [group.key, group]));
  const selectedGroups = selections.filter((group) => group.selected && group.label.trim());
  const selectableMatches = selectedGroups.reduce((total, selection) => total + (previewByKey.get(selection.key)?.matched_count || 0), 0);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !applying) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [applying, onClose]);

  const updateSelection = (key: string, patch: Partial<WatchlistClassificationSelection>) => {
    setSelections(selections.map((group) => group.key === key ? { ...group, ...patch } : group));
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="classification-preview-title" className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-lg border border-themed bg-page shadow-2xl sm:max-h-[88vh] sm:rounded-lg" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-themed bg-nav/80 px-4 py-4 sm:px-5">
          <div>
            <p className="page-eyebrow">{t("watchlist.classificationEyebrow")}</p>
            <h2 id="classification-preview-title" className="mt-1 text-lg font-semibold text-primary">{t("watchlist.classificationTitle")}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={applying} className="icon-button shrink-0 disabled:opacity-40" aria-label={t("watchlist.classificationClose")} title={t("watchlist.classificationClose")}>×</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-themed bg-[var(--border)] sm:grid-cols-4">
            {[
              [t("watchlist.classificationFiles"), preview.file_count],
              [t("watchlist.classificationGroups"), preview.group_count],
              [t("watchlist.classificationMatched"), preview.matched_stock_count],
              [t("watchlist.classificationUnmatched"), preview.unmatched_count],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-surface px-3 py-3"><span className="block text-[11px] text-muted">{label}</span><strong className="mt-1 block text-lg font-semibold text-primary">{value}</strong></div>
            ))}
          </div>

          <p className="mt-4 rounded-md border border-themed bg-surface/60 px-3 py-2 text-xs leading-5 text-secondary">{t("watchlist.classificationBoundary")}</p>

          <div className="mt-4 space-y-2">
            {preview.groups.map((group) => {
              const selection = selections.find((item) => item.key === group.key) || { key: group.key, label: group.suggested_name, selected: false };
              return (
                <div key={group.key} className={`rounded-md border px-3 py-3 transition ${selection.selected ? "border-[var(--accent)]/30 bg-[var(--accent-bg)]" : "border-themed bg-surface/45 opacity-65"}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selection.selected} disabled={group.matched_count === 0} onChange={(event) => updateSelection(group.key, { selected: event.target.checked })} className="mt-2 h-4 w-4 shrink-0 accent-[var(--accent)]" aria-label={t("watchlist.classificationSelectGroup", { name: selection.label })} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input value={selection.label} onChange={(event) => updateSelection(group.key, { label: event.target.value })} disabled={!selection.selected} maxLength={64} className="field-input min-w-0 flex-1 py-2 text-sm font-medium" aria-label={t("watchlist.classificationGroupName", { file: group.source_filename })} />
                        <span className="shrink-0 text-xs text-muted">{t("watchlist.classificationGroupStats", { matched: group.matched_count, total: group.row_count, unmatched: group.unmatched_count })}</span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted" title={group.source_filename}>{group.source_filename}</p>
                      {group.sample_symbols.length > 0 && <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-secondary">{group.sample_symbols.join(" · ")}</p>}
                      {group.already_assigned_count > 0 && <p className="mt-1 text-[11px] text-muted">{t("watchlist.classificationAlreadyAssigned", { count: group.already_assigned_count })}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {preview.unmatched_symbols.length > 0 && (
            <details className="mt-4 rounded-md border border-themed bg-surface/45 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-secondary">{t("watchlist.classificationUnmatchedDetails", { count: preview.unmatched_count })}</summary>
              <p className="mt-2 break-words text-[11px] leading-5 text-muted">{preview.unmatched_symbols.join(" · ")}</p>
            </details>
          )}
          {error && <div className="inline-notice inline-notice--warning mt-4">{error}</div>}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-themed bg-nav/70 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-muted">{t("watchlist.classificationSelectedSummary", { groups: selectedGroups.length, matches: selectableMatches })}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={applying} className="ui-button flex-1 disabled:opacity-40 sm:flex-none">{t("watchlist.cancel")}</button>
            <button type="button" onClick={onApply} disabled={applying || selectedGroups.length === 0 || selectableMatches === 0} className="ui-button ui-button--primary flex-1 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none">{applying ? t("watchlist.classificationApplying") : t("watchlist.classificationApply")}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function QuickCapture({
  message,
  setMessage,
  onClose,
  onSubmit,
  onFilter,
}: {
  message: string;
  setMessage: (v: string) => void;
  onClose: () => void;
  onSubmit: (result: SymbolSearchItem, inspiration: string) => void;
  onFilter: (query: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [inspiration, setInspiration] = useState("");
  const [results, setResults] = useState<SymbolSearchItem[]>([]);
  const [selected, setSelected] = useState<SymbolSearchItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const command = parseWatchlistCommand(query);

  const search = useCallback(async (searchQuery: string) => {
    const q = searchQuery.trim();
    if (!q) {
      setError(t("stock.searchSymbols"));
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    setSelected(null);
    setSearched(true);
    try {
      const res = await api.searchSymbols(q);
      setResults(res.items);
      setSelected(res.items.length === 1 ? res.items[0] : null);
    } catch (searchError) {
      setResults([]);
      setError(searchError instanceof Error ? searchError.message : t("watchlist.refreshFailed"));
    } finally {
      setLoading(false);
    }
  }, [setMessage, t]);

  useEffect(() => {
    const q = command.value;
    if (!q || command.type === "filter") {
      const timer = window.setTimeout(() => {
        setResults([]);
        setSelected(null);
        setSearched(false);
        setError("");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      void search(q);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [command.type, command.value, search]);

  const create = () => {
    if (!selected) return;
    onSubmit(selected, inspiration.trim());
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/80 px-2 pt-8 backdrop-blur-sm sm:px-3 sm:pt-[14vh]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("watchlist.commandPalette")} className="w-full max-w-3xl overflow-hidden rounded-xl border border-[var(--accent)]/25 bg-page shadow-[0_30px_120px_rgba(0,0,0,0.55)]" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-themed bg-nav/80 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{t("watchlist.commandPalette")}</p>
            <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-muted transition hover:bg-surface-hover hover:text-primary">{t("stock.esc")}</button>
          </div>
        </div>
        <div className="p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <input
            autoFocus
            value={query}
            aria-label={t("watchlist.commandInput")}
            onChange={(e) => {
              const nextQuery = e.target.value;
              setQuery(nextQuery);
              setSelected(null);
              setMessage("");
              if (!nextQuery.trim()) {
                setResults([]);
                setSearched(false);
                setError("");
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (command.type === "filter" && command.value) {
                  e.preventDefault();
                  onFilter(command.value);
                  return;
                }
                if (selected) create();
                else if (results.length > 0) setSelected(results[0]);
                else void search(command.value);
              }
              if (e.key === "Escape") onClose();
            }}
            placeholder={t("watchlist.commandPlaceholder")}
            className="w-full rounded-xl border border-themed bg-input px-4 py-3 text-base text-primary outline-none placeholder:text-muted focus:border-[var(--accent)] sm:px-5 sm:py-4 sm:text-lg"
          />
          <div className="flex items-center justify-center rounded-xl border border-themed bg-surface px-3 py-3 text-sm text-muted">
            {command.type === "filter" ? t("watchlist.filterCommand") : loading ? t("stock.searching") : searched ? t("stock.resultCount", { count: results.length }) : t("stock.liveSearch")}
          </div>
        </div>
        {command.type === "add" && <textarea
          value={inspiration}
          onChange={(e) => setInspiration(e.target.value)}
          rows={2}
          placeholder={t("stock.inspirationPlaceholder")}
          className="mt-3 w-full rounded-xl border border-themed bg-input px-4 py-3 text-sm leading-6 text-primary outline-none focus:border-[var(--accent)]"
        />}
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        {message && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {message}
          </p>
        )}
        {command.type === "add" && command.value && searched && !loading && results.length === 0 && !error && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {t("stock.noSearchResult")}
          </p>
        )}
        {command.type === "add" && results.length > 0 && (
          <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-themed bg-surface/60 p-2">
            {results.map((item) => (
              <button
                key={`${item.symbol}-${item.exchange}-${item.market}`}
                onClick={() => {
                  setSelected(item);
                  setMessage("");
                }}
                className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                  selected?.symbol === item.symbol
                    ? "border-[var(--accent)] bg-[var(--accent-bg-hover)] shadow-[0_0_0_1px_var(--accent),0_0_22px_var(--accent-bg-hover)]"
                    : "border-transparent bg-transparent opacity-80 hover:border-[var(--border-hover)] hover:bg-surface-hover hover:opacity-100"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                      selected?.symbol === item.symbol ? "border-[var(--accent)] bg-accent text-on-accent" : "border-themed text-muted"
                    }`}>
                      {selected?.symbol === item.symbol ? "✓" : ""}
                    </span>
                    <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary">{item.symbol}</p>
                    <p className="mt-0.5 text-xs text-muted">{item.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block text-xs font-medium text-secondary">{localizedMarketLabel(item.market, t)}</span>
                    <span className="mt-0.5 block text-[10px] text-muted">{item.exchange || item.type}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted">{command.type === "filter" ? t("watchlist.filterCommandHint") : t("stock.captureHint")}</p>
          <button
            onClick={() => command.type === "filter" ? onFilter(command.value) : create()}
            disabled={command.type === "filter" ? !command.value : !selected}
            className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-bg)] px-4 py-2 text-sm font-semibold text-accent transition hover:bg-[var(--accent-bg-hover)] disabled:cursor-not-allowed disabled:border-themed disabled:bg-surface disabled:text-muted"
          >
            {command.type === "filter" ? t("watchlist.applyFilter") : t("stock.addToRadar")}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
