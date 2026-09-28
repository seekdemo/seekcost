"use client";

import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/components/I18nProvider";

const AI_PROVIDERS = [
  { name: "Gemini", href: "https://gemini.google.com/app", labelKey: "dossier.openGemini" },
  { name: "Grok", href: "https://grok.com/", labelKey: "dossier.openGrok" },
] as const;

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through for browsers that block the Clipboard API.
    }
  }

  const fallback = document.createElement("textarea");
  fallback.value = value;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.appendChild(fallback);
  fallback.select();
  const copied = document.execCommand("copy");
  fallback.remove();
  return copied;
}

export default function ResearchAiPromptDialog({
  title,
  initialPrompt,
  onClose,
  onUsePrompt,
}: {
  title: string;
  initialPrompt: string;
  onClose: () => void;
  onUsePrompt: () => void;
}) {
  const { t } = useI18n();
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    promptRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  const copyPrompt = async () => {
    const success = await copyText(prompt);
    setCopied(success);
    if (success) window.setTimeout(() => setCopied(false), 1800);
  };

  const handoffToProvider = () => {
    void copyText(prompt);
    onUsePrompt();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-5">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("dossier.closeAiPrompt")}
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="research-ai-dialog-title"
        className="relative z-10 flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-lg border border-themed bg-page shadow-2xl sm:max-h-[88dvh] sm:rounded-lg"
      >
        <header className="flex items-start justify-between gap-4 border-b border-themed px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted">{t("dossier.askAi")}</p>
            <h2 id="research-ai-dialog-title" className="mt-1 break-words text-lg font-semibold text-primary">
              {t("dossier.aiDialogTitle", { title })}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("dossier.closeAiPrompt")}
            title={t("dossier.closeAiPrompt")}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-xl leading-none text-muted transition hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="research-ai-prompt" className="text-sm font-medium text-primary">{t("dossier.researchPrompt")}</label>
            <span className="text-xs text-muted">{t("dossier.publicContextOnly")}</span>
          </div>
          <textarea
            ref={promptRef}
            id="research-ai-prompt"
            aria-label={t("dossier.researchPrompt")}
            value={prompt}
            onChange={(event) => { setPrompt(event.target.value); setCopied(false); }}
            spellCheck={false}
            className="block min-h-[min(52dvh,460px)] w-full resize-y rounded-md border border-themed bg-input px-4 py-3 font-mono text-[13px] leading-6 text-primary outline-none transition placeholder:text-muted focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
          />
          <p aria-live="polite" className="mt-2 min-h-5 text-xs text-accent">{copied ? t("dossier.promptCopied") : ""}</p>
        </div>

        <footer className="border-t border-themed bg-surface/55 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => void copyPrompt()}
              className="min-h-10 rounded-md border border-themed px-4 py-2 text-sm font-medium text-secondary transition hover:border-[var(--border-hover)] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {copied ? t("dossier.promptCopied") : t("dossier.copyPrompt")}
            </button>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              {AI_PROVIDERS.map((provider) => (
                <a
                  key={provider.name}
                  href={provider.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={handoffToProvider}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-themed px-4 py-2 text-sm font-medium text-primary transition hover:border-[var(--accent)] hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  {t(provider.labelKey)}
                </a>
              ))}
              <button
                type="button"
                onClick={onUsePrompt}
                className="col-span-2 min-h-10 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              >
                {t("dossier.openEditorToPaste")}
              </button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
