"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { useI18n } from "@/components/I18nProvider";
import ResearchTickerMention, { type ResearchTickerSummary } from "@/components/research/ResearchTickerMention";

export function sanitizeMarkdownUrl(url: string): string | null {
  const value = url.trim();
  return /^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value) ? value : null;
}

function sanitizeMarkdownImageUrl(url: string): string | null {
  const value = url.trim();
  return /^https?:\/\//i.test(value) || /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value) ? value : null;
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tickerMapFrom(stocks: ResearchTickerSummary[]) {
  return new Map(stocks.map((stock) => [stock.symbol.toUpperCase(), stock]));
}

function tokenizeResearchText(value: string, sourceNoteId?: string, tickerMap = new Map<string, ResearchTickerSummary>()) {
  if (!sourceNoteId) return value;
  const knownSymbols = [...tickerMap.keys()].sort((a, b) => b.length - a.length).map(escapePattern);
  const knownPattern = knownSymbols.length ? `|\\b(?:${knownSymbols.join("|")})\\b` : "";
  const parts = value.split(new RegExp(`(\\$[A-Za-z0-9.-]{1,12}|@[\\p{Script=Han}A-Za-z0-9_-]{1,24}${knownPattern})`, "giu"));
  if (parts.length === 1) return value;
  return parts.map((part, index) => {
    if (/^\$[A-Za-z0-9.-]{1,12}$/.test(part)) {
      const symbol = part.slice(1).toUpperCase();
      const stock = tickerMap.get(symbol);
      if (stock) return <ResearchTickerMention key={`${part}-${index}`} stock={stock} label={part} />;
      return <Link key={`${part}-${index}`} href={`/watchlist?symbol=${encodeURIComponent(symbol)}&fromNote=${encodeURIComponent(sourceNoteId)}`} className="research-markdown-token is-stock">{part}</Link>;
    }
    if (/^@[\p{Script=Han}A-Za-z0-9_-]{1,24}$/u.test(part)) {
      const tag = part.slice(1);
      return <Link key={`${part}-${index}`} href={`/watchlist?view=sector&tag=${encodeURIComponent(tag)}`} className="research-markdown-token is-tag">{part}</Link>;
    }
    const stock = tickerMap.get(part.toUpperCase());
    if (stock) return <ResearchTickerMention key={`${part}-${index}`} stock={stock} label={part} />;
    return part;
  });
}

function tokenizeChildren(children: ReactNode, sourceNoteId?: string, tickerMap?: Map<string, ResearchTickerSummary>): ReactNode {
  if (!sourceNoteId) return children;
  if (typeof children === "string") return tokenizeResearchText(children, sourceNoteId, tickerMap);
  if (Array.isArray(children)) return children.map((child) => tokenizeChildren(child, sourceNoteId, tickerMap));
  return children;
}

function plainText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(plainText).join("");
  return "";
}

function MarkdownCode({ children, className }: { children?: ReactNode; className?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const code = String(children ?? "").replace(/\n$/, "");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border border-themed bg-[#111827]">
      <button type="button" onClick={() => void copy()} className="absolute right-2 top-2 min-h-10 rounded-md border border-white/10 bg-white/10 px-2.5 text-[11px] text-white/75 opacity-60 transition sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100" aria-label={t("stock.copyCode")}>
        {copied ? t("stock.copied") : t("stock.copyCode")}
      </button>
      <pre className="overflow-x-auto p-4 text-xs leading-6 text-slate-100"><code className={className}>{code}</code></pre>
    </div>
  );
}

function markdownComponents(sourceNoteId?: string, tickerSummaries: ResearchTickerSummary[] = []): Components {
  let headingIndex = 0;
  const headingId = () => sourceNoteId ? `research-heading-${headingIndex++}` : undefined;
  const tickerMap = tickerMapFrom(tickerSummaries);
  return {
  a: ({ href, children }) => {
    const safeHref = sanitizeMarkdownUrl(href || "");
    if (!safeHref) return <>{children}</>;
    const label = plainText(children).trim();
    const isTimestamp = /^(?:\d{1,2}:)?\d{2}:\d{2}$/.test(label);
    if (safeHref.startsWith("/")) return <Link href={safeHref}>{children}</Link>;
    return <a href={safeHref} target="_blank" rel="noreferrer" className={isTimestamp ? "research-markdown-timestamp" : undefined} data-research-timestamp={isTimestamp ? "true" : undefined}>{children}</a>;
  },
  p: ({ children }) => <p>{tokenizeChildren(children, sourceNoteId, tickerMap)}</p>,
  li: ({ children }) => <li>{tokenizeChildren(children, sourceNoteId, tickerMap)}</li>,
  h1: ({ children }) => <h1 id={headingId()}>{tokenizeChildren(children, sourceNoteId, tickerMap)}</h1>,
  h2: ({ children }) => <h2 id={headingId()}>{tokenizeChildren(children, sourceNoteId, tickerMap)}</h2>,
  h3: ({ children }) => <h3 id={headingId()}>{tokenizeChildren(children, sourceNoteId, tickerMap)}</h3>,
  blockquote: ({ children }) => <blockquote>{tokenizeChildren(children, sourceNoteId, tickerMap)}</blockquote>,
  td: ({ children }) => <td>{tokenizeChildren(children, sourceNoteId, tickerMap)}</td>,
  th: ({ children }) => <th>{tokenizeChildren(children, sourceNoteId, tickerMap)}</th>,
  img: ({ src, alt }) => {
    const safeSrc = sanitizeMarkdownImageUrl(typeof src === "string" ? src : "");
    if (!safeSrc) return null;
    {/* eslint-disable-next-line @next/next/no-img-element -- Markdown content may include data URLs and externally hosted research images. */}
    return <img src={safeSrc} alt={alt || ""} loading="lazy" className="my-5 max-h-[720px] w-full rounded-lg border border-themed bg-input object-contain" />;
  },
  input: ({ checked, disabled }) => <input type="checkbox" checked={checked} disabled={disabled ?? true} readOnly aria-label={checked ? "Completed" : "Not completed"} />,
  code: ({ className, children, ...props }) => <code className={className} {...props}>{children}</code>,
  pre: ({ children }) => {
    const child = Array.isArray(children) ? children[0] : children;
    if (child && typeof child === "object" && "props" in child) {
      const props = child.props as { children?: ReactNode; className?: string };
      return <MarkdownCode className={props.className}>{props.children}</MarkdownCode>;
    }
    return <pre>{children}</pre>;
  },
  table: ({ children }) => <div className="my-4 overflow-x-auto"><table>{children}</table></div>,
  };
}

export function renderMarkdown(source: string, sourceNoteId?: string, tickerSummaries: ResearchTickerSummary[] = []): ReactNode {
  if (!source.trim()) return null;
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={markdownComponents(sourceNoteId, tickerSummaries)}>{source}</ReactMarkdown>;
}

export default function MarkdownPreview({ source, emptyLabel = "Markdown preview appears here.", className = "", sourceNoteId, tickerSummaries = [] }: { source: string; emptyLabel?: string; className?: string; sourceNoteId?: string; tickerSummaries?: ResearchTickerSummary[] }) {
  return (
    <div className={`markdown-preview min-w-0 text-sm leading-7 text-secondary [&_a]:text-accent [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-amber-300/70 [&_blockquote]:pl-4 [&_blockquote]:text-secondary [&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-primary [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-primary [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-primary [&_hr]:my-6 [&_li]:my-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:my-3 [&_strong]:font-semibold [&_strong]:text-primary [&_ul]:ml-5 [&_ul]:list-disc ${className}`}>
      {source.trim() ? renderMarkdown(source, sourceNoteId, tickerSummaries) : <p className="text-muted">{emptyLabel}</p>}
    </div>
  );
}
