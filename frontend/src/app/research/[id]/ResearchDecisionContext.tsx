"use client";

import { useState, type ReactNode } from "react";

export interface ResearchDecisionItem {
  id: "status" | "confidence" | "review";
  label: string;
  value: string;
  tone?: "default" | "due";
}

export interface ResearchDecisionContextProps {
  label: string;
  showLabel: string;
  hideLabel: string;
  items: ResearchDecisionItem[];
  children: ReactNode;
}

export default function ResearchDecisionContext({ label, showLabel, hideLabel, items, children }: ResearchDecisionContextProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = children !== null && children !== undefined && children !== false;

  return (
    <section className="research-decision-context" aria-label={label}>
      <div className="research-decision-context__summary">
        {items.map((item) => (
          <div key={item.id} data-decision-item={item.id} data-tone={item.tone || "default"}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      {hasDetails ? <>
        <button
          type="button"
          className="research-decision-context__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? hideLabel : showLabel}
        </button>
        <div className="research-decision-context__details" hidden={!expanded}>
          {children}
        </div>
      </> : null}
    </section>
  );
}
