"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { api } from "@/lib/api";
import type { ResearchNote } from "@/lib/types";

type ReviewAsset = { id: number; symbol: string; name: string };

type QuickReviewPanelProps = {
  scope: "asset" | "portfolio";
  asset?: ReviewAsset;
  className?: string;
  onSaved?: (note: ResearchNote) => void;
};

const LIMITS = [280, 280, 180] as const;

function reviewExcerpt(content: string) {
  return content
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/[*_>`~-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

export default function QuickReviewPanel({ scope, asset, className = "", onSaved }: QuickReviewPanelProps) {
  const { t, localeTag } = useI18n();
  const [answers, setAnswers] = useState(["", "", ""]);
  const [reviews, setReviews] = useState<ResearchNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  const isAsset = scope === "asset";
  const assetId = asset?.id;
  const promptKeys = isAsset
    ? ["quickReview.assetPrompt1", "quickReview.assetPrompt2", "quickReview.assetPrompt3"]
    : ["quickReview.portfolioPrompt1", "quickReview.portfolioPrompt2", "quickReview.portfolioPrompt3"];
  const prompts = promptKeys.map((key) => t(key));

  useEffect(() => {
    let cancelled = false;
    api.listNotes({ kind: "review", sort: "updated_at", order: "desc" })
      .then((notes) => {
        if (cancelled) return;
        const scoped = notes.filter((note) => isAsset
          ? note.links.some((link) => link.entity_type === "asset" && link.entity_id === assetId)
          : note.links.length === 0);
        setReviews(scoped);
        setLoadError("");
      })
      .catch((reason) => {
        if (!cancelled) setLoadError(reason instanceof Error ? reason.message : t("quickReview.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [assetId, isAsset, t]);

  const canSave = useMemo(() => answers.every((answer) => answer.trim().length > 0), [answers]);

  const updateAnswer = (index: number, value: string) => {
    setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? value : answer));
    setSaved(false);
    setSaveError("");
  };

  const saveReview = async () => {
    if (!canSave || saving || (isAsset && !asset)) return;
    setSaving(true);
    setSaveError("");
    setSaved(false);
    const now = new Date();
    const date = now.toLocaleDateString(localeTag, { year: "numeric", month: "short", day: "numeric" });
    const title = isAsset
      ? t("quickReview.assetRecordTitle", { symbol: asset?.symbol || "", date })
      : t("quickReview.portfolioRecordTitle", { date });
    const content = answers
      .map((answer, index) => `## ${prompts[index]}\n\n${answer.trim()}`)
      .join("\n\n");

    try {
      const created = await api.createNote({
        title,
        content,
        format: "markdown",
        visibility: "private",
        kind: "review",
        status: "active",
        allow_comments: true,
        stock_symbols: isAsset && asset ? [asset.symbol] : [],
        links: isAsset && asset ? [{ entity_type: "asset", entity_id: asset.id }] : [],
      });
      setReviews((current) => [created, ...current]);
      onSaved?.(created);
      setAnswers(["", "", ""]);
      setSaved(true);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : t("quickReview.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      id={isAsset ? "asset-trade-review" : "investment-review"}
      className={`overflow-hidden rounded-[var(--radius-xl)] border border-themed bg-surface ${className}`}
      aria-labelledby={`${scope}-review-title`}
    >
      <div className="border-b border-themed px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted">{t("quickReview.eyebrow")}</p>
            <h2 id={`${scope}-review-title`} className="mt-1 text-base font-semibold text-primary">
              {t(isAsset ? "quickReview.assetTitle" : "quickReview.portfolioTitle")}
            </h2>
          </div>
          <span className="shrink-0 rounded-md bg-input px-2 py-1 text-[10px] text-muted">{t("quickReview.private")}</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">
          {t(isAsset ? "quickReview.assetDescription" : "quickReview.portfolioDescription")}
        </p>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {prompts.map((prompt, index) => (
          <label key={promptKeys[index]} className="block">
            <span className="flex items-center justify-between gap-3 text-xs font-medium text-secondary">
              <span><span className="mr-2 font-mono text-[10px] text-muted">0{index + 1}</span>{prompt}</span>
              <span className="font-mono text-[10px] text-muted">{answers[index].length}/{LIMITS[index]}</span>
            </span>
            <textarea
              value={answers[index]}
              onChange={(event) => updateAnswer(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void saveReview();
                }
              }}
              maxLength={LIMITS[index]}
              rows={index === 2 ? 2 : 3}
              placeholder={t(`${promptKeys[index]}Placeholder`)}
              className="mt-2 min-h-20 w-full resize-y rounded-lg border border-themed bg-input px-3 py-2.5 text-sm leading-6 text-primary outline-none transition placeholder:text-muted focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/10"
            />
          </label>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-themed pt-4">
          <span className="text-[10px] text-muted">{t("quickReview.shortcut")}</span>
          <button
            type="button"
            onClick={() => void saveReview()}
            disabled={!canSave || saving || (isAsset && !asset)}
            className="ui-button ui-button--primary min-h-10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? t("quickReview.saving") : t("quickReview.save")}
          </button>
        </div>
        <div aria-live="polite" className="min-h-4 text-xs">
          {saveError && <p className="text-red-400">{t("quickReview.saveFailed")}: {saveError}</p>}
          {saved && <p className="text-ok">{t("quickReview.saved")}</p>}
        </div>
      </div>

      <div className="border-t border-themed bg-input/35 px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold text-secondary">{t("quickReview.recent")}</h3>
          <Link href="/research" className="text-[11px] text-accent hover:underline">{t("quickReview.allReviews")}</Link>
        </div>
        {loading ? (
          <div className="mt-3 space-y-2" aria-label={t("quickReview.loading")}>
            <div className="h-12 animate-pulse rounded-lg bg-surface" />
            <div className="h-12 animate-pulse rounded-lg bg-surface" />
          </div>
        ) : loadError ? (
          <p className="mt-3 text-xs leading-5 text-red-400">{t("quickReview.loadFailed")}: {loadError}</p>
        ) : reviews.length ? (
          <div className="mt-3 divide-y divide-themed">
            {reviews.slice(0, 3).map((review) => (
              <Link key={review.id} href={`/research/${review.id}`} className="group block py-3 first:pt-0 last:pb-0">
                <span className="block truncate text-xs font-medium text-primary group-hover:text-accent">{review.title}</span>
                <span className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted">{reviewExcerpt(review.content) || t("quickReview.emptyRecord")}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs leading-5 text-muted">{t("quickReview.empty")}</p>
        )}
      </div>
    </section>
  );
}
