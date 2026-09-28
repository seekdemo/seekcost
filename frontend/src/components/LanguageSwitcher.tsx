"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const currentLocale = SUPPORTED_LOCALES.find(item => item.code === locale) || SUPPORTED_LOCALES[0];

  useEffect(() => {
    if (!open) return;
    containerRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const chooseLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        data-testid="language-switcher"
        data-locale={locale}
        aria-label={`${t("common.language")}: ${currentLocale.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}
        className={`group inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-secondary outline-none transition focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
          open
            ? "border-[var(--border-hover)] bg-surface text-primary"
            : "border-themed bg-transparent hover:border-[var(--border-hover)] hover:bg-surface hover:text-primary"
        } ${compact ? "min-w-[72px]" : "min-w-[72px] sm:min-w-[124px]"}`}
      >
        <svg className="h-4 w-4 shrink-0 text-muted transition group-hover:text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21M12 3C9.6 5.5 8.4 8.5 8.4 12S9.6 18.5 12 21" />
        </svg>
        <span className={`truncate text-xs font-semibold ${compact ? "max-w-[34px]" : "max-w-[76px]"}`}>
          {compact ? currentLocale.shortLabel : <><span className="sm:hidden">{currentLocale.shortLabel}</span><span className="hidden sm:inline">{currentLocale.label}</span></>}
        </span>
        <svg className={`h-3 w-3 shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t("common.language")}
          onKeyDown={(event) => {
            const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
            const index = options.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "ArrowDown" ? (index + 1) % options.length : event.key === "ArrowUp" ? (index - 1 + options.length) % options.length : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : -1;
            if (next >= 0) { event.preventDefault(); options[next]?.focus(); }
            if (event.key === "Tab") setOpen(false);
          }}
          className="absolute right-0 top-full z-[90] mt-2 w-52 overflow-hidden rounded-xl border border-themed bg-[var(--surface-raised)] p-1.5 shadow-[0_22px_65px_-28px_var(--shadow-color)]"
        >
          {SUPPORTED_LOCALES.map(item => {
            const selected = item.code === locale;
            return (
              <button
                key={item.code}
                type="button"
                role="option"
                aria-selected={selected}
                data-locale-option={item.code}
                onClick={() => chooseLocale(item.code)}
                className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left transition ${
                  selected ? "bg-[var(--accent-bg)] text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary"
                }`}
              >
                <span className={`w-8 shrink-0 text-[10px] font-bold ${selected ? "text-accent" : "text-muted"}`}>{item.shortLabel}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
                {selected && (
                  <svg className="h-4 w-4 shrink-0 text-accent" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="m5 10 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
