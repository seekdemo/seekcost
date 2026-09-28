import type { ReactNode } from "react";

export interface ResearchDetailViewProps {
  documentBar: ReactNode;
  header: ReactNode;
  outline?: ReactNode;
  articleBody: ReactNode;
  annotationAnchors?: ReactNode;
  overlays?: ReactNode;
  footer?: ReactNode;
  bottomBar?: ReactNode;
  isEditing?: boolean;
  annotationLabel: string;
}

/** Layout-only shell for a research document. Stateful concerns stay in NoteDetail. */
export default function ResearchDetailView({
  documentBar,
  header,
  outline,
  articleBody,
  annotationAnchors,
  overlays,
  footer,
  bottomBar,
  isEditing = false,
  annotationLabel,
}: ResearchDetailViewProps) {
  return (
    <>
      {documentBar}
      <div className={`research-document-grid${outline ? " has-outline" : ""}${annotationAnchors ? " has-anchors" : ""}${isEditing ? " is-editing" : ""}${bottomBar ? " has-bottom-bar" : ""}`}>
        <aside className="research-document-grid__outline" data-research-region="outline">
          {outline}
        </aside>
        <section className="research-document-grid__article" data-research-region="article">
          {header}
          {articleBody}
          {footer}
        </section>
        {annotationAnchors ? <aside className="research-document-grid__anchors" data-research-region="annotation-anchors" aria-label={annotationLabel}>
          {annotationAnchors}
        </aside> : null}
      </div>
      {overlays}
      {bottomBar}
    </>
  );
}
