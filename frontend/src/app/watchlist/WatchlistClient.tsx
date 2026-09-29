"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import MarketQuote, { loadMarketQuote, MarketQuoteHeading, MarketQuoteUpdates, type IntradayQuote } from "@/components/MarketQuote";
import MarkdownEditor from "@/components/MarkdownEditor";
import MarkdownPreview from "@/components/MarkdownPreview";
import { stripRichText } from "@/components/RichTextField";
import { storedTextToMarkdown } from "@/lib/markdown";
import { semanticColor } from "@/lib/semanticColor";
import { api } from "@/lib/api";
import type {
  ResearchNote,
  ResearchWrite,
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

interface StockMemo {
  id: string;
  stockId: string;
  content: string;
  pinned?: boolean;
  convertedNoteId?: string;
  createdAt: string;
  updatedAt: string;
}

interface ArchiveEntry {
  id: string;
  stock: WatchStock;
  reason: ArchiveReason;
  note: string;
  archivedAt: string;
}

interface DailyBar {
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type KRange = "1mo" | "3mo" | "6mo" | "1y";

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

function fmtMoney(n: number, locale = "en-US") {
  return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtDay(ts: number, locale = "en-US") {
  return new Date(ts * 1000).toLocaleDateString(locale, { month: "numeric", day: "numeric" });
}

function fmtMonthTick(ts: number, locale = "en-US") {
  return new Date(ts * 1000).toLocaleDateString(locale, { month: "numeric", day: "numeric" });
}

function movingAverage(values: number[], period: number) {
  const result: Array<number | null> = [];
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) {
      result.push(sum / period);
    } else {
      result.push(null);
    }
  }
  return result;
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

function uniqueLabels(stocks: WatchStock[], type: "industry" | "concept") {
  const set = new Set<string>();
  for (const stock of stocks) {
    const labels = type === "industry" ? inferIndustryLabels(stock) : inferConceptLabels(stock);
    for (const label of labels) set.add(label);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
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

function noteToApi(note: Partial<WatchNote>, stocks: WatchStock[]): ResearchWrite {
  const body: ResearchWrite = { visibility: "private" };
  if (note.title !== undefined) body.title = note.title;
  if (note.content !== undefined) body.content = note.content;
  if (note.format !== undefined) body.format = note.format;
  if (note.knowledgeTags !== undefined) body.knowledge_tags = note.knowledgeTags;
  if (note.stockIds !== undefined) body.stock_symbols = note.stockIds.map((id) => stocks.find((stock) => stock.id === id)?.symbol).filter((symbol): symbol is string => Boolean(symbol));
  if (note.stockIds !== undefined) body.links = [
    ...(note.links || []).filter((link) => link.entityType !== "watch_stock").map((link) => ({ entity_type: link.entityType, entity_id: link.entityId })),
    ...note.stockIds.map(Number).filter(Number.isFinite).map((entityId) => ({ entity_type: "watch_stock" as const, entity_id: entityId })),
  ];
  return body;
}

function apiMemoToStockMemo(raw: Record<string, unknown>): StockMemo {
  return {
    id: String(raw.id),
    stockId: String(raw.stock_id),
    content: String(raw.content || ""),
    pinned: Boolean(raw.pinned),
    convertedNoteId: raw.converted_note_id == null ? undefined : String(raw.converted_note_id),
    createdAt: String(raw.created_at || new Date().toISOString()),
    updatedAt: String(raw.updated_at || new Date().toISOString()),
  };
}

export default function WatchlistPage() {
  return <AuthGuard><WatchlistContent /></AuthGuard>;
}

function WatchlistContent({ detailStockId }: { detailStockId?: string }) {
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
  const [archives, setArchives] = useState<ArchiveEntry[]>(loadStoredArchives);
  const [notes, setNotes] = useState<WatchNote[]>([]);
  const [memos, setMemos] = useState<StockMemo[]>([]);
  const [view, setView] = useState<ViewMode>("funnel");
  const [marketScope, setMarketScope] = useState<MarketScope>("all");
  const [selectedId, setSelectedId] = useState<string | null>(detailStockId || null);
  const [decisionStockId, setDecisionStockId] = useState<string | null>(null);
  const [funnelCommandQuery, setFunnelCommandQuery] = useState<{ value: string; nonce: number } | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [archiveStock, setArchiveStock] = useState<WatchStock | null>(null);
  const [archiveReason, setArchiveReason] = useState<ArchiveReason>("buy");
  const [archiveNote, setArchiveNote] = useState("");
  const [deleteStock, setDeleteStock] = useState<WatchStock | null>(null);
  const [importMsg, setImportMsg] = useState("");
  const [quickMsg, setQuickMsg] = useState("");
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [classificationLoading, setClassificationLoading] = useState(false);
  const [classificationApplying, setClassificationApplying] = useState(false);
  const [classificationPreview, setClassificationPreview] = useState<WatchlistClassificationPreview | null>(null);
  const [classificationSelections, setClassificationSelections] = useState<WatchlistClassificationSelection[]>([]);
  const [classificationError, setClassificationError] = useState("");
  const [backendMsg, setBackendMsg] = useState("");
  const [backendLoaded, setBackendLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadBackend = async () => {
      try {
        setBackendMsg("");
        const backendStocks = (await api.listWatchStocks()).map(apiStockToWatchStock);
        const [noteRows, memoRows] = await Promise.all([api.listNotes(), api.listStockMemos()]);
        if (cancelled) return;
        setStocks(backendStocks);
        setNotes(noteRows.map((row) => apiNoteToWatchNote(row, backendStocks)));
        setMemos(memoRows.map(apiMemoToStockMemo));
      } catch (error) {
        if (!cancelled) setBackendMsg(error instanceof Error ? error.message : t("watchlist.backendFallback"));
      } finally {
        if (!cancelled) setBackendLoaded(true);
      }
    };
    void loadBackend();
    return () => { cancelled = true; };
  }, [t]);

  useEffect(() => {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archives));
  }, [archives]);

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
    const addTimer = searchParams.get("add") === "1" && !detailStockId
      ? window.setTimeout(() => {
        setQuickOpen(true);
        router.replace("/watchlist", { scroll: false });
      }, 0)
      : null;
    const viewTimer = deepView && ["funnel", "sector", "concept", "price"].includes(deepView)
      ? window.setTimeout(() => setView(deepView), 0)
      : null;
    if (symbol && !detailStockId) {
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
  }, [detailStockId, router, searchParams, stocks]);

  const visibleStocks = stocks.filter((stock) => matchesMarketScope(stock, marketScope));
  const selected = stocks.find((s) => s.id === (detailStockId || selectedId)) || null;
  const decisionStock = stocks.find((stock) => stock.id === decisionStockId) || null;
  const sourceNoteId = searchParams.get("fromNote");
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

  const addNote = async (stockId: string) => {
    const now = new Date().toISOString();
    const note = normalizeNoteLinks({
      id: uid(),
        stockId,
        stockIds: [stockId],
        knowledgeTags: [],
        title: t("watchlist.researchCreated"),
        format: "markdown",
        visibility: "private",
        content: "",
        createdAt: now,
        updatedAt: now,
    }, stocks);
    setNotes((prev) => [note, ...prev]);
    try {
      const created = apiNoteToWatchNote(await api.createNote(noteToApi(note, stocks)), stocks);
      setNotes((prev) => prev.map((item) => item.id === note.id ? created : item));
      return created.id;
    } catch (error) {
      setBackendMsg(error instanceof Error ? error.message : t("watchlist.researchCreateFailed"));
      return note.id;
    }
  };

  const updateNote = (id: string, patch: Partial<WatchNote>) => {
    let nextNote: WatchNote | null = null;
    setNotes((prev) => prev.map((note) => {
      if (note.id !== id) return note;
      nextNote = normalizeNoteLinks({ ...note, ...patch, updatedAt: new Date().toISOString() }, stocks);
      return nextNote;
    }));
    setTimeout(() => {
      if (!nextNote) return;
      api.updateNote(id, noteToApi(nextNote, stocks)).catch((error) => {
        setBackendMsg(error instanceof Error ? error.message : t("watchlist.researchSaveFailed"));
      });
    }, 0);
  };

  const deleteNote = (id: string) => {
    setNotes((prev) => prev.filter((note) => note.id !== id));
    void api.deleteNote(id).catch((error) => {
      setBackendMsg(error instanceof Error ? error.message : t("watchlist.researchDeleteFailed"));
    });
  };

  const addMemo = (stockId: string, content: string) => {
    const text = content.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const memo: StockMemo = { id: uid(), stockId, content: text, pinned: false, createdAt: now, updatedAt: now };
    setMemos((prev) => [memo, ...prev]);
    void api.createStockMemo({ stock_id: Number(stockId), content: text, pinned: false }).then((raw) => {
      const created = apiMemoToStockMemo(raw);
      setMemos((prev) => prev.map((item) => item.id === memo.id ? created : item));
    }).catch((error) => {
      setBackendMsg(error instanceof Error ? error.message : t("watchlist.memoCreateFailed"));
    });
  };

  const updateMemo = (id: string, patch: Partial<StockMemo>) => {
    setMemos((prev) => prev.map((memo) => (
      memo.id === id ? { ...memo, ...patch, updatedAt: new Date().toISOString() } : memo
    )));
    void api.updateStockMemo(id, {
      content: patch.content,
      pinned: patch.pinned,
      converted_note_id: patch.convertedNoteId == null ? undefined : Number(patch.convertedNoteId),
    }).catch((error) => {
      setBackendMsg(error instanceof Error ? error.message : t("watchlist.memoSaveFailed"));
    });
  };

  const deleteMemo = (id: string) => {
    setMemos((prev) => prev.filter((memo) => memo.id !== id));
    void api.deleteStockMemo(id).catch((error) => {
      setBackendMsg(error instanceof Error ? error.message : t("watchlist.memoDeleteFailed"));
    });
  };

  const convertMemoToNote = async (memo: StockMemo) => {
    try {
      const created = apiNoteToWatchNote(await api.convertStockMemoToNote(memo.id), stocks);
      setNotes((prev) => prev.some((note) => note.id === created.id) ? prev : [created, ...prev]);
      setMemos((prev) => prev.map((item) => item.id === memo.id ? { ...item, convertedNoteId: created.id } : item));
    } catch (error) {
      setBackendMsg(error instanceof Error ? error.message : t("watchlist.memoUpgradeFailed"));
    }
  };

  const onDropStage = (stage: Stage) => {
    if (!dragId) return;
    updateStock(dragId, { stage });
    setDragId(null);
  };

  const confirmArchive = () => {
    if (!archiveStock) return;
    setArchives((prev) => [
      {
        id: uid(),
        stock: archiveStock,
        reason: archiveReason,
        note: archiveNote,
        archivedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setStocks((prev) => prev.filter((s) => s.id !== archiveStock.id));
    setNotes((prev) => prev.map((note) => ({
      ...note,
      stockId: note.stockId === archiveStock.id ? undefined : note.stockId,
      stockIds: (note.stockIds || []).filter((id) => id !== archiveStock.id),
    })));
    setMemos((prev) => prev.filter((memo) => memo.stockId !== archiveStock.id));
    setSelectedId(null);
    setArchiveStock(null);
    setArchiveNote("");
    if (detailStockId) router.push("/watchlist");
    void api.deleteWatchStock(archiveStock.id).catch((error) => {
      setBackendMsg(error instanceof Error ? error.message : t("watchlist.archiveSyncFailed"));
    });
  };

  const confirmDelete = () => {
    if (!deleteStock) return;
    setStocks((prev) => prev.filter((s) => s.id !== deleteStock.id));
    setNotes((prev) => prev.map((note) => ({
      ...note,
      stockId: note.stockId === deleteStock.id ? undefined : note.stockId,
      stockIds: (note.stockIds || []).filter((id) => id !== deleteStock.id),
    })));
    setMemos((prev) => prev.filter((memo) => memo.stockId !== deleteStock.id));
    setSelectedId(null);
    setDeleteStock(null);
    if (detailStockId) router.push("/watchlist");
    void api.deleteWatchStock(deleteStock.id).catch((error) => {
      setBackendMsg(error instanceof Error ? error.message : t("watchlist.deleteSyncFailed"));
    });
  };

  const deleteStocks = (ids: string[]) => {
    if (!ids.length) return;
    setStocks((prev) => prev.filter((stock) => !ids.includes(stock.id)));
    setNotes((prev) => prev.map((note) => ({
      ...note,
      stockId: note.stockId && ids.includes(note.stockId) ? undefined : note.stockId,
      stockIds: (note.stockIds || []).filter((id) => !ids.includes(id)),
    })));
    setMemos((prev) => prev.filter((memo) => !ids.includes(memo.stockId)));
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

  if (detailStockId) {
    return (
      <div className="page-shell page-shell--wide min-h-[calc(100vh-112px)]">
        {backendMsg && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            {backendMsg}
          </div>
        )}
        {selected ? (
          <SoulModal
            stock={selected}
            stocks={stocks}
            notes={notes.filter((note) => noteLinksStock(note, selected))}
            memos={memos.filter((memo) => memo.stockId === selected.id)}
            updateStock={updateStock}
            addNote={addNote}
            updateNote={updateNote}
            deleteNote={deleteNote}
            addMemo={addMemo}
            updateMemo={updateMemo}
            deleteMemo={deleteMemo}
            convertMemoToNote={convertMemoToNote}
            onClose={() => router.push("/watchlist")}
            sourceNoteId={sourceNoteId || undefined}
            onArchive={(stock) => setArchiveStock(stock)}
            onDelete={(stock) => setDeleteStock(stock)}
            pageMode
          />
        ) : backendLoaded ? (
          <div className="rounded-lg border border-themed bg-surface px-6 py-16 text-center">
            <h1 className="text-lg font-semibold text-primary">{t("watchlist.noStock")}</h1>
            <p className="mt-2 text-sm text-muted">{t("watchlist.noStockDescription")}</p>
            <Link href="/watchlist" className="mt-5 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
              {t("watchlist.back")}
            </Link>
          </div>
        ) : (
          <div className="py-20 text-center text-sm text-muted animate-pulse">{t("watchlist.loadingDetail")}</div>
        )}

        {archiveStock && (
          <ArchiveModal
            stock={archiveStock}
            reason={archiveReason}
            setReason={setArchiveReason}
            note={archiveNote}
            setNote={setArchiveNote}
            onClose={() => setArchiveStock(null)}
            onConfirm={confirmArchive}
          />
        )}

        {deleteStock && (
          <DeleteModal
            stock={deleteStock}
            onClose={() => setDeleteStock(null)}
            onConfirm={confirmDelete}
          />
        )}
      </div>
    );
  }

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

      {archiveStock && (
        <ArchiveModal
          stock={archiveStock}
          reason={archiveReason}
          setReason={setArchiveReason}
          note={archiveNote}
          setNote={setArchiveNote}
          onClose={() => setArchiveStock(null)}
          onConfirm={confirmArchive}
        />
      )}

      {deleteStock && (
        <DeleteModal
          stock={deleteStock}
          onClose={() => setDeleteStock(null)}
          onConfirm={confirmDelete}
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

function SoulModal({
  stock,
  stocks,
  notes,
  memos,
  updateStock,
  addNote,
  updateNote,
  deleteNote,
  addMemo,
  updateMemo,
  deleteMemo,
  convertMemoToNote,
  onClose,
  sourceNoteId,
  onArchive,
  onDelete,
  pageMode = false,
}: {
  stock: WatchStock;
  stocks: WatchStock[];
  notes: WatchNote[];
  memos: StockMemo[];
  updateStock: (id: string, patch: Partial<WatchStock>) => void;
  addNote: (stockId: string) => Promise<string>;
  updateNote: (id: string, patch: Partial<WatchNote>) => void;
  deleteNote: (id: string) => void;
  addMemo: (stockId: string, content: string) => void;
  updateMemo: (id: string, patch: Partial<StockMemo>) => void;
  deleteMemo: (id: string) => void;
  convertMemoToNote: (memo: StockMemo, stock: WatchStock) => void | Promise<void>;
  onClose: () => void;
  sourceNoteId?: string;
  onArchive: (stock: WatchStock) => void;
  onDelete: (stock: WatchStock) => void;
  pageMode?: boolean;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => ({
    ...stock,
    entryReason: storedTextToMarkdown(stock.entryReason || ""),
    businessSummary: storedTextToMarkdown(stock.businessSummary || ""),
    growthDrivers: storedTextToMarkdown(stock.growthDrivers || ""),
    fundamentalRisks: storedTextToMarkdown(stock.fundamentalRisks || ""),
    thesis: storedTextToMarkdown(stock.thesis || ""),
    invalidation: storedTextToMarkdown(stock.invalidation || ""),
  }));
  const [kRange, setKRange] = useState<KRange>("6mo");
  const [kBars, setKBars] = useState<DailyBar[]>([]);
  const [kLoading, setKLoading] = useState(false);
  const [kError, setKError] = useState("");
  const [savedHint, setSavedHint] = useState("");
  const industrySuggestions = useMemo(() => uniqueLabels(stocks, "industry"), [stocks]);
  const conceptSuggestions = useMemo(() => uniqueLabels(stocks, "concept"), [stocks]);
  const kMarket = quoteMarket(draft);

  useEffect(() => {
    let cancelled = false;
    const loadBars = async () => {
      setKLoading(true);
      setKError("");
      try {
        const res = await api.getDailyBars(draft.symbol, kMarket, kRange);
        if (!cancelled) setKBars(Array.isArray(res.items) ? res.items : []);
      } catch (error) {
        if (!cancelled) {
          setKBars([]);
          setKError(error instanceof Error ? error.message : t("stock.klineError"));
        }
      } finally {
        if (!cancelled) setKLoading(false);
      }
    };
    void loadBars();
    return () => { cancelled = true; };
  }, [draft.symbol, kMarket, kRange, t]);

  const persistDraft = () => {
    updateStock(stock.id, { ...draft, symbol: formatSymbol(draft.symbol) || draft.symbol });
    setSavedHint(t("stock.saved"));
    window.setTimeout(() => setSavedHint(""), 1800);
  };

  const save = () => {
    persistDraft();
    if (!pageMode) onClose();
  };

  const setMilestone = (id: string, patch: Partial<Milestone>) => {
    setDraft((prev) => ({
      ...prev,
      milestones: prev.milestones.map((m) => m.id === id ? { ...m, ...patch } : m),
    }));
  };

  return (
    <div
      className={pageMode ? "w-full" : "fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:px-3 sm:py-6"}
      onClick={pageMode ? undefined : onClose}
    >
      <div
        className={pageMode ? "w-full" : "max-h-[96vh] w-full max-w-[min(1500px,96vw)] overflow-y-auto rounded-t-xl border border-themed bg-page shadow-2xl sm:max-h-[94vh] sm:rounded-lg"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${pageMode ? "page-header" : "sticky top-0 z-10 border-b border-themed bg-nav px-4 py-4 backdrop-blur sm:px-5"} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
          <div>
            {pageMode && (
              <Link href="/watchlist" className="mb-3 inline-flex min-h-8 items-center gap-1 text-xs text-muted transition hover:text-accent">
                <span aria-hidden="true">←</span> {t("watchlist.back")}
              </Link>
            )}
            <h1 className={pageMode ? "page-title" : "text-xl font-bold text-primary"}>{draft.symbol} · {draft.name}</h1>
            <p className="mt-1.5 text-xs text-muted">
              {localizedStageTitle(draft.stage, t)}
              {[...inferIndustryLabels(draft), ...inferConceptLabels(draft)].length > 0
                ? ` / ${[...inferIndustryLabels(draft), ...inferConceptLabels(draft)].join(" / ")}`
                : ` / ${t("watchlist.unclassified")}`}
            </p>
          </div>
          <div className="grid grid-cols-3 items-center gap-2 sm:flex sm:flex-wrap sm:justify-end">
            {sourceNoteId && (
              <Link href={`/research/${encodeURIComponent(sourceNoteId)}`} className="rounded-lg border border-[var(--accent)]/35 bg-[var(--accent-bg)] px-3 py-2 text-sm text-accent transition hover:bg-[var(--accent-bg-hover)]">
                {t("stock.returnResearch")}
              </Link>
            )}
            {savedHint && <span className="rounded-full border border-ok bg-ok-soft px-3 py-1.5 text-xs text-ok">{savedHint}</span>}
            <button onClick={() => onArchive(draft)} className="min-h-10 rounded-lg border border-amber-500/30 px-3 py-2 text-sm text-amber-300 transition hover:bg-amber-500/10">{t("stock.archive")}</button>
            <button onClick={() => onDelete(draft)} className="min-h-10 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/10">{t("stock.delete")}</button>
            <button onClick={save} className="min-h-10 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-dark)]">{t("stock.save")}</button>
            {!pageMode && <button onClick={onClose} className="rounded-lg border border-themed px-3 py-2 text-sm text-secondary transition hover:border-[var(--border-hover)] hover:text-primary">{t("stock.closeLabel")}</button>}
            {!pageMode && (
              <button onClick={onClose} aria-label={t("stock.closeDetail")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-themed text-lg leading-none text-muted transition hover:border-[var(--border-hover)] hover:text-primary">
                ×
              </button>
            )}
          </div>
        </div>

        <div className={`space-y-5 ${pageMode ? "" : "p-4 sm:p-5"}`}>
          <section className="space-y-4 rounded-[var(--radius-lg)] border border-themed bg-surface p-4 sm:p-5 lg:p-6">
            <div>
              <h3 className="mb-3 text-base font-semibold text-primary">{t("stock.fundamentals")}</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <TextField label={t("stock.symbolCode")} value={draft.symbol} onChange={(v) => setDraft({ ...draft, symbol: formatSymbol(v) })} />
                <TextField label={t("stock.name")} value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
                <label className="text-xs text-muted">
                  {t("stock.stage")}
                  <select value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value as Stage })}
                    className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)]">
                    {STAGES.map((s) => <option key={s.key} value={s.key}>{localizedStageTitle(s.key, t)}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <TagEditor
                  label={t("stock.industry")}
                  placeholder={t("stock.industryPlaceholder")}
                  tags={draft.industries || []}
                  suggestions={industrySuggestions}
                  setTags={(tags) => setDraft({ ...draft, industries: tags, sector: tags.join(";") })}
                />
                <TagEditor
                  label={t("stock.concept")}
                  placeholder={t("stock.conceptPlaceholder")}
                  tags={draft.concepts || []}
                  suggestions={conceptSuggestions}
                  setTags={(tags) => setDraft({ ...draft, concepts: tags })}
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted">
                {t("stock.classificationHint")}
              </p>
              <div className="mt-4">
                <MarkdownEditor label={t("stock.entryReason")} value={draft.entryReason || ""} onChange={(entryReason) => setDraft({ ...draft, entryReason })} onSave={persistDraft} placeholder={t("stock.entryReasonPlaceholder")} minHeight="180px" />
              </div>
              <div className="mt-4 grid gap-4">
                <MarkdownEditor label={t("stock.business")} value={draft.businessSummary || ""} onChange={(businessSummary) => setDraft({ ...draft, businessSummary })} onSave={persistDraft} placeholder={t("stock.businessPlaceholder")} minHeight="180px" />
                <MarkdownEditor label={t("stock.growth")} value={draft.growthDrivers || ""} onChange={(growthDrivers) => setDraft({ ...draft, growthDrivers })} onSave={persistDraft} placeholder={t("stock.growthPlaceholder")} minHeight="180px" />
                <MarkdownEditor label={t("stock.risks")} value={draft.fundamentalRisks || ""} onChange={(fundamentalRisks) => setDraft({ ...draft, fundamentalRisks })} onSave={persistDraft} placeholder={t("stock.risksPlaceholder")} minHeight="180px" tone="warning" />
              </div>
              <FundamentalMetricsEditor metrics={draft.fundamentalMetrics || []} onChange={(fundamentalMetrics) => setDraft({ ...draft, fundamentalMetrics })} />
            </div>
          </section>

          <section className="space-y-4 rounded-[var(--radius-lg)] border border-themed bg-surface p-4 sm:p-5 lg:p-6">
            <div className="border-b border-themed pb-3">
              <h3 className="text-base font-semibold text-primary">{t("stock.anchor")}</h3>
              <p className="mt-1 text-xs text-muted">{t("stock.anchorDescription")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                [t("stock.strikePrice"), t("stock.strikeHint"), "strikePrice"],
                [t("stock.fairPrice"), t("stock.fairHint"), "fairPrice"],
                [t("stock.targetPrice"), t("stock.targetHint"), "targetPrice"],
              ] as const).map(([label, hint, key]) => (
                <label key={key} className="rounded-lg border border-themed bg-input p-3 text-xs text-muted focus-within:border-[var(--accent)]">
                  <span className="font-semibold text-secondary">{label}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft[key] || ""}
                    onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) || 0 })}
                    placeholder="0.00"
                    className="mt-2 w-full bg-transparent text-lg font-semibold text-primary outline-none placeholder:text-muted"
                  />
                  <span className="mt-1 block leading-5">{hint}</span>
                </label>
              ))}
            </div>
            <Field label={t("stock.thesis")}>
              <div>
                <MarkdownEditor label={t("stock.thesis")} value={draft.thesis} onChange={(thesis) => setDraft({ ...draft, thesis })} onSave={persistDraft} placeholder={t("stock.thesisPlaceholder")} minHeight="240px" />
                <div className="flex flex-col items-start justify-between gap-2 border-t border-themed px-3 py-2 sm:flex-row sm:items-center">
                  <span className="text-[11px] text-muted">{t("stock.thesisHint")}</span>
                  <button type="button" onClick={persistDraft} className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-[var(--accent-dark)]">{t("stock.saveAnchor")}</button>
                </div>
              </div>
            </Field>
            <Field label={t("stock.invalidation")}>
              <div>
                <MarkdownEditor label={t("stock.invalidation")} value={draft.invalidation} onChange={(invalidation) => setDraft({ ...draft, invalidation })} onSave={persistDraft} placeholder={t("stock.invalidationPlaceholder")} minHeight="220px" tone="warning" />
                <div className="flex flex-col items-start justify-between gap-2 border-t border-amber-500/20 px-3 py-2 sm:flex-row sm:items-center">
                  <span className="text-[11px] text-muted">{t("stock.invalidationHint")}</span>
                  <button type="button" onClick={persistDraft} className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/15">{t("stock.saveInvalidation")}</button>
                </div>
              </div>
            </Field>
            <Field label={t("stock.milestones")}>
              <div className="space-y-2">
                {draft.milestones.map((m) => (
                  <div key={m.id} className="grid gap-2 sm:grid-cols-[140px_1fr_72px]">
                    <input type="date" value={m.date} onChange={(e) => setMilestone(m.id, { date: e.target.value })}
                      className="rounded-lg border border-themed bg-input px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />
                    <input value={m.title} onChange={(e) => setMilestone(m.id, { title: e.target.value })}
                      className="rounded-lg border border-themed bg-input px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />
                    <button onClick={() => setDraft({ ...draft, milestones: draft.milestones.filter((x) => x.id !== m.id) })}
                      className="rounded-lg border border-themed px-2 py-2 text-xs text-muted hover:text-red-300">{t("stock.deleteMilestone")}</button>
                  </div>
                ))}
                <button onClick={() => setDraft({ ...draft, milestones: [...draft.milestones, { id: uid(), date: "", title: "", done: false }] })}
                  className="rounded-lg border border-dashed border-themed px-3 py-2 text-sm text-secondary hover:border-[var(--border-hover)] hover:text-primary">
                  {t("stock.addMilestone")}
                </button>
              </div>
            </Field>
          </section>

          <QuantObservation stock={draft} bars={kBars} />

          <DailyKSection
            stock={draft}
            bars={kBars}
            range={kRange}
            setRange={setKRange}
            loading={kLoading}
            error={kError}
          />

          <section className="space-y-4">
            <div className="border-b border-themed pb-3">
              <h3 className="text-base font-semibold text-primary">{t("stock.notesResearch")}</h3>
              <p className="mt-1 text-xs text-muted">{t("stock.notesResearchDescription")}</p>
            </div>
            <StockMemoPanel
              stock={stock}
              memos={memos}
              onAdd={addMemo}
              onUpdate={updateMemo}
              onDelete={deleteMemo}
              onConvert={convertMemoToNote}
            />

            <LinkedNotesPanel
              stockId={stock.id}
              stocks={stocks}
              notes={notes}
              onAdd={addNote}
              onUpdate={updateNote}
              onDelete={deleteNote}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function FundamentalMetricsEditor({ metrics, onChange }: { metrics: { name: string; value: string; period?: string }[]; onChange: (metrics: { name: string; value: string; period?: string }[]) => void }) {
  const { t } = useI18n();
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold text-secondary">{t("stock.metrics")}</h4><button type="button" onClick={() => onChange([...metrics, { name: "", value: "", period: "" }])} className="rounded-md border border-themed px-2.5 py-1.5 text-xs text-secondary hover:text-primary">{t("stock.addMetric")}</button></div>
      {metrics.length === 0 ? <p className="mt-2 rounded-lg border border-dashed border-themed px-3 py-4 text-center text-xs text-muted">{t("stock.metricEmpty")}</p> : (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {metrics.map((metric, index) => <div key={`${index}-${metric.name}`} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg bg-input p-2 sm:grid-cols-[1fr_1fr_90px_auto]">
            <input value={metric.name} onChange={(event) => onChange(metrics.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder={t("stock.metricName")} className="min-w-0 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted" />
            <input value={metric.value} onChange={(event) => onChange(metrics.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} placeholder={t("stock.metricValue")} className="min-w-0 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted max-sm:col-start-1" />
            <input value={metric.period || ""} onChange={(event) => onChange(metrics.map((item, itemIndex) => itemIndex === index ? { ...item, period: event.target.value } : item))} placeholder={t("stock.metricPeriod")} className="min-w-0 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted max-sm:col-start-1" />
            <button type="button" onClick={() => onChange(metrics.filter((_item, itemIndex) => itemIndex !== index))} className="px-2 text-muted hover:text-red-300" aria-label={t("stock.removeMetric")}>×</button>
          </div>)}
        </div>
      )}
    </div>
  );
}

function QuantObservation({ stock, bars }: { stock: WatchStock; bars: DailyBar[] }) {
  const { t } = useI18n();
  const closes = bars.map((bar) => bar.close).filter((value) => value > 0);
  const latest = closes[closes.length - 1] || stock.currentPrice || 0;
  const average = (count: number) => closes.length >= count ? closes.slice(-count).reduce((sum, value) => sum + value, 0) / count : null;
  const ma20 = average(20);
  const ma60 = average(60);
  const returns = closes.slice(1).map((value, index) => value / closes[index] - 1);
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const variance = returns.length > 1 ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1) : 0;
  const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
  let peak = 0;
  let maxDrawdown = 0;
  for (const close of closes) { peak = Math.max(peak, close); if (peak) maxDrawdown = Math.min(maxDrawdown, (close - peak) / peak); }
  const downside = stock.strikePrice > 0 && latest > stock.strikePrice ? latest - stock.strikePrice : 0;
  const upside = stock.targetPrice > latest ? stock.targetPrice - latest : 0;
  const rewardRisk = downside > 0 && upside > 0 ? upside / downside : null;
  const rules = [
    ma20 && ma60 ? (latest >= ma20 && ma20 >= ma60 ? t("stock.maStrong") : latest < ma20 ? t("stock.maShort") : t("stock.maMixed")) : t("stock.maInsufficient"),
    volatility ? (volatility > 45 ? t("stock.volHigh", { value: volatility.toFixed(1) }) : t("stock.volNormal", { value: volatility.toFixed(1) })) : t("stock.volInsufficient"),
    rewardRisk ? t("stock.rewardRiskValue", { value: rewardRisk.toFixed(2) }) : t("stock.rewardRiskMissing"),
  ];
  return (
    <section className="rounded-[var(--radius-lg)] border border-themed bg-surface p-4 sm:p-5 lg:p-6">
      <div className="flex flex-col gap-2 border-b border-themed pb-4 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-base font-semibold text-primary">{t("stock.quant")}</h3><p className="mt-1 text-xs text-muted">{t("stock.quantDescription")}</p></div><span className="text-[11px] text-muted">{t("stock.quantRule")}</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="MA20" value={ma20 ? fmtMoney(ma20) : "--"} />
        <MetricCard label="MA60" value={ma60 ? fmtMoney(ma60) : "--"} />
        <MetricCard label={t("stock.annualVolatility")} value={returns.length ? `${volatility.toFixed(1)}%` : "--"} />
        <MetricCard label={t("stock.maxDrawdown")} value={closes.length ? `${(maxDrawdown * 100).toFixed(1)}%` : "--"} />
        <MetricCard label={t("stock.rewardRisk")} value={rewardRisk ? rewardRisk.toFixed(2) : "--"} />
      </div>
      <div className="mt-4 grid gap-2 lg:grid-cols-3">{rules.map((rule) => <p key={rule} className="rounded-lg bg-input/70 px-3 py-3 text-xs leading-5 text-secondary">{rule}</p>)}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-secondary">{label}</span>
      {children}
    </label>
  );
}

function DailyKSection({
  stock,
  bars,
  range,
  setRange,
  loading,
  error,
}: {
  stock: WatchStock;
  bars: DailyBar[];
  range: KRange;
  setRange: (value: KRange) => void;
  loading: boolean;
  error: string;
}) {
  const { t } = useI18n();
  const ranges: { key: KRange; label: string }[] = [
    { key: "1mo", label: t("stock.range1m") },
    { key: "3mo", label: t("stock.range3m") },
    { key: "6mo", label: t("stock.range6m") },
    { key: "1y", label: t("stock.range1y") },
  ];
  const latest = bars[bars.length - 1];
  const first = bars[0];
  const perf = latest && first ? ((latest.close - first.open) / Math.max(first.open, 0.01)) * 100 : 0;
  return (
    <section className="rounded-[var(--radius-lg)] border border-themed bg-surface p-4 sm:p-5 lg:p-6">
      <div className="flex flex-col gap-3 border-b border-themed pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-primary">{t("stock.kline")}</h3>
          <p className="mt-1 text-xs text-muted">
            {stock.symbol} · {localizedAssetClassLabel(stock, t)}
            {bars.length > 0 ? ` · ${t("stock.klineBars", { count: bars.length })}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ranges.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setRange(item.key)}
              className={`rounded-md border px-3 py-1.5 text-xs transition ${
                range === item.key
                  ? "border-[var(--accent)] bg-[var(--accent-bg)] text-accent"
                  : "border-themed bg-surface-alt text-secondary hover:border-[var(--border-hover)] hover:text-primary"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_220px]">
        <div className="min-w-0">
          {loading ? (
            <div className="flex h-72 items-center justify-center rounded-lg bg-input text-sm text-muted">{t("stock.klineLoading")}</div>
          ) : error ? (
            <div className="flex h-72 items-center justify-center rounded-lg bg-input text-sm text-amber-200">{error}</div>
          ) : bars.length === 0 ? (
            <div className="flex h-72 items-center justify-center rounded-lg bg-input text-sm text-muted">{t("stock.klineEmpty")}</div>
          ) : (
            <CandlestickChart stock={stock} bars={bars} />
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <MetricCard label={t("stock.periodPerformance")} value={bars.length > 0 ? fmtPct(perf) : "--"} accent={perf >= 0 ? "text-up" : "text-down"} />
          <MetricCard label={t("stock.periodHigh")} value={bars.length > 0 ? fmtMoney(Math.max(...bars.map((bar) => bar.high))) : "--"} />
          <MetricCard label={t("stock.periodLow")} value={bars.length > 0 ? fmtMoney(Math.min(...bars.map((bar) => bar.low))) : "--"} />
          <MetricCard label={t("stock.latestClose")} value={latest ? fmtMoney(latest.close) : "--"} accent={latest && latest.close >= latest.open ? "text-up" : "text-down"} />
        </div>
      </div>
    </section>
  );
}

function CandlestickChart({ stock, bars }: { stock: WatchStock; bars: DailyBar[] }) {
  const { t, localeTag } = useI18n();
  const visibleBars = bars.slice(-80);
  const [hoverIndex, setHoverIndex] = useState<number | null>(visibleBars.length - 1);
  const resolvedHoverIndex = hoverIndex == null || visibleBars.length === 0 ? null : Math.min(hoverIndex, visibleBars.length - 1);
  const ma5 = movingAverage(visibleBars.map((bar) => bar.close), 5);
  const ma10 = movingAverage(visibleBars.map((bar) => bar.close), 10);
  const ma20 = movingAverage(visibleBars.map((bar) => bar.close), 20);
  const maValues = [...ma5, ...ma10, ...ma20].filter((value): value is number => value != null);
  const highMax = Math.max(...visibleBars.map((bar) => bar.high), ...maValues);
  const lowMin = Math.min(...visibleBars.map((bar) => bar.low), ...maValues);
  const spread = Math.max(highMax - lowMin, 0.01);
  const volumeMax = Math.max(...visibleBars.map((bar) => bar.volume || 0), 1);
  const yTicks = Array.from({ length: 5 }, (_item, index) => highMax - (spread / 4) * index);
  const xTicks = visibleBars.reduce<number[]>((acc, bar, index) => {
    const current = new Date(bar.date * 1000);
    const prev = index > 0 ? new Date(visibleBars[index - 1].date * 1000) : null;
    if (index === 0 || index === visibleBars.length - 1 || !prev || current.getMonth() !== prev.getMonth()) {
      acc.push(index);
    }
    return acc;
  }, []);
  const active = resolvedHoverIndex != null ? visibleBars[resolvedHoverIndex] : visibleBars[visibleBars.length - 1];
  const activeX = resolvedHoverIndex != null && visibleBars.length > 0 ? ((resolvedHoverIndex + 0.5) / visibleBars.length) * 100 : null;
  const activeY = active ? ((highMax - active.close) / spread) * 100 : null;
  const overlays = [
    { label: t("stock.strike"), value: stock.strikePrice, color: semanticColor("--accent", "#6366f1") },
    { label: t("stock.fair"), value: stock.fairPrice, color: "rgba(59,130,246,0.95)" },
    { label: t("stock.target"), value: stock.targetPrice, color: "rgba(245,158,11,0.95)" },
  ].filter((item) => item.value > 0 && item.value >= lowMin * 0.9 && item.value <= highMax * 1.1);
  const maOverlays = [
    { label: "MA5", values: ma5, color: "#f59e0b" },
    { label: "MA10", values: ma10, color: "#38bdf8" },
    { label: "MA20", values: ma20, color: "#a78bfa" },
  ];
  const activeMA5 = resolvedHoverIndex != null ? ma5[resolvedHoverIndex] : null;
  const activeMA10 = resolvedHoverIndex != null ? ma10[resolvedHoverIndex] : null;
  const activeMA20 = resolvedHoverIndex != null ? ma20[resolvedHoverIndex] : null;
  return (
    <div className="rounded-lg border border-themed bg-input p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted">
          {t("stock.recentBars", { count: visibleBars.length })}
          {active ? ` · ${fmtDay(active.date, localeTag)}` : ""}
        </div>
        {active && (
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="text-muted">{t("stock.open")} <span className="text-primary">{fmtMoney(active.open, localeTag)}</span></span>
            <span className="text-muted">{t("stock.high")} <span className="text-primary">{fmtMoney(active.high, localeTag)}</span></span>
            <span className="text-muted">{t("stock.low")} <span className="text-primary">{fmtMoney(active.low, localeTag)}</span></span>
            <span className="text-muted">{t("stock.close")} <span className={active.close >= active.open ? "text-up" : "text-down"}>{fmtMoney(active.close, localeTag)}</span></span>
            <span className="text-muted">{t("stock.volume")} <span className="text-primary">{active.volume.toLocaleString(localeTag)}</span></span>
            <span className="text-muted">MA5 <span className="text-amber-300">{activeMA5 != null ? fmtMoney(activeMA5) : "--"}</span></span>
            <span className="text-muted">MA10 <span className="text-sky-300">{activeMA10 != null ? fmtMoney(activeMA10) : "--"}</span></span>
            <span className="text-muted">MA20 <span className="text-violet-300">{activeMA20 != null ? fmtMoney(activeMA20) : "--"}</span></span>
          </div>
        )}
      </div>
      <div className="rounded-md border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]">
        <div className="relative h-72 overflow-hidden border-b border-white/5 px-2 py-3">
          {yTicks.map((tick) => {
            const top = ((highMax - tick) / spread) * 100;
            return (
              <div key={tick} className="pointer-events-none absolute inset-x-0" style={{ top: `${top}%` }}>
                <div className="border-t border-dashed border-white/8" />
                <span className="absolute right-2 -translate-y-1/2 bg-input/90 px-1 text-[10px] text-muted">{fmtMoney(tick)}</span>
              </div>
            );
          })}
          {overlays.map((overlay) => {
            const top = ((highMax - overlay.value) / spread) * 100;
            return (
              <div key={overlay.label} className="pointer-events-none absolute inset-x-0 z-[1]" style={{ top: `${top}%` }}>
                <div className="border-t border-dashed" style={{ borderColor: overlay.color, opacity: 0.75 }} />
                <span className="absolute left-2 -translate-y-1/2 rounded bg-page/90 px-1.5 py-0.5 text-[10px]" style={{ color: overlay.color }}>
                  {overlay.label} {fmtMoney(overlay.value)}
                </span>
              </div>
            );
          })}
          {maOverlays.map((overlay) => {
            const points = overlay.values
              .map((value, index) => {
                if (value == null) return null;
                const x = ((index + 0.5) / visibleBars.length) * 100;
                const y = ((highMax - value) / spread) * 100;
                return `${x},${y}`;
              })
              .filter(Boolean)
              .join(" ");
            if (!points) return null;
            return (
              <svg key={overlay.label} className="pointer-events-none absolute inset-0 z-[2] h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <polyline
                  fill="none"
                  points={points}
                  stroke={overlay.color}
                  strokeWidth="0.6"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            );
          })}
          {activeX != null && activeY != null && (
            <>
              <div className="pointer-events-none absolute inset-y-0 z-[3] w-px bg-white/20" style={{ left: `${activeX}%` }} />
              <div className="pointer-events-none absolute inset-x-0 z-[3] border-t border-dashed border-white/15" style={{ top: `${activeY}%` }} />
              <span
                className="pointer-events-none absolute z-[4] rounded bg-page/95 px-2 py-1 text-[10px] text-primary shadow-lg"
                style={{
                  left: `${Math.min(activeX + 1.5, 78)}%`,
                  top: `${Math.max(activeY - 10, 3)}%`,
                }}
              >
                {fmtDay(active.date, localeTag)} {t("stock.close")} {fmtMoney(active.close, localeTag)}
              </span>
            </>
          )}
          <div className="flex h-full items-stretch gap-[2px]">
            {visibleBars.map((bar, index) => {
              const rising = bar.close >= bar.open;
              const top = ((highMax - Math.max(bar.open, bar.close)) / spread) * 100;
              const height = Math.max((Math.abs(bar.close - bar.open) / spread) * 100, 1.2);
              const wickTop = ((highMax - bar.high) / spread) * 100;
              const wickBottom = ((highMax - bar.low) / spread) * 100;
              const activeBar = resolvedHoverIndex === index;
              return (
                <button
                  key={`${bar.date}-${index}`}
                  type="button"
                  onMouseEnter={() => setHoverIndex(index)}
                  onFocus={() => setHoverIndex(index)}
                  className={`relative z-[2] h-full flex-1 rounded-sm transition ${activeBar ? "bg-white/5" : "hover:bg-white/2"}`}
                  aria-label={`${fmtDay(bar.date, localeTag)} ${t("stock.kline")}`}
                >
                  <span
                    className={`absolute left-1/2 w-px -translate-x-1/2 ${rising ? "bg-up" : "bg-down"}`}
                    style={{ top: `${wickTop}%`, bottom: `${100 - wickBottom}%` }}
                  />
                  <span
                    className={`absolute left-1/2 min-w-[4px] -translate-x-1/2 rounded-[2px] ${rising ? "bg-up" : "bg-down"}`}
                    style={{ top: `${top}%`, height: `${height}%`, width: activeBar ? "8px" : "6px" }}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <div className="relative h-20 overflow-hidden px-2 py-2">
          <div className="pointer-events-none absolute inset-x-0 top-2 border-t border-dashed border-white/8" />
          <div className="flex h-full items-end gap-[2px]">
            {visibleBars.map((bar, index) => {
              const rising = bar.close >= bar.open;
              const activeBar = resolvedHoverIndex === index;
              return (
                <button
                  key={`vol-${bar.date}-${index}`}
                  type="button"
                  onMouseEnter={() => setHoverIndex(index)}
                  onFocus={() => setHoverIndex(index)}
                  className={`relative h-full flex-1 rounded-sm transition ${activeBar ? "bg-white/5" : "hover:bg-white/2"}`}
                  aria-label={`${fmtDay(bar.date, localeTag)} ${t("stock.volume")}`}
                >
                  <span
                    className={`absolute inset-x-0 bottom-0 rounded-[2px] ${rising ? "bg-up" : "bg-down"}`}
                    style={{ height: `${Math.max((bar.volume / volumeMax) * 100, 4)}%` }}
                  />
                </button>
              );
            })}
          </div>
          <span className="pointer-events-none absolute right-2 top-1 text-[10px] text-muted">{t("stock.volume")}</span>
        </div>
        <div className="flex items-center justify-between border-t border-white/5 px-2 py-2 text-[11px] text-muted">
          {xTicks.map((tick, index) => (
            <span key={`${visibleBars[tick].date}-${index}`}>{fmtMonthTick(visibleBars[tick].date, localeTag)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-themed bg-input px-3 py-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`mt-2 text-sm font-semibold ${accent || "text-primary"}`}>{value}</p>
    </div>
  );
}

function StockMemoPanel({
  stock,
  memos,
  onAdd,
  onUpdate,
  onDelete,
  onConvert,
}: {
  stock: WatchStock;
  memos: StockMemo[];
  onAdd: (stockId: string, content: string) => void;
  onUpdate: (id: string, patch: Partial<StockMemo>) => void;
  onDelete: (id: string) => void;
  onConvert: (memo: StockMemo, stock: WatchStock) => void | Promise<void>;
}) {
  const { t, localeTag } = useI18n();
  const [text, setText] = useState("");
  const sorted = [...memos].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt));
  const submit = () => {
    if (!text.trim()) return;
    onAdd(stock.id, text);
    setText("");
  };

  return (
    <section className="rounded-lg border border-themed bg-surface">
      <div className="border-b border-themed px-4 py-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-primary">{t("stock.quickMemos")}</h3>
            <p className="mt-1 text-xs text-muted">{t("stock.quickMemosDescription", { symbol: stock.symbol })}</p>
          </div>
          <span className="text-xs text-muted">{t("stock.memoCount", { count: memos.length })}</span>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
            }}
            rows={2}
            placeholder={t("stock.memoPlaceholder")}
            className="min-w-0 flex-1 resize-none rounded-lg border border-themed bg-input px-3 py-2 text-sm leading-6 text-primary outline-none placeholder:text-muted focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-dark)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("stock.addMemo")}
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted">{t("stock.noMemos")}</div>
      ) : (
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((memo) => (
            <article key={memo.id} className={`rounded-lg border p-3 ${memo.pinned ? "border-[var(--accent)] bg-[var(--accent-bg)]" : "border-themed bg-input"}`}>
              <p className="whitespace-pre-wrap text-sm leading-6 text-secondary">{memo.content}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-themed pt-2">
                <span className="text-[11px] text-muted">{new Date(memo.createdAt).toLocaleString(localeTag, { hour12: false })}</span>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => onUpdate(memo.id, { pinned: !memo.pinned })} className="rounded-md px-2 py-1 text-xs text-secondary hover:bg-surface-alt hover:text-primary">
                    {memo.pinned ? t("stock.unpin") : t("stock.pin")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onConvert(memo, stock)}
                    disabled={!!memo.convertedNoteId}
                    className="rounded-md px-2 py-1 text-xs text-accent hover:bg-[var(--accent-bg)] disabled:cursor-not-allowed disabled:text-muted"
                  >
                    {memo.convertedNoteId ? t("stock.upgraded") : t("stock.upgrade")}
                  </button>
                  <button type="button" onClick={() => onDelete(memo.id)} className="rounded-md px-2 py-1 text-xs text-muted hover:bg-red-500/10 hover:text-red-300">
                    {t("stock.deleteMemo")}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LinkedNotesPanel({
  stockId,
  stocks,
  notes,
  onAdd,
  onUpdate,
  onDelete,
}: {
  stockId: string;
  stocks: WatchStock[];
  notes: WatchNote[];
  onAdd: (stockId: string) => Promise<string>;
  onUpdate: (id: string, patch: Partial<WatchNote>) => void;
  onDelete: (id: string) => void;
}) {
  const { t, localeTag } = useI18n();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const activeNote = notes.find((note) => note.id === activeId) || notes[0] || null;
  const isEditing = !!activeNote && editingId === activeNote.id;
  const detailOpen = !!activeId;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!notes.length || (activeId && !notes.some((note) => note.id === activeId))) {
        setActiveId(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeId, notes]);

  const createNote = async () => {
    const id = await onAdd(stockId);
    setActiveId(id);
    setEditingId(id);
  };

  return (
    <div className="rounded-lg border border-themed bg-surface">
      <div className="flex flex-col gap-3 border-b border-themed px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-primary">{t("stock.linkedResearch")}</h3>
          <p className="mt-1 text-xs text-muted">{t("stock.linkedResearchDescription")}</p>
        </div>
        <button
          type="button"
          onClick={() => void createNote()}
          className="shrink-0 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-bg)] px-3 py-2 text-xs font-medium text-accent transition hover:bg-[var(--accent-bg-hover)]"
        >
          {t("stock.addResearch")}
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="m-4 rounded-lg border border-dashed border-themed bg-surface-alt px-3 py-12 text-center text-sm leading-6 text-muted">
          {t("stock.noLinkedResearch")}
        </div>
      ) : (
        <div>
          {!detailOpen && (
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onOpen={() => {
                    setActiveId(note.id);
                    setEditingId(null);
                  }}
                  onEdit={() => {
                    setActiveId(note.id);
                    setEditingId(note.id);
                  }}
                  onDelete={() => onDelete(note.id)}
                />
              ))}
            </div>
          )}

          {detailOpen && activeNote && (
            <div className="min-w-0 border-t border-themed p-4">
              <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start">
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(null);
                    setEditingId(null);
                  }}
                  className="rounded-lg border border-themed px-3 py-3 text-xs text-secondary transition hover:border-[var(--border-hover)] hover:text-primary"
                >
                  {t("watchlist.back")}
                </button>
                {isEditing ? (
                  <input
                    value={activeNote.title}
                    onChange={(event) => onUpdate(activeNote.id, { title: event.target.value })}
                    placeholder={t("stock.researchTitlePlaceholder")}
                    className="min-w-0 flex-1 rounded-lg border border-themed bg-input px-3 py-3 text-lg font-semibold text-primary outline-none placeholder:text-muted focus:border-[var(--accent)]"
                  />
                ) : (
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-xl font-semibold text-primary">{activeNote.title || t("watchlist.unnamedResearch")}</h4>
                    <p className="mt-1 text-xs text-muted">
                      {t("stock.researchFormat", { format: activeNote.format === "rich" ? t("stock.richText") : t("stock.markdown"), date: new Date(activeNote.updatedAt).toLocaleString(localeTag, { hour12: false }) })}
                    </p>
                  </div>
                )}
                {isEditing ? (
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg bg-accent px-4 py-3 text-xs font-semibold text-on-accent transition hover:bg-[var(--accent-dark)]"
                  >
                    {t("stock.finish")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingId(activeNote.id)}
                    className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-bg)] px-4 py-3 text-xs font-medium text-accent transition hover:bg-[var(--accent-bg-hover)]"
                  >
                    {t("stock.edit")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(activeNote.id)}
                  className="rounded-lg border border-red-500/30 px-3 py-3 text-xs text-red-300 transition hover:bg-red-500/10"
                >
                  {t("stock.delete")}
                </button>
              </div>
              {isEditing ? (
                <>
              <NoteEditor
                note={activeNote}
                spacious
                allowedTags={allowedKnowledgeTags(stocks)}
                onUpdate={(patch) => onUpdate(activeNote.id, patch)}
              />
                  <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted">
                    <span>{t("stock.noteSavedLocal")}</span>
                    <span>{t("stock.noteUpdated", { date: new Date(activeNote.updatedAt).toLocaleString(localeTag, { hour12: false }) })}</span>
                  </div>
                </>
              ) : (
                <NotePreview note={activeNote} spacious />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NoteEditor({
  note,
  allowedTags,
  onUpdate,
  spacious = false,
}: {
  note: WatchNote;
  allowedTags: string[];
  onUpdate: (patch: Partial<WatchNote>) => void;
  spacious?: boolean;
}) {
  const { t } = useI18n();
  const richRef = useRef<HTMLDivElement | null>(null);
  const format = note.format || "markdown";

  useEffect(() => {
    if (format === "rich" && richRef.current && richRef.current.innerHTML !== note.content) {
      richRef.current.innerHTML = note.content;
    }
  }, [format, note.id, note.content]);

  const switchFormat = (next: "markdown" | "rich") => {
    if (next === format) return;
    onUpdate({
      format: next,
      content: next === "rich" ? markdownToHtml(note.content) : storedTextToMarkdown(note.content),
    });
  };

  const runRichCommand = (command: string, value?: string) => {
    richRef.current?.focus();
    document.execCommand(command, false, value);
    onUpdate({ content: richRef.current?.innerHTML || "" });
  };

  return (
    <div className="mt-3 rounded-lg border border-themed bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-themed px-2 py-2">
        <div className="flex rounded-md border border-themed bg-input p-0.5">
          <button
            type="button"
            onClick={() => switchFormat("markdown")}
            className={`rounded px-2 py-1 text-xs transition ${format === "markdown" ? "bg-accent text-on-accent" : "text-secondary hover:text-primary"}`}
          >
            {t("stock.markdown")}
          </button>
          <button
            type="button"
            onClick={() => switchFormat("rich")}
            className={`rounded px-2 py-1 text-xs transition ${format === "rich" ? "bg-accent text-on-accent" : "text-secondary hover:text-primary"}`}
          >
            {t("stock.formatRich")}
          </button>
        </div>

        {format === "rich" && (
          <div className="flex flex-wrap gap-1">
            <NoteToolButton onClick={() => runRichCommand("bold")}>B</NoteToolButton>
            <NoteToolButton onClick={() => runRichCommand("italic")}>I</NoteToolButton>
            <NoteToolButton onClick={() => runRichCommand("formatBlock", "h3")}>H3</NoteToolButton>
            <NoteToolButton onClick={() => runRichCommand("insertUnorderedList")}>{t("stock.list")}</NoteToolButton>
            <NoteToolButton onClick={() => runRichCommand("formatBlock", "blockquote")}>{t("stock.quote")}</NoteToolButton>
          </div>
        )}
      </div>

      {format === "markdown" ? (
        <MarkdownEditor label={t("stock.noteBody")} value={note.content} onChange={(content) => onUpdate({ content })} placeholder={t("stock.editorPlaceholder")} minHeight={spacious ? "560px" : "220px"} emptyLabel={t("stock.noMarkdownPreview")} mentionSuggestions={allowedTags} />
      ) : (
        <div
          ref={richRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => onUpdate({ content: richRef.current?.innerHTML || "" })}
          className={`${spacious ? "min-h-[620px]" : "min-h-56"} px-4 py-4 text-sm leading-7 text-primary outline-none empty:before:text-muted [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--accent)] [&_blockquote]:pl-3 [&_blockquote]:text-secondary [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc`}
        />
      )}
    </div>
  );
}

function NoteCard({
  note,
  onOpen,
  onEdit,
  onDelete,
}: {
  note: WatchNote;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const plain = stripNoteContent(note.content, note.format);
  const isEmpty = !plain;
  const words = plain.replace(/\s+/g, "");
  const noteKind = plain.length > 420 ? "deep" : words.length > 120 ? "observation" : "memo";
  const noteType = noteKind === "deep" ? t("research.typeDeep") : noteKind === "observation" ? t("research.typeObservation") : t("research.typeMemo");
  const accent = noteKind === "deep"
    ? "from-sky-400 via-cyan-300 to-teal-300"
    : noteKind === "observation"
      ? "from-violet-400 via-fuchsia-300 to-sky-300"
      : "from-amber-300 via-orange-300 to-rose-300";
  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-lg border border-white/[0.08] bg-[#0D0D12] p-6 transition hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_18px_60px_rgba(0,0,0,0.30)]"
    >
      <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${accent}`} />
      <div className={`pointer-events-none absolute inset-x-0 top-[2px] h-8 bg-gradient-to-b ${accent} opacity-10 blur-xl`} />
      <button type="button" onClick={onOpen} className="flex flex-col gap-3 text-left">
        <div className="flex items-center justify-between gap-3 text-[11px] leading-none">
          <div className="flex min-w-0 items-center gap-2 overflow-hidden text-white/42">
            <span className="shrink-0 font-medium text-white/62">{noteType}</span>
            <span className="truncate">{note.format === "rich" ? t("stock.formatRich") : t("stock.markdown")}</span>
          </div>
          <span className="shrink-0 text-white/38" title={t("research.privateOnly")}>🔒</span>
        </div>

        <div>
          <h4 className="line-clamp-1 text-base font-semibold leading-[1.4] text-white">{note.title || t("watchlist.unnamedResearch")}</h4>
          <p className="mt-2 line-clamp-3 text-sm leading-[1.6] text-[#8A8A93]">
            {isEmpty ? t("watchlist.emptyResearch") : plain}
          </p>
        </div>
      </button>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
        <button type="button" onClick={onOpen} className="rounded-full border border-sky-300/20 bg-sky-300/[0.08] px-2.5 py-1 font-mono text-[11px] font-semibold text-sky-100 transition hover:bg-sky-300/[0.13]">
          {t("common.view")}
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onEdit} className="rounded-md px-2 py-1 text-xs text-white/50 transition hover:bg-white/[0.06] hover:text-white">
            {t("stock.edit")}
          </button>
          <button type="button" onClick={onDelete} className="rounded-md px-2 py-1 text-xs text-white/42 transition hover:bg-red-500/10 hover:text-red-200">
            {t("stock.delete")}
          </button>
        </div>
      </div>
    </article>
  );
}

function NotePreview({ note, spacious = false }: { note: WatchNote; spacious?: boolean }) {
  const { t } = useI18n();
  const empty = !stripNoteContent(note.content, note.format);
  return (
    <div className={`rounded-lg border border-themed bg-input px-5 py-5 ${spacious ? "min-h-[620px]" : "min-h-48"}`}>
      {empty ? (
        <div className="flex min-h-48 items-center justify-center text-sm text-muted">
          {t("stock.noteEmpty")}
        </div>
      ) : note.format === "rich" ? (
        <div
          className="space-y-4 text-sm leading-7 text-secondary [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--accent)] [&_blockquote]:pl-3 [&_blockquote]:text-secondary [&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-primary [&_li]:ml-5 [&_li]:list-disc [&_p]:my-2 [&_strong]:font-semibold [&_strong]:text-primary"
          dangerouslySetInnerHTML={{ __html: note.content }}
        />
      ) : (
        <MarkdownPreview source={note.content} emptyLabel={t("stock.noMarkdownPreview")} />
      )}
    </div>
  );
}

function NoteToolButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="rounded-md border border-themed px-2 py-1 text-xs font-medium text-secondary transition hover:border-[var(--border-hover)] hover:text-primary"
    >
      {children}
    </button>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function markdownToHtml(value: string) {
  const lines = value.split("\n");
  return lines.map((line) => {
    const safe = inlineMarkdownToHtml(line);
    if (line.startsWith("### ")) return `<h3>${inlineMarkdownToHtml(line.slice(4))}</h3>`;
    if (line.startsWith("## ")) return `<h3>${inlineMarkdownToHtml(line.slice(3))}</h3>`;
    if (line.startsWith("# ")) return `<h3>${inlineMarkdownToHtml(line.slice(2))}</h3>`;
    if (line.startsWith("> ")) return `<blockquote>${inlineMarkdownToHtml(line.slice(2))}</blockquote>`;
    if (line.startsWith("- ")) return `<ul><li>${inlineMarkdownToHtml(line.slice(2))}</li></ul>`;
    return safe ? `<p>${safe}</p>` : "<p><br></p>";
  }).join("");
}

function inlineMarkdownToHtml(value: string) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
}

function stripNoteContent(content: string, format?: "markdown" | "rich") {
  if (!content) return "";
  if (format === "rich") {
    if (typeof document === "undefined") return content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const box = document.createElement("div");
    box.innerHTML = content;
    return (box.textContent || "").replace(/\s+/g, " ").trim();
  }
  return content
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function TagEditor({
  label,
  tags,
  suggestions,
  setTags,
  placeholder,
}: {
  label: string;
  tags: string[];
  suggestions: string[];
  setTags: (tags: string[]) => void;
  placeholder: string;
}) {
  const { t } = useI18n();
  const [raw, setRaw] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = raw.trim()
    ? suggestions
        .filter((tag) => !tags.includes(tag))
        .filter((tag) => tag.toLowerCase().includes(raw.trim().toLowerCase()))
        .slice(0, 8)
    : suggestions.filter((tag) => !tags.includes(tag)).slice(0, 8);

  const addTags = (value: string) => {
    const nextTags = value
      .split(/[;；,，/|]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag) => !tags.includes(tag));
    if (!nextTags.length) return;
    setTags([...tags, ...nextTags]);
    setRaw("");
    setActiveIndex(0);
  };
  const addTag = () => {
    if (matches.length > 0 && raw.trim()) {
      addTags(matches[Math.min(activeIndex, matches.length - 1)]);
      return;
    }
    addTags(raw);
  };
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-secondary">{label}</p>
      <div className="min-h-24 rounded-lg border border-themed bg-input p-2">
        <div className="mb-2 flex flex-wrap gap-2">
          {tags.length === 0 ? (
            <span className="px-1 py-1 text-xs text-muted">{t("stock.tagUnclassified")}</span>
          ) : tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)]/20 bg-[var(--accent-bg)] px-2 py-1 text-xs text-accent">
              <span>{tag}</span>
              <button
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setTags(tags.filter((item) => item !== tag));
                }}
                className="rounded border border-transparent px-1.5 py-0.5 text-[10px] text-secondary transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
                type="button"
                title={`${t("stock.tagRemove")} ${tag}`}
              >
                {t("stock.tagRemove")}
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTag();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((idx) => Math.min(idx + 1, Math.max(matches.length - 1, 0)));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((idx) => Math.max(idx - 1, 0));
              }
            }}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm text-primary outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={addTag}
            className="rounded-md border border-themed px-2 py-1 text-xs text-secondary transition hover:border-[var(--border-hover)] hover:text-primary"
          >
            {t("stock.tagAdd")}
          </button>
        </div>
        {matches.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-themed pt-2">
            {matches.map((tag, index) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTags(tag)}
                className={`rounded-md border px-2 py-1 text-xs transition ${
                  index === activeIndex && raw.trim()
                    ? "border-[var(--accent)] bg-[var(--accent-bg)] text-accent"
                    : "border-themed bg-surface text-secondary hover:border-[var(--border-hover)] hover:text-primary"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder = "" }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-xs text-muted">
      {label}
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)]" />
    </label>
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

function ArchiveModal({
  stock,
  reason,
  setReason,
  note,
  setNote,
  onClose,
  onConfirm,
}: {
  stock: WatchStock;
  reason: ArchiveReason;
  setReason: (r: ArchiveReason) => void;
  note: string;
  setNote: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-3" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-themed bg-page p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-primary">{t("watchlist.archive")} {stock.symbol}</h2>
        <p className="mt-1 text-sm text-muted">{t("watchlist.archiveDescription")}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => setReason("buy")}
            className={`rounded-lg border px-3 py-3 text-sm ${reason === "buy" ? "border-[var(--accent)] bg-[var(--accent-bg)] text-accent" : "border-themed text-secondary"}`}>
            {t("watchlist.archiveBuyAction")}
          </button>
          <button onClick={() => setReason("invalidated")}
            className={`rounded-lg border px-3 py-3 text-sm ${reason === "invalidated" ? "border-amber-500/60 bg-amber-500/10 text-amber-300" : "border-themed text-secondary"}`}>
            {t("watchlist.archiveInvalidatedAction")}
          </button>
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4}
          placeholder={t("watchlist.archivePlaceholder")}
          className="mt-4 w-full rounded-lg border border-themed bg-input px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--accent)]" />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-themed px-4 py-2 text-sm text-secondary">{t("watchlist.cancel")}</button>
          <button onClick={onConfirm} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent">{t("watchlist.generateReview")}</button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({
  stock,
  onClose,
  onConfirm,
}: {
  stock: WatchStock;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/70 px-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-red-500/30 bg-page p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-red-300">{t("watchlist.delete")} {stock.symbol}</h2>
        <p className="mt-2 text-sm leading-6 text-secondary">{t("watchlist.deleteDescription")}</p>
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs leading-5 text-muted">
          {t("watchlist.deleteLinked")}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-themed px-4 py-2 text-sm text-secondary">{t("watchlist.cancel")}</button>
          <button onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500">{t("watchlist.confirmDelete")}</button>
        </div>
      </div>
    </div>
  );
}
