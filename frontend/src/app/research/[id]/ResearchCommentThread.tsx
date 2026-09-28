"use client";

import ResearchCommentCard, { type ResearchRailComment } from "./ResearchCommentCard";

export interface ResearchCommentThreadProps {
  comments: ResearchRailComment[];
  activeId: string | null;
  mode: "context" | "all";
  labels: { thread: string; all: string; context: string; empty: string };
  onModeChange: (mode: "context" | "all") => void;
  onActivate: (commentId: string) => void;
  renderComposer: (parentId?: string) => React.ReactNode;
  renderComments?: (comments: ResearchRailComment[]) => React.ReactNode;
  locale: string;
  replyLabel: (count: number) => string;
  unresolvedLabel: string;
}

export default function ResearchCommentThread({ comments, activeId, mode, labels, onModeChange, onActivate, renderComposer, renderComments, locale, replyLabel, unresolvedLabel }: ResearchCommentThreadProps) {
  const anchored = comments.filter((comment) => Boolean(comment.quoteText));
  const visible = mode === "context" ? (activeId ? anchored.filter((comment) => comment.id === activeId) : anchored) : comments;
  const active = comments.find((comment) => comment.id === activeId);
  return <section className="research-comment-thread" role="complementary" aria-label={labels.thread}>
    {active?.quoteText && <button type="button" className="note-annotation-quote-box mb-4 block w-full border-l-2 px-3 py-2 text-left text-xs" onClick={() => onActivate(active.id)}>“{active.quoteText}”</button>}
    <div className="research-comment-thread__tabs" role="tablist">
      <button type="button" role="tab" aria-selected={mode === "context"} onClick={() => onModeChange("context")}>{labels.context}</button>
      <button type="button" role="tab" aria-selected={mode === "all"} onClick={() => onModeChange("all")}>{labels.all}</button>
    </div>
    {renderComments ? renderComments(visible) : visible.length ? visible.map((comment, index) => <ResearchCommentCard key={comment.id} comment={comment} index={index} locale={locale} active={comment.id === activeId} onActivate={() => onActivate(comment.id)} replyLabel={replyLabel} unresolvedLabel={unresolvedLabel} />) : <p className="py-8 text-center text-sm text-muted">{labels.empty}</p>}
    {renderComposer(active?.id)}
  </section>;
}
