"use client";

import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/components/I18nProvider";
import { htmlClipboardToMarkdown } from "@/lib/markdown";

import MarkdownPreview from "./MarkdownPreview";
import MarkdownToolbar, { type MarkdownAction } from "./MarkdownToolbar";
import "./markdown-editor.css";

type EditorMode = "edit" | "preview";
export type MarkdownPreviewMode = "off" | "single" | "split";
export type MarkdownSaveState = "idle" | "unsaved" | "saving" | "saved" | "failed";

function insertLinePrefix(value: string, start: number, end: number, prefix: string) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const selectedEnd = value.indexOf("\n", end);
  const lineEnd = selectedEnd < 0 ? value.length : selectedEnd;
  const selected = value.slice(lineStart, lineEnd);
  const lines = selected.split("\n").map((line, index) => {
    if (prefix === "1. ") return `${index + 1}. ${line.replace(/^\d+\.\s+/, "")}`;
    return `${prefix}${line.replace(/^(?:[-*+]\s+|>\s+)/, "")}`;
  });
  return { value: `${value.slice(0, lineStart)}${lines.join("\n")}${value.slice(lineEnd)}`, start: lineStart, end: lineStart + lines.join("\n").length };
}

export default function MarkdownEditor({
  label,
  value,
  onChange,
  placeholder,
  minHeight = "180px",
  defaultMode = "edit",
  saveState = "idle",
  onSave,
  tone = "default",
  emptyLabel,
  mentionSuggestions = [],
  maxLength,
  previewMode,
  previewLabel,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minHeight?: string;
  defaultMode?: EditorMode;
  saveState?: MarkdownSaveState;
  onSave?: () => void | Promise<void>;
  tone?: "default" | "warning";
  emptyLabel?: string;
  mentionSuggestions?: string[];
  maxLength?: number;
  previewMode?: MarkdownPreviewMode;
  previewLabel?: string;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const [mode, setMode] = useState<EditorMode>(defaultMode);
  const controlledPreview = previewMode !== undefined;
  const effectiveMode = controlledPreview ? (previewMode === "single" ? "preview" : "edit") : mode;
  const split = controlledPreview && previewMode === "split";
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [pasteUndo, setPasteUndo] = useState<string | null>(null);
  const dirty = saveState === "unsaved";
  const mentionMatches = mention
    ? mentionSuggestions.filter((item) => item.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    if (!dirty || typeof window === "undefined") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!autoFocus) return;
    const frame = window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus]);

  const rememberSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    selectionRef.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
  };

  const detectMention = (nextValue: string, cursor: number) => {
    if (!mentionSuggestions.length) return;
    const match = nextValue.slice(0, cursor).match(/(?:^|\s)@([\p{Script=Han}A-Za-z0-9_-]{0,24})$/u);
    setMention(match ? { start: cursor - match[1].length - 1, query: match[1] } : null);
  };

  const chooseMention = (suggestion: string) => {
    const textarea = textareaRef.current;
    if (!textarea || !mention) return;
    const token = `@${suggestion} `;
    const cursor = mention.start + token.length;
    setPasteUndo(null);
    onChange(`${value.slice(0, mention.start)}${token}${value.slice(textarea.selectionStart)}`);
    setMention(null);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
      rememberSelection();
    });
  };

  const replaceSelection = (replacement: string, startOffset: number, endOffset: number) => {
    const textarea = textareaRef.current;
    const { start, end } = textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : selectionRef.current;
    const currentValue = textarea?.value ?? value;
    const next = `${currentValue.slice(0, start)}${replacement}${currentValue.slice(end)}`;
    setPasteUndo(null);
    onChange(next);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(start + startOffset, start + replacement.length - endOffset);
      rememberSelection();
    });
  };

  const runAction = (action: MarkdownAction) => {
    rememberSelection();
    const textarea = textareaRef.current;
    const { start, end } = textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : selectionRef.current;
    const currentValue = textarea?.value ?? value;
    const selected = currentValue.slice(start, end);
    if (action === "bold") return replaceSelection(`**${selected || t("stock.markImportant")}**`, 2, 2);
    if (action === "italic") return replaceSelection(`*${selected || t("stock.emphasis")}*`, 1, 1);
    if (action === "heading") return replaceSelection(`## ${selected || t("stock.heading")}`, 3, 0);
    if (action === "bullet") {
      const next = insertLinePrefix(currentValue, start, end, "- ");
      setPasteUndo(null);
      onChange(next.value);
      requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(next.start, next.end); });
      return;
    }
    if (action === "numbered") {
      const next = insertLinePrefix(currentValue, start, end, "1. ");
      setPasteUndo(null);
      onChange(next.value);
      requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(next.start, next.end); });
      return;
    }
    if (action === "quote") return replaceSelection(`> ${selected || t("stock.quote")}`, 2, 0);
    if (action === "code") return replaceSelection(`\`\`\`\n${selected || t("stock.code")}\n\`\`\``, 4, 4);
    if (action === "link") return replaceSelection(`[${selected || t("stock.link")}](https://)`, 1, 8);
    return replaceSelection("|  |  |\n| --- | --- |\n|  |  |", 0, 0);
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    const plain = event.clipboardData.getData("text/plain");
    const converted = html ? htmlClipboardToMarkdown(html) : "";
    const pasted = converted.trim() || plain;
    if (!pasted) return;
    const textarea = textareaRef.current;
    const currentValue = textarea?.value ?? value;
    const start = textarea?.selectionStart ?? currentValue.length;
    const end = textarea?.selectionEnd ?? start;
    setPasteUndo(currentValue);
    const next = `${currentValue.slice(0, start)}${pasted}${currentValue.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const cursor = start + pasted.length;
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  };

  const undoCleanedPaste = () => {
    if (pasteUndo === null) return;
    onChange(pasteUndo);
    setPasteUndo(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const statusText = {
    idle: "",
    unsaved: t("stock.editorUnsaved"),
    saving: t("stock.editorSaving"),
    saved: t("stock.editorSaved"),
    failed: t("stock.editorSaveFailed"),
  }[saveState];

  return (
    <section className="writing-editor" data-save-state={saveState} data-tone={tone} aria-label={label}>
      <div className="writing-editor__toolbar">
        <MarkdownToolbar onAction={runAction} disabled={effectiveMode === "preview"} />
        {!controlledPreview && <div className="writing-editor__modes" role="group" aria-label={t("stock.editorMode")}>
          <button type="button" aria-pressed={mode === "edit"} onClick={() => { setMode("edit"); requestAnimationFrame(() => textareaRef.current?.focus()); }}>{t("stock.edit")}</button>
          <button type="button" aria-pressed={mode === "preview"} onClick={() => { rememberSelection(); setMode("preview"); setMention(null); }}>{t("stock.preview")}</button>
        </div>}
      </div>
      <div className={`research-editor-layout min-w-0${split ? " is-split" : ""}`} data-editor-layout={split ? "split" : effectiveMode}>
        <div className={`${effectiveMode === "preview" ? "hidden" : "block"} research-editor-layout__source relative min-w-0 border-themed`}>
          {mention && mentionMatches.length > 0 && (
            <div className="absolute left-3 top-3 z-20 w-[min(18rem,calc(100%-1.5rem))] overflow-hidden rounded-lg border border-themed bg-page shadow-xl">
              <div className="border-b border-themed px-3 py-2 text-[11px] text-muted">{t("stock.chooseTag")}</div>
              {mentionMatches.map((suggestion) => (
                <button key={suggestion} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseMention(suggestion)} className="block min-h-10 w-full px-3 py-2 text-left text-sm text-secondary transition hover:bg-surface-hover hover:text-primary">@{suggestion}</button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            autoFocus={autoFocus}
            value={value}
            maxLength={maxLength}
            aria-label={label}
            placeholder={placeholder}
            onChange={(event) => { setPasteUndo(null); onChange(event.target.value); detectMention(event.target.value, event.target.selectionStart); }}
            onSelect={rememberSelection}
            onClick={(event) => { rememberSelection(); detectMention(event.currentTarget.value, event.currentTarget.selectionStart); }}
            onKeyUp={(event) => { rememberSelection(); detectMention(event.currentTarget.value, event.currentTarget.selectionStart); }}
            onPaste={onPaste}
            onKeyDown={(event) => {
              if (mention && mentionMatches.length > 0 && (event.key === "Enter" || event.key === "Tab")) {
                event.preventDefault();
                chooseMention(mentionMatches[0]);
                return;
              }
              if (event.key === "Escape") setMention(null);
              if (!event.nativeEvent.isComposing && (event.metaKey || event.ctrlKey) && event.key === "Enter" && onSave && saveState !== "saving") {
                event.preventDefault();
                void onSave();
              }
            }}
            style={{ minHeight }}
            className="writing-editor__input"
          />
        </div>
        {(effectiveMode === "preview" || split) && <section aria-label={previewLabel} className="research-editor-layout__preview research-article-prose min-w-0 px-4 py-4" style={{ minHeight }}>
          <MarkdownPreview source={value} emptyLabel={emptyLabel || t("stock.noMarkdownPreview")} />
        </section>}
      </div>
      <div className="writing-editor__footer">
        <span className="writing-editor__status"><span>{label}</span><span aria-live="polite" className={saveState === "failed" ? "text-red-400" : ""}>{statusText}</span></span>
        <span className="flex flex-wrap items-center justify-end gap-2">
          {pasteUndo !== null && (
            <span className="inline-flex items-center gap-1.5 text-secondary" aria-live="polite">
              {t("research.pasteCleaned")}
              <button type="button" onClick={undoCleanedPaste} className="rounded px-1.5 py-1 text-accent hover:bg-surface-hover">{t("research.undoPaste")}</button>
              <button type="button" onClick={() => setPasteUndo(null)} className="rounded px-1.5 py-1 text-muted hover:bg-surface-hover hover:text-primary">{t("research.dismiss")}</button>
            </span>
          )}
          <span>{maxLength ? `${value.length}/${maxLength}` : ""}{onSave && <span>{maxLength ? " · " : ""}{t("stock.editorShortcut")}</span>}</span>
        </span>
      </div>
    </section>
  );
}
