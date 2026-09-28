"use client";

import type { ReactNode } from "react";
import ResearchResponsivePanel from "./ResearchResponsivePanel";

export interface ResearchEditorShellProps {
  title: ReactNode;
  metadata: ReactNode;
  editor: ReactNode;
  properties: ReactNode;
  propertiesOpen: boolean;
  propertiesTitle: string;
  ariaLabel: string;
  closePropertiesLabel: string;
  onCloseProperties: () => void;
}

export default function ResearchEditorShell({
  title,
  metadata,
  editor,
  properties,
  propertiesOpen,
  propertiesTitle,
  ariaLabel,
  closePropertiesLabel,
  onCloseProperties,
}: ResearchEditorShellProps) {
  return (
    <section className="research-editor-shell" aria-label={ariaLabel}>
      <div className="research-editor-shell__canvas">
        <div className="research-editor-shell__title">{title}</div>
        <div className="research-editor-shell__metadata">{metadata}</div>
        <div className="research-editor-shell__editor">{editor}</div>
      </div>
      <ResearchResponsivePanel
        open={propertiesOpen}
        title={propertiesTitle}
        closeLabel={closePropertiesLabel}
        variant="sheet"
        onClose={onCloseProperties}
      >
        {properties}
      </ResearchResponsivePanel>
    </section>
  );
}
