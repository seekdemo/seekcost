"use client";

import "../research/research-detail.css";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import MarkdownEditor from "@/components/MarkdownEditor";
import MarkdownPreview from "@/components/MarkdownPreview";
import { htmlClipboardToMarkdown } from "@/lib/markdown";
import ResearchArticleShell from "@/app/research/[id]/ResearchArticleShell";
import ResearchDetailView from "@/app/research/[id]/ResearchDetailView";
import ResearchDocumentBar from "@/app/research/[id]/ResearchDocumentBar";
import ResearchCommentDrawer from "@/app/research/[id]/ResearchCommentDrawer";
import ResearchAnnotationLayer from "@/app/research/[id]/ResearchAnnotationLayer";
import ResearchCommentThread from "@/app/research/[id]/ResearchCommentThread";
import ResearchReadingHeader from "@/app/research/[id]/ResearchReadingHeader";
import ResearchReadingActionBar from "@/app/research/[id]/ResearchReadingActionBar";
import ResearchOutline, { outlineFromMarkdown, outlineFromRichHtml } from "@/app/research/[id]/ResearchOutline";
import ResearchEditorShell from "@/app/research/[id]/ResearchEditorShell";
import ResearchPropertiesPanel from "@/app/research/[id]/ResearchPropertiesPanel";
import { useResearchAutoSave, type ResearchSaveState } from "@/app/research/_components/useResearchAutoSave";
import { api } from "@/lib/api";
import { getCurrentUserId } from "@/lib/auth";
import type { ResearchComment, ResearchNote, ResearchWrite } from "@/lib/types";
import { useI18n } from "@/components/I18nProvider";

type NoteFormat = "markdown" | "rich";
type NoteVisibility = "private" | "workspace" | "public";
type Stage = "radar" | "conviction" | "strike";
type ResearchKind = "quick" | "company" | "thesis" | "decision" | "review";
type ResearchStatus = "draft" | "active" | "validated" | "invalidated" | "archived";
type NoteScope = "all" | "favorites" | "due" | "active" | "archived" | "linked" | "unlinked";
type NotesStyle = "reading" | "cards";
type NotesSort = "latest" | "created" | "review_due";
type AnnotationView = "side" | "bottom";
type ResearchPreviewMode = "off" | "single" | "split";

interface WatchStock {
  id: string;
  symbol: string;
  name: string;
  stage: Stage;
  sector?: string;
  industries?: string[];
  concepts?: string[];
  currentPrice?: number;
  strikePrice?: number;
  fairPrice?: number;
  targetPrice?: number;
  thesis?: string;
}

interface WatchNote {
  id: string;
  userId?: string;
  stockId?: string;
  stockIds?: string[];
  knowledgeTags?: string[];
  tags?: string[];
  series?: string;
  seriesId?: string;
  title: string;
  format?: NoteFormat;
  visibility?: NoteVisibility;
  kind?: ResearchKind;
  status?: ResearchStatus;
  confidence?: number | null;
  nextReviewAt?: string | null;
  starred?: boolean;
  coverImageUrl?: string | null;
  coverColor?: string | null;
  links?: { entityType: "watch_stock" | "asset" | "trade_plan" | "transaction"; entityId: number }[];
  allowComments?: boolean;
  commentCount?: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface NoteComment {
  id: string;
  noteId: string;
  userId: string;
  parentId?: string | null;
  replyToUserId?: string | null;
  replyToAuthor?: { id: string; nickname: string; avatarUrl?: string } | null;
  content: string;
  quoteText?: string;
  quotePrefix?: string;
  quoteSuffix?: string;
  startOffset?: number;
  endOffset?: number;
  blockId?: string;
  anchorStatus?: string;
  reactions: CommentReaction[];
  createdAt: string;
  author: { id: string; nickname: string; avatarUrl?: string };
}

interface CommentReaction {
  emoji: string;
  count: number;
  reacted: boolean;
}

interface QuoteAnchor {
  quoteText: string;
  quotePrefix: string;
  quoteSuffix: string;
  startOffset: number;
  endOffset: number;
  blockId?: string;
}

interface NoteSeriesOption {
  id: string;
  name: string;
}

const NOTE_STYLE_KEY = "seekcost_notes_style_v1";
const NOTE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const NOTE_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const COMMENT_EMOJIS = ["😀", "👍", "❤️", "🔥", "💡", "👏", "🎉"];
const COMMENT_REACTIONS = ["👍", "❤️", "🔥", "💡", "👏"];
const RESEARCH_RETURN_KEY = "seekcost:research-library-return";
const RESEARCH_SCROLL_KEY = "seekcost:research-library-scroll";

function scopeLabel(scope: NoteScope, t: (key: string) => string) {
  const keys: Record<NoteScope, string> = { all: "research.scopeAll", favorites: "research.scopeFavorites", due: "research.scopeDue", active: "research.scopeActive", archived: "research.scopeArchived", linked: "research.scopeLinked", unlinked: "research.scopeUnlinked" };
  return t(keys[scope]);
}

function researchKindLabel(kind: ResearchKind, t: (key: string) => string) {
  const keys: Record<ResearchKind, string> = { quick: "research.kindQuick", company: "research.kindCompany", thesis: "research.kindThesis", decision: "research.kindDecision", review: "research.kindReview" };
  return t(keys[kind]);
}

function researchStatusLabel(status: ResearchStatus, t: (key: string) => string) {
  const keys: Record<ResearchStatus, string> = { draft: "research.statusDraft", active: "research.statusActive", validated: "research.statusValidated", invalidated: "research.statusInvalidated", archived: "research.statusArchived" };
  return t(keys[status]);
}

function loadLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().replace(/^"|"$/g, "").toUpperCase();
}

function formatSymbol(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return "";
  return normalized.replace(/\.US$/, "").replace(/\.(HK|SH|SZ|SS|TW|TWO|BJ)$/, "");
}

function symbolKey(symbol: string) {
  return formatSymbol(symbol);
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function noteSeriesFavoriteKey(note: Pick<WatchNote, "series" | "seriesId">) {
  return note.seriesId ? `id:${note.seriesId}` : note.series || "";
}

function seriesFavoriteKeyForName(name: string, options: NoteSeriesOption[]) {
  const series = options.find((option) => option.name === name);
  return series ? `id:${series.id}` : name;
}

function imageAltFromName(name: string, fallback = "Image") {
  return name.replace(/\.[^.]+$/, "").replace(/[\[\]()]/g, " ").replace(/\s+/g, " ").trim() || fallback;
}

function isSafeImageSrc(src: string) {
  return /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(src) || /^https:\/\//i.test(src);
}

function readNoteImage(file: File, t: (key: string) => string): Promise<{ src: string; alt: string }> {
  if (!file.type.startsWith("image/")) return Promise.reject(new Error(t("research.imageOnly")));
  if (file.size > NOTE_IMAGE_MAX_BYTES) return Promise.reject(new Error(t("research.imageTooLarge")));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ src: String(reader.result || ""), alt: imageAltFromName(file.name, t("research.imageAlt")) });
    reader.onerror = () => reject(new Error(t("research.imageReadFailed")));
    reader.readAsDataURL(file);
  });
}

function hasRenderableContent(note: Pick<WatchNote, "content" | "format">) {
  if (stripContent(note.content, note.format)) return true;
  return note.format === "rich" ? /<img\b/i.test(note.content) : /!\[[^\]]*]\([^)]+\)/.test(note.content);
}

function extractSymbolMentions(text: string) {
  const matches = text.matchAll(/\$([A-Za-z0-9.-]{1,12})/g);
  return uniqueValues([...matches].map((match) => formatSymbol(match[1])));
}

function allowedKnowledgeTags(stocks: WatchStock[]) {
  return uniqueValues(stocks.flatMap((stock) => [
    ...(stock.industries || []),
    ...(stock.concepts || []),
    ...(stock.sector || "").split(/[;；,，/|]/),
  ]));
}

function extractKnowledgeTags(text: string, allowedTags: string[]) {
  const allowed = new Set(allowedTags);
  const matches = text.matchAll(/@([\p{Script=Han}A-Za-z0-9][\p{Script=Han}A-Za-z0-9_-]{0,24})/gu);
  return uniqueValues([...matches].map((match) => match[1]).filter((tag) => allowed.has(tag)));
}

function stripContent(content: string, format?: NoteFormat) {
  if (!content) return "";
  if (format === "rich") {
    if (typeof document === "undefined") return content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const box = document.createElement("div");
    box.innerHTML = sanitizeRichHtml(content);
    const imageText = Array.from(box.querySelectorAll("img"))
      .map((img) => img.getAttribute("alt") || "Image")
      .join(" ");
    return `${box.textContent || ""} ${imageText}`.replace(/\s+/g, " ").trim();
  }
  return content
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMarkdownToHtml(value: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function sanitizeRichHtml(value: string) {
  const fallback = value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");

  if (typeof document === "undefined") {
    return fallback
      .replace(/<(?!\/?(h1|h2|h3|p|br|ul|ol|li|blockquote|strong|b|em|i|u|s|code|pre|hr|div|span|a|img|figure|figcaption|table|thead|tbody|tfoot|tr|th|td|caption)\b)[^>]*>/gi, "")
      .replace(/<img\b([^>]*)>/gi, (match) => {
        const srcMatch = match.match(/\ssrc=["']([^"']+)["']/i);
        const src = srcMatch?.[1] || "";
        return isSafeImageSrc(src) ? match : "";
      })
      .replace(/<a\b([^>]*)>/gi, (match) => {
        const hrefMatch = match.match(/\shref=["']([^"']+)["']/i);
        const href = hrefMatch?.[1] || "";
        if (!/^(?:https?:\/\/|\/(?!\/)|#|\?)/i.test(href)) return "<a>";
        const target = /\starget=["']_blank["']/i.test(match) ? ' target="_blank" rel="noreferrer noopener"' : "";
        return `<a href="${href}"${target}>`;
      });
  }

  const allowedTags = new Set(["H1", "H2", "H3", "P", "BR", "UL", "OL", "LI", "BLOCKQUOTE", "STRONG", "B", "EM", "I", "U", "S", "CODE", "PRE", "HR", "DIV", "SPAN", "A", "IMG", "FIGURE", "FIGCAPTION", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "CAPTION"]);
  const template = document.createElement("template");
  template.innerHTML = fallback;

  const cleanNode = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const element = child as HTMLElement;
      if (!allowedTags.has(element.tagName)) {
        const text = document.createTextNode(element.textContent || "");
        element.replaceWith(text);
        continue;
      }
      if (element.tagName === "IMG") {
        const src = element.getAttribute("src") || "";
        const alt = element.getAttribute("alt") || "Image";
        const title = element.getAttribute("title") || "";
        const rawWidth = element.getAttribute("data-width") || element.style.width || "";
        const width = Number.parseFloat(rawWidth);
        const align = element.getAttribute("data-align") || "center";
        if (!isSafeImageSrc(src)) {
          element.remove();
          continue;
        }
        for (const attribute of Array.from(element.attributes)) {
          element.removeAttribute(attribute.name);
        }
        element.setAttribute("src", src);
        element.setAttribute("alt", alt);
        if (title) element.setAttribute("title", title);
        if (Number.isFinite(width)) {
          const safeWidth = Math.min(100, Math.max(20, width));
          element.setAttribute("data-width", String(Math.round(safeWidth)));
          element.setAttribute("style", `width:${safeWidth}%;max-width:100%;height:auto;`);
        }
        if (["left", "center", "right"].includes(align)) {
          element.setAttribute("data-align", align);
          const margin = align === "left" ? "0 auto 0 0" : align === "right" ? "0 0 0 auto" : "0 auto";
          const currentStyle = element.getAttribute("style") || "max-width:100%;height:auto;";
          element.setAttribute("style", `${currentStyle};display:block;margin:${margin};`);
        }
        element.setAttribute("draggable", "false");
        element.setAttribute("loading", "lazy");
        continue;
      }
      if (element.tagName === "SPAN") {
        const token = element.getAttribute("data-token") || "";
        const symbol = element.getAttribute("data-symbol") || "";
        const label = element.getAttribute("data-label") || "";
        for (const attribute of Array.from(element.attributes)) {
          element.removeAttribute(attribute.name);
        }
        if (token === "stock" && /^[A-Z0-9.-]{1,12}$/.test(symbol)) {
          element.setAttribute("data-token", "stock");
          element.setAttribute("data-symbol", symbol);
          if (label) element.setAttribute("data-label", label.slice(0, 40));
          element.setAttribute("contenteditable", "false");
        }
        cleanNode(element);
        continue;
      }
      if (element.tagName === "A") {
        const href = element.getAttribute("href") || "";
        const safeHref = /^(?:https?:\/\/|\/(?!\/)|#|\?)/i.test(href) ? href : "";
        const target = element.getAttribute("target") === "_blank" ? "_blank" : "";
        const rel = target ? "noreferrer noopener" : "";
        for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
        if (safeHref) element.setAttribute("href", safeHref);
        if (target) element.setAttribute("target", target);
        if (rel) element.setAttribute("rel", rel);
        cleanNode(element);
        continue;
      }
      for (const attribute of Array.from(element.attributes)) {
        element.removeAttribute(attribute.name);
      }
      cleanNode(element);
    }
  };

  cleanNode(template.content);
  return template.innerHTML;
}

function markdownToRichHtml(markdown: string) {
  const lines = markdown.split("\n");
  let inList = false;
  let inCode = false;
  let codeLines: string[] = [];
  const html: string[] = [];
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };
  const closeCode = () => {
    if (inCode) {
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      codeLines = [];
      inCode = false;
    }
  };
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim().startsWith("```")) {
      closeList();
      if (inCode) {
        closeCode();
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdownToHtml(line.replace(/^-\s+/, ""))}</li>`);
      continue;
    }
    closeList();
    if (!line.trim()) {
      html.push("<p><br></p>");
    } else {
      const imageMatch = line.match(/^!\[([^\]]*)]\(([^)]+)\)$/);
      if (imageMatch && isSafeImageSrc(imageMatch[2])) {
        html.push(`<p><img src="${escapeHtml(imageMatch[2])}" alt="${escapeHtml(imageMatch[1] || "Image")}"></p>`);
      } else if (line.startsWith("### ")) {
        html.push(`<h3>${inlineMarkdownToHtml(line.replace(/^###\s+/, ""))}</h3>`);
      } else if (line.startsWith("## ")) {
        html.push(`<h2>${inlineMarkdownToHtml(line.replace(/^##\s+/, ""))}</h2>`);
      } else if (line.startsWith("# ")) {
        html.push(`<h1>${inlineMarkdownToHtml(line.replace(/^#\s+/, ""))}</h1>`);
      } else if (line.startsWith("> ")) {
        html.push(`<blockquote>${inlineMarkdownToHtml(line.replace(/^>\s+/, ""))}</blockquote>`);
      } else {
        html.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
      }
    }
  }
  closeList();
  closeCode();
  return html.join("");
}

function normalizeNote(note: WatchNote, stocks: WatchStock[]) {
  const text = `${note.title || ""} ${note.content || ""}`;
  const ids = new Set(note.stockIds || (note.stockId ? [note.stockId] : []));
  const allowedTags = allowedKnowledgeTags(stocks);
  for (const symbol of extractSymbolMentions(text)) {
    const stock = stocks.find((item) => symbolKey(item.symbol) === symbolKey(symbol));
    if (stock) ids.add(stock.id);
  }
  return {
    ...note,
    stockIds: [...ids],
    knowledgeTags: extractKnowledgeTags(text, allowedTags),
    tags: uniqueValues(note.tags || []).slice(0, 12),
    series: note.series?.trim() || undefined,
    seriesId: note.seriesId,
    title: note.title || "Untitled research",
    format: note.format || "markdown",
    visibility: note.visibility || "private",
    kind: note.kind || "quick",
    status: note.status || "active",
    confidence: note.confidence ?? null,
    nextReviewAt: note.nextReviewAt ?? null,
    starred: note.starred === true,
    coverImageUrl: note.coverImageUrl ?? null,
    coverColor: note.coverColor ?? null,
    allowComments: note.allowComments !== false,
  };
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
    currentPrice: Number(raw.current_price || 0),
    strikePrice: Number(raw.strike_price || 0),
    fairPrice: Number(raw.fair_price || 0),
    targetPrice: Number(raw.target_price || 0),
    thesis: String(raw.thesis || ""),
  };
}

function apiNoteToWatchNote(raw: ResearchNote, stocks: WatchStock[]): WatchNote {
  const symbols = raw.stock_symbols.map((item) => formatSymbol(item));
  return normalizeNote({
    id: String(raw.id),
    userId: String(raw.user_id),
    stockIds: symbols.map((symbol) => stocks.find((stock) => symbolKey(stock.symbol) === symbolKey(symbol))?.id).filter(Boolean) as string[],
    knowledgeTags: raw.knowledge_tags,
    tags: raw.tags,
    series: raw.series ? String(raw.series) : undefined,
    seriesId: raw.series_id ? String(raw.series_id) : undefined,
    title: String(raw.title || "Untitled research"),
    format: raw.format === "rich" ? "rich" : "markdown",
    visibility: (raw.visibility as NoteVisibility) || "private",
    kind: (raw.kind as ResearchKind) || "quick",
    status: (raw.status as ResearchStatus) || "active",
    confidence: raw.confidence == null ? null : Number(raw.confidence),
    nextReviewAt: raw.next_review_at ? String(raw.next_review_at) : null,
    starred: Boolean(raw.starred),
    coverImageUrl: raw.cover_image_url ? String(raw.cover_image_url) : null,
    coverColor: raw.cover_color ? String(raw.cover_color) : null,
    links: raw.links.map((link) => ({ entityType: link.entity_type, entityId: link.entity_id })),
    allowComments: raw.allow_comments,
    commentCount: raw.comment_count,
    content: raw.content,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }, stocks);
}

function apiCommentToNoteComment(raw: ResearchComment): NoteComment {
  const author = raw.author;
  return {
    id: String(raw.id),
    noteId: String(raw.note_id),
    userId: String(raw.user_id),
    parentId: raw.parent_id === null || raw.parent_id === undefined ? null : String(raw.parent_id),
    replyToUserId: raw.reply_to_user_id === null || raw.reply_to_user_id === undefined ? null : String(raw.reply_to_user_id),
    replyToAuthor: raw.reply_to_author ? {
      id: String(raw.reply_to_author.id),
      nickname: raw.reply_to_author.nickname,
      avatarUrl: raw.reply_to_author.avatar_url || undefined,
    } : null,
    content: String(raw.content || ""),
    quoteText: raw.quote_text ? String(raw.quote_text) : undefined,
    quotePrefix: raw.quote_prefix ? String(raw.quote_prefix) : undefined,
    quoteSuffix: raw.quote_suffix ? String(raw.quote_suffix) : undefined,
    startOffset: raw.start_offset === null || raw.start_offset === undefined ? undefined : Number(raw.start_offset),
    endOffset: raw.end_offset === null || raw.end_offset === undefined ? undefined : Number(raw.end_offset),
    blockId: raw.block_id ? String(raw.block_id) : undefined,
    anchorStatus: raw.anchor_status ? String(raw.anchor_status) : undefined,
    reactions: raw.reactions,
    createdAt: String(raw.created_at || new Date().toISOString()),
    author: {
      id: String(author.id),
      nickname: author.nickname,
      avatarUrl: author.avatar_url || undefined,
    },
  };
}

function noteToApi(note: WatchNote, stocks: WatchStock[]): ResearchWrite {
  return {
    title: note.title,
    content: note.content,
    format: note.format || "markdown",
    visibility: "private" as const,
    kind: note.kind || "quick",
    status: note.status || "active",
    confidence: note.confidence ?? null,
    next_review_at: note.nextReviewAt || null,
    starred: note.starred === true,
    cover_image_url: note.coverImageUrl || null,
    cover_color: note.coverColor || null,
    allow_comments: note.allowComments !== false,
    stock_symbols: (note.stockIds || []).map((id) => stocks.find((stock) => stock.id === id)?.symbol).filter((symbol): symbol is string => Boolean(symbol)),
    links: [
      ...(note.links || []).filter((link) => link.entityType !== "watch_stock").map((link) => ({ entity_type: link.entityType, entity_id: link.entityId })),
      ...(note.stockIds || []).map(Number).filter(Number.isFinite).map((entityId) => ({ entity_type: "watch_stock" as const, entity_id: entityId })),
    ],
    knowledge_tags: note.knowledgeTags || [],
    tags: note.tags || [],
    series: note.series || null,
    series_id: note.seriesId ? Number(note.seriesId) : null,
    created_at: note.createdAt,
  };
}

function fmtShortDate(value: string, locale = "en-US") {
  if (!value) return "";
  return new Date(value).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function fmtDate(value: string, locale = "en-US") {
  if (!value) return "";
  return new Date(value).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(value: string, locale = "en-US") {
  if (!value) return "";
  return new Date(value).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtRelativeDate(value: string, t: (key: string, vars?: { days?: number | string; date?: string }) => string, locale = "en-US") {
  if (!value) return "";
  const date = new Date(value);
  const elapsed = Date.now() - date.getTime();
  if (Number.isNaN(elapsed)) return "";
  const days = Math.floor(elapsed / 86_400_000);
  if (days <= 0) return t("research.today");
  if (days === 1) return t("research.yesterday");
  if (days < 30) return t("research.daysAgo", { days });
  return t("research.updatedDate", { date: fmtShortDate(value, locale) });
}

function reviewLabel(value: string | null | undefined, t: (key: string, vars?: { days?: number | string; date?: string }) => string, locale = "en-US") {
  if (!value) return t("research.reviewUnset");
  const reviewAt = new Date(value);
  const today = new Date();
  const days = Math.ceil((reviewAt.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return t("research.overdue", { days: Math.abs(days) });
  if (days === 0) return t("research.reviewToday");
  if (days === 1) return t("research.reviewTomorrow");
  if (days <= 14) return t("research.reviewInDays", { days });
  return t("research.reviewDate", { date: fmtShortDate(value, locale) });
}

function NoteManagementFields({
  note,
  onUpdate,
  seriesSuggestions = [],
  stocks = [],
}: {
  note: WatchNote;
  onUpdate: (patch: Partial<WatchNote>) => void;
  seriesSuggestions?: NoteSeriesOption[];
  stocks?: WatchStock[];
}) {
  const { t } = useI18n();
  const [tagInput, setTagInput] = useState("");
  const [stocksExpanded, setStocksExpanded] = useState(false);
  const [stockQuery, setStockQuery] = useState("");
  const stockOptionsId = useId();
  const tags = note.tags || [];
  const linkedStockIds = note.stockIds || [];
  const linkedStockIdSet = new Set(linkedStockIds);
  const selectedStocks = stocks.filter((stock) => linkedStockIdSet.has(stock.id));
  const normalizedStockQuery = stockQuery.trim().toLocaleLowerCase();
  const filteredStocks = stocks
    .filter((stock) => `${stock.symbol} ${stock.name}`.toLocaleLowerCase().includes(normalizedStockQuery))
    .sort((left, right) => {
      const selectedOrder = Number(linkedStockIdSet.has(right.id)) - Number(linkedStockIdSet.has(left.id));
      return selectedOrder || left.symbol.localeCompare(right.symbol);
    });
  const toggleStocksExpanded = () => {
    if (stocksExpanded) setStockQuery("");
    setStocksExpanded(!stocksExpanded);
  };
  const addTag = () => {
    const additions = uniqueValues(tagInput.split(/[，,]/));
    if (!additions.length) return;
    onUpdate({ tags: uniqueValues([...tags, ...additions]).slice(0, 12) });
    setTagInput("");
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-muted">
        {t("research.type")}
        <select value={note.kind || "quick"} onChange={(event) => onUpdate({ kind: event.target.value as ResearchKind })} className="mt-1.5 w-full rounded-md border border-themed bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)]">
          <option value="quick">{t("research.kindQuick")}</option><option value="company">{t("research.kindCompany")}</option><option value="thesis">{t("research.kindThesis")}</option><option value="decision">{t("research.kindDecision")}</option><option value="review">{t("research.kindReview")}</option>
        </select>
      </label>
      <section className="overflow-hidden rounded-lg border border-themed bg-surface sm:col-span-2" aria-labelledby={`${stockOptionsId}-label`}>
        <button
          type="button"
          onClick={toggleStocksExpanded}
          aria-label={t(stocksExpanded ? "research.collapseLinkedStocks" : "research.expandLinkedStocks")}
          aria-expanded={stocksExpanded}
          aria-controls={stockOptionsId}
          className="flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-input/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] sm:px-4"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span id={`${stockOptionsId}-label`} className="text-xs font-medium text-secondary">{t("research.linkedStocks")}</span>
              <span className="rounded-full bg-input px-2 py-0.5 text-[11px] tabular-nums text-muted">{t("research.linkedStocksSelected", { count: selectedStocks.length })}</span>
            </span>
            <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
              {selectedStocks.length ? <>
                {selectedStocks.slice(0, 4).map((stock) => <span key={stock.id} className="max-w-28 truncate rounded bg-[var(--accent-bg)] px-1.5 py-0.5 text-[11px] font-medium text-accent">${stock.symbol}</span>)}
                {selectedStocks.length > 4 && <span className="text-[11px] text-muted">+{selectedStocks.length - 4}</span>}
              </> : <span className="text-xs text-muted">{t("research.noLinkedStocksSelected")}</span>}
            </span>
          </span>
          <span aria-hidden="true" className={`shrink-0 text-base text-muted transition-transform ${stocksExpanded ? "rotate-180" : ""}`}>⌄</span>
        </button>

        {stocksExpanded && <div id={stockOptionsId} className="border-t border-themed bg-input/35 p-3 sm:p-4">
          <input
            type="search"
            value={stockQuery}
            onChange={(event) => setStockQuery(event.target.value)}
            autoComplete="off"
            aria-label={t("research.searchLinkedStocks")}
            placeholder={t("research.searchLinkedStocks")}
            className="w-full rounded-md border border-themed bg-surface px-3 py-2.5 text-sm text-primary outline-none placeholder:text-muted focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-bg)]"
          />
          {filteredStocks.length ? <div className="mt-3 grid max-h-64 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2" role="group" aria-label={t("research.linkedStockResults")}>
            {filteredStocks.map((stock) => {
              const linked = linkedStockIdSet.has(stock.id);
              return <button
                key={stock.id}
                type="button"
                aria-pressed={linked}
                aria-label={t("research.toggleLinkedStock", { symbol: stock.symbol })}
                onClick={() => onUpdate({ stockIds: linked ? linkedStockIds.filter((id) => id !== stock.id) : [...linkedStockIds, stock.id] })}
                className={`flex min-h-11 min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${linked ? "border-[var(--accent)] bg-[var(--accent-bg)] text-accent" : "border-themed bg-surface text-secondary hover:border-[var(--accent)] hover:text-primary"}`}
              >
                <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${linked ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-themed bg-input"}`}>{linked ? "✓" : ""}</span>
                <span className="shrink-0 font-semibold">${stock.symbol}</span>
                <span className="min-w-0 truncate text-muted" title={stock.name}>{stock.name}</span>
              </button>;
            })}
          </div> : <p className="px-1 py-8 text-center text-xs text-muted">{stocks.length ? t("research.noLinkedStockMatches") : t("research.noLinkedStocks")}</p>}
        </div>}
      </section>
      <label className="text-xs text-muted">
        {t("research.status")}
        <select value={note.status || "active"} onChange={(event) => onUpdate({ status: event.target.value as ResearchStatus })} className="mt-1.5 w-full rounded-md border border-themed bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)]">
          <option value="draft">{t("research.statusDraft")}</option><option value="active">{t("research.statusActive")}</option><option value="validated">{t("research.statusValidated")}</option><option value="invalidated">{t("research.statusInvalidated")}</option><option value="archived">{t("research.statusArchived")}</option>
        </select>
      </label>
      <label className="text-xs text-muted">
        {t("research.topic")}
        <select
          value={note.seriesId || ""}
          onChange={(event) => {
            const selected = seriesSuggestions.find((series) => series.id === event.target.value);
            onUpdate({ seriesId: selected?.id, series: selected?.name });
          }}
          className="mt-1.5 w-full rounded-md border border-themed bg-surface px-3 py-2 text-sm text-primary outline-none placeholder:text-muted focus:border-[var(--accent)]"
        >
          <option value="">{t("research.noTopic")}</option>
          {seriesSuggestions.map((series) => <option key={series.id} value={series.id}>{series.name}</option>)}
        </select>
        <Link href="/research/topics" className="mt-1.5 inline-block text-[10px] text-accent hover:underline">{t("research.manageTopics")}</Link>
      </label>
      <label className="text-xs text-muted">
        {t("research.createdAt")}
        <input
          data-research-created-at="true"
          type="datetime-local"
          value={toDateTimeLocal(note.createdAt)}
          onChange={(event) => onUpdate({ createdAt: fromDateTimeLocal(event.target.value) })}
          className="mt-1.5 w-full rounded-md border border-themed bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)]"
        />
      </label>
      <label className="text-xs text-muted">
        {t("research.nextReview")}
        <input type="datetime-local" value={note.nextReviewAt ? toDateTimeLocal(note.nextReviewAt) : ""} onChange={(event) => onUpdate({ nextReviewAt: event.target.value ? fromDateTimeLocal(event.target.value) : null })} className="mt-1.5 w-full rounded-md border border-themed bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)]" />
      </label>
      <label className="text-xs text-muted">
        {t("research.confidence")}
        <select value={note.confidence ?? ""} onChange={(event) => onUpdate({ confidence: event.target.value ? Number(event.target.value) : null })} className="mt-1.5 w-full rounded-md border border-themed bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)]">
          <option value="">{t("research.notSet")}</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}
        </select>
      </label>
      <div className="sm:col-span-2">
        <span className="text-xs text-muted">{t("research.cover")}</span>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input value={note.coverImageUrl || ""} onChange={(event) => onUpdate({ coverImageUrl: event.target.value || null })} placeholder={t("research.coverPlaceholder")} className="rounded-md border border-themed bg-surface px-3 py-2 text-sm text-primary outline-none placeholder:text-muted focus:border-[var(--accent)]" />
          <div className="flex items-center gap-1.5 rounded-md border border-themed bg-surface px-2" aria-label={t("research.coverColorAria")}>
            {["#DCE7F5", "#E6DDF4", "#D7ECE7", "#F3DDE2", "#E8E3D1"].map((color) => <button key={color} type="button" onClick={() => onUpdate({ coverImageUrl: null, coverColor: color })} className="h-6 w-6 rounded-full border-2" style={{ backgroundColor: color, borderColor: note.coverColor === color ? "var(--accent)" : "transparent" }} aria-label={t("research.chooseColor", { color })} />)}
          </div>
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="text-xs text-muted" htmlFor="note-tag-input">{t("research.tags")}</label>
        <div className="mt-1.5 flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-themed bg-surface px-2 py-1.5 focus-within:border-[var(--accent)]">
          {tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-md bg-[var(--accent-bg)] px-2 py-1 text-xs text-accent">
              #{tag}
              <button type="button" onClick={() => onUpdate({ tags: tags.filter((item) => item !== tag) })} className="text-muted transition hover:text-primary" aria-label={t("research.removeTag", { tag })}>×</button>
            </span>
          ))}
          <input
            id="note-tag-input"
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onBlur={addTag}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === "," || event.key === "，") && !event.nativeEvent.isComposing) {
                event.preventDefault();
                addTag();
              }
            }}
            disabled={tags.length >= 12}
            placeholder={tags.length ? t("research.addMoreTags") : t("research.addTagPlaceholder")}
            className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm text-primary outline-none placeholder:text-muted disabled:cursor-not-allowed"
          />
        </div>
        <p className="mt-1 text-[10px] text-muted">{t("research.tagHint")}</p>
      </div>
    </div>
  );
}

function readingMinutes(text: string) {
  const compact = text.replace(/\s+/g, "");
  return Math.max(1, Math.ceil(compact.length / 450));
}

function firstNoteImage(note: WatchNote) {
  const match = note.format === "rich"
    ? note.content.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)
    : note.content.match(/!\[[^\]]*]\(([^)]+)\)/);
  const src = match?.[1] || "";
  return isSafeImageSrc(src) ? src : "";
}

function noteCoverStyle(note: Pick<WatchNote, "id" | "title" | "coverColor">) {
  const hex = note.coverColor?.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) return { backgroundColor: "var(--surface-alt)", color: "var(--text-primary)" };
  // Relative luminance keeps saved custom colors legible in either theme.
  const linear = [0, 2, 4].map(offset => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  const luminance = .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  return { backgroundColor: `#${hex}`, color: luminance > .179 ? "#000000" : "#ffffff" };
}

export default function NotesPage() {
  return <ResearchPage />;
}

export function ResearchPage({ initialNoteId }: { initialNoteId?: string } = {}) {
  return <AuthGuard><NotesContent initialNoteId={initialNoteId} /></AuthGuard>;
}

export function NewNotePage() {
  return <AuthGuard><NewNoteContent /></AuthGuard>;
}

function NewNoteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [stocks, setStocks] = useState<WatchStock[]>([]);
  const [seriesOptions, setSeriesOptions] = useState<NoteSeriesOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<WatchNote>(() => {
    const now = new Date().toISOString();
    const transactionId = Number(searchParams.get("transaction"));
    const assetId = Number(searchParams.get("asset"));
    const planId = Number(searchParams.get("trade_plan"));
    const links: WatchNote["links"] = [];
    if (Number.isFinite(transactionId) && transactionId > 0) links.push({ entityType: "transaction", entityId: transactionId });
    if (Number.isFinite(assetId) && assetId > 0) links.push({ entityType: "asset", entityId: assetId });
    if (Number.isFinite(planId) && planId > 0) links.push({ entityType: "trade_plan", entityId: planId });
    return {
      id: "new",
      title: "",
      format: "rich",
      visibility: "private",
      kind: links.some((link) => link.entityType === "transaction") ? "review" : "quick",
      status: "active",
      confidence: null,
      nextReviewAt: null,
      starred: false,
      links,
      allowComments: true,
      content: "",
      stockIds: [],
      knowledgeTags: [],
      tags: [],
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listWatchStocks(), api.listNoteSeries()])
      .then(([stockRows, seriesRows]) => {
        if (!cancelled) {
          setStocks(stockRows.map(apiStockToWatchStock));
          setSeriesOptions(seriesRows.map((series) => ({ id: String(series.id), name: String(series.name) })));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const updateDraft = useCallback((patch: Partial<WatchNote>) => {
    setDraft((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  }, []);

  const saveNote = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const normalized = normalizeNote({ ...draft, title: draft.title.trim() || t("research.untitled") }, stocks);
      const created = await api.createNote(noteToApi(normalized, stocks));
      router.push(`/research/${encodeURIComponent(String(created.id))}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("research.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <Link href="/research" className="mb-3 inline-flex min-h-8 items-center text-xs text-muted transition hover:text-accent">← {t("research.backLibrary")}</Link>
          <h1 className="page-title">{t("research.newTitle")}</h1>
          <p className="page-description">{t("research.newDescription")}</p>
        </div>
        <div className="page-actions">
          <select
            value={draft.kind || "quick"}
            onChange={(event) => updateDraft({ kind: event.target.value as ResearchKind })}
            className="rounded-lg border border-themed bg-input px-3 py-2 text-sm text-secondary outline-none focus:border-[var(--accent)]"
          >
            <option value="quick">{researchKindLabel("quick", t)}</option>
            <option value="company">{researchKindLabel("company", t)}</option>
            <option value="thesis">{researchKindLabel("thesis", t)}</option>
            <option value="decision">{researchKindLabel("decision", t)}</option>
            <option value="review">{researchKindLabel("review", t)}</option>
          </select>
          <button type="button" onClick={() => router.push("/research")} className="ui-button">{t("research.cancel")}</button>
          <button type="button" onClick={() => void saveNote()} disabled={saving} className="ui-button ui-button--primary disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? t("research.saving") : t("research.save")}
          </button>
        </div>
      </header>

      {error && <div className="inline-notice inline-notice--danger">{error}</div>}

      <section className="overflow-hidden rounded-[var(--radius-xl)] border border-themed bg-surface">
        <div className="border-b border-themed px-4 py-4 sm:px-6">
          <input
            value={draft.title}
            onChange={(event) => updateDraft({ title: event.target.value })}
            placeholder={t("research.titlePlaceholder")}
            className="w-full bg-transparent text-2xl font-bold leading-9 text-primary outline-none placeholder:text-muted"
          />
        </div>
        <div className="border-b border-themed bg-input/40 px-4 py-4 sm:px-6">
          <NoteManagementFields note={draft} onUpdate={updateDraft} seriesSuggestions={seriesOptions} stocks={stocks} />
        </div>
        <NoteEditor note={draft} stocks={stocks} allowedTags={allowedKnowledgeTags(stocks)} onUpdate={updateDraft} />
      </section>
    </div>
  );
}

function ResearchFilterPanel({
  scope,
  scopeItems,
  activeSeries,
  activeTag,
  seriesCounts,
  tagCounts,
  favoriteSeries,
  seriesOptions,
  query,
  onScopeChange,
  onSeriesChange,
  onTagChange,
  onClear,
}: {
  scope: NoteScope;
  scopeItems: { key: NoteScope; count: number }[];
  activeSeries: string | null;
  activeTag: string | null;
  seriesCounts: [string, number][];
  tagCounts: [string, number][];
  favoriteSeries: string[];
  seriesOptions: NoteSeriesOption[];
  query: string;
  onScopeChange: (scope: NoteScope) => void;
  onSeriesChange: (series: string | null) => void;
  onTagChange: (tag: string | null) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const filtered = Boolean(activeTag || activeSeries || scope !== "all" || query);
  return (
    <section className="research-filter-panel" aria-label={t("research.filterAria")}>
      <div className="research-filter-panel__row">
        <span className="research-filter-panel__label">{t("research.status")}</span>
        <div className="research-filter-tabs" role="group" aria-label={t("research.filterStatusAria")}>
          {scopeItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onScopeChange(item.key)}
              className={`research-filter-chip${scope === item.key ? " is-active" : ""}`}
              aria-pressed={scope === item.key}
            >
              <span>{scopeLabel(item.key, t)}</span>
              <strong>{item.count}</strong>
            </button>
          ))}
        </div>
        {filtered && (
          <button type="button" onClick={onClear} className="research-filter-clear">
            {t("research.clearFilters")}
          </button>
        )}
      </div>

      {seriesCounts.length > 0 && (
        <div className="research-filter-panel__row">
          <span className="research-filter-panel__label">{t("research.filterTopic")}</span>
          <div className="research-filter-tabs">
            {seriesCounts.map(([series, count]) => {
              const favorite = favoriteSeries.includes(seriesFavoriteKeyForName(series, seriesOptions));
              return (
                <button
                  key={series}
                  type="button"
                  onClick={() => onSeriesChange(activeSeries === series ? null : series)}
                  className={`research-filter-chip research-filter-chip--topic${activeSeries === series ? " is-active" : ""}`}
                  aria-pressed={activeSeries === series}
                >
                  {favorite && <span aria-hidden="true">★</span>}
                  <span>{series}</span>
                  <strong>{count}</strong>
                </button>
              );
            })}
          </div>
          <Link href="/research/topics" className="research-filter-manage">{t("research.manageTopic")} <span aria-hidden="true">→</span></Link>
        </div>
      )}

      {tagCounts.length > 0 && (
        <div className="research-filter-panel__row">
          <span className="research-filter-panel__label">{t("research.filterTag")}</span>
          <div className="research-filter-tabs">
            {tagCounts.slice(0, 20).map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                onClick={() => onTagChange(activeTag === tag ? null : tag)}
                className={`research-filter-chip research-filter-chip--tag${activeTag === tag ? " is-active" : ""}`}
                aria-pressed={activeTag === tag}
              >
                <span>#{tag}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ResearchLibrarySkeleton({ view }: { view: NotesStyle }) {
  const { t } = useI18n();
  if (view === "reading") {
    return (
      <div className="research-reading-list" aria-label={t("research.loading")}>
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="research-reading-skeleton">
            <span className="skeleton-block h-5 w-2/5" />
            <span className="skeleton-block mt-4 h-3 w-full" />
            <span className="skeleton-block mt-2 h-3 w-3/4" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="research-card-grid" aria-label={t("research.loading")}>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="research-card-skeleton">
          <span className="skeleton-block block h-[210px] rounded-none" />
          <div className="p-4">
            <span className="skeleton-block block h-4 w-4/5" />
            <span className="skeleton-block mt-3 block h-3 w-full" />
            <span className="skeleton-block mt-2 block h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NotesContent({ initialNoteId }: { initialNoteId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [styleMode, setStyleMode] = useState<NotesStyle>(() => {
    const requested = searchParams.get("view");
    if (requested === "reading" || requested === "cards") return requested;
    const saved = loadLocal<string | null>(NOTE_STYLE_KEY, null);
    if (saved === "reading") return "reading";
    if (saved === "cards") return "cards";
    return "cards";
  });
  const [sortMode, setSortMode] = useState<NotesSort>(() => {
    const requested = searchParams.get("sort");
    return requested === "created" || requested === "review_due" ? requested : "latest";
  });
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [scope, setScope] = useState<NoteScope>(() => {
    const requested = searchParams.get("scope") as NoteScope | null;
    return requested && ["all", "favorites", "due", "active", "archived", "linked", "unlinked"].includes(requested) ? requested : "all";
  });
  const [activeTag, setActiveTag] = useState<string | null>(() => searchParams.get("tag"));
  const [activeSeries, setActiveSeries] = useState<string | null>(() => searchParams.get("topic") || searchParams.get("series"));
  const [favoriteNoteIds, setFavoriteNoteIds] = useState<string[]>([]);
  const [favoriteSeries, setFavoriteSeries] = useState<string[]>([]);
  const [seriesOptions, setSeriesOptions] = useState<NoteSeriesOption[]>([]);
  const [stocks, setStocks] = useState<WatchStock[]>([]);
  const [notes, setNotes] = useState<WatchNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [backendMsg, setBackendMsg] = useState("");
  const [comments, setComments] = useState<Record<string, NoteComment[]>>({});
  const [commentDraft, setCommentDraft] = useState("");
  const routeSelectionRef = useRef<string | null>(null);
  const currentUserId = getCurrentUserId();

  useEffect(() => {
    localStorage.setItem(NOTE_STYLE_KEY, JSON.stringify(styleMode));
  }, [styleMode]);

  useEffect(() => {
    if (initialNoteId) return;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (scope !== "all") params.set("scope", scope);
    if (sortMode !== "latest") params.set("sort", sortMode);
    if (styleMode !== "cards") params.set("view", styleMode);
    if (activeTag) params.set("tag", activeTag);
    if (activeSeries) params.set("topic", activeSeries);
    const target = `/research${params.size ? `?${params.toString()}` : ""}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== target) router.replace(target, { scroll: false });
  }, [activeSeries, activeTag, initialNoteId, query, router, scope, sortMode, styleMode]);

  useEffect(() => {
    let cancelled = false;
    const loadBackend = async () => {
      try {
        setBackendMsg("");
        const backendStocks = (await api.listWatchStocks()).map(apiStockToWatchStock);
        const backendNotes = await api.listNotes();
        const favorites = await api.listNoteFavorites().catch(() => ({ note_ids: [], series: [] }));
        const seriesRows = await api.listNoteSeries().catch(() => []);
        if (cancelled) return;
        setStocks(backendStocks);
        setFavoriteNoteIds(favorites.note_ids.map(String));
        setFavoriteSeries(favorites.series.map(String));
        setSeriesOptions(seriesRows.map((series) => ({ id: String(series.id), name: String(series.name) })));
        const mapped = backendNotes.map((row) => apiNoteToWatchNote(row, backendStocks));
        setNotes(mapped);
      } catch (error) {
        if (!cancelled) setBackendMsg(error instanceof Error ? error.message : t("research.loadFailed"));
      } finally {
        if (!cancelled) setNotesLoading(false);
      }
    };
    void loadBackend();
    return () => { cancelled = true; };
  }, [t]);

  useEffect(() => {
    const noteId = initialNoteId || searchParams.get("note");
    if (!noteId) {
      routeSelectionRef.current = null;
      return;
    }
    if (!notes.some((note) => note.id === noteId)) return;
    const isNewRouteSelection = routeSelectionRef.current !== noteId;
    routeSelectionRef.current = noteId;
    const timer = window.setTimeout(() => {
      setActiveId(noteId);
      // Selecting the same route again can happen when an auto-save refreshes
      // the notes collection. Keep the active editor open in that case. When
      // navigating to a different research item, leave its edit session.
      if (isNewRouteSelection) {
        setEditingId((current) => current === noteId ? current : null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialNoteId, searchParams, notes]);

  useEffect(() => {
    const series = searchParams.get("series")?.trim();
    if (!series) return;
    const timer = window.setTimeout(() => {
      setActiveSeries(series);
      setActiveId(null);
      setEditingId(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  const stockMap = useMemo(() => new Map(stocks.map((stock) => [stock.id, stock])), [stocks]);
  const requestedNoteId = initialNoteId || searchParams.get("note");
  const activeNote = notes.find((note) => note.id === (activeId || requestedNoteId)) || null;
  const isEditing = !!activeNote && editingId === activeNote.id;
  useEffect(() => {
    if (isEditing) document.body.dataset.researchEditing = "true";
    else delete document.body.dataset.researchEditing;
    return () => { delete document.body.dataset.researchEditing; };
  }, [isEditing]);
  const persistResearch = useCallback(async (note: WatchNote) => {
    await api.updateNote(note.id, noteToApi(note, stocks));
  }, [stocks]);
  const reportSaveError = useCallback((error: unknown) => {
    setBackendMsg(error instanceof Error ? error.message : t("research.saveFailed"));
  }, [t]);
  const researchSave = useResearchAutoSave<WatchNote>({
    documentKey: isEditing ? activeNote.id : null,
    delayMs: 650,
    persist: persistResearch,
    onError: reportSaveError,
  });
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const note of notes) {
      for (const tag of note.tags || []) {
        map.set(tag, (map.get(tag) || 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [notes]);
  const seriesCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const note of notes) {
      if (note.series) map.set(note.series, (map.get(note.series) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => {
      const favoriteOrder = Number(favoriteSeries.includes(seriesFavoriteKeyForName(b[0], seriesOptions)))
        - Number(favoriteSeries.includes(seriesFavoriteKeyForName(a[0], seriesOptions)));
      return favoriteOrder || b[1] - a[1] || a[0].localeCompare(b[0]);
    });
  }, [notes, favoriteSeries, seriesOptions]);
  const seriesSuggestions = seriesOptions;
  const linkedCount = notes.filter((note) => (note.stockIds || []).length > 0).length;
  const scopeItems: { key: NoteScope; count: number }[] = [
    { key: "all", count: notes.length },
    { key: "favorites", count: notes.filter((note) => favoriteNoteIds.includes(note.id)).length },
    { key: "active", count: notes.filter((note) => (note.status || "active") === "active").length },
    { key: "due", count: notes.filter((note) => note.nextReviewAt && new Date(note.nextReviewAt) <= new Date()).length },
    { key: "archived", count: notes.filter((note) => note.status === "archived").length },
    { key: "linked", count: linkedCount },
    { key: "unlinked", count: notes.length - linkedCount },
  ];
  const todayCount = notes.filter((note) => new Date(note.updatedAt).toDateString() === new Date().toDateString()).length;
  const updateNote = (id: string, patch: Partial<WatchNote>) => {
    const current = notes.find((note) => note.id === id);
    if (!current) return;
    const nextNote = normalizeNote({ ...current, ...patch, updatedAt: new Date().toISOString() }, stocks);
    setNotes((previous) => previous.map((note) => note.id === id ? nextNote : note));
    researchSave.schedule(nextNote);
  };

  const toggleNoteFavorite = (id: string) => {
    const wasFavorite = favoriteNoteIds.includes(id);
    setFavoriteNoteIds((current) => wasFavorite ? current.filter((item) => item !== id) : [...current, id]);
    const request = wasFavorite ? api.unfavoriteNote(id) : api.favoriteNote(id);
    setNotes((current) => current.map((note) => note.id === id ? { ...note, starred: !wasFavorite } : note));
    void request
      .then(() => undefined)
      .catch((error) => {
        setFavoriteNoteIds((current) => wasFavorite ? [...new Set([...current, id])] : current.filter((item) => item !== id));
        setNotes((current) => current.map((note) => note.id === id ? { ...note, starred: wasFavorite } : note));
        setBackendMsg(error instanceof Error ? error.message : t("research.starSaveFailed"));
      });
  };

  const toggleSeriesFavorite = (series: string) => {
    const wasFavorite = favoriteSeries.includes(series);
    setFavoriteSeries((current) => wasFavorite ? current.filter((item) => item !== series) : [...current, series]);
    const request = wasFavorite ? api.unfavoriteNoteSeries(series) : api.favoriteNoteSeries(series);
    void request.catch((error) => {
      setFavoriteSeries((current) => wasFavorite ? [...new Set([...current, series])] : current.filter((item) => item !== series));
      setBackendMsg(error instanceof Error ? error.message : t("research.topicStarSaveFailed"));
    });
  };

  const deleteNote = (id: string) => {
    setNotes((prev) => prev.filter((note) => note.id !== id));
    setFavoriteNoteIds((prev) => prev.filter((noteId) => noteId !== id));
    if (activeId === id) {
      setActiveId(null);
      setEditingId(null);
    }
    void api.deleteNote(id).catch((error) => {
      setBackendMsg(error instanceof Error ? error.message : t("research.deleteFailed"));
    });
  };

  const loadNoteComments = useCallback(async (noteId: string) => {
    if (comments[noteId]) return;
    try {
      const rows = await api.listNoteComments(noteId);
      setComments((prev) => ({ ...prev, [noteId]: rows.map(apiCommentToNoteComment) }));
    } catch (error) {
      setBackendMsg(error instanceof Error ? error.message : t("research.commentsLoadFailed"));
    }
  }, [comments, t]);

  const submitComment = async (noteId: string, parentId?: string | null, anchor?: QuoteAnchor, contentOverride?: string) => {
    const content = (contentOverride ?? commentDraft).trim();
    if (!content) return false;
    try {
      const created = apiCommentToNoteComment(await api.createNoteComment(noteId, content, parentId, anchor));
      setComments((prev) => ({ ...prev, [noteId]: [...(prev[noteId] || []), created] }));
      setNotes((prev) => prev.map((note) => note.id === noteId ? { ...note, commentCount: (note.commentCount || 0) + 1 } : note));
      if (contentOverride === undefined) setCommentDraft("");
      return true;
    } catch (error) {
      setBackendMsg(error instanceof Error ? error.message : t("research.commentSendFailed"));
      return false;
    }
  };

  const toggleCommentReaction = (noteId: string, commentId: string, emoji: string) => {
    const currentComment = (comments[noteId] || []).find((comment) => comment.id === commentId);
    if (!currentComment) return;
    const existing = currentComment.reactions.find((reaction) => reaction.emoji === emoji);
    const wasReacted = !!existing?.reacted;
    const optimistic = existing
      ? currentComment.reactions
          .map((reaction) => reaction.emoji === emoji ? { ...reaction, count: Math.max(0, reaction.count + (wasReacted ? -1 : 1)), reacted: !wasReacted } : reaction)
          .filter((reaction) => reaction.count > 0)
      : [...currentComment.reactions, { emoji, count: 1, reacted: true }];
    setComments((prev) => ({
      ...prev,
      [noteId]: (prev[noteId] || []).map((comment) => comment.id === commentId ? { ...comment, reactions: optimistic } : comment),
    }));
    const request = wasReacted ? api.removeNoteCommentReaction(commentId, emoji) : api.addNoteCommentReaction(commentId, emoji);
    void request
      .then((rows) => {
        const reactions = rows.map((row) => ({ emoji: String(row.emoji || ""), count: Number(row.count || 0), reacted: Boolean(row.reacted) }));
        setComments((prev) => ({
          ...prev,
          [noteId]: (prev[noteId] || []).map((comment) => comment.id === commentId ? { ...comment, reactions } : comment),
        }));
      })
      .catch((error) => {
        setComments((prev) => ({
          ...prev,
          [noteId]: (prev[noteId] || []).map((comment) => comment.id === commentId ? { ...comment, reactions: currentComment.reactions } : comment),
        }));
        setBackendMsg(error instanceof Error ? error.message : t("research.reactionFailed"));
      });
  };

  const deleteComment = (noteId: string, commentId: string) => {
    const previous = comments[noteId] || [];
    // 根评论删除时后端会级联删除其回复，前端同步移除
    const removedIds = new Set(previous.filter((comment) => comment.id === commentId || comment.parentId === commentId).map((comment) => comment.id));
    if (!removedIds.size) return;
    const next = previous.filter((comment) => !removedIds.has(comment.id));
    setComments((prev) => ({ ...prev, [noteId]: next }));
    setNotes((prev) => prev.map((note) => note.id === noteId ? { ...note, commentCount: Math.max(0, (note.commentCount || 0) - removedIds.size) } : note));
    void api.deleteNoteComment(commentId)
      .catch((error) => {
        setComments((prev) => ({ ...prev, [noteId]: previous }));
        setNotes((prev) => prev.map((note) => note.id === noteId ? { ...note, commentCount: (note.commentCount || 0) + removedIds.size } : note));
        setBackendMsg(error instanceof Error ? error.message : t("research.commentDeleteFailed"));
      });
  };

  useEffect(() => {
    const commentNote = activeNote;
    if (!commentNote || editingId === commentNote.id || comments[commentNote.id]) return;
    const noteId = commentNote.id;
    const timer = window.setTimeout(() => void loadNoteComments(noteId), 0);
    return () => window.clearTimeout(timer);
  }, [activeNote, editingId, comments, loadNoteComments]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return notes
      .map((note) => ({
        note,
        stocks: (note.stockIds || []).map((id) => stockMap.get(id)).filter(Boolean) as WatchStock[],
        plain: stripContent(note.content, note.format),
      }))
      .filter(({ note, stocks: linkedStocks, plain }) => {
        if (scope === "linked" && linkedStocks.length === 0) return false;
        if (scope === "unlinked" && linkedStocks.length > 0) return false;
        if (scope === "favorites" && !favoriteNoteIds.includes(note.id)) return false;
        if (scope === "active" && (note.status || "active") !== "active") return false;
        if (scope === "archived" && note.status !== "archived") return false;
        if (scope === "due" && (!note.nextReviewAt || new Date(note.nextReviewAt) > new Date())) return false;
        if (activeTag && !(note.tags || []).includes(activeTag)) return false;
        if (activeSeries && note.series !== activeSeries) return false;
        if (!q) return true;
        return `${note.title} ${plain} ${note.series || ""} ${(note.tags || []).join(" ")} ${(note.knowledgeTags || []).join(" ")} ${linkedStocks.map((s) => `${s.symbol} ${s.name}`).join(" ")}`.toUpperCase().includes(q);
      })
      .sort((a, b) => sortMode === "created"
        ? (b.note.createdAt || "").localeCompare(a.note.createdAt || "")
        : sortMode === "review_due"
          ? (a.note.nextReviewAt || "9999").localeCompare(b.note.nextReviewAt || "9999")
          : (b.note.updatedAt || "").localeCompare(a.note.updatedAt || ""));
  }, [notes, query, stockMap, scope, activeTag, activeSeries, sortMode, favoriteNoteIds]);
  const detailOpen = !!activeNote;
  const detailPending = Boolean(requestedNoteId && notesLoading);

  useEffect(() => {
    if (!detailOpen) return;
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    const frame = window.requestAnimationFrame(() => {
      root.style.scrollBehavior = previousBehavior;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [detailOpen, activeId]);

  useEffect(() => {
    if (detailOpen || notesLoading) return;
    const saved = Number(sessionStorage.getItem(RESEARCH_SCROLL_KEY) || 0);
    if (!saved) return;
    sessionStorage.removeItem(RESEARCH_SCROLL_KEY);
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: "auto" }));
    return () => window.cancelAnimationFrame(frame);
  }, [detailOpen, notesLoading]);

  useEffect(() => {
    if (!isEditing || !["dirty", "saving", "failed"].includes(researchSave.state)) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isEditing, researchSave.state]);

  const openResearch = (noteId: string, edit = false) => {
    sessionStorage.setItem(RESEARCH_RETURN_KEY, `${window.location.pathname}${window.location.search}`);
    sessionStorage.setItem(RESEARCH_SCROLL_KEY, String(window.scrollY));
    if (edit) {
      setActiveId(noteId);
      setEditingId(noteId);
    }
    router.push(`/research/${encodeURIComponent(noteId)}`);
  };

  const returnToLibrary = () => {
    const target = sessionStorage.getItem(RESEARCH_RETURN_KEY) || "/research";
    sessionStorage.removeItem(RESEARCH_RETURN_KEY);
    setActiveId(null);
    setEditingId(null);
    router.push(target);
  };

  return (
    <div className={detailOpen || requestedNoteId ? "research-detail-page" : "page-shell page-shell--wide research-library-page"}>
      {backendMsg && <div className="inline-notice inline-notice--warning">{backendMsg}</div>}

      {detailPending ? (
        <div className="research-detail-loading" role="status" aria-label={t("research.loadingDetail")} aria-busy="true">
          <span className="skeleton-block research-detail-loading__bar" />
          <div className="research-detail-loading__document">
            <span className="skeleton-block research-detail-loading__eyebrow" />
            <span className="skeleton-block research-detail-loading__title" />
            <span className="skeleton-block research-detail-loading__meta" />
            <span className="skeleton-block research-detail-loading__line is-wide" />
            <span className="skeleton-block research-detail-loading__line" />
            <span className="skeleton-block research-detail-loading__line is-short" />
          </div>
        </div>
      ) : activeNote ? (
        <NoteDetail
          note={activeNote}
          stocks={(activeNote.stockIds || []).map((id) => stockMap.get(id)).filter(Boolean) as WatchStock[]}
          stockOptions={stocks}
          editing={isEditing}
          onBack={async () => {
            if (isEditing) {
              if (researchSave.state === "failed") return;
              const latest = notes.find((note) => note.id === activeNote.id) || activeNote;
              if (!await researchSave.flush(latest)) return;
            }
            returnToLibrary();
          }}
          onEdit={() => setEditingId(activeNote.id)}
          onDone={async () => {
            if (researchSave.state === "failed") return;
            const latest = notes.find((note) => note.id === activeNote.id) || activeNote;
            if (await researchSave.flush(latest)) setEditingId(null);
          }}
          saveState={researchSave.state}
          onRetrySave={() => { void researchSave.retry(); }}
          onDelete={() => deleteNote(activeNote.id)}
          onUpdate={(patch) => updateNote(activeNote.id, patch)}
          seriesSuggestions={seriesSuggestions}
          favorite={favoriteNoteIds.includes(activeNote.id)}
          onToggleFavorite={() => toggleNoteFavorite(activeNote.id)}
          seriesFavorite={favoriteSeries.includes(noteSeriesFavoriteKey(activeNote))}
          onToggleSeriesFavorite={activeNote.series ? () => toggleSeriesFavorite(noteSeriesFavoriteKey(activeNote)) : undefined}
          comments={comments[activeNote.id] || []}
          commentDraft={commentDraft}
          setCommentDraft={setCommentDraft}
          onSubmitComment={(parentId, anchor, content) => submitComment(activeNote.id, parentId, anchor, content)}
          onToggleReaction={(commentId, emoji) => toggleCommentReaction(activeNote.id, commentId, emoji)}
          onDeleteComment={(commentId) => deleteComment(activeNote.id, commentId)}
          currentUserId={currentUserId}
        />
      ) : requestedNoteId && !notesLoading ? (
        <div className="error-state">
          <span className="error-state__code" aria-hidden="true">?</span>
          <p className="error-state__eyebrow">{t("research.unavailable")}</p>
          <h1>{t("research.unavailable")}</h1>
          <p>{t("research.unavailableDescription")}</p>
          <button type="button" onClick={() => router.push("/research")} className="ui-button ui-button--primary">{t("research.backLibrary")}</button>
        </div>
      ) : (
        <>
          <header className="research-library-hero">
            <div className="research-library-hero__copy">
              <div className="research-private-pill"><span aria-hidden="true">●</span> {t("research.privateSpace")}</div>
              <h1 className="page-title">{t("research.libraryTitle")}</h1>
              <p className="research-library-hero__description">{t("research.libraryDescription")}</p>
              <p className="research-library-privacy">{t("research.privacy")}</p>
              <p className="research-library-summary">{t("research.summary", { count: notes.length, today: todayCount, linked: linkedCount })}</p>
            </div>

            <div className="research-library-actions">
              <label className="research-search">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" strokeLinecap="round" /></svg>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("research.searchPlaceholder")} aria-label={t("research.searchAria")} />
                {query && <button type="button" onClick={() => setQuery("")} aria-label={t("research.clearSearch")}>×</button>}
              </label>
              <Link href="/research/topics" className="ui-button research-topic-button">{t("research.topics")}</Link>
              <Link href="/research/guide" className="ui-button ui-button--secondary">公司研究室 →</Link>
              <Link href="/research/new" className="ui-button ui-button--primary research-create-button"><span aria-hidden="true">＋</span> {t("research.new")}</Link>
            </div>

          </header>

          <div className="research-command-bar">
            <div className="research-segmented" role="group" aria-label={t("research.sortAria")}>
              {([
                ["latest", t("research.sortLatest")],
                ["created", t("research.sortCreated")],
                ["review_due", t("research.sortDue")],
              ] as [NotesSort, string][]).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setSortMode(key)} className={sortMode === key ? "is-active" : ""} aria-pressed={sortMode === key}>{label}</button>
              ))}
            </div>
            <div className="research-segmented research-segmented--view" role="group" aria-label={t("research.viewAria")}>
              {([
                ["cards", t("research.cardsView")],
                ["reading", t("research.readingView")],
              ] as [NotesStyle, string][]).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setStyleMode(key)} className={styleMode === key ? "is-active" : ""} aria-pressed={styleMode === key}>{label}</button>
              ))}
            </div>
          </div>

          <ResearchFilterPanel
            scope={scope}
            scopeItems={scopeItems}
            activeSeries={activeSeries}
            activeTag={activeTag}
            seriesCounts={seriesCounts}
            tagCounts={tagCounts}
            favoriteSeries={favoriteSeries}
            seriesOptions={seriesOptions}
            query={query}
            onScopeChange={setScope}
            onSeriesChange={setActiveSeries}
            onTagChange={setActiveTag}
            onClear={() => { setScope("all"); setActiveTag(null); setActiveSeries(null); setQuery(""); }}
          />

          {notesLoading ? (
            <ResearchLibrarySkeleton view={styleMode} />
          ) : filtered.length === 0 ? (
            <div className="research-empty-state">
              <span aria-hidden="true">⌕</span>
              <h2>{t(notes.length ? "research.noMatches" : "ux.researchEmpty")}</h2>
              <p>{t(notes.length ? "research.noMatchesDescription" : "ux.researchEmptyHint")}</p>
              {notes.length ? <button type="button" onClick={() => { setScope("all"); setActiveTag(null); setActiveSeries(null); setQuery(""); }} className="ui-button">{t("research.viewAll")}</button>
                : <Link href="/research/new" className="ui-button ui-button--primary">{t("ux.researchCreate")}</Link>}
            </div>
          ) : styleMode === "reading" ? (
            <section className="research-reading-list" aria-label={t("research.readingListAria")}>
              {filtered.map(({ note, stocks: linkedStocks, plain }) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  plain={plain}
                  stocks={linkedStocks}
                  active={false}
                  onOpen={() => openResearch(note.id)}
                  onEdit={() => openResearch(note.id, true)}
                  favorite={favoriteNoteIds.includes(note.id)}
                  onToggleFavorite={() => toggleNoteFavorite(note.id)}
                />
              ))}
            </section>
          ) : (
            <div className="research-card-grid" aria-label={t("research.cardGridAria")}>
              {filtered.map(({ note, stocks: linkedStocks, plain }) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  plain={plain}
                  stocks={linkedStocks}
                  active={false}
                  variant="cards"
                  onOpen={() => openResearch(note.id)}
                  onEdit={() => openResearch(note.id, true)}
                  favorite={favoriteNoteIds.includes(note.id)}
                  onToggleFavorite={() => toggleNoteFavorite(note.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CommentPanel({
  note,
  comments,
  draft,
  setDraft,
  onSubmit,
  pendingQuote,
  onClearQuote,
  onToggleReaction,
  onDeleteComment,
  currentUserId,
  annotationView,
  focusCommentId,
}: {
  note: WatchNote | null;
  comments: NoteComment[];
  draft: string;
  setDraft: (value: string) => void;
  onSubmit: (parentId?: string | null, anchor?: QuoteAnchor) => Promise<boolean>;
  pendingQuote: QuoteAnchor | null;
  onClearQuote: () => void;
  onToggleReaction: (commentId: string, emoji: string) => void;
  onDeleteComment: (commentId: string) => void;
  currentUserId: string | null;
  annotationView: AnnotationView;
  focusCommentId?: string | null;
}) {
  const { t } = useI18n();
  const [replyTo, setReplyTo] = useState<NoteComment | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [inputFocused, setInputFocused] = useState(false);
  const scopedComments = focusCommentId ? comments.filter((comment) => comment.id === focusCommentId || comment.parentId === focusCommentId) : comments;
  const roots = scopedComments.filter((comment) => !comment.parentId && (annotationView === "bottom" || !comment.quoteText || comment.id === focusCommentId));
  const repliesByParent = scopedComments.reduce<Record<string, NoteComment[]>>((acc, comment) => {
    if (!comment.parentId) return acc;
    acc[comment.parentId] = [...(acc[comment.parentId] || []), comment];
    return acc;
  }, {});
  const canComment = note?.allowComments !== false;
  const canDelete = (comment: NoteComment) => !!currentUserId && (comment.userId === currentUserId || note?.userId === currentUserId);
  const submit = async () => {
    if (!canComment || !draft.trim()) return;
    const sent = await onSubmit(replyTo?.id || null, replyTo ? undefined : pendingQuote || undefined);
    if (!sent) return;
    setReplyTo(null);
    onClearQuote();
    setInputFocused(false);
  };
  const composerOpen = inputFocused || !!draft.trim() || !!replyTo || !!pendingQuote;
  return (
    <section id={`comment-composer-${note?.id || "note"}`} className="research-comment-panel mt-14 scroll-mt-24 border-t border-themed/70 pt-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-primary">{annotationView === "bottom" ? t("research.allComments") : t("research.commentsAndReview")} {annotationView === "bottom" ? comments.length : roots.length}</h3>
          {annotationView === "side" && comments.some((comment) => !comment.parentId && comment.quoteText) && (
            <p className="mt-1 text-xs text-muted">{t("research.annotationSideHint")}</p>
          )}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] ${canComment ? "bg-[var(--accent-bg)] text-accent" : "bg-white/[0.05] text-muted"}`}>
          {canComment ? t("research.commenting") : t("research.commentingClosed")}
        </span>
      </div>

      <div className="mb-7">
        {pendingQuote && !replyTo && (
          <div className="note-annotation-quote-box mb-3 border-l-2 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <p className="note-annotation-text line-clamp-3 text-xs leading-5">“{pendingQuote.quoteText}”</p>
              <button type="button" onClick={onClearQuote} className="shrink-0 text-xs text-muted transition hover:text-primary">{t("research.cancelQuote")}</button>
            </div>
          </div>
        )}
        {replyTo && (
          <div className="mb-2 flex items-center justify-between text-xs text-accent">
            <span>{t("research.replyTo", { name: replyTo.author.nickname })}</span>
            <button type="button" onClick={() => setReplyTo(null)} className="text-muted transition hover:text-primary">{t("research.cancel")}</button>
          </div>
        )}
        <div className={`research-comment-composer transition ${composerOpen ? "is-open px-3 py-3" : "px-3 py-2"}`}>
          <textarea
            value={draft}
            onFocus={() => setInputFocused(true)}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && draft.trim()) {
                event.preventDefault();
                void submit();
              }
            }}
            rows={composerOpen ? 4 : 1}
            disabled={!canComment}
            placeholder={canComment ? (replyTo ? t("research.replyTo", { name: replyTo.author.nickname }) : t("research.personalNotePlaceholder")) : t("research.commentsClosed")}
            className="w-full resize-none bg-transparent text-sm leading-6 text-primary outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div className={`flex items-center justify-between gap-3 overflow-hidden transition-all duration-200 ${composerOpen ? "mt-2 max-h-10 opacity-100" : "max-h-0 opacity-0"}`}>
            <div className="flex min-w-0 gap-0.5 overflow-x-auto">
              {COMMENT_EMOJIS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => setDraft(`${draft}${emoji}`)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base transition hover:bg-white/[0.06]" aria-label={t("research.insertEmoji", { emoji })}>
                  {emoji}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={!canComment || !draft.trim()}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-[var(--accent-dark)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {replyTo ? t("research.sendReply") : t("research.sendComment")}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {roots.length === 0 ? (
          <div className="py-10 text-center text-sm leading-6 text-muted">
            {canComment ? (annotationView === "side" && comments.length ? t("research.noStandaloneComments") : t("research.personalNotesEmpty")) : t("research.readOnlyComments")}
          </div>
        ) : roots.map((comment) => (
          <div key={comment.id} className="py-4">
            <CommentItem key={comment.id} comment={comment} canReply={canComment} canDelete={canDelete(comment)} onReply={() => { onClearQuote(); setReplyTo(comment); }} onReact={(emoji) => onToggleReaction(comment.id, emoji)} onDelete={() => onDeleteComment(comment.id)} />
            {(() => {
              const replies = repliesByParent[comment.id] || [];
              const expanded = !!expandedReplies[comment.id];
              const visibleReplies = expanded ? replies : replies.slice(0, 2);
              if (!replies.length) return null;
              return (
                <div className="ml-7 mt-3 border-l border-white/[0.08] pl-3 sm:ml-10">
                  <div className="space-y-3">
                    {visibleReplies.map((reply) => (
                      <CommentItem key={reply.id} comment={reply} canReply={canComment} canDelete={canDelete(reply)} onReply={() => { onClearQuote(); setReplyTo(reply); }} onReact={(emoji) => onToggleReaction(reply.id, emoji)} onDelete={() => onDeleteComment(reply.id)} compact />
                    ))}
                  </div>
                  {replies.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setExpandedReplies((prev) => ({ ...prev, [comment.id]: !expanded }))}
                      className="mt-2 text-[11px] font-medium text-accent transition hover:underline"
                    >
                      {expanded ? t("research.collapseReplies") : t("research.expandReplies", { count: replies.length - 2 })}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </section>
  );
}

function CommentItem({ comment, canReply, canDelete = false, onReply, onReact, onDelete, compact = false }: { comment: NoteComment; canReply: boolean; canDelete?: boolean; onReply: () => void; onReact: (emoji: string) => void; onDelete: () => void; compact?: boolean }) {
  const { t, localeTag } = useI18n();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const replyToName = compact && comment.replyToAuthor && comment.replyToAuthor.id !== comment.author.id ? comment.replyToAuthor.nickname : "";
  return (
    <div id={`comment-${comment.id}`} className="scroll-mt-24">
      <div className="flex items-start gap-2">
        <span className={`${compact ? "h-6 w-6" : "h-8 w-8"} flex shrink-0 items-center justify-center rounded-full bg-[var(--accent-bg)] text-[10px] font-semibold text-accent`}>
          {(comment.author.nickname || "U").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-medium text-primary">{comment.author.nickname}</p>
            <span className="shrink-0 text-[10px] text-muted">{fmtShortDate(comment.createdAt, localeTag)}</span>
          </div>
          {!compact && comment.quoteText && (
            <button
              type="button"
              onClick={() => document.getElementById(`note-anchor-${comment.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
              className="note-annotation-quote-box note-annotation-text mt-2 block w-full border-l-2 px-3 py-2 text-left text-xs leading-5 transition hover:brightness-110"
            >
              “{comment.quoteText}”
            </button>
          )}
          <p className={`${compact ? "text-xs leading-5" : "text-sm leading-6"} mt-1 whitespace-pre-wrap text-secondary`}>
            {replyToName && <span className="mr-1 text-accent">{t("research.replyTo", { name: `@${replyToName}` })}</span>}
            {comment.content}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {COMMENT_REACTIONS.map((emoji) => {
              const reaction = comment.reactions.find((item) => item.emoji === emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(emoji)}
                  disabled={!canReply}
                  className={`flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${reaction?.reacted ? "bg-[var(--accent-bg-hover)] text-primary ring-1 ring-[var(--accent)]/30" : reaction ? "bg-white/[0.05] text-secondary hover:bg-white/[0.08]" : "text-muted opacity-55 hover:bg-white/[0.05] hover:opacity-100"}`}
                  aria-label={t(reaction?.reacted ? "research.removeReaction" : "research.addReaction", { emoji })}
                >
                  <span>{emoji}</span>{reaction && <span className="text-[10px]">{reaction.count}</span>}
                </button>
              );
            })}
            {canReply && (
              <button type="button" onClick={onReply} className="ml-1 px-1 text-[11px] text-muted transition hover:text-accent">
                {t("research.reply")}
              </button>
            )}
            {canDelete && (confirmingDelete ? (
              <span className="ml-1 inline-flex items-center gap-1 text-[11px]">
                <button type="button" onClick={onDelete} className="px-1 font-medium text-red-500 transition hover:text-red-400">{t("research.confirmDelete")}</button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="px-1 text-muted transition hover:text-primary">{t("research.cancel")}</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmingDelete(true)} className="ml-1 px-1 text-[11px] text-muted transition hover:text-red-500">
                {t("research.delete")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NoteCard({
  note,
  plain,
  stocks,
  active,
  variant = "reading",
  onOpen,
  onEdit,
  favorite,
  onToggleFavorite,
}: {
  note: WatchNote;
  plain: string;
  stocks: WatchStock[];
  active: boolean;
  variant?: NotesStyle;
  onOpen: () => void;
  onEdit: () => void;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const { t, localeTag } = useI18n();
  const words = plain.replace(/\s+/g, "");
  const topTags = (note.tags?.length ? note.tags : note.knowledgeTags || []).slice(0, 3);
  const linkedStocks = stocks.slice(0, 2);
  const coverImage = note.coverImageUrl || firstNoteImage(note);
  const kind = researchKindLabel(note.kind || "quick", t);
  const status = researchStatusLabel(note.status || "active", t);
  const title = note.title || t("research.untitled");
  const body = plain || t("research.noBody");
  if (variant === "cards") {
    return (
      <article className="research-card group">
        <div className="research-card__media">
          <button type="button" onClick={onOpen} className="research-card__cover" aria-label={`${t("research.view")}: ${title}`}>
            {coverImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- 笔记图片可能是 data URL，不能交给 next/image 优化。 */}
                <img src={coverImage} alt={t("research.coverAlt")} loading="lazy" />
                <span className="research-card__image-shade" />
              </>
            ) : (
              <div className="research-card__fallback" style={noteCoverStyle(note)} aria-hidden="true" />
            )}
          </button>
          <div className="research-card__badges">
            <span>{kind}</span>
            <span data-status={note.status || "active"}>{status}</span>
          </div>
          <button type="button" onClick={onToggleFavorite} className={`research-card__star${favorite ? " is-active" : ""}`} aria-pressed={favorite} aria-label={favorite ? t("research.unstar") : t("research.star")} title={favorite ? t("research.unstar") : t("research.star")}>
            {favorite ? "★" : "☆"}
          </button>
        </div>

        <div className="research-card__body">
          <button type="button" onClick={onOpen} className="research-card__copy">
            <h2>{title}</h2>
            <p>{body}</p>
          </button>
          <div className="research-card__chips">
            {linkedStocks.map((stock) => <span key={stock.id} className="research-card__stock">${stock.symbol}</span>)}
            {topTags.map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
          <div className="research-card__footer">
            <div className="research-card__identity" title={t("research.createdUpdated", { created: fmtDateTime(note.createdAt, localeTag), updated: fmtDateTime(note.updatedAt, localeTag) })}>
              <span aria-hidden="true">{t("research.private")}</span>
              <div><strong>{fmtRelativeDate(note.updatedAt, t, localeTag)}</strong><small>{t("research.minutes", { count: readingMinutes(plain) })}</small></div>
            </div>
            <div className="research-card__metrics">
              <span title={t("research.comments", { count: note.commentCount || 0 })}><span aria-hidden="true">◌</span> {note.commentCount || 0}</span>
              <button type="button" onClick={onEdit} aria-label={`${t("research.edit")}: ${title}`}>{t("research.edit")}</button>
            </div>
          </div>
        </div>
      </article>
    );
  }
  return (
    <article className={`research-reading-card group${active ? " is-active" : ""}`}>
      <button type="button" onClick={onOpen} className="research-reading-card__main">
        <div className="research-reading-card__content">
          <div className="research-reading-card__eyebrow"><span>{kind}</span><span>{status}</span>{note.series && <span>{t("research.topic")} · {note.series}</span>}</div>
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
        {coverImage && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- 笔记图片可能是 data URL，不能交给 next/image 优化。 */}
            <img src={coverImage} alt={t("research.thumbnailAlt")} loading="lazy" className="research-reading-card__image" />
          </>
        )}
      </button>

      <div className="research-reading-card__meta">
        <span>{fmtRelativeDate(note.updatedAt, t, localeTag)}</span>
        <span>{t("research.minutes", { count: readingMinutes(plain) })}</span>
        <span>{t("research.words", { count: words.length })}</span>
        <span>{t("research.comments", { count: note.commentCount || 0 })}</span>
        {linkedStocks.map((stock) => <span key={stock.id} className="research-card__stock">${stock.symbol}</span>)}
        {topTags.map((tag) => <span key={tag}>#{tag}</span>)}
        <button type="button" onClick={onToggleFavorite} className={favorite ? "is-active" : ""} aria-label={favorite ? t("research.unstar") : t("research.star")}>
          {favorite ? `★ ${t("research.starredLabel")}` : `☆ ${t("research.star")}`}
        </button>
        <button type="button" onClick={onEdit} className="research-reading-card__edit">{t("research.edit")}</button>
      </div>
    </article>
  );
}

function ResearchCoverImage({ src, alt, unavailableLabel, retryLabel }: { src: string; alt: string; unavailableLabel: string; retryLabel: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="research-cover-failure" role="status">
        <span>{unavailableLabel}</span>
        <button type="button" onClick={() => { setFailed(false); setAttempt((current) => current + 1); }}>{retryLabel}</button>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Research covers may use external or data URLs.
    <img key={attempt} src={src} alt={alt} onError={() => setFailed(true)} />
  );
}

function NoteDetail({
  note,
  stocks,
  stockOptions,
  editing,
  comments,
  commentDraft,
  setCommentDraft,
  onSubmitComment,
  onToggleReaction,
  onDeleteComment,
  currentUserId,
  onBack,
  onEdit,
  onDone,
  saveState,
  onRetrySave,
  onDelete,
  onUpdate,
  seriesSuggestions,
  favorite,
  onToggleFavorite,
  seriesFavorite,
  onToggleSeriesFavorite,
}: {
  note: WatchNote;
  stocks: WatchStock[];
  stockOptions: WatchStock[];
  editing: boolean;
  comments: NoteComment[];
  commentDraft: string;
  setCommentDraft: (value: string) => void;
  onSubmitComment: (parentId?: string | null, anchor?: QuoteAnchor, content?: string) => Promise<boolean>;
  onToggleReaction: (commentId: string, emoji: string) => void;
  onDeleteComment: (commentId: string) => void;
  currentUserId: string | null;
  onBack: () => void | Promise<void>;
  onEdit: () => void;
  onDone: () => void | Promise<void>;
  saveState: ResearchSaveState;
  onRetrySave: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<WatchNote>) => void;
  seriesSuggestions: NoteSeriesOption[];
  favorite: boolean;
  onToggleFavorite: () => void;
  seriesFavorite: boolean;
  onToggleSeriesFavorite?: () => void;
}) {
  const { t, localeTag } = useI18n();
  const plain = stripContent(note.content, note.format);
  const coverImage = note.coverImageUrl;
  const kindLabel = researchKindLabel(note.kind || "quick", t);
  const statusLabel = researchStatusLabel(note.status || "active", t);
  const decisionStatusLabel = note.status === "active" ? t("research.active") : statusLabel;
  const title = note.title || t("research.untitled");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pendingQuote, setPendingQuote] = useState<QuoteAnchor | null>(null);
  const [commentDrawerOpen, setCommentDrawerOpen] = useState(false);
  const commentTriggerRef = useRef<HTMLButtonElement | null>(null);
  const outlineTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [outlineDrawerOpen, setOutlineDrawerOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<ResearchPreviewMode>("off");
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null);
  const [threadMode, setThreadMode] = useState<"context" | "all">("context");
  const outlineItems = useMemo(() => note.format === "markdown" ? outlineFromMarkdown(note.content) : outlineFromRichHtml(note.content), [note.content, note.format]);
  const focusRetrySave = useCallback(() => {
    window.setTimeout(() => document.querySelector<HTMLButtonElement>(".research-save-status.is-failed button")?.focus(), 0);
  }, []);
  const handleDone = useCallback(async () => {
    if (saveState === "failed") {
      focusRetrySave();
      return;
    }
    setPreviewMode("off");
    setPropertiesOpen(false);
    await onDone();
  }, [focusRetrySave, onDone, saveState]);
  useEffect(() => {
    if (previewMode !== "split") return;
    const onResize = () => {
      if (window.innerWidth < 1280) setPreviewMode("single");
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [previewMode]);
  const handleBack = useCallback(async () => {
    if (saveState === "failed") {
      focusRetrySave();
      return;
    }
    await onBack();
  }, [focusRetrySave, onBack, saveState]);
  const closeQuoteComment = useCallback(() => setPendingQuote(null), [setPendingQuote]);
  const openQuoteComment = (anchor: QuoteAnchor) => {
    setPendingQuote(anchor);
  };
  const useSelectionAsCoreThesis = useCallback(async (text: string) => {
    if (stocks.length !== 1) return false;
    try {
      await api.updateWatchStock(stocks[0].id, { thesis: text });
      return true;
    } catch {
      return false;
    }
  }, [stocks]);
  const reviewOverdue = Boolean(note.nextReviewAt && new Date(note.nextReviewAt) <= new Date());
  const reviewDone = note.status === "archived" || note.status === "validated";
  const statusTone: "neutral" | "success" | "danger" = reviewDone ? "success" : note.status === "invalidated" ? "danger" : "neutral";
  const statusPillLabel = note.status === "archived" ? t("research.completed") : decisionStatusLabel;
  const reviewBadge = note.status === "archived"
    ? { label: t("research.reviewCompleted"), tone: "gold" as const }
    : reviewOverdue ? { label: t("research.reviewOverdue"), tone: "amber" as const } : null;
  const exportCurrentNote = useCallback(() => {
    const body = note.format === "markdown" ? note.content : stripContent(note.content, note.format);
    const blob = new Blob([`# ${note.title}\n\n${body.trim()}\n`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(note.title || "research").replace(/[\\/:*?"<>|#]+/g, "").replace(/\s+/g, "_").slice(0, 80)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [note.content, note.format, note.title]);
  const editorSaveMetadata = {
    idle: t("research.allChangesSaved"),
    dirty: t("research.saveUnsaved"),
    saving: t("research.saveSaving"),
    saved: t("research.allChangesSaved"),
    failed: t("research.saveFailedShort"),
  }[saveState];
  const coverElement = coverImage ? (
    <ResearchCoverImage key={coverImage} src={coverImage} alt={t("research.coverAlt")} unavailableLabel={t("research.imageUnavailable")} retryLabel={t("research.retryImage")} />
  ) : null;
  const anchoredComments = comments.filter((comment) => !comment.parentId && comment.quoteText);
  const selectedAnnotationId = activeAnnotation || anchoredComments[0]?.id || null;
  const openModifyCreatedTime = () => {
    onEdit();
    setPropertiesOpen(true);
    window.setTimeout(() => document.querySelector<HTMLInputElement>("[data-research-created-at]")?.focus(), 80);
  };
  const readingMoreMenu = confirmingDelete ? (
    <>
      <button type="button" role="menuitem" onClick={() => setConfirmingDelete(false)}>{t("research.cancel")}</button>
      <button type="button" role="menuitem" className="research-detail__delete-confirm" onClick={onDelete}>{t("research.confirmDelete")}</button>
    </>
  ) : (
    <>
      <button type="button" role="menuitem" onClick={onToggleFavorite}>{favorite ? `★ ${t("research.unstar")}` : `☆ ${t("research.star")}`}</button>
      {outlineItems.length > 1 && (
        <button type="button" role="menuitem" onClick={() => { outlineTriggerRef.current = document.activeElement as HTMLButtonElement | null; setOutlineDrawerOpen(true); }}>{t("research.openOutline")}</button>
      )}
      <button type="button" role="menuitem" onClick={openModifyCreatedTime}>{t("research.modifyCreatedTime")}</button>
      <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); setConfirmingDelete(true); }}>{t("research.deleteResearch")}</button>
    </>
  );
  return (
    <section className="research-detail group/detail">
      <ResearchArticleShell
        titleId="research-document-title"
        className="research-detail__canvas"
        progressLabel={t("research.readingProgress")}
        scrollTopLabel={t("research.scrollTop")}
        scrollBottomLabel={t("research.scrollBottom")}
        showScrollControls={!editing}
      >
        {({ titleVisible }) => <>
        <ResearchDetailView
          documentBar={editing ? <ResearchDocumentBar
          mode={editing ? "editing" : "reading"}
          title={title}
          titleVisible={editing ? false : titleVisible}
          starred={favorite}
          commentsExpanded={commentDrawerOpen}
          outlineExpanded={outlineDrawerOpen}
          propertiesExpanded={propertiesOpen}
          saveState={saveState}
          heading={t("research.detailTitle")}
          labels={{
            navigation: t("research.documentNavigation"), back: t("research.backLibrary"), comments: t("research.personalNotesCount", { count: comments.length }), outline: t("research.openOutline"),
            star: t("research.star"), unstar: t("research.unstar"), more: t("research.moreActions"), edit: t("research.editResearch"),
            done: t("research.finishEditing"), preview: t("research.preview"), editContent: t("research.editContent"), splitPreview: t("research.splitPreview"), properties: t("research.properties"),
          }}
          onBack={() => void handleBack()}
          onComments={() => { commentTriggerRef.current = document.activeElement as HTMLButtonElement | null; setCommentDrawerOpen(true); }}
          onOutline={outlineItems.length > 1 ? () => { outlineTriggerRef.current = document.activeElement as HTMLButtonElement | null; setOutlineDrawerOpen(true); } : undefined}
          onToggleStar={onToggleFavorite}
          onEdit={() => { setPreviewMode("off"); setPropertiesOpen(false); onEdit(); }}
          onDone={() => void handleDone()}
          onRetrySave={onRetrySave}
          previewMode={previewMode}
          onTogglePreview={() => setPreviewMode((current) => current === "single" ? "off" : "single")}
          onToggleSplitPreview={() => setPreviewMode((current) => current === "split" ? "off" : "split")}
          onToggleProperties={() => setPropertiesOpen((value) => !value)}
          moreMenu={editing ? (
            confirmingDelete ? <><button type="button" role="menuitem" onClick={() => setConfirmingDelete(false)}>{t("research.cancel")}</button><button type="button" role="menuitem" className="research-detail__delete-confirm" onClick={onDelete}>{t("research.confirmDelete")}</button></> : <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); setConfirmingDelete(true); }}>{t("research.deleteResearch")}</button>
          ) : (
            confirmingDelete ? <><button type="button" role="menuitem" onClick={() => setConfirmingDelete(false)}>{t("research.cancel")}</button><button type="button" role="menuitem" className="research-detail__delete-confirm" onClick={onDelete}>{t("research.confirmDelete")}</button></> : <><button type="button" role="menuitem" onClick={() => { onEdit(); setPropertiesOpen(true); window.setTimeout(() => document.querySelector<HTMLInputElement>("[data-research-created-at]")?.focus(), 80); }}>{t("research.modifyCreatedTime")}</button><button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); setConfirmingDelete(true); }}>{t("research.deleteResearch")}</button></>
          )}
        /> : null}
          header={!editing ? <ResearchReadingHeader
            titleId="research-document-title"
            title={title}
            kindLabel={kindLabel}
            status={{ label: statusPillLabel, tone: statusTone }}
            reviewBadge={reviewBadge}
            confidence={note.confidence ?? null}
            confidenceLabel={note.confidence ? `${t("research.confidence")} ${note.confidence}/5` : t("research.confidence")}
            meta={<>
              <span data-meta="created">{t("research.published")} <time dateTime={note.createdAt}>{fmtDate(note.createdAt, localeTag)}</time></span>
              <span data-meta="updated">{t("research.updated")} <time dateTime={note.updatedAt}>{fmtDate(note.updatedAt, localeTag)}</time></span>
              <span data-meta="reading">{readingMinutes(plain)} {t("research.reading")}</span>
            </>}
            series={note.series ? {
              name: note.series,
              href: note.seriesId ? `/research/topics/${encodeURIComponent(note.seriesId)}` : `/research?series=${encodeURIComponent(note.series)}`,
            } : null}
            seriesFavorite={seriesFavorite}
            onToggleSeriesFavorite={onToggleSeriesFavorite}
            seriesStarLabels={{ star: t("research.topicStar"), unstar: t("research.topicUnstar") }}
            tags={note.tags || []}
            stocks={stocks.slice(0, 6).map((stock) => ({ symbol: stock.symbol, href: `/watchlist?symbol=${encodeURIComponent(stock.symbol)}&fromNote=${encodeURIComponent(note.id)}` }))}
            knowledgeTags={(note.knowledgeTags || []).slice(0, 6).map((tag) => ({ tag, href: `/watchlist?view=sector&tag=${encodeURIComponent(tag)}` }))}
            content={note.content}
            format={note.format || "markdown"}
            reviewDone={reviewDone}
            cover={coverElement}
            labels={{ topic: t("research.topicCard"), judgment: t("research.keyJudgmentCard"), checks: t("research.nextChecksCard"), collectedIn: t("research.collectedIn") }}
          /> : undefined}
          isEditing={editing}
          annotationLabel={t("research.annotationAnchors")}
          outline={!editing && outlineItems.length > 1 ? <ResearchOutline items={outlineItems} title={t("research.outline")} ariaLabel={t("research.outlineLabel")} /> : undefined}
          articleBody={editing ? (
            <ResearchEditorShell
              title={<input id="research-document-title" aria-label={t("research.editorTitle")} value={note.title} onChange={(event) => onUpdate({ title: event.target.value })} className="research-document-header__title-input" placeholder={t("research.titlePlaceholder")} />}
              metadata={<>
                <span>{t("research.created")} {fmtDateTime(note.createdAt, localeTag)}</span>
                <span aria-live="polite" aria-atomic="true">{editorSaveMetadata}</span>
              </>}
              editor={<NoteEditor note={note} stocks={stocks} allowedTags={allowedKnowledgeTags(stocks)} previewMode={previewMode} onUpdate={onUpdate} onDone={handleDone} />}
              propertiesOpen={propertiesOpen}
              propertiesTitle={t("research.propertiesTitle")}
              ariaLabel={t("research.editorShell")}
              closePropertiesLabel={t("research.closeProperties")}
              onCloseProperties={() => setPropertiesOpen(false)}
              properties={<ResearchPropertiesPanel
                title={t("research.properties")}
                description={t("research.managementHint")}
                updatedAt={<span>{t("research.updated")} {fmtDateTime(note.updatedAt, localeTag)}</span>}
              >
                <NoteManagementFields note={note} onUpdate={onUpdate} seriesSuggestions={seriesSuggestions} stocks={stockOptions} />
                <div className="research-properties-panel__star">
                  <button type="button" onClick={onToggleFavorite} aria-label={favorite ? t("research.unstar") : t("research.star")}>{favorite ? "★" : "☆"} {favorite ? t("research.unstar") : t("research.star")}</button>
                </div>
              </ResearchPropertiesPanel>}
            />
          ) : (
            <AnnotatedNotePreview
              note={note}
              comments={comments}
              onQuote={openQuoteComment}
              canComment={note.allowComments !== false}
              tickerStocks={stockOptions}
              onUseAsCoreThesis={stocks.length === 1 ? useSelectionAsCoreThesis : undefined}
              activeId={selectedAnnotationId}
              onActivateAnnotation={(id) => {
                setActiveAnnotation(id);
                setThreadMode("context");
                setCommentDrawerOpen(true);
              }}
              pendingQuote={pendingQuote}
              onSubmitPending={async (content) => {
                const sent = await onSubmitComment(null, pendingQuote || undefined, content);
                if (sent) closeQuoteComment();
                return sent;
              }}
              onClearPending={closeQuoteComment}
            />
          )}
          overlays={!editing ? <>
            <ResearchCommentDrawer open={commentDrawerOpen} title={t("research.personalNotes")} closeLabel={t("research.closePersonalNotes")} triggerRef={commentTriggerRef} onClose={() => setCommentDrawerOpen(false)}>
              <div className="research-comment-drawer"><ResearchCommentThread comments={comments.filter((comment) => !comment.parentId).map((comment) => ({ ...comment, replyCount: comments.filter((reply) => reply.parentId === comment.id).length }))} activeId={selectedAnnotationId} mode={threadMode} labels={{ thread: t("research.personalNotes"), context: t("research.personalNoteContext"), all: t("research.personalNotesAll"), empty: t("research.personalNotesEmpty") }} onModeChange={setThreadMode} onActivate={(id) => { setActiveAnnotation(id); setThreadMode("context"); document.getElementById(`note-anchor-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }} renderComposer={() => null} locale={localeTag} replyLabel={(count) => t("research.replyCountLocate", { count })} unresolvedLabel={t("research.unresolvedAnchor")} renderComments={(visible) => <CommentPanel note={note} comments={threadMode === "context" ? comments.filter((comment) => visible.some((root) => root.id === comment.id || root.id === comment.parentId)) : comments} draft={commentDraft} setDraft={setCommentDraft} onSubmit={onSubmitComment} pendingQuote={null} onClearQuote={() => setPendingQuote(null)} onToggleReaction={onToggleReaction} onDeleteComment={onDeleteComment} currentUserId={currentUserId} annotationView="bottom" focusCommentId={threadMode === "context" ? visible[0]?.id : null} />} /></div>
            </ResearchCommentDrawer>
            <ResearchCommentDrawer open={outlineDrawerOpen} title={t("research.outline")} ariaLabel={t("research.outlineLabel")} closeLabel={t("research.closeOutline")} triggerRef={outlineTriggerRef} onClose={() => setOutlineDrawerOpen(false)}>
              <div className="py-4"><ResearchOutline items={outlineItems} title={t("research.outline")} ariaLabel={t("research.outlineLabel")} onNavigate={() => setOutlineDrawerOpen(false)} /></div>
            </ResearchCommentDrawer>
          </> : undefined}
          footer={!editing ? <footer className="research-detail__footer">
            <span>{t("research.end")}</span><i /><p>{t("research.returnReview")}</p>
          </footer> : undefined}
          bottomBar={!editing ? <ResearchReadingActionBar
            commentCount={comments.length}
            commentsExpanded={commentDrawerOpen}
            labels={{
              navigation: t("research.readingActions"),
              back: t("research.backLibrary"),
              comments: t("research.commentWord"),
              edit: t("research.editResearch"),
              export: t("research.export"),
              more: t("research.moreActions"),
            }}
            onBack={() => void handleBack()}
            onComments={() => { commentTriggerRef.current = document.activeElement as HTMLButtonElement | null; setCommentDrawerOpen(true); }}
            onEdit={() => { setPreviewMode("off"); setPropertiesOpen(false); onEdit(); }}
            onExport={exportCurrentNote}
            moreMenu={readingMoreMenu}
          /> : undefined}
        />
        </>}
      </ResearchArticleShell>
    </section>
  );
}

function NoteEditor({
  note,
  stocks,
  allowedTags,
  previewMode,
  onUpdate,
  onDone,
}: {
  note: WatchNote;
  stocks: WatchStock[];
  allowedTags: string[];
  previewMode?: ResearchPreviewMode;
  onUpdate: (patch: Partial<WatchNote>) => void;
  onDone?: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const mode = note.format || "markdown";
  const previewControlled = previewMode !== undefined;
  const [localPreviewMode, setLocalPreviewMode] = useState<ResearchPreviewMode>("off");
  const effectivePreviewMode = previewMode ?? localPreviewMode;

  useEffect(() => {
    if (previewControlled || localPreviewMode !== "split") return;
    const keepPreviewResponsive = () => {
      if (window.innerWidth < 1280) setLocalPreviewMode("single");
    };
    keepPreviewResponsive();
    window.addEventListener("resize", keepPreviewResponsive);
    return () => window.removeEventListener("resize", keepPreviewResponsive);
  }, [localPreviewMode, previewControlled]);

  const switchMode = (next: NoteFormat) => {
    if (next === mode) return;
    const content = next === "rich" ? markdownToRichHtml(note.content) : htmlClipboardToMarkdown(note.content);
    if (!previewControlled) setLocalPreviewMode("off");
    onUpdate({ format: next, content });
  };

  return (
    <div className="relative space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-themed bg-input/70 p-2">
        <div className="flex shrink-0 gap-1 rounded-md bg-surface p-1" role="tablist" aria-label={t("research.editorFormat")}>
          <button type="button" role="tab" onClick={() => switchMode("rich")} aria-selected={mode === "rich"} className={`min-h-9 rounded px-3 text-xs font-medium transition ${mode === "rich" ? "bg-[var(--accent-bg)] text-accent" : "text-muted hover:bg-input hover:text-primary"}`}>{t("research.visualMode")}</button>
          <button type="button" role="tab" onClick={() => switchMode("markdown")} aria-selected={mode === "markdown"} className={`min-h-9 rounded px-3 text-xs font-medium transition ${mode === "markdown" ? "bg-[var(--accent-bg)] text-accent" : "text-muted hover:bg-input hover:text-primary"}`}>{t("research.markdownMode")}</button>
        </div>
        {!previewControlled && <div className="ml-auto flex shrink-0 gap-1 rounded-md bg-surface p-1" role="group" aria-label={t("research.researchPreview")}>
          <button type="button" aria-pressed={effectivePreviewMode === "off"} onClick={() => setLocalPreviewMode("off")} className={`min-h-9 rounded px-3 text-xs font-medium transition ${effectivePreviewMode === "off" ? "bg-[var(--accent-bg)] text-accent" : "text-muted hover:bg-input hover:text-primary"}`}>{t("research.editContent")}</button>
          <button type="button" aria-pressed={effectivePreviewMode === "single"} onClick={() => setLocalPreviewMode("single")} className={`min-h-9 rounded px-3 text-xs font-medium transition ${effectivePreviewMode === "single" ? "bg-[var(--accent-bg)] text-accent" : "text-muted hover:bg-input hover:text-primary"}`}>{t("research.preview")}</button>
          <button type="button" aria-pressed={effectivePreviewMode === "split"} onClick={() => setLocalPreviewMode("split")} className={`hidden min-h-9 rounded px-3 text-xs font-medium transition xl:inline-flex xl:items-center ${effectivePreviewMode === "split" ? "bg-[var(--accent-bg)] text-accent" : "text-muted hover:bg-input hover:text-primary"}`}>{t("research.splitPreview")}</button>
        </div>}
      </div>
      {mode === "markdown" ? (
        <MarkdownEditor label={t("research.editorLabel")} value={note.content} onChange={(content) => onUpdate({ format: "markdown", content })} placeholder={t("research.editorPlaceholder")} minHeight="520px" emptyLabel={t("research.noMarkdownPreview")} previewMode={effectivePreviewMode} previewLabel={t("research.researchPreview")} />
      ) : (
        <div className={`research-editor-layout${effectivePreviewMode === "split" ? " is-split" : ""}`} data-editor-layout={effectivePreviewMode === "split" ? "split" : effectivePreviewMode === "single" ? "preview" : "edit"}>
          <div className={`research-editor-layout__source${effectivePreviewMode === "single" ? " hidden" : ""}`}><RichTextEditor note={note} stocks={stocks} allowedTags={allowedTags} onUpdate={onUpdate} onDone={onDone} /></div>
          {effectivePreviewMode !== "off" && <section aria-label={t("research.researchPreview")} className="research-editor-layout__preview research-editor-rich-preview research-article-prose">
            <RichContent html={note.content} emptyText={t("research.noBody")} />
          </section>}
        </div>
      )}
    </div>
  );
}

function RichTextEditor({
  note,
  stocks,
  allowedTags,
  onUpdate,
  onDone,
}: {
  note: WatchNote;
  stocks: WatchStock[];
  allowedTags: string[];
  onUpdate: (patch: Partial<WatchNote>) => void;
  onDone?: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const commitTimerRef = useRef<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [imageError, setImageError] = useState("");
  const [bubble, setBubble] = useState<{ top: number; left: number } | null>(null);
  const [slashMenu, setSlashMenu] = useState<{ top: number; left: number } | null>(null);
  const [mentionMenu, setMentionMenu] = useState<{ kind: "stock" | "tag"; query: string; top: number; left: number } | null>(null);
  const [imageBox, setImageBox] = useState<{ top: number; left: number; width: number; height: number; widthPct: number; align: "left" | "center" | "right" } | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const resizeRef = useRef<{ startX: number; startPct: number; parentWidth: number } | null>(null);
  const resizeMoveRef = useRef<((event: MouseEvent) => void) | null>(null);
  const [insertMenu, setInsertMenu] = useState(false);
  const [pasteUndo, setPasteUndo] = useState<string | null>(null);
  const pasteInProgressRef = useRef(false);

  const stockMatches = mentionMenu?.kind === "stock"
    ? stocks
        .filter((stock) => `${stock.symbol} ${stock.name}`.toUpperCase().includes(mentionMenu.query.toUpperCase()))
        .slice(0, 8)
    : [];
  const tagMatches = mentionMenu?.kind === "tag"
    ? allowedTags
        .filter((tag) => tag.toLowerCase().includes(mentionMenu.query.toLowerCase()))
        .slice(0, 8)
    : [];

  const applyMarkdownGesture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== " ") return false;
    const range = currentRange();
    const selection = window.getSelection();
    if (!range || !selection || range.startContainer.nodeType !== Node.TEXT_NODE) return false;
    const textNode = range.startContainer;
    const text = textNode.textContent || "";
    const before = text.slice(0, range.startOffset);
    const markerMatch = before.match(/(?:^|\n)(#{1,3}|>|-|1\.)$/);
    if (!markerMatch) return false;
    event.preventDefault();
    const marker = markerMatch[1];
    const markerStart = before.length - marker.length;
    textNode.textContent = `${text.slice(0, markerStart)}${text.slice(range.startOffset)}`;
    range.setStart(textNode, markerStart);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    if (marker === "#") runCommand("formatBlock", "h1");
    if (marker === "##") runCommand("formatBlock", "h2");
    if (marker === "###") runCommand("formatBlock", "h3");
    if (marker === ">") runCommand("formatBlock", "blockquote");
    if (marker === "-" || marker === "1.") runCommand("insertUnorderedList");
    return true;
  };

  const commitNow = () => {
    if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current);
    const el = editorRef.current;
    if (!el) return;
    const html = sanitizeRichHtml(el.innerHTML);
    if (html !== note.content) onUpdate({ content: html });
    commitTimerRef.current = null;
  };

  const clearPasteUndo = () => setPasteUndo(null);

  const commit = (delay = 0) => {
    if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = window.setTimeout(() => {
      commitNow();
    }, delay);
  };

  const runCommand = (command: string, value?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    clearPasteUndo();
    const normalizedValue = command === "formatBlock" && value && !value.startsWith("<") ? `<${value}>` : value;
    document.execCommand(command, false, normalizedValue);
    commit();
  };

  const insertText = (text: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    clearPasteUndo();
    document.execCommand("insertText", false, text);
    commit();
  };

  const insertHtml = (html: string) => {
    editorRef.current?.focus();
    clearPasteUndo();
    document.execCommand("insertHTML", false, html);
    commit();
  };
  const insertImages = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setImageError("");
    try {
      const images = await Promise.all(list.map((file) => readNoteImage(file, t)));
      const html = images
        .map((image) => `<p><img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}"></p>`)
        .join("");
      insertHtml(html);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : t("research.imageInsertFailed"));
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const updateImageBox = (image = selectedImageRef.current) => {
    if (!image || !editorRef.current?.contains(image)) {
      selectedImageRef.current = null;
      setImageBox(null);
      return;
    }
    const rect = image.getBoundingClientRect();
    const parentRect = (image.parentElement || editorRef.current).getBoundingClientRect();
    const widthPct = Number.parseFloat(image.getAttribute("data-width") || "") || Math.round((rect.width / Math.max(1, parentRect.width)) * 100);
    const align = image.getAttribute("data-align") as "left" | "center" | "right" | null;
    setImageBox({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      widthPct: Math.min(100, Math.max(20, widthPct)),
      align: align && ["left", "center", "right"].includes(align) ? align : "center",
    });
  };

  const applyImageAlignStyle = (image: HTMLImageElement, align: "left" | "center" | "right") => {
    image.setAttribute("data-align", align);
    image.style.display = "block";
    image.style.margin = align === "left" ? "0 auto 0 0" : align === "right" ? "0 0 0 auto" : "0 auto";
  };

  const setImageAlign = (align: "left" | "center" | "right") => {
    const image = selectedImageRef.current;
    if (!image) return;
    clearPasteUndo();
    applyImageAlignStyle(image, align);
    updateImageBox(image);
    commit();
  };

  const selectImage = (target: EventTarget | null) => {
    if (target instanceof HTMLImageElement && editorRef.current?.contains(target)) {
      selectedImageRef.current = target;
      updateImageBox(target);
      setBubble(null);
      setSlashMenu(null);
      setMentionMenu(null);
      return true;
    }
    selectedImageRef.current = null;
    setImageBox(null);
    return false;
  };

  const beginImageResize = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const image = selectedImageRef.current;
    if (!image) return;
    const parentWidth = (image.parentElement || editorRef.current)?.getBoundingClientRect().width || image.getBoundingClientRect().width;
    resizeRef.current = { startX: event.clientX, startPct: imageBox?.widthPct || 100, parentWidth: Math.max(1, parentWidth) };
    resizeMoveRef.current = resizeImage;
    window.addEventListener("mousemove", resizeMoveRef.current);
    window.addEventListener("mouseup", endImageResize, { once: true });
  };

  const resizeImage = (event: MouseEvent) => {
    const resize = resizeRef.current;
    const image = selectedImageRef.current;
    if (!resize || !image) return;
    clearPasteUndo();
    const deltaPct = ((event.clientX - resize.startX) / resize.parentWidth) * 100;
    const widthPct = Math.min(100, Math.max(20, resize.startPct + deltaPct));
    image.setAttribute("data-width", String(Math.round(widthPct)));
    image.style.width = `${widthPct}%`;
    image.style.maxWidth = "100%";
    image.style.height = "auto";
    applyImageAlignStyle(image, imageBox?.align || "center");
    updateImageBox(image);
  };

  const endImageResize = () => {
    if (resizeMoveRef.current) window.removeEventListener("mousemove", resizeMoveRef.current);
    resizeMoveRef.current = null;
    resizeRef.current = null;
    updateImageBox();
    commit();
  };

  const currentRange = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return null;
    return range;
  };

  const caretPosition = (range: Range) => {
    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height) return { top: rect.bottom + 10, left: rect.left };
    const editorRect = editorRef.current?.getBoundingClientRect();
    return { top: (editorRect?.top || 120) + 64, left: (editorRect?.left || 24) + 24 };
  };

  const updateMentionMenu = () => {
    const range = currentRange();
    if (!range || !range.collapsed || range.startContainer.nodeType !== Node.TEXT_NODE) {
      setMentionMenu(null);
      return;
    }
    const before = range.startContainer.textContent?.slice(0, range.startOffset) || "";
    const stockMatch = before.match(/(?:^|\s)\$([A-Za-z0-9.-]{0,12})$/);
    const tagMatch = before.match(/(?:^|\s)@([\p{Script=Han}A-Za-z0-9_-]{0,24})$/u);
    const position = caretPosition(range);
    if (stockMatch) {
      setMentionMenu({ kind: "stock", query: stockMatch[1], ...position });
      return;
    }
    if (tagMatch) {
      setMentionMenu({ kind: "tag", query: tagMatch[1], ...position });
      return;
    }
    setMentionMenu(null);
  };

  const replaceCurrentToken = (token: string, html?: string) => {
    const range = currentRange();
    const selection = window.getSelection();
    if (!range || !selection || range.startContainer.nodeType !== Node.TEXT_NODE) {
      if (html) insertHtml(`${html}&nbsp;`);
      else insertText(`${token} `);
      setMentionMenu(null);
      return;
    }
    clearPasteUndo();
    const textNode = range.startContainer;
    const text = textNode.textContent || "";
    const before = text.slice(0, range.startOffset);
    const after = text.slice(range.startOffset);
    const match = before.match(/(?:^|\s)([$@][\p{Script=Han}A-Za-z0-9._-]{0,24})$/u);
    if (!match || match.index === undefined) {
      if (html) insertHtml(`${html}&nbsp;`);
      else insertText(`${token} `);
      setMentionMenu(null);
      return;
    }
    const prefixEnd = before.length - match[1].length;
    textNode.textContent = `${before.slice(0, prefixEnd)}${after}`;
    range.setStart(textNode, prefixEnd);
    range.collapse(true);
    if (html) {
      const template = document.createElement("template");
      template.innerHTML = `${html}&nbsp;`;
      const fragment = template.content;
      const lastNode = fragment.lastChild;
      range.insertNode(fragment);
      if (lastNode) range.setStartAfter(lastNode);
      range.collapse(true);
    } else {
      const nextText = document.createTextNode(`${token} `);
      range.insertNode(nextText);
      range.setStart(nextText, nextText.textContent?.length || 0);
      range.collapse(true);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    setMentionMenu(null);
    commit();
  };

  const stockTokenHtml = (stock: WatchStock) => (
    `<span data-token="stock" data-symbol="${escapeHtml(stock.symbol)}" data-label="${escapeHtml(stock.name)}" contenteditable="false">$${escapeHtml(stock.symbol)}</span>`
  );

  const updateSelectionUi = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setBubble(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      setBubble(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setBubble(null);
      return;
    }
    setBubble({ top: Math.max(70, rect.top - 44), left: rect.left + rect.width / 2 });
  };

  const updateSlashMenu = () => {
    const range = currentRange();
    if (!range || !range.collapsed) {
      setSlashMenu(null);
      return;
    }
    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
      setSlashMenu(null);
      return;
    }
    const before = range.startContainer.textContent?.slice(0, range.startOffset) || "";
    if (!/(^|\s)\/$/.test(before)) {
      setSlashMenu(null);
      return;
    }
    setSlashMenu(caretPosition(range));
  };

  const removeSlashTrigger = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.startContainer.nodeType !== Node.TEXT_NODE || range.startOffset <= 0) return;
    const text = range.startContainer.textContent || "";
    if (text[range.startOffset - 1] !== "/") return;
    range.startContainer.textContent = `${text.slice(0, range.startOffset - 1)}${text.slice(range.startOffset)}`;
    range.setStart(range.startContainer, range.startOffset - 1);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const runBlock = (type: "h2" | "h3" | "quote" | "ul" | "ol" | "divider" | "image" | "stock" | "tag") => {
    removeSlashTrigger();
    setSlashMenu(null);
    setMentionMenu(null);
    if (type === "h2") runCommand("formatBlock", "h2");
    if (type === "h3") runCommand("formatBlock", "h3");
    if (type === "quote") runCommand("formatBlock", "blockquote");
    if (type === "ul") runCommand("insertUnorderedList");
    if (type === "ol") runCommand("insertOrderedList");
    if (type === "divider") insertHtml("<hr>");
    if (type === "image") imageInputRef.current?.click();
    if (type === "stock") {
      insertText("$");
      window.setTimeout(updateMentionMenu, 0);
    }
    if (type === "tag") {
      insertText("@");
      window.setTimeout(updateMentionMenu, 0);
    }
  };

  useEffect(() => {
    const el = editorRef.current;
    if (!el || focused) return;
    const safe = sanitizeRichHtml(note.content || "");
    if (el.innerHTML !== safe) el.innerHTML = safe;
  }, [note.content, focused]);

  useEffect(() => {
    return () => {
      if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current);
      if (resizeMoveRef.current) window.removeEventListener("mousemove", resizeMoveRef.current);
    };
  }, []);

  useEffect(() => {
    if (!imageBox) return;
    const update = () => updateImageBox();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [imageBox]);

  useEffect(() => {
    const handleInsert = (event: Event) => {
      const token = (event as CustomEvent<string>).detail;
      if (token) insertText(token);
    };
    window.addEventListener("seekcost:rich-insert-token", handleInsert);
    return () => window.removeEventListener("seekcost:rich-insert-token", handleInsert);
  });

  const bubbleButton = "rounded-md px-2 py-1 text-xs text-secondary transition hover:bg-white/[0.06] hover:text-primary";
  const toolbarButton = "rounded-md border border-transparent px-2.5 py-1.5 text-xs text-secondary transition hover:border-white/[0.08] hover:bg-white/[0.05] hover:text-primary";
  const blockItems = [
    ["h2", t("research.heading"), t("research.headingDescription")],
    ["h3", t("research.subheading"), t("research.subheadingDescription")],
    ["quote", t("research.quote"), t("research.quoteDescription")],
    ["ul", t("research.list"), t("research.listDescription")],
    ["ol", t("research.numberedList"), t("research.numberedListDescription")],
    ["divider", t("research.divider"), t("research.dividerDescription")],
    ["stock", t("research.stockLink"), t("research.stockLinkDescription")],
    ["tag", t("research.tagLink"), t("research.tagLinkDescription")],
    ["image", t("research.image"), t("research.imageDescription")],
  ] as const;

  return (
    <div className="group/editor relative isolate overflow-visible rounded-lg border border-themed bg-surface shadow-[0_18px_80px_rgba(0,0,0,0.14)]">
      {bubble && (
        <div className="fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-[#15161d]/95 p-1 shadow-[0_18px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl" style={{ top: bubble.top, left: bubble.left }}>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")} className={bubbleButton}>B</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")} className={bubbleButton}>I</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "h2")} className={bubbleButton}>{t("research.heading")}</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "blockquote")} className={bubbleButton}>{t("research.quote")}</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertUnorderedList")} className={bubbleButton}>{t("research.list")}</button>
        </div>
      )}
      {slashMenu && (
        <div className="fixed z-50 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#15161d]/95 p-1.5 shadow-[0_22px_80px_rgba(0,0,0,0.38)] backdrop-blur-xl" style={{ top: slashMenu.top, left: slashMenu.left }}>
          <div className="px-3 pb-1.5 pt-2 text-[11px] text-muted">{t("research.insertBlock")}</div>
          {blockItems.map(([key, label, desc]) => (
            <button key={key} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runBlock(key)} className="block w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.06]">
              <span className="block text-sm text-primary">{label}</span>
              <span className="block text-[11px] text-muted">{desc}</span>
            </button>
          ))}
        </div>
      )}
      {mentionMenu && (stockMatches.length > 0 || tagMatches.length > 0 || mentionMenu.query) && (
        <div className="fixed z-50 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#15161d]/95 p-1.5 shadow-[0_22px_80px_rgba(0,0,0,0.38)] backdrop-blur-xl" style={{ top: mentionMenu.top, left: mentionMenu.left }}>
          <div className="px-3 pb-1.5 pt-2 text-[11px] text-muted">
            {mentionMenu.kind === "stock" ? t("research.chooseStock") : t("research.chooseTag")}
          </div>
          {mentionMenu.kind === "stock" && stockMatches.map((stock) => (
            <button key={stock.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => replaceCurrentToken(`$${stock.symbol}`, stockTokenHtml(stock))} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.06]">
              <span className="shrink-0 font-mono text-sm font-semibold text-sky-200">${stock.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-secondary">{stock.name}</span>
            </button>
          ))}
          {mentionMenu.kind === "tag" && tagMatches.map((tag) => (
            <button key={tag} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => replaceCurrentToken(`@${tag}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.06]">
              <span className="text-sm text-cyan-100">@{tag}</span>
            </button>
          ))}
          {((mentionMenu.kind === "stock" && stockMatches.length === 0) || (mentionMenu.kind === "tag" && tagMatches.length === 0)) && (
            <div className="px-3 py-2 text-xs text-muted">
              {mentionMenu.kind === "stock" ? t("research.noStockMatch") : t("research.noTagMatch")}
            </div>
          )}
        </div>
      )}
      {imageBox && (
        <div
          className="fixed z-40 pointer-events-none rounded-lg border border-sky-300/60 shadow-[0_0_0_1px_rgba(14,165,233,0.18),0_18px_50px_rgba(0,0,0,0.24)]"
          style={{ top: imageBox.top, left: imageBox.left, width: imageBox.width, height: imageBox.height }}
        >
          <div className="pointer-events-auto absolute -top-9 right-0 flex items-center gap-1 rounded-md border border-white/10 bg-[#15161d]/95 p-1 text-[11px] text-sky-100 shadow-xl backdrop-blur">
            <span className="px-1.5">{Math.round(imageBox.widthPct)}%</span>
            {([
              ["left", t("research.alignLeft")],
              ["center", t("research.alignCenter")],
              ["right", t("research.alignRight")],
            ] as ["left" | "center" | "right", string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setImageAlign(key)}
                aria-pressed={imageBox.align === key}
                className={`rounded px-1.5 py-0.5 transition ${imageBox.align === key ? "bg-sky-300/20 text-sky-100" : "text-secondary hover:bg-white/[0.08] hover:text-primary"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onMouseDown={beginImageResize}
            className="pointer-events-auto absolute -bottom-2 -right-2 h-4 w-4 rounded-full border border-sky-100/80 bg-sky-300 shadow-[0_0_18px_rgba(125,211,252,0.45)] transition hover:scale-110"
            aria-label={t("research.resizeImage")}
            title={t("research.resizeImageTitle")}
          />
        </div>
      )}
      <input
        ref={imageInputRef}
        type="file"
        accept={NOTE_IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => void insertImages(event.target.files || [])}
      />
      <div className="research-rich-toolbar flex flex-col gap-2 border-b border-themed px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-muted">{t("research.richText")}</span>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")} className={toolbarButton}>B</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")} className={toolbarButton}>I</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("strikeThrough")} className={toolbarButton}>S</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "h2")} className={toolbarButton}>H2</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "blockquote")} className={toolbarButton}>{t("research.quote")}</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertUnorderedList")} className={toolbarButton}>{t("research.list")}</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertOrderedList")} className={toolbarButton}>{t("research.numberedList")}</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertHtml("<hr>")} className={toolbarButton}>{t("research.divider")}</button>
          <button type="button" onClick={() => imageInputRef.current?.click()} className={toolbarButton}>{t("research.image")}</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runBlock("stock")} className={toolbarButton}>{t("research.insertStock")}</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runBlock("tag")} className={toolbarButton}>{t("research.insertTag")}</button>
          {imageError && <span className="px-2 text-[11px] text-amber-300">{imageError}</span>}
        </div>
        <span className="text-[11px] text-muted">{t("research.insertHint")}</span>
      </div>
      <div className="relative">
        <div className="absolute left-2 top-4 z-10 hidden opacity-0 transition group-hover/editor:opacity-60 hover:!opacity-100 xl:block">
          <button
            type="button"
            onClick={() => setInsertMenu((value) => !value)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-themed bg-surface text-lg leading-none text-muted shadow-lg transition hover:border-[var(--accent)] hover:bg-[var(--accent-bg)] hover:text-accent"
            aria-label={t("research.insertBlock")}
          >
            +
          </button>
          {insertMenu && (
            <div className="absolute left-10 top-0 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#15161d]/95 p-1.5 shadow-[0_22px_80px_rgba(0,0,0,0.38)] backdrop-blur-xl">
              <div className="px-3 pb-1.5 pt-2 text-[11px] text-muted">{t("research.insertBlock")}</div>
              {blockItems.map(([key, label, desc]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setInsertMenu(false);
                    runBlock(key);
                  }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
                >
                  <span className="block text-sm text-primary">{label}</span>
                  <span className="block text-[11px] text-muted">{desc}</span>
                </button>
              ))}
            </div>
          )}
          {imageError && <div className="absolute left-10 top-56 w-64 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{imageError}</div>}
        </div>
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={t("research.editorLabel")}
          suppressContentEditableWarning
          onFocus={() => setFocused(true)}
          onBlur={() => {
            commitNow();
            setFocused(false);
            setBubble(null);
            setSlashMenu(null);
            window.setTimeout(() => setMentionMenu(null), 120);
          }}
          onMouseUp={() => {
            updateSelectionUi();
            updateMentionMenu();
            updateImageBox();
          }}
          onClick={(event) => {
            selectImage(event.target);
          }}
          onKeyUp={() => {
            updateSelectionUi();
            updateSlashMenu();
            updateMentionMenu();
            updateImageBox();
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && onDone) {
              event.preventDefault();
              commitNow();
              void onDone();
              return;
            }
            if (imageBox && ["Backspace", "Delete", "Escape"].includes(event.key)) {
              if (event.key === "Escape") {
                selectedImageRef.current = null;
                setImageBox(null);
              }
            }
            if (applyMarkdownGesture(event)) return;
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
              event.preventDefault();
              runCommand("bold");
              return;
            }
            if (event.key === "Escape") {
              setSlashMenu(null);
              setMentionMenu(null);
              setBubble(null);
              return;
            }
            if ((event.key === "Enter" || event.key === "Tab") && mentionMenu) {
              const firstStock = mentionMenu.kind === "stock" ? stockMatches[0] : null;
              const firstTag = mentionMenu.kind === "tag" ? tagMatches[0] : null;
              if (firstStock || firstTag) {
                event.preventDefault();
                replaceCurrentToken(firstStock ? `$${firstStock.symbol}` : `@${firstTag}`, firstStock ? stockTokenHtml(firstStock) : undefined);
              }
            }
          }}
          onInput={(event) => {
            if (!pasteInProgressRef.current && (event.nativeEvent as InputEvent).inputType !== "insertFromPaste") clearPasteUndo();
            commit(250);
            window.setTimeout(() => {
              updateSlashMenu();
              updateMentionMenu();
            }, 0);
          }}
          onPaste={(event) => {
            event.preventDefault();
            setBubble(null);
            setSlashMenu(null);
            setMentionMenu(null);
            const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
            if (imageFiles.length) {
              void insertImages(imageFiles);
              return;
            }
            const html = event.clipboardData.getData("text/html");
            const text = event.clipboardData.getData("text/plain");
            pasteInProgressRef.current = true;
            setPasteUndo(sanitizeRichHtml(editorRef.current?.innerHTML || ""));
            if (html) {
              editorRef.current?.focus();
              document.execCommand("insertHTML", false, sanitizeRichHtml(html));
              commit();
            } else {
              document.execCommand("insertText", false, text);
              commit();
            }
            window.setTimeout(() => { pasteInProgressRef.current = false; }, 0);
          }}
          data-placeholder={t("research.editorPlaceholder")}
          className="seek-rich-doc min-h-[520px] w-full px-4 py-5 text-[15px] leading-8 text-primary caret-[var(--accent)] outline-none empty:before:pointer-events-none empty:before:block empty:before:text-muted empty:before:content-[attr(data-placeholder)] sm:px-6 sm:py-6 lg:min-h-[640px] xl:px-8 [&_blockquote]:my-5 [&_blockquote]:rounded-r-lg [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--accent)] [&_blockquote]:bg-white/[0.035] [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-secondary [&_code]:rounded [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_code]:text-primary [&_h1]:mb-5 [&_h1]:mt-8 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight [&_h2]:mb-4 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-8 [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_img]:my-5 [&_img]:max-h-[620px] [&_img]:w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-themed [&_img]:bg-input [&_img]:object-contain [&_li]:my-2 [&_li]:pl-1 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_pre]:my-6 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-themed [&_pre]:bg-input [&_pre]:px-4 [&_pre]:py-3 [&_strong]:font-semibold [&_strong]:text-primary [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-6"
        />
        {pasteUndo !== null && (
          <div className="research-paste-notice" role="status">
            <span>{t("research.pasteCleaned")}</span>
            <button type="button" onClick={() => {
              if (!editorRef.current) return;
              editorRef.current.innerHTML = pasteUndo;
              setPasteUndo(null);
              commitNow();
              editorRef.current.focus();
            }}>{t("research.undoPaste")}</button>
            <button type="button" onClick={() => setPasteUndo(null)}>{t("research.dismiss")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function RichContent({ html, emptyText }: { html: string; emptyText: string }) {
  const safeHtml = sanitizeRichHtml(html);
  let headingIndex = 0;
  const htmlWithHeadingIds = safeHtml.replace(/<(h[1-3])\b([^>]*)>/gi, (_match, tag: string, attributes: string) => `<${tag}${attributes} id="research-heading-${headingIndex++}">`);
  if (!hasRenderableContent({ content: safeHtml, format: "rich" })) {
    return <div className="flex min-h-80 items-center justify-center text-muted">{emptyText}</div>;
  }
  return (
    <div className="research-article-prose">
    <div
      className="text-[16px] leading-[1.8] text-secondary [&_blockquote]:my-7 [&_blockquote]:border-l-2 [&_blockquote]:border-sky-300/40 [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-input [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_h1]:mb-5 [&_h1]:mt-10 [&_h1]:text-[22px] [&_h1]:font-bold [&_h1]:leading-[1.4] [&_h1]:text-primary [&_h2]:mb-4 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:leading-[1.45] [&_h2]:text-primary [&_h3]:mb-3 [&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:leading-7 [&_h3]:text-primary [&_hr]:my-10 [&_hr]:border-themed [&_img]:my-7 [&_img]:max-h-[720px] [&_img]:w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-themed [&_img]:bg-input [&_img]:object-contain [&_li]:my-2 [&_ol]:my-7 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-6 [&_pre]:my-7 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-themed [&_pre]:bg-input [&_pre]:px-4 [&_pre]:py-3 [&_pre]:text-sm [&_pre]:leading-6 [&_strong]:font-semibold [&_strong]:text-primary [&_ul]:my-7 [&_ul]:space-y-4 [&_ul]:pl-0 [&_ul_li]:border-l-2 [&_ul_li]:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] [&_ul_li]:pl-3"
      dangerouslySetInnerHTML={{ __html: htmlWithHeadingIds }}
    />
    </div>
  );
}

function NotePreview({ note, tickerStocks = [] }: { note: WatchNote; tickerStocks?: WatchStock[] }) {
  const { t } = useI18n();
  const hasBody = hasRenderableContent(note);
  const articleRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    articleRef.current?.querySelectorAll("h1,h2,h3").forEach((heading, index) => {
      heading.id = `research-heading-${index}`;
    });
  }, [note.content, note.format]);
  return (
    <article ref={articleRef} className="research-article-prose min-h-[420px] text-base leading-8 text-secondary">
      {hasBody ? (
        note.format === "rich"
          ? <RichContent html={note.content} emptyText={t("research.noBody")} />
          : <MarkdownPreview source={note.content} sourceNoteId={note.id} tickerSummaries={tickerStocks} />
      ) : (
        <div className="flex min-h-80 items-center justify-center text-muted">{t("research.noBody")}</div>
      )}
    </article>
  );
}

function findAnchorOffset(text: string, comment: NoteComment) {
  const quote = comment.quoteText || "";
  if (!quote) return -1;
  if (comment.startOffset !== undefined && text.slice(comment.startOffset, comment.endOffset) === quote) {
    return comment.startOffset;
  }
  let best = -1;
  let bestScore = -1;
  let index = text.indexOf(quote);
  while (index >= 0) {
    const prefix = comment.quotePrefix || "";
    const suffix = comment.quoteSuffix || "";
    const score = Number(!prefix || text.slice(Math.max(0, index - prefix.length), index).endsWith(prefix))
      + Number(!suffix || text.slice(index + quote.length, index + quote.length + suffix.length).startsWith(suffix));
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
    index = text.indexOf(quote, index + 1);
  }
  return best;
}

function markTextRange(container: HTMLElement, start: number, end: number, commentId: string, active: boolean, pending = false) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const segments: Array<{ node: Text; start: number; end: number }> = [];
  let cursor = 0;
  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const next = cursor + node.data.length;
    if (next > start && cursor < end && !node.parentElement?.closest("[data-note-anchor]")) {
      segments.push({ node, start: Math.max(0, start - cursor), end: Math.min(node.data.length, end - cursor) });
    }
    cursor = next;
    current = walker.nextNode();
  }
  segments.reverse().forEach((segment, index) => {
    if (segment.end <= segment.start || !segment.node.parentNode) return;
    segment.node.splitText(segment.end);
    const selected = segment.node.splitText(segment.start);
    const mark = document.createElement("mark");
    mark.dataset.noteAnchor = commentId;
    mark.dataset.commentId = commentId;
    mark.className = `note-annotation-mark${active ? " is-active" : ""}${pending ? " is-pending" : ""}`;
    if (index === segments.length - 1) mark.id = `note-anchor-${commentId}`;
    selected.parentNode?.replaceChild(mark, selected);
    mark.appendChild(selected);
  });
}

function AnnotatedNotePreview({
  note,
  comments,
  onQuote,
  canComment,
  tickerStocks,
  onUseAsCoreThesis,
  pendingQuote,
  onSubmitPending,
  onClearPending,
  activeId: controlledActiveId,
  onActivateAnnotation,
}: {
  note: WatchNote;
  comments: NoteComment[];
  onQuote: (anchor: QuoteAnchor) => void;
  canComment: boolean;
  tickerStocks: WatchStock[];
  onUseAsCoreThesis?: (text: string) => Promise<boolean>;
  pendingQuote: QuoteAnchor | null;
  onSubmitPending: (content: string) => Promise<boolean>;
  onClearPending: () => void;
  activeId?: string | null;
  onActivateAnnotation?: (id: string) => void;
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const annotationInputRef = useRef<HTMLTextAreaElement | null>(null);
  const annotationDialogRef = useRef<HTMLDivElement | null>(null);
  const annotationTriggerRef = useRef<HTMLElement | null>(null);
  const [selectionAction, setSelectionAction] = useState<(QuoteAnchor & { top: number; left: number }) | null>(null);
  const [selectionCommitted, setSelectionCommitted] = useState(false);
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null);
  const selectedAnnotation = controlledActiveId ?? activeAnnotation;
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [submittingAnnotation, setSubmittingAnnotation] = useState(false);
  const [thesisState, setThesisState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const annotationComments = comments
    .filter((comment) => !comment.parentId && comment.quoteText)
    .sort((a, b) => (a.startOffset ?? Number.MAX_SAFE_INTEGER) - (b.startOffset ?? Number.MAX_SAFE_INTEGER));
  const repliesByParent = comments.reduce<Record<string, NoteComment[]>>((acc, comment) => {
    if (comment.parentId) acc[comment.parentId] = [...(acc[comment.parentId] || []), comment];
    return acc;
  }, {});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const text = container.textContent || "";
    const occupied = new Set<string>();
    const anchors = comments
      .filter((comment) => !comment.parentId && comment.quoteText)
      .map((comment) => ({ comment, start: findAnchorOffset(text, comment) }))
      .filter((item) => item.start >= 0)
      .sort((a, b) => b.start - a.start);
    for (const { comment, start } of anchors) {
      const key = `${start}:${start + (comment.quoteText?.length || 0)}`;
      if (occupied.has(key)) continue;
      occupied.add(key);
      markTextRange(container, start, start + (comment.quoteText?.length || 0), comment.id, selectedAnnotation === comment.id);
    }
    if (selectionAction) {
      markTextRange(container, selectionAction.startOffset, selectionAction.endOffset, "pending-selection", false, true);
    }
    return () => {
      container.querySelectorAll<HTMLElement>("[data-note-anchor]").forEach((mark) => {
        const parent = mark.parentNode;
        mark.replaceWith(...Array.from(mark.childNodes));
        parent?.normalize();
      });
    };
  });

  useEffect(() => {
    if (!selectionCommitted || pendingQuote) return;
    const timer = window.setTimeout(() => {
      setSelectionAction(null);
      setSelectionCommitted(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pendingQuote, selectionCommitted]);

  useEffect(() => {
    if (!pendingQuote) return;
    annotationTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => annotationInputRef.current?.focus(), 80);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.key !== "Escape" && event.key !== "Tab")) return;
      const highestPriority = Math.max(...Array.from(document.querySelectorAll<HTMLElement>("[data-research-overlay-priority]"))
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => Number(element.dataset.researchOverlayPriority || 0)));
      if (highestPriority > 100) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClearPending();
        return;
      }
      if (event.key !== "Tab" || !annotationDialogRef.current) return;
      const focusable = Array.from(annotationDialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"))
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => annotationTriggerRef.current?.focus(), 0);
    };
  }, [pendingQuote, onClearPending]);

  const readSelection = (delay = 0) => {
    if (!canComment) return;
    window.setTimeout(() => {
      const container = containerRef.current;
      const selection = window.getSelection();
      if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setSelectionAction(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setSelectionAction(null);
        return;
      }
      const quoteText = range.toString();
      if (quoteText.trim().length < 2 || quoteText.length > 500) {
        setSelectionAction(null);
        return;
      }
      const before = document.createRange();
      before.selectNodeContents(container);
      before.setEnd(range.startContainer, range.startOffset);
      const startOffset = before.toString().length;
      const endOffset = startOffset + quoteText.length;
      const fullText = container.textContent || "";
      const blockElement = (range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer as Element)
        ?.closest("p,h1,h2,h3,li,blockquote,pre");
      const blocks = Array.from(container.querySelectorAll("p,h1,h2,h3,li,blockquote,pre"));
      const blockIndex = blockElement ? blocks.indexOf(blockElement) : -1;
      const selectionRects = range.getClientRects();
      const rect = selectionRects[selectionRects.length - 1] || range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const actionWidth = onUseAsCoreThesis ? 292 : 112;
      const relativeTop = rect.top - containerRect.top;
      setSelectionAction({
        quoteText,
        quotePrefix: fullText.slice(Math.max(0, startOffset - 80), startOffset),
        quoteSuffix: fullText.slice(endOffset, endOffset + 80),
        startOffset,
        endOffset,
        blockId: blockIndex >= 0 ? `block-${blockIndex}` : undefined,
        top: relativeTop > 48 ? relativeTop - 44 : rect.bottom - containerRect.top + 8,
        left: Math.max(8, Math.min(containerRect.width - actionWidth - 8, rect.left - containerRect.left + rect.width / 2 - actionWidth / 2)),
      });
      setSelectionCommitted(false);
      setThesisState("idle");
      selection.removeAllRanges();
    }, delay);
  };

  const activateAnnotation = (commentId: string) => {
    setActiveAnnotation(commentId);
    onActivateAnnotation?.(commentId);
    document.getElementById(`note-anchor-${commentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const submitSelectionComment = async () => {
    const content = annotationDraft.trim();
    if (!content || submittingAnnotation) return;
    setSubmittingAnnotation(true);
    const sent = await onSubmitPending(content);
    if (!sent) setSubmittingAnnotation(false);
  };

  const saveCoreThesis = async () => {
    if (!selectionAction || !onUseAsCoreThesis || thesisState === "saving") return;
    setThesisState("saving");
    const saved = await onUseAsCoreThesis(selectionAction.quoteText.trim());
    setThesisState(saved ? "saved" : "failed");
  };

  return (
    <div>
      <div className="research-annotation-layout">
        <div
          ref={containerRef}
          className="note-annotation-scope relative min-w-0"
          onMouseUp={() => readSelection()}
          onTouchEnd={() => readSelection(120)}
          onClick={(event) => {
            const anchor = (event.target as HTMLElement).closest<HTMLElement>("[data-note-anchor]");
            if (anchor?.dataset.noteAnchor && anchor.dataset.noteAnchor !== "pending-selection") activateAnnotation(anchor.dataset.noteAnchor);
          }}
        >
          <NotePreview note={note} tickerStocks={tickerStocks} />
          <ResearchAnnotationLayer
            containerRef={containerRef}
            comments={annotationComments.map((comment) => ({ ...comment, replyCount: (repliesByParent[comment.id] || []).length }))}
            activeId={selectedAnnotation}
            onActivate={activateAnnotation}
            label={(count) => t("research.commentsOnSelectedText", { count })}
          />
          {selectionAction && (
            <div
              style={{ top: selectionAction.top, left: selectionAction.left }}
              onPointerDown={(event) => event.preventDefault()}
              onMouseUp={(event) => event.stopPropagation()}
              onTouchEnd={(event) => event.stopPropagation()}
              className="note-selection-actions absolute z-20"
            >
              <button
                type="button"
                onClick={() => {
                  setAnnotationDraft("");
                  setSubmittingAnnotation(false);
                  onQuote(selectionAction);
                  setSelectionCommitted(true);
                }}
              ><span aria-hidden="true">＋</span> {t("research.addComment")}</button>
              {onUseAsCoreThesis ? <button type="button" onClick={() => void saveCoreThesis()} disabled={thesisState === "saving"}>{t("research.useAsCoreThesis")}</button> : null}
              {thesisState !== "idle" && thesisState !== "saving" ? <span role="status" className={thesisState === "failed" ? "is-failed" : ""}>{thesisState === "saved" ? t("research.coreThesisUpdated") : t("research.coreThesisFailed")}</span> : null}
            </div>
          )}
        </div>
      </div>

      {pendingQuote && (
        <div ref={annotationDialogRef} className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-5" data-research-overlay-priority="100" role="dialog" aria-modal="true" aria-labelledby="selection-comment-title">
          <button type="button" tabIndex={-1} className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClearPending} aria-label={t("research.closePanel")} />
          <div className="note-annotation-dialog relative w-full overflow-hidden rounded-t-lg border border-[var(--annotation-border)] bg-[var(--surface)] shadow-2xl sm:max-w-[560px] sm:rounded-lg">
            <div className="flex items-center justify-between border-b border-themed px-4 py-3.5 sm:px-5">
              <div>
                <h3 id="selection-comment-title" className="text-sm font-semibold text-primary">{t("research.commentSelection")}</h3>
                <p className="mt-0.5 text-[11px] text-muted">{t("research.selectionHint")}</p>
              </div>
              <button type="button" onClick={onClearPending} className="flex h-11 w-11 items-center justify-center rounded-full text-lg text-muted transition hover:bg-input hover:text-primary" aria-label={t("research.closeComment")}>×</button>
            </div>

            <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pb-5">
              <blockquote className="note-annotation-quote-box max-h-28 overflow-y-auto rounded-md border-l-2 px-3 py-2.5">
                <p className="note-annotation-text text-xs leading-5">“{pendingQuote.quoteText}”</p>
              </blockquote>
              <textarea
                ref={annotationInputRef}
                value={annotationDraft}
                maxLength={1200}
                onChange={(event) => setAnnotationDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && annotationDraft.trim()) {
                    event.preventDefault();
                    void submitSelectionComment();
                  }
                }}
                rows={5}
                placeholder={t("research.thoughtPlaceholder")}
                className="mt-3 min-h-32 w-full resize-none bg-transparent text-[15px] leading-7 text-primary outline-none placeholder:text-muted"
              />

              <div className="mt-2 flex items-end justify-between gap-3 border-t border-themed pt-3">
                <div className="min-w-0">
                  <div className="flex gap-0.5 overflow-x-auto pb-1">
                    {COMMENT_EMOJIS.map((emoji) => (
                      <button key={emoji} type="button" onClick={() => setAnnotationDraft(`${annotationDraft}${emoji}`.slice(0, 1200))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base transition hover:bg-input" aria-label={t("research.insertEmoji", { emoji })}>{emoji}</button>
                    ))}
                  </div>
                  <p className={`mt-1 text-[10px] ${annotationDraft.length > 1100 ? "text-amber-400" : "text-muted"}`}>{t("research.sendCommentShortcut", { count: annotationDraft.length })}</p>
                </div>
                <button type="button" onClick={() => void submitSelectionComment()} disabled={!annotationDraft.trim() || submittingAnnotation} className="note-selection-action h-9 shrink-0 rounded-full border px-5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45">{submittingAnnotation ? t("research.sendingComment") : t("research.sendComment")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
