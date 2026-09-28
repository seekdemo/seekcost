"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

export interface ResearchResponsivePanelProps {
  open: boolean;
  title: string;
  closeLabel: string;
  variant: "drawer" | "sheet";
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}

export default function ResearchResponsivePanel({ open, title, closeLabel, variant, triggerRef, onClose, children }: ResearchResponsivePanelProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fallbackTriggerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      if (wasOpen.current) window.setTimeout(() => (triggerRef?.current || fallbackTriggerRef.current)?.focus(), 40);
      wasOpen.current = false;
      return;
    }
    fallbackTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    wasOpen.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.key !== "Escape" && event.key !== "Tab")) return;
      const highestPriority = Math.max(...Array.from(document.querySelectorAll<HTMLElement>("[data-research-overlay-priority]"))
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => Number(element.dataset.researchOverlayPriority || 0)));
      if (highestPriority > 90) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"))
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, variant, triggerRef]);
  if (!open) return null;
  return (
    <div ref={panelRef} className={`research-responsive-panel research-responsive-panel--${variant} is-modal`} data-variant={variant} data-research-overlay-priority="90" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" tabIndex={-1} className="research-responsive-panel__backdrop" onClick={onClose} aria-label={closeLabel} />
      <section className="research-responsive-panel__surface">
        <header className="research-responsive-panel__header">
          <h2 id={titleId}>{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={closeLabel}>×</button>
        </header>
        <div className="research-responsive-panel__body">{children}</div>
      </section>
    </div>
  );
}
