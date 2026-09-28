import type { ReactNode } from "react";
import ResearchMetaBar from "./ResearchMetaBar";

interface ResearchHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  metadataLabel: string;
  metadata: ReactNode;
  contextDetails?: ReactNode;
  cover?: ReactNode;
  children?: ReactNode;
}

export default function ResearchHeader({
  eyebrow,
  title,
  metadataLabel,
  metadata,
  contextDetails,
  cover,
  children,
}: ResearchHeaderProps) {
  return (
    <header className="research-document-header">
      {eyebrow ? <div className="research-document-header__eyebrow">{eyebrow}</div> : null}
      {title}
      <div className="research-document-header__properties">
        <ResearchMetaBar ariaLabel={metadataLabel}>{metadata}</ResearchMetaBar>
        {contextDetails || children}
      </div>
      {cover ? <figure data-research-cover>{cover}</figure> : null}
    </header>
  );
}
