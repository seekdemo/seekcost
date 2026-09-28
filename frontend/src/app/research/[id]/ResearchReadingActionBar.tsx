"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface ResearchReadingActionBarProps {
  commentCount: number;
  commentsExpanded?: boolean;
  labels: {
    navigation: string;
    back: string;
    comments: string;
    edit: string;
    export: string;
    more: string;
  };
  onBack: () => void;
  onComments: () => void;
  onEdit: () => void;
  onExport: () => void;
  moreMenu?: ReactNode;
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H9.2l-4 3v-3H4.5A1.5 1.5 0 0 1 3 15.5V7a1.5 1.5 0 0 1 1.5-1.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7.5 10.2h9M7.5 13.2h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v10m0 0l-3.6-3.6M12 14l3.6-3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 16.5v1.6A1.9 1.9 0 0 0 6.9 20h10.2a1.9 1.9 0 0 0 1.9-1.9v-1.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19.5h4.2L19.3 8.4a2 2 0 0 0 0-2.8l-1.9-1.9a2 2 0 0 0-2.8 0L3.5 14.8v4.7h.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13.2 5.3l4.5 4.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** 研究详情阅读态的底部浮动操作栏：返回 / 评论 / 编辑 / 导出 / 更多。 */
export default function ResearchReadingActionBar({ commentCount, commentsExpanded = false, labels, onBack, onComments, onEdit, onExport, moreMenu }: ResearchReadingActionBarProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreMenuFocus = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      restoreMenuFocus.current = true;
      setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("pointerdown", onPointerDown); };
  }, [open]);

  useEffect(() => {
    if (open || !restoreMenuFocus.current) return;
    restoreMenuFocus.current = false;
    menuTriggerRef.current?.focus();
  }, [open]);

  return (
    <nav className="research-reading-actions" aria-label={labels.navigation}>
      <button type="button" className="research-reading-actions__back" onClick={onBack}>
        <span aria-hidden="true">←</span>
        <span>{labels.back}</span>
      </button>
      <span aria-hidden="true" className="research-reading-actions__spacer" />
      <button type="button" className="research-reading-actions__comments" onClick={onComments} aria-expanded={commentsExpanded}>
        <CommentIcon />
        <span>{labels.comments}</span>
        <em>{commentCount}</em>
      </button>
      <span aria-hidden="true" className="research-reading-actions__spacer" />
      <div className="research-reading-actions__group">
        <button type="button" className="research-reading-actions__edit" onClick={onEdit}>
          <EditIcon />
          <span>{labels.edit}</span>
        </button>
        <button type="button" className="research-reading-actions__export" onClick={onExport}>
          <DownloadIcon />
          <span>{labels.export}</span>
        </button>
        <div className="research-reading-actions__menu" ref={menuRef} data-research-overlay-priority={open ? "110" : undefined}>
          <button ref={menuTriggerRef} type="button" className="research-reading-actions__more" aria-label={labels.more} aria-expanded={open} onClick={() => setOpen((value) => !value)}>•••</button>
          {open && <div className="research-reading-actions__menu-panel" role="menu" onClick={() => setOpen(false)}>{moreMenu}</div>}
        </div>
      </div>
    </nav>
  );
}
