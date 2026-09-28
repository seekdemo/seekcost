"use client";

import type { ReactNode } from "react";

export interface ResearchPropertiesPanelProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  updatedAt?: ReactNode;
}

export default function ResearchPropertiesPanel({ title, description, children, updatedAt }: ResearchPropertiesPanelProps) {
  return (
    <div className="research-properties-panel">
      <div className="research-properties-panel__title">{title}</div>
      {description ? <p className="research-properties-panel__description">{description}</p> : null}
      {updatedAt ? <div className="research-properties-panel__updated">{updatedAt}</div> : null}
      <div className="research-properties-panel__fields">{children}</div>
    </div>
  );
}
