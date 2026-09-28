"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";

const ALLOWED_RICH_TEXT_TAGS = new Set(["a", "blockquote", "br", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ol", "p", "strong", "ul"]);
const REMOVED_RICH_TEXT_TAGS = "script,style,iframe,object,embed,form,input,button,img,svg,math,video,audio,canvas,picture,source";

export function richTextHtml(value: string) {
  if (!value.trim()) return "";
  if (/<\/?(p|div|br|strong|b|em|i|h[1-6]|ul|ol|li|blockquote|a)\b/i.test(value)) return value;
  return value
    .split("\n")
    .map(line => line.trim() ? `<p>${escapeHtml(line)}</p>` : "<p><br></p>")
    .join("");
}

export function stripRichText(value: string) {
  if (!value) return "";
  if (typeof document === "undefined") return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const box = document.createElement("div");
  box.innerHTML = value;
  return (box.textContent || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function sanitizeRichText(value: string) {
  if (typeof document === "undefined") {
    return value
      .replace(/<(script|style|iframe|object|embed|form|svg|math|video|audio|canvas|picture)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<(input|button|img|source)\b[^>]*\/?\s*>/gi, "")
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/javascript\s*:/gi, "")
      .replace(/<\/?b\b/gi, (tag) => tag.startsWith("</") ? "</strong" : "<strong")
      .replace(/<\/?i\b/gi, (tag) => tag.startsWith("</") ? "</em" : "<em");
  }
  const box = document.createElement("div");
  box.innerHTML = value;
  box.querySelectorAll(REMOVED_RICH_TEXT_TAGS).forEach(node => node.remove());
  box.querySelectorAll("b, i").forEach(node => {
    const replacement = document.createElement(node.tagName.toLowerCase() === "b" ? "strong" : "em");
    replacement.replaceChildren(...node.childNodes);
    node.replaceWith(replacement);
  });
  box.querySelectorAll<HTMLElement>("*").forEach(node => {
    const tag = node.tagName.toLowerCase();
    if (!ALLOWED_RICH_TEXT_TAGS.has(tag)) {
      node.replaceWith(...node.childNodes);
      return;
    }
    [...node.attributes].forEach(attribute => {
      const name = attribute.name.toLowerCase();
      if (tag !== "a" || name !== "href") node.removeAttribute(attribute.name);
    });
    if (tag === "a") {
      const href = node.getAttribute("href") || "";
      if (!/^https?:\/\//i.test(href)) node.removeAttribute("href");
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noreferrer");
    }
  });
  return box.innerHTML;
}

export function RichTextContent({ value, className = "" }: { value: string; className?: string }) {
  if (!stripRichText(value)) return null;
  return (
    <div
      className={`rich-text-content text-secondary [&_a]:text-accent [&_a]:underline [&_b]:font-semibold [&_b]:text-primary [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-amber-400/60 [&_blockquote]:pl-3 [&_h3]:my-2 [&_h3]:font-semibold [&_h3]:text-primary [&_i]:italic [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:my-1 [&_strong]:font-semibold [&_strong]:text-primary ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(richTextHtml(value)) }}
    />
  );
}

export default function RichTextField({ label, value, onChange, placeholder, tone = "default", minHeight = "126px" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  tone?: "default" | "warning";
  minHeight?: string;
}) {
  const { t } = useI18n();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const savedQuoteRef = useRef("");
  const [focused, setFocused] = useState(false);
  const [hasContent, setHasContent] = useState(Boolean(stripRichText(value)));
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    if (!editorRef.current || focused) return;
    const html = richTextHtml(value);
    if (editorRef.current.innerHTML !== html) editorRef.current.innerHTML = html;
    setHasContent(Boolean(stripRichText(value)));
  }, [focused, value]);

  useEffect(() => {
    if (!focused) return;
    const trackSelection = () => {
      const selection = window.getSelection();
      if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
        savedRangeRef.current = selection.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener("selectionchange", trackSelection);
    return () => document.removeEventListener("selectionchange", trackSelection);
  }, [focused]);

  const emitChange = () => {
    const next = sanitizeRichText(editorRef.current?.innerHTML || "");
    setHasContent(Boolean(editorRef.current?.textContent?.trim()));
    onChange(next);
  };

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
      savedQuoteRef.current = selection.toString();
    }
  };

  const selectSavedQuote = () => {
    const quote = savedQuoteRef.current;
    const editor = editorRef.current;
    if (!quote || !editor) return false;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent || "";
      const start = text.indexOf(quote);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + quote.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return true;
    }
    return false;
  };

  const restoreSelection = () => {
    const savedRange = savedRangeRef.current?.cloneRange();
    const savedQuote = savedQuoteRef.current;
    editorRef.current?.focus();
    const selection = window.getSelection();
    if (!selection || !savedRange) return;
    selection.removeAllRanges();
    selection.addRange(savedRange);
    if (savedRange.collapsed) {
      savedQuoteRef.current = savedQuote;
      selectSavedQuote();
    }
  };

  const runCommand = (command: string, commandValue?: string) => {
    restoreSelection();
    document.execCommand(command, false, commandValue);
    emitChange();
    rememberSelection();
  };

  const openLinkEditor = () => {
    setLinkUrl("");
    setShowLink(true);
  };

  const insertLink = () => {
    const url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) return;
    restoreSelection();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range?.collapsed) {
      document.execCommand("insertHTML", false, `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`);
    } else {
      document.execCommand("createLink", false, url);
    }
    setShowLink(false);
    setLinkUrl("");
    emitChange();
  };

  const toolbar = [
    { command: "bold", label: "B", title: t("stock.markImportant") },
    { command: "italic", label: "I", title: t("stock.emphasis") },
    { command: "formatBlock", value: "h3", label: "H", title: t("stock.heading") },
    { command: "insertUnorderedList", label: "•", title: t("stock.list") },
    { command: "formatBlock", value: "blockquote", label: "❯", title: t("stock.quote") },
  ];

  return (
    <div className={`relative overflow-visible rounded-lg border bg-input transition ${focused ? tone === "warning" ? "border-amber-400" : "border-[var(--accent)] ring-2 ring-[var(--ring)]" : tone === "warning" ? "border-amber-500/30" : "border-themed"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-themed px-2 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[.12em] text-muted">{t("stock.richText")}</span>
        <div className="flex items-center gap-0.5">
          {toolbar.map(item => (
            <button key={`${item.command}-${item.label}`} type="button" title={item.title} aria-label={item.title}
              onMouseDown={event => event.preventDefault()} onClick={() => runCommand(item.command, item.value)}
              className="flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs font-semibold text-secondary transition hover:bg-surface-hover hover:text-primary">
              {item.label}
            </button>
          ))}
          <button type="button" title={t("stock.link")} aria-label={t("stock.link")} onMouseDown={event => { event.preventDefault(); rememberSelection(); }} onClick={openLinkEditor}
            className="flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs font-semibold text-secondary transition hover:bg-surface-hover hover:text-primary">↗</button>
          <span className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden="true" />
          <button type="button" title={t("stock.undo")} aria-label={t("stock.undo")} onMouseDown={event => event.preventDefault()} onClick={() => runCommand("undo")}
            className="flex h-7 min-w-7 items-center justify-center rounded text-sm text-muted transition hover:bg-surface-hover hover:text-primary">↶</button>
          <button type="button" title={t("stock.redo")} aria-label={t("stock.redo")} onMouseDown={event => event.preventDefault()} onClick={() => runCommand("redo")}
            className="flex h-7 min-w-7 items-center justify-center rounded text-sm text-muted transition hover:bg-surface-hover hover:text-primary">↷</button>
        </div>
      </div>

      {showLink && (
        <div className="absolute right-2 top-10 z-30 flex w-[min(320px,calc(100%-16px))] items-center gap-2 rounded-lg border border-themed bg-[var(--surface-raised)] p-2 shadow-xl">
          <input autoFocus type="url" value={linkUrl} onChange={event => setLinkUrl(event.target.value)} placeholder="https://"
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); insertLink(); } if (event.key === "Escape") setShowLink(false); }}
            className="min-w-0 flex-1 rounded-md border border-themed bg-input px-2 py-1.5 text-xs text-primary outline-none focus:border-[var(--accent)]" />
          <button type="button" disabled={!/^https?:\/\//i.test(linkUrl.trim())} onClick={insertLink} className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent disabled:opacity-40">{t("stock.insertLink")}</button>
        </div>
      )}

      <div ref={editorRef} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label}
        data-placeholder={placeholder} style={{ minHeight }}
        onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); rememberSelection(); }} onInput={emitChange} onKeyUp={rememberSelection} onMouseUp={rememberSelection}
        onPaste={event => {
          event.preventDefault();
          const html = event.clipboardData.getData("text/html");
          const text = event.clipboardData.getData("text/plain");
          document.execCommand(html ? "insertHTML" : "insertText", false, html ? sanitizeRichText(html) : text);
          emitChange();
        }}
        className={`rich-editable max-h-[420px] overflow-y-auto px-3 py-3 text-sm leading-7 text-primary outline-none [&_a]:text-accent [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-amber-400/60 [&_blockquote]:pl-3 [&_blockquote]:text-secondary [&_h3]:my-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-primary [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:my-1 [&_strong]:font-semibold [&_strong]:text-primary ${!hasContent ? "is-empty" : ""}`}
      />
    </div>
  );
}
