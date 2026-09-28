"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { useI18n } from "@/components/I18nProvider";
import type { ResearchRailComment } from "./ResearchCommentCard";

interface Group { id: string; comments: ResearchRailComment[]; top: number }

export default function ResearchAnnotationLayer({ containerRef, comments, activeId, onActivate, label }: { containerRef: RefObject<HTMLElement | null>; comments: ResearchRailComment[]; activeId: string | null; onActivate: (id: string) => void; label: (count: number) => string }) {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  useLayoutEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      if (!container) return;
      const next: Group[] = [];
      for (const comment of comments) {
        const mark = container.querySelector<HTMLElement>(`mark[data-note-anchor="${CSS.escape(comment.id)}"]`);
        if (!mark) continue;
        const top = mark.getBoundingClientRect().top - container.getBoundingClientRect().top;
        const group = next.find((item) => Math.abs(item.top - top) <= 24);
        if (group) group.comments.push(comment); else next.push({ id: comment.id, comments: [comment], top });
      }
      setGroups(next);
    };
    measure();
    const mutation = containerRef.current ? new MutationObserver(measure) : null;
    if (mutation && containerRef.current) mutation.observe(containerRef.current, { childList: true, subtree: true, characterData: true });
    const observer = typeof ResizeObserver !== "undefined" && containerRef.current ? new ResizeObserver(measure) : null;
    if (observer && containerRef.current) observer.observe(containerRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => { observer?.disconnect(); mutation?.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure); };
  }, [comments, containerRef]);
  if (!groups.length) return null;
  return <div className="research-annotation-layer" aria-label={t("research.annotationAnchors")}>{groups.map((group) => {
    const active = group.comments.some((comment) => comment.id === activeId);
    return <button key={group.id} type="button" className={active ? "is-active" : ""} style={{ top: group.top }} onClick={() => onActivate(group.comments[0].id)} aria-label={label(group.comments.length)}>{group.comments.length}</button>;
  })}</div>;
}
