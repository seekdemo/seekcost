"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import ResearchSaveStatus from "@/app/research/_components/ResearchSaveStatus";
import type { ResearchSaveState } from "@/app/research/_components/useResearchAutoSave";

export interface ResearchDocumentBarProps {
  mode: "reading" | "editing";
  title: string;
  titleVisible: boolean;
  starred: boolean;
  commentsExpanded?: boolean;
  outlineExpanded?: boolean;
  propertiesExpanded?: boolean;
  saveState?: ResearchSaveState;
  heading?: string;
  labels: {
    navigation: string;
    back: string;
    comments: string;
    outline: string;
    star: string;
    unstar: string;
    more: string;
    edit: string;
    done: string;
    preview: string;
    editContent: string;
    splitPreview: string;
    properties: string;
  };
  onBack: () => void;
  onComments: () => void;
  onOutline?: () => void;
  onToggleStar: () => void;
  onEdit: () => void;
  onDone: () => void;
  onRetrySave: () => void;
  onTogglePreview?: () => void;
  onToggleSplitPreview?: () => void;
  onToggleProperties?: () => void;
  previewMode?: "off" | "single" | "split";
  moreMenu?: ReactNode;
}

export default function ResearchDocumentBar({ mode, title, titleVisible, starred, commentsExpanded = false, outlineExpanded = false, propertiesExpanded = false, saveState, heading, labels, onBack, onComments, onOutline, onToggleStar, onEdit, onDone, onRetrySave, onTogglePreview, onToggleSplitPreview, onToggleProperties, previewMode = "off", moreMenu }: ResearchDocumentBarProps) {
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
    <nav className={`research-document-bar${mode === "reading" ? " research-document-bar--reading" : ""}`} aria-label={labels.navigation}>
      <div className="research-document-bar__inner">
        <button type="button" className="research-document-bar__back" onClick={onBack} aria-label={labels.back}>
          <span aria-hidden="true">←</span><span>{mode === "reading" && heading ? heading : labels.back}</span>
        </button>
        <span className={`research-document-bar__compact-title${titleVisible ? " is-hidden" : ""}`} aria-hidden={titleVisible}>{title}</span>
        {mode === "reading" ? null : (
        <div className="research-document-bar__actions">
          {saveState && <ResearchSaveStatus state={saveState} onRetry={onRetrySave} />}
          <button type="button" className="research-document-bar__comments" onClick={onComments} aria-label={labels.comments} aria-expanded={commentsExpanded}><span className="research-document-bar__comment-icon" aria-hidden="true" />{labels.comments}</button>
          {onTogglePreview && <button type="button" aria-pressed={previewMode === "single"} onClick={onTogglePreview}>{previewMode === "single" ? labels.editContent : labels.preview}</button>}
          {onToggleSplitPreview && <button type="button" className="research-document-bar__split" aria-pressed={previewMode === "split"} onClick={onToggleSplitPreview}>{labels.splitPreview}</button>}
          {onToggleProperties && <button type="button" onClick={onToggleProperties} aria-expanded={propertiesExpanded}>{labels.properties}</button>}
          <button type="button" className="ui-button ui-button--primary" onClick={onDone}>{labels.done}</button>
          <div className="research-document-menu" ref={menuRef} data-research-overlay-priority={open ? "110" : undefined}>
            <button ref={menuTriggerRef} type="button" className="research-document-menu__trigger" aria-label={labels.more} aria-expanded={open} onClick={() => setOpen((value) => !value)}>•••</button>
            {open && <div className="research-document-menu__panel" role="menu" onClick={() => setOpen(false)}>{moreMenu || <span role="menuitem">{labels.properties}</span>}</div>}
          </div>
        </div>
        )}
      </div>
    </nav>
  );
}
