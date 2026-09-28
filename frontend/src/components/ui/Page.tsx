import type { ReactNode } from "react";

type PageShellProps = {
  children: ReactNode;
  className?: string;
  width?: "default" | "wide" | "reading";
};

export function PageShell({ children, className = "", width = "default" }: PageShellProps) {
  return <section className={`page-shell page-shell--${width} ${className}`}>{children}</section>;
}

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, eyebrow, actions, meta, className = "" }: PageHeaderProps) {
  return (
    <header className={`page-header ${className}`}>
      <div className="page-header__copy">
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <div className="page-description">{description}</div>}
        {meta && <div className="page-meta">{meta}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Surface({
  children,
  className = "",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return <div className={`ui-surface ${interactive ? "ui-surface--interactive" : ""} ${className}`}>{children}</div>;
}

export function EmptyState({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? "empty-state--compact" : ""}`}>
      <span className="empty-state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h3" strokeLinecap="round" />
        </svg>
      </span>
      <div>
        <p className="empty-state__title">{title}</p>
        {description && <p className="empty-state__description">{description}</p>}
        {action && <div className="empty-state__action">{action}</div>}
      </div>
    </div>
  );
}

export function InlineNotice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" | "danger" | "success" }) {
  return <div className={`inline-notice inline-notice--${tone}`} role={tone === "danger" ? "alert" : "status"}>{children}</div>;
}
