type PineLogoProps = {
  compact?: boolean;
  className?: string;
};

export default function PineLogo({ compact = false, className = "" }: PineLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-alt)]">
        <svg viewBox="0 0 32 32" aria-hidden="true" className="h-5 w-5 text-brand">
          <path
            d="M16 3.8 8.9 13h3.35l-5.65 7.2h5.05L7.9 25h6.55v3.2h3.1V25h6.55l-3.75-4.8h5.05L19.75 13h3.35L16 3.8Z"
            fill="currentColor"
          />
          <path d="M16 7.4 12.2 13h7.6L16 7.4Z" fill="rgba(255,255,255,0.32)" />
        </svg>
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-[0.12em] text-primary">SeekCost</span>
          <span className="mt-1 text-[9px] uppercase tracking-[0.22em] text-muted">Pine</span>
        </span>
      )}
    </span>
  );
}
