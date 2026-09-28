"use client";

import ResearchCommentCard, { type ResearchRailComment } from "./ResearchCommentCard";

export default function ResearchCommentRail({ comments, activeId, locale, emptyLabel, replyLabel, unresolvedLabel, onActivate, compact = false, ariaLabel }: { comments: ResearchRailComment[]; activeId: string | null; locale: string; emptyLabel: string; replyLabel: (count: number) => string; unresolvedLabel: string; onActivate: (commentId: string) => void; compact?: boolean; ariaLabel?: string }) {
  if (!comments.length) return <div className="rounded-lg border border-dashed border-themed px-4 py-8 text-center text-xs leading-5 text-muted">{emptyLabel}</div>;
  if (compact) {
    return <div className="research-annotation-anchor-rail" aria-label={ariaLabel || emptyLabel}>{comments.length > 1 ? <button type="button" className={comments.some((comment) => comment.id === activeId) ? "is-active" : ""} onClick={() => onActivate(comments[0].id)} aria-label={`${comments.length} comments on selected text`}>{comments.length}</button> : comments.map((comment, index) => <button key={comment.id} type="button" className={activeId === comment.id ? "is-active" : ""} onClick={() => onActivate(comment.id)} aria-label={`${index + 1}. ${comment.quoteText || ""}`}>{index + 1}</button>)}</div>;
  }
  return (
    <div className="space-y-3">
      {comments.map((comment, index) => <ResearchCommentCard key={comment.id} comment={comment} index={index} locale={locale} active={activeId === comment.id} onActivate={() => onActivate(comment.id)} replyLabel={replyLabel} unresolvedLabel={unresolvedLabel} />)}
    </div>
  );
}
