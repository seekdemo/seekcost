"use client";

import type { ReactNode, RefObject } from "react";
import ResearchResponsivePanel from "./ResearchResponsivePanel";

export default function ResearchCommentDrawer({ open, title, ariaLabel, closeLabel, onClose, children, triggerRef }: { open: boolean; title: string; ariaLabel?: string; closeLabel: string; onClose: () => void; children: ReactNode; triggerRef?: RefObject<HTMLElement | null> }) {
  return <ResearchResponsivePanel open={open} title={ariaLabel || title} closeLabel={closeLabel} onClose={onClose} triggerRef={triggerRef} variant="drawer">{children}</ResearchResponsivePanel>;
}
