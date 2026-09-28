import type { ReactNode } from "react";

export default function ResearchMetaBar({ children, ariaLabel }: { children: ReactNode; ariaLabel: string }) {
  return <div className="research-detail__meta" data-research-meta aria-label={ariaLabel}>{children}</div>;
}
