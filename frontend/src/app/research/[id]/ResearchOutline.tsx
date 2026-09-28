"use client";

import { useEffect, useRef, useState } from "react";

export interface ResearchOutlineItem {
  id: string;
  label: string;
  level: 1 | 2 | 3;
}

export function outlineFromMarkdown(source: string): ResearchOutlineItem[] {
  let fenced = false;
  const items: ResearchOutlineItem[] = [];
  for (const line of source.split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const label = match[2].replace(/\[([^\]]+)]\([^)]+\)|[*_~`]/g, "$1").trim();
    if (label) items.push({ id: `research-heading-${items.length}`, label, level: match[1].length as 1 | 2 | 3 });
  }
  return items;
}

export function outlineFromRichHtml(source: string): ResearchOutlineItem[] {
  const items: ResearchOutlineItem[] = [];
  for (const match of source.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const label = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
    if (label) items.push({ id: `research-heading-${items.length}`, label, level: Number(match[1]) as 1 | 2 | 3 });
  }
  return items;
}

function headingForItem(item: ResearchOutlineItem, items: ResearchOutlineItem[]) {
  const existing = document.getElementById(item.id);
  if (existing) return existing;
  const index = items.findIndex((candidate) => candidate.id === item.id);
  const heading = Array.from(document.querySelectorAll<HTMLElement>(".research-article-prose h1, .research-article-prose h2, .research-article-prose h3"))[index];
  if (heading) heading.id = item.id;
  return heading;
}

export default function ResearchOutline({ items, title, ariaLabel, onNavigate }: { items: ResearchOutlineItem[]; title: string; ariaLabel?: string; onNavigate?: () => void }) {
  const [activeId, setActiveId] = useState(items[0]?.id || "");
  const outlineRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!items.length) return;
    const update = () => {
      const candidates = items
        .map((item) => ({ id: item.id, top: headingForItem(item, items)?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY }))
        .filter((item) => Number.isFinite(item.top));
      const current = [...candidates].reverse().find((item) => item.top <= 112) || candidates[0];
      if (current) setActiveId(current.id);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [items]);

  useEffect(() => {
    const outline = outlineRef.current;
    const active = outline?.querySelector<HTMLElement>(`[data-outline-id="${CSS.escape(activeId)}"]`);
    if (!outline || !active) return;
    const itemTop = active.offsetTop;
    const itemBottom = itemTop + active.offsetHeight;
    const visibleTop = outline.scrollTop;
    const visibleBottom = visibleTop + outline.clientHeight;
    if (itemTop < visibleTop + 40) outline.scrollTo({ top: Math.max(0, itemTop - 48), behavior: "auto" });
    else if (itemBottom > visibleBottom - 8) outline.scrollTo({ top: itemBottom - outline.clientHeight + 16, behavior: "auto" });
  }, [activeId]);

  if (items.length < 2) return null;
  return (
    <nav ref={outlineRef} className="research-outline" data-quiet-outline="true" aria-label={ariaLabel || title}>
      <p>{title}</p>
      <ol>
        {items.map((item) => (
          <li key={item.id} data-level={item.level}>
            <button
              type="button"
              data-outline-id={item.id}
              className={activeId === item.id ? "is-active" : ""}
              aria-current={activeId === item.id ? "location" : undefined}
              onClick={() => {
                const heading = headingForItem(item, items);
                if (heading) {
                  const behavior = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
                  window.scrollTo({ top: Math.max(0, heading.getBoundingClientRect().top + window.scrollY - 88), behavior });
                }
                onNavigate?.();
              }}
            >{item.label}</button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
