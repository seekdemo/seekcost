"use client";

export interface ResearchRailComment {
  id: string;
  content: string;
  quoteText?: string;
  anchorStatus?: string;
  createdAt: string;
  author: { nickname: string };
  replyCount?: number;
  reactions?: { emoji: string; count: number; reacted: boolean }[];
}

export default function ResearchCommentCard({ comment, index, locale, active, onActivate, replyLabel, unresolvedLabel }: { comment: ResearchRailComment; index: number; locale: string; active: boolean; onActivate: () => void; replyLabel: (count: number) => string; unresolvedLabel: string }) {
  const unresolved = Boolean(comment.anchorStatus && !["ok", "resolved"].includes(comment.anchorStatus));
  return (
    <button id={`annotation-card-${comment.id}`} type="button" onClick={onActivate} className={`note-annotation-card block w-full rounded-lg border-l-2 px-3 py-3 text-left transition${active ? " is-active" : ""}`}>
      <div className="note-annotation-muted flex items-center justify-between gap-2 text-[10px]">
        <span className="note-annotation-text truncate font-medium">{index + 1}. {comment.author.nickname}</span>
        <span className="shrink-0">{new Date(comment.createdAt).toLocaleDateString(locale, { month: "short", day: "numeric" })}</span>
      </div>
      {comment.quoteText && <p className="note-annotation-muted mt-2 line-clamp-2 text-[11px] leading-5">“{comment.quoteText}”</p>}
      <p className="note-annotation-text mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-5">{comment.content}</p>
      <div className="note-annotation-muted mt-2 flex items-center justify-between gap-2 text-[10px]">
        <span>{comment.replyCount ? replyLabel(comment.replyCount) : ""}</span>
        {unresolved && <span className="text-amber-400">{unresolvedLabel}</span>}
      </div>
    </button>
  );
}
