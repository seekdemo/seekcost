"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useI18n } from "@/components/I18nProvider";
import { api } from "@/lib/api";
import type { TranslationVariables } from "@/lib/i18n";
import type { PriceVolumeObservation, WatchlistStock } from "@/lib/types";

function initialValue(value: number) {
  return value > 0 ? String(value) : "";
}

function parsePrice(value: string) {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

type AnchorField = "strike" | "fair" | "target";

interface PriceReference {
  key: string;
  label: string;
  description: string;
  value: number | null | undefined;
}

function formatPrice(value: number, locale: string) {
  return value.toLocaleString(locale, { maximumFractionDigits: 2 });
}

function inputPrice(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function AnchorHelp({
  htmlFor,
  label,
  description,
  labelClassName = "text-xs text-muted",
  placement = "below",
}: {
  htmlFor?: string;
  label: string;
  description: string;
  labelClassName?: string;
  placement?: "above" | "below";
}) {
  const { t } = useI18n();
  const tooltipId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setPinned(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHovered(false);
        setPinned(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <span
      ref={containerRef}
      className="relative inline-flex items-center gap-1"
    >
      {htmlFor
        ? <label htmlFor={htmlFor} className={labelClassName}>{label}</label>
        : <span className={labelClassName}>{label}</span>}
      <button
        type="button"
        aria-label={t("dossier.anchorHelpLabel", { label })}
        aria-expanded={open}
        aria-controls={tooltipId}
        onClick={() => setPinned((current) => !current)}
        onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
        onPointerLeave={(event) => { if (event.pointerType === "mouse") setHovered(false); }}
        onBlur={(event) => {
          if (!containerRef.current?.contains(event.relatedTarget as Node | null)) setPinned(false);
        }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted outline-none transition hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] font-semibold leading-none">?</span>
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute left-0 z-30 w-[min(300px,calc(100vw-3rem))] rounded-md border border-themed bg-[var(--surface-raised)] p-3 text-left shadow-[0_18px_50px_-24px_var(--shadow-color)] ${placement === "above" ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          <strong className="block text-xs font-semibold text-primary">{label}</strong>
          <span className="mt-1.5 block text-xs font-normal leading-5 text-secondary">{description}</span>
        </span>
      )}
    </span>
  );
}

function ReferenceList({
  items,
  localeTag,
  onUse,
  t,
  tooltipPlacement = "below",
}: {
  items: PriceReference[];
  localeTag: string;
  onUse: (value: number) => void;
  t: (key: string, variables?: TranslationVariables) => string;
  tooltipPlacement?: "above" | "below";
}) {
  const available = items.filter((item): item is PriceReference & { value: number } => typeof item.value === "number" && Number.isFinite(item.value) && item.value > 0);
  return (
    <div className="mt-4 rounded-md border border-themed bg-surface/35 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-primary">{t("dossier.anchorReferences")}</p>
        <p className="text-[11px] text-muted">{t("dossier.anchorTechnicalNote")}</p>
      </div>
      {available.length === 0 ? <p className="mt-3 text-xs text-muted">{t("dossier.anchorNoReference")}</p> : (
        <div className="mt-3 space-y-2">
          {available.map((item) => (
            <div key={item.key} className="flex min-h-10 items-center justify-between gap-3 border-b border-themed/70 pb-2 last:border-b-0 last:pb-0">
              <span className="min-w-0">
                <AnchorHelp label={item.label} description={item.description} labelClassName="text-xs text-secondary" placement={tooltipPlacement} />
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <strong className="text-sm tabular-nums text-primary">{formatPrice(item.value, localeTag)}</strong>
                <button type="button" onClick={() => onUse(item.value)} className="min-h-8 rounded px-2 text-xs font-medium text-accent transition hover:bg-[var(--accent-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">{t("dossier.anchorUse")}</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DecisionAnchorEditor({
  stock,
  observation,
  onClose,
  onSaved,
}: {
  stock: WatchlistStock;
  observation: PriceVolumeObservation | null;
  onClose: () => void;
  onSaved: (stock: WatchlistStock) => void;
}) {
  const { t, localeTag } = useI18n();
  const [strikePrice, setStrikePrice] = useState(() => initialValue(stock.strike_price));
  const [fairPrice, setFairPrice] = useState(() => initialValue(stock.fair_price));
  const [targetPrice, setTargetPrice] = useState(() => initialValue(stock.target_price));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setAnchorValue = (field: AnchorField, value: number) => {
    const next = inputPrice(value);
    if (field === "strike") setStrikePrice(next);
    else if (field === "fair") setFairPrice(next);
    else setTargetPrice(next);
  };

  const ma5 = observation?.ma5 ?? null;
  const atr14 = observation?.atr14 ?? null;
  const parsedStrike = parsePrice(strikePrice);
  const references = {
    strike: [
      { key: "ma5", label: t("dossier.refMa5"), description: t("dossier.refMa5Help"), value: ma5 },
      { key: "ma5-atr", label: t("dossier.refMa5Atr"), description: t("dossier.refMa5AtrHelp"), value: ma5 != null && atr14 != null ? ma5 - atr14 * 0.5 : null },
      { key: "support60", label: t("dossier.refSupport60"), description: t("dossier.refSupport60Help"), value: observation?.support60 },
    ],
    fair: [
      { key: "vwap20", label: t("dossier.refVwap20"), description: t("dossier.refVwap20Help"), value: observation?.vwap20 },
      { key: "vwap60", label: t("dossier.refVwap60"), description: t("dossier.refVwap60Help"), value: observation?.vwap60 },
      { key: "ma60", label: t("dossier.refMa60"), description: t("dossier.refMa60Help"), value: observation?.ma60 },
    ],
    target: [
      { key: "resistance20", label: t("dossier.refResistance20"), description: t("dossier.refResistance20Help"), value: observation?.resistance20 },
      { key: "resistance60", label: t("dossier.refResistance60"), description: t("dossier.refResistance60Help"), value: observation?.resistance60 },
      { key: "entry-atr", label: t("dossier.refEntryPlusAtr"), description: t("dossier.refEntryPlusAtrHelp"), value: parsedStrike != null && parsedStrike > 0 && atr14 != null ? parsedStrike + atr14 * 2 : null },
    ],
  } satisfies Record<AnchorField, PriceReference[]>;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, onClose]);

  const save = async () => {
    const strike = parsePrice(strikePrice);
    const fair = parsePrice(fairPrice);
    const target = parsePrice(targetPrice);
    if (strike === null || fair === null || target === null) {
      setError(t("dossier.anchorInvalid"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.updateWatchStock(stock.id, {
        strike_price: strike,
        fair_price: fair,
        target_price: target,
      });
      onSaved({ ...stock, strike_price: strike, fair_price: fair, target_price: target, updated_at: new Date().toISOString() });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("dossier.anchorSaveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/55 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="decision-anchor-editor-title" className="flex h-full w-full flex-col border-l border-themed bg-page shadow-[-24px_0_80px_rgba(0,0,0,0.38)] sm:w-[min(440px,42vw)]">
        <header className="flex items-start justify-between gap-4 border-b border-themed px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{t("dossier.anchorSettings")}</p>
            <h2 id="decision-anchor-editor-title" className="mt-1 truncate text-lg font-semibold text-primary">{stock.symbol} · {stock.name}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t("dossier.closeAnchorSettings")} title={t("dossier.closeAnchorSettings")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg text-muted transition hover:bg-surface-hover hover:text-primary disabled:opacity-50">×</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <p className="text-sm leading-6 text-secondary">{t("dossier.anchorSettingsDescription")}</p>
          <p className="mt-2 text-xs text-muted">{t("dossier.anchorEmptyHint", { currency: stock.current_price > 0 ? stock.current_price.toLocaleString(localeTag, { maximumFractionDigits: 2 }) : "--" })}</p>

          <div className="mt-6 space-y-4">
            <section>
              <AnchorHelp htmlFor="anchor-strike-price" label={t("stock.strikePrice")} description={t("dossier.anchorStrikeHelp")} />
              <input id="anchor-strike-price" type="number" min="0" step="any" inputMode="decimal" value={strikePrice} onChange={(event) => setStrikePrice(event.target.value)} placeholder={t("dossier.anchorOptionalPlaceholder")} className="mt-1.5 h-11 w-full rounded-md border border-themed bg-input px-3 text-sm tabular-nums text-primary outline-none focus:border-[var(--accent)]" />
              <p className="mt-1.5 text-xs leading-5 text-muted">{t("dossier.anchorStrikeDescription")}</p>
              <ReferenceList items={references.strike} localeTag={localeTag} onUse={(value) => setAnchorValue("strike", value)} t={t} />
            </section>
            <section>
              <AnchorHelp htmlFor="anchor-fair-price" label={t("stock.fairPrice")} description={t("dossier.anchorFairHelp")} />
              <input id="anchor-fair-price" type="number" min="0" step="any" inputMode="decimal" value={fairPrice} onChange={(event) => setFairPrice(event.target.value)} placeholder={t("dossier.anchorOptionalPlaceholder")} className="mt-1.5 h-11 w-full rounded-md border border-themed bg-input px-3 text-sm tabular-nums text-primary outline-none focus:border-[var(--accent)]" />
              <p className="mt-1.5 text-xs leading-5 text-muted">{t("dossier.anchorFairDescription")}</p>
              <ReferenceList items={references.fair} localeTag={localeTag} onUse={(value) => setAnchorValue("fair", value)} t={t} tooltipPlacement="above" />
            </section>
            <section>
              <AnchorHelp htmlFor="anchor-target-price" label={t("stock.targetPrice")} description={t("dossier.anchorTargetHelp")} />
              <input id="anchor-target-price" type="number" min="0" step="any" inputMode="decimal" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} placeholder={t("dossier.anchorOptionalPlaceholder")} className="mt-1.5 h-11 w-full rounded-md border border-themed bg-input px-3 text-sm tabular-nums text-primary outline-none focus:border-[var(--accent)]" />
              <p className="mt-1.5 text-xs leading-5 text-muted">{t("dossier.anchorTargetDescription")}</p>
              <ReferenceList items={references.target} localeTag={localeTag} onUse={(value) => setAnchorValue("target", value)} t={t} tooltipPlacement="above" />
            </section>
          </div>
          <section className="mt-7 border-t border-themed pt-5">
            <p className="text-xs font-semibold text-primary">{t("dossier.anchorRiskBoundary")}</p>
            <p className="mt-2 text-xs leading-5 text-secondary">{t("dossier.anchorRiskMa5Buffer", { value: ma5 != null ? formatPrice(ma5 * 0.925, localeTag) : "--" })}</p>
          </section>
          {error && <p role="alert" className="mt-4 text-xs text-red-400">{error}</p>}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-themed bg-surface/55 px-5 py-4">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-10 rounded-md border border-themed px-4 py-2 text-sm text-secondary disabled:opacity-50">{t("dossier.cancel")}</button>
          <button type="button" onClick={() => void save()} disabled={busy} className="min-h-10 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50">{busy ? t("dossier.saving") : t("dossier.savePriceAnchors")}</button>
        </footer>
      </aside>
    </div>
  );
}
