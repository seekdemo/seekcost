"use client";

import { useEffect, useRef } from "react";

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open, title = "确认操作", message, confirmText = "确定", cancelText = "取消",
  danger = true, onConfirm, onCancel,
}: ConfirmModalProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    btnRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message" className="relative mx-4 max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-[var(--radius-xl)] border border-themed bg-[var(--surface-raised)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onKeyDown={e => {
          if (e.key !== "Tab") return;
          const controls = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
          const first = controls[0], last = controls.at(-1);
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }}
        onClick={e => e.stopPropagation()}>
        <h3 id="confirm-modal-title" className="text-base font-bold text-primary mb-2">{title}</h3>
        <p id="confirm-modal-message" className="text-sm text-secondary mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <button ref={btnRef} onClick={onCancel}
            className="ui-button">
            {cancelText}
          </button>
          <button onClick={onConfirm}
            className={`ui-button border-transparent ${
              danger ? "bg-red-600 text-white hover:bg-red-500" : "bg-accent bg-accent-hover text-on-accent"
            }`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
