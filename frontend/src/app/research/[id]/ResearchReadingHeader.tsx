"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export interface MarkdownSection {
  heading: string;
  body: string;
}

/** 按二级标题切分 Markdown；标题前的导语（如免责声明引用）归入 heading 为空的首段。 */
export function splitMarkdownSections(source: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let fenced = false;
  const preamble: string[] = [];
  let current: { heading: string; body: string[] } | null = null;
  for (const line of source.split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      (current ? current.body : preamble).push(line);
      continue;
    }
    if (!fenced) {
      const match = line.match(/^\s*##\s+(.+?)\s*#*\s*$/);
      if (match) {
        if (current) sections.push({ heading: current.heading, body: current.body.join("\n").trim() });
        current = { heading: match[1].trim(), body: [] };
        continue;
      }
    }
    (current ? current.body : preamble).push(line);
  }
  if (current) sections.push({ heading: current.heading, body: current.body.join("\n").trim() });
  const lead = preamble.join("\n").trim();
  if (lead) sections.unshift({ heading: "", body: lead });
  return sections;
}

function plainInline(source: string): string {
  return source
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[*_~`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((chunk) =>
      chunk
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !/^#{1,6}\s/.test(line) && !/^\s*[-*]\s/.test(line) && !/^\s*>\s?/.test(line))
        .join(" ")
    )
    .map(plainInline)
    .filter(Boolean);
}

interface CheckItem {
  text: string;
  checked: boolean | null;
}

function parseChecklist(body: string): CheckItem[] {
  const items: CheckItem[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    let match = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (match) {
      items.push({ text: plainInline(match[2]), checked: match[1].toLowerCase() === "x" });
      continue;
    }
    match = line.match(/^[-*]\s+(.+)$/);
    if (match) items.push({ text: plainInline(match[1]), checked: null });
  }
  return items.filter((item) => item.text);
}

const TOPIC_RE = /(研究主题|主题$)/;
const JUDGMENT_RE = /(关键判断|核心判断|关键结论)/;
const CHECKS_RE = /(下一步检查|下一次检查|下次检查|检查清单|待办)/;
const OBSERVE_RE = /(观察与思考|观察|思考|分析|背景)/;

export interface ReadingSummary {
  topicParagraphs: string[];
  judgmentParagraphs: string[];
  checks: CheckItem[];
}

/** 从正文提取摘要卡片所需内容；没有专用章节时回退到首个分析段/首个清单。 */
export function buildReadingSummary(content: string, format: string, reviewDone: boolean): ReadingSummary {
  const empty: ReadingSummary = { topicParagraphs: [], judgmentParagraphs: [], checks: [] };
  if (format !== "markdown") return empty;
  const sections = splitMarkdownSections(content);
  const named = (re: RegExp) => sections.find((section) => section.heading && re.test(section.heading));

  const topicSection = named(TOPIC_RE);
  const judgmentSection = named(JUDGMENT_RE);
  const checksSection = named(CHECKS_RE);

  let checks = checksSection ? parseChecklist(checksSection.body) : [];
  if (!checks.length) {
    for (const section of sections) {
      const candidate = parseChecklist(section.body);
      if (candidate.length >= 2) { checks = candidate; break; }
    }
  }
  checks = checks.map((item) => (item.checked === null ? { ...item, checked: reviewDone } : item));

  let judgmentParagraphs = judgmentSection ? toParagraphs(judgmentSection.body) : [];
  if (!judgmentParagraphs.length) {
    const observe = sections.find((section) => section.heading && OBSERVE_RE.test(section.heading));
    const pool = observe ? [observe, ...sections.filter((s) => s !== observe)] : sections;
    for (const section of pool) {
      if (!section.heading) continue;
      const paragraphs = toParagraphs(section.body);
      if (paragraphs.length) { judgmentParagraphs = paragraphs; break; }
    }
  }

  return {
    topicParagraphs: topicSection ? toParagraphs(topicSection.body) : [],
    judgmentParagraphs,
    checks,
  };
}

export interface ResearchReadingHeaderProps {
  titleId: string;
  title: string;
  kindLabel: string;
  status: { label: string; tone: "neutral" | "success" | "danger" };
  reviewBadge: { label: string; tone: "gold" | "amber" } | null;
  confidence: number | null;
  confidenceLabel: string;
  meta?: ReactNode;
  series?: { name: string; href: string } | null;
  seriesFavorite?: boolean;
  onToggleSeriesFavorite?: () => void;
  seriesStarLabels?: { star: string; unstar: string };
  tags: string[];
  stocks: { symbol: string; href: string }[];
  knowledgeTags: { tag: string; href: string }[];
  content: string;
  format: string;
  reviewDone: boolean;
  cover?: ReactNode;
  labels: {
    topic: string;
    judgment: string;
    checks: string;
    collectedIn: string;
  };
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="research-reading-header__shield-icon">
      <path d="M12 3.2l7 2.8v5.1c0 4.3-2.9 7.4-7 8.7-4.1-1.3-7-4.4-7-8.7V6l7-2.8z" fill="currentColor" opacity=".16" />
      <path d="M12 3.2l7 2.8v5.1c0 4.3-2.9 7.4-7 8.7-4.1-1.3-7-4.4-7-8.7V6l7-2.8z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.9 12.1l2.1 2.1 4.1-4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KindIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="research-reading-header__kind-icon">
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.2 8.5h7.6M8.2 12h7.6M8.2 15.5h4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MedalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8.4 3.5h7.2l-2.1 6.3h-3L8.4 3.5z" fill="currentColor" opacity=".55" />
      <circle cx="12" cy="14.4" r="5.1" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.1 14.4l1.4 1.4 2.5-2.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SummaryCard({ title, children, empty = false }: { title: string; children: ReactNode; empty?: boolean }) {
  return (
    <section className={`research-summary-card${empty ? " is-empty" : ""}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function ResearchReadingHeader({
  titleId,
  title,
  kindLabel,
  status,
  reviewBadge,
  confidence,
  confidenceLabel,
  meta,
  series,
  seriesFavorite = false,
  onToggleSeriesFavorite,
  seriesStarLabels,
  tags,
  stocks,
  knowledgeTags,
  content,
  format,
  reviewDone,
  cover,
  labels,
}: ResearchReadingHeaderProps) {
  const badgeMatch = title.match(/^(【[^】]+】)\s*([\s\S]*)$/);
  const badge = badgeMatch ? badgeMatch[1] : null;
  const rest = badgeMatch ? badgeMatch[2] : title;
  const summary = buildReadingSummary(content, format, reviewDone);
  const hasTopicContext = Boolean(summary.topicParagraphs.length || series || tags.length || stocks.length || knowledgeTags.length);
  const cards = [
    true,
    summary.judgmentParagraphs.length > 0,
    summary.checks.length > 0,
  ].filter(Boolean).length;

  return (
    <header className="research-reading-header">
      <div className="research-reading-header__title-row">
        <h1 id={titleId}>
          {badge && (
            <>
              <span className="research-reading-header__title-badge">{badge}</span>
              <span className="research-reading-header__title-divider" aria-hidden="true" />
            </>
          )}
          <span>{rest}</span>
        </h1>
        {confidence != null && confidence > 0 && (
          <span className="research-reading-header__confidence" title={confidenceLabel} aria-label={confidenceLabel}>
            <ShieldIcon />
            <strong>{confidence}/5</strong>
            <span className="research-reading-header__confidence-chevron" aria-hidden="true">›</span>
          </span>
        )}
      </div>

      <div className="research-reading-header__pill-row">
        <div className="research-reading-header__pills">
          <span className="research-status-pill research-status-pill--kind">
            <KindIcon />
            {kindLabel}
          </span>
          <span className={`research-status-pill research-status-pill--${status.tone}`}>{status.label}</span>
        </div>
        {reviewBadge && (
          <span className={`research-review-badge research-review-badge--${reviewBadge.tone}`}>
            <MedalIcon />
            {reviewBadge.label}
          </span>
        )}
      </div>

      {meta ? <div className="research-reading-header__meta">{meta}</div> : null}

      {cover ? <figure data-research-cover>{cover}</figure> : null}

      <div className={`research-summary-grid research-summary-grid--${cards}`}>
        <SummaryCard title={labels.topic} empty={!hasTopicContext}>
          {summary.topicParagraphs.length > 0 ? (
            summary.topicParagraphs.map((paragraph) => <p key={paragraph.slice(0, 12)}>{paragraph}</p>)
          ) : (
            <div className="research-summary-card__chips">
              {series && (
                <div className="research-summary-card__series">
                  <Link href={series.href}><span aria-hidden="true">§</span>{series.name}</Link>
                  {onToggleSeriesFavorite && seriesStarLabels && (
                    <button
                      type="button"
                      onClick={onToggleSeriesFavorite}
                      className={seriesFavorite ? "is-active" : ""}
                      aria-label={seriesFavorite ? seriesStarLabels.unstar : seriesStarLabels.star}
                      title={seriesFavorite ? seriesStarLabels.unstar : seriesStarLabels.star}
                    >
                      {seriesFavorite ? "★" : "☆"}
                    </button>
                  )}
                </div>
              )}
              {tags.length > 0 && <div className="research-summary-card__tagrow">{tags.slice(0, 6).map((tag) => <span key={tag} className="research-summary-chip">#{tag}</span>)}</div>}
              {stocks.length > 0 && (
                <div className="research-summary-card__tagrow">
                  {stocks.slice(0, 6).map((stock) => (
                    <Link key={stock.symbol} href={stock.href} className="research-summary-chip is-link">{stock.symbol}</Link>
                  ))}
                </div>
              )}
              {knowledgeTags.length > 0 && (
                <div className="research-summary-card__tagrow">
                  {knowledgeTags.slice(0, 6).map((item) => (
                    <Link key={item.tag} href={item.href} className="research-summary-chip is-link">#{item.tag}</Link>
                  ))}
                </div>
              )}
              {!hasTopicContext && <p className="research-summary-card__placeholder">—</p>}
            </div>
          )}
        </SummaryCard>

        {summary.judgmentParagraphs.length > 0 && (
          <SummaryCard title={labels.judgment}>
            {summary.judgmentParagraphs.map((paragraph) => <p key={paragraph.slice(0, 12)}>{paragraph}</p>)}
          </SummaryCard>
        )}

        {summary.checks.length > 0 && (
          <SummaryCard title={labels.checks}>
            <ul className="research-summary-card__checks">
              {summary.checks.map((item) => (
                <li key={item.text.slice(0, 16)} data-checked={item.checked ? "true" : "false"}>
                  <span className="research-summary-card__checkbox" aria-hidden="true">
                    {item.checked ? (
                      <svg viewBox="0 0 16 16" fill="none"><path d="M3.5 8.4l2.8 2.8 6.2-6.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    ) : null}
                  </span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </SummaryCard>
        )}
      </div>
    </header>
  );
}
