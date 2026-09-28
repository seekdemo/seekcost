"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import AuthGuard from "@/components/AuthGuard";
import { stripRichText } from "@/components/RichTextField";
import { useI18n } from "@/components/I18nProvider";
import { api } from "@/lib/api";
import type { KRange, PriceVolumeResponse, WatchResearchSection, WatchResearchSectionKey, WatchlistResearchProfile } from "@/lib/types";

import DailyKSection, { type DailyKStatus } from "./DailyKSection";
import PriceRiskPanel from "./PriceRiskPanel";
import DecisionAnchorEditor from "./DecisionAnchorEditor";
import DecisionSummary from "./DecisionSummary";
import PriceVolumeObservation, { type ObservationStatus } from "./PriceVolumeObservation";
import QuantStrategyPanel from "./QuantStrategyPanel";
import ResearchAiPromptDialog from "./ResearchAiPromptDialog";
import ResearchSupportPanel from "./ResearchSupportPanel";
import ResearchNavigation from "./ResearchNavigation";
import ResearchSectionCard from "./ResearchSectionCard";
import type { ResearchSectionSop } from "./ResearchSectionCard";
import ResearchSectionEditor from "./ResearchSectionEditor";
import ResearchSopCard from "./ResearchSopCard";
import { buildResearchAiPrompt } from "./researchAiPrompts";

const SECTION_KEYS: WatchResearchSectionKey[] = [
  "company_overview",
  "industry_moat",
  "growth_financials",
  "risks_invalidation",
  "valuation_decision",
];

const SECTION_COPY: Record<WatchResearchSectionKey, { title: string; prompt: string }> = {
  company_overview: { title: "dossier.companyOverview", prompt: "dossier.companyOverviewPrompt" },
  industry_moat: { title: "dossier.industryMoat", prompt: "dossier.industryMoatPrompt" },
  growth_financials: { title: "dossier.growthFinancials", prompt: "dossier.growthFinancialsPrompt" },
  risks_invalidation: { title: "dossier.risksInvalidation", prompt: "dossier.risksInvalidationPrompt" },
  valuation_decision: { title: "dossier.valuationDecision", prompt: "dossier.valuationDecisionPrompt" },
};

const SECTION_SOP_COPY: Record<WatchResearchSectionKey, { goal: string; finish: string; nextCheck: string }> = {
  company_overview: { goal: "dossier.sopCompanyOverviewGoal", finish: "dossier.sopCompanyOverviewFinish", nextCheck: "dossier.sopCompanyOverviewNextCheck" },
  industry_moat: { goal: "dossier.sopIndustryMoatGoal", finish: "dossier.sopIndustryMoatFinish", nextCheck: "dossier.sopIndustryMoatNextCheck" },
  growth_financials: { goal: "dossier.sopGrowthFinancialsGoal", finish: "dossier.sopGrowthFinancialsFinish", nextCheck: "dossier.sopGrowthFinancialsNextCheck" },
  risks_invalidation: { goal: "dossier.sopRisksInvalidationGoal", finish: "dossier.sopRisksInvalidationFinish", nextCheck: "dossier.sopRisksInvalidationNextCheck" },
  valuation_decision: { goal: "dossier.sopValuationDecisionGoal", finish: "dossier.sopValuationDecisionFinish", nextCheck: "dossier.sopValuationDecisionNextCheck" },
};

function isComplete(section: WatchResearchSection) {
  return Boolean(
    hasContent(section)
    && section.evidence.length
    && section.open_questions.length
    && section.reviewed_at
    && section.next_review_at,
  );
}

function hasContent(section: WatchResearchSection) {
  return Boolean(stripRichText(section.summary));
}

function reviewCheckCount(section: WatchResearchSection) {
  return [
    section.evidence.length > 0,
    section.open_questions.length > 0,
    Boolean(section.reviewed_at),
    Boolean(section.next_review_at),
  ].filter(Boolean).length;
}

function profileMarket(stock: Pick<WatchlistResearchProfile["stock"], "symbol" | "sector">) {
  const symbol = stock.symbol.trim().toUpperCase();
  const sector = stock.sector || "";
  if (sector.includes("加密") || symbol.endsWith("-USD")) return "crypto";
  if (sector.includes("港") || /^\d{4,5}(?:\.HK)?$/.test(symbol)) return "hk";
  if (sector.includes("A股") || /^(?:\d{6})(?:\.(?:SS|SH|SZ|BJ))?$/.test(symbol)) return "cn";
  if (symbol.endsWith(".TW") || sector.includes("台股")) return "tw";
  return "us";
}

function DetailContent({ stockId }: { stockId: number }) {
  const { locale, localeTag, t } = useI18n();
  const [profile, setProfile] = useState<WatchlistResearchProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [error, setError] = useState("");
  const [editingSectionKey, setEditingSectionKey] = useState<WatchResearchSectionKey | null>(null);
  const [aiSectionKey, setAiSectionKey] = useState<WatchResearchSectionKey | null>(null);
  const [pasteReadySectionKey, setPasteReadySectionKey] = useState<WatchResearchSectionKey | null>(null);
  const [kRange, setKRange] = useState<KRange>("6mo");
  const [priceRetry, setPriceRetry] = useState(0);
  const [priceVolume, setPriceVolume] = useState<PriceVolumeResponse | null>(null);
  const [priceStatus, setPriceStatus] = useState<DailyKStatus>("loading");
  const [quoteStatus, setQuoteStatus] = useState<"loading" | "live" | "cached">("loading");
  const [anchorEditorOpen, setAnchorEditorOpen] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const next = await api.getWatchlistResearchProfile(stockId);
      setQuoteStatus("loading");
      setProfile(next);
      setStatus("ready");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("dossier.loadError");
      setError(message);
      setStatus(/not found|不存在/i.test(message) ? "not-found" : "error");
    }
  }, [stockId, t]);

  useEffect(() => {
    let cancelled = false;
    const loadInitial = async () => {
      try {
        const next = await api.getWatchlistResearchProfile(stockId);
        if (!cancelled) {
          setProfile(next);
          setQuoteStatus("loading");
          setStatus("ready");
        }
      } catch (caught) {
        if (cancelled) return;
        const message = caught instanceof Error ? caught.message : t("dossier.loadError");
        setError(message);
        setStatus(/not found|不存在/i.test(message) ? "not-found" : "error");
      }
    };
    void loadInitial();
    return () => { cancelled = true; };
  }, [stockId, t]);

  const quoteStockId = profile?.stock_id;
  useEffect(() => {
    if (!quoteStockId) return;
    let cancelled = false;
    api.getWatchStockQuote(quoteStockId).then((quote) => {
      if (cancelled) return;
      setProfile((current) => current ? {
        ...current,
        stock: {
          ...current.stock,
          current_price: quote.price,
          price_session: quote.session,
        },
      } : current);
      setQuoteStatus("live");
    }).catch(() => {
      if (!cancelled) setQuoteStatus("cached");
    });
    return () => { cancelled = true; };
  }, [quoteStockId]);

  const priceStockId = profile?.stock_id;
  const priceSymbol = profile?.stock.symbol;
  const priceSector = profile?.stock.sector;
  useEffect(() => {
    if (!priceStockId || !priceSymbol) return;
    let cancelled = false;
    const market = profileMarket({ symbol: priceSymbol, sector: priceSector || "" });
    const loadPriceVolume = async () => {
      setPriceStatus("loading");
      try {
        const next = await api.getPriceVolume(priceStockId, market, kRange);
        if (cancelled) return;
        setPriceVolume(next);
        if (!next.items.length) setPriceStatus("empty");
        else if (next.as_of && Date.now() - new Date(next.as_of).getTime() > 7 * 24 * 60 * 60 * 1000) setPriceStatus("stale");
        else setPriceStatus("ready");
      } catch {
        if (!cancelled) {
          setPriceVolume(null);
          setPriceStatus("error");
        }
      }
    };
    void loadPriceVolume();
    return () => { cancelled = true; };
  }, [priceStockId, priceSymbol, priceSector, kRange, priceRetry]);

  const orderedSections = useMemo(() => {
    if (!profile) return [];
    const byKey = new Map(profile.research_sections.map((section) => [section.key, section]));
    return SECTION_KEYS.map((key) => byKey.get(key)).filter((section): section is WatchResearchSection => Boolean(section));
  }, [profile]);

  const aiPrompt = useMemo(() => {
    if (!profile || !aiSectionKey) return "";
    return buildResearchAiPrompt(aiSectionKey, profile.stock, locale);
  }, [aiSectionKey, locale, profile]);

  if (status === "loading") {
    return (
      <div className="page-container min-w-0" aria-busy="true">
        <div className="mb-8 h-5 w-28 animate-pulse rounded bg-surface" />
        <div className="h-12 w-2/3 animate-pulse rounded bg-surface" />
        <div className="mt-8 h-36 animate-pulse rounded-md bg-surface" />
        <div className="mt-10 space-y-5"><div className="h-48 animate-pulse rounded-md bg-surface" /><div className="h-48 animate-pulse rounded-md bg-surface" /></div>
      </div>
    );
  }

  if (status === "not-found") {
    return <div className="page-container"><Link href="/watchlist" className="text-sm text-accent">{t("watchlist.back")}</Link><h1 className="mt-8 page-title">{t("watchlist.noStock")}</h1><p className="mt-2 text-secondary">{t("watchlist.noStockDescription")}</p></div>;
  }

  if (status === "error" || !profile) {
    return <div className="page-container"><Link href="/watchlist" className="text-sm text-accent">{t("watchlist.back")}</Link><h1 className="mt-8 page-title">{t("dossier.loadError")}</h1><p className="mt-2 text-secondary">{error}</p><button type="button" onClick={() => void load()} className="mt-5 min-h-10 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent">{t("dossier.retry")}</button></div>;
  }

  const contentCompleted = orderedSections.filter(hasContent).length;
  const contentTotal = SECTION_KEYS.length;
  const contentCompleteness = Math.round((contentCompleted / contentTotal) * 100);
  const reviewCompleted = orderedSections.reduce((total, section) => total + reviewCheckCount(section), 0);
  const reviewTotal = SECTION_KEYS.length * 4;
  const reviewReadiness = Math.round((reviewCompleted / reviewTotal) * 100);
  const alerts = [];
  if (!stripRichText(profile.stock.thesis)) alerts.push(t("dossier.actionThesis"));
  if (!stripRichText(profile.stock.invalidation)) alerts.push(t("dossier.actionInvalidation"));
  if (!orderedSections.some((section) => section.next_review_at)) alerts.push(t("dossier.actionNextCheck"));

  const openFirstGap = () => {
    const firstGap = orderedSections.find((section) => !isComplete(section)) || orderedSections[0];
    document.getElementById(`research-${firstGap?.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveSection = async (section: WatchResearchSection, update: Parameters<typeof api.updateWatchResearchSection>[2]) => {
    const saved = await api.updateWatchResearchSection(profile.stock_id, section.key, update);
    setProfile((current) => current ? {
      ...current,
      research_sections: current.research_sections.map((item) => item.key === saved.key ? saved : item),
    } : current);
    setEditingSectionKey(null);
    setPasteReadySectionKey(null);
  };

  const openAiPrompt = (sectionKey: WatchResearchSectionKey) => {
    setPasteReadySectionKey(null);
    setAiSectionKey(sectionKey);
  };

  const openPasteEditor = () => {
    if (!aiSectionKey) return;
    const sectionKey = aiSectionKey;
    setAiSectionKey(null);
    setEditingSectionKey(sectionKey);
    setPasteReadySectionKey(sectionKey);
    window.requestAnimationFrame(() => {
      document.getElementById(`research-${sectionKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="page-container company-dossier min-w-0">
      <header className="mb-4 min-w-0">
        <Link href="/watchlist" className="inline-flex min-h-10 items-center text-sm text-secondary transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">{t("watchlist.back")}</Link>
        <div className="mt-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="page-title break-words">{profile.stock.symbol} <span className="company-dossier__name">{profile.stock.name}</span></h1>
            <p className="mt-2 text-sm text-secondary">{profile.stock.sector || t("watchlist.unclassified")} · {t(`watchlist.stage${profile.stock.stage === "radar" ? "Radar" : profile.stock.stage === "conviction" ? "Conviction" : "Strike"}`)}</p>
          </div>
          <p className="shrink-0 text-xs text-muted">{t("dossier.updated")} {new Date(profile.stock.updated_at).toLocaleDateString(localeTag)}</p>
        </div>
      </header>

      <DailyKSection stock={profile.stock} bars={priceVolume?.items || []} movingAverages={priceVolume?.moving_averages || []} observation={priceVolume?.observation || null} range={kRange} onRangeChange={setKRange} onRetry={() => setPriceRetry((value) => value + 1)} status={priceStatus} asOf={priceVolume?.as_of || null} source={priceVolume?.source || ""} />
      {priceStatus !== "loading" && priceStatus !== "error" && <PriceRiskPanel assessment={priceVolume?.risk_assessment} currency={priceVolume?.currency || ""} />}

      <div className="my-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-4">
        <p className="text-sm text-secondary">{locale === 'en' ? 'Build your own understanding of the business, evidence and risks.' : '从生意、证据到自己的判断，按你的方式理解这家公司。'}</p>
        <Link className="ui-button ui-button--primary" href={`/research/guide/${stockId}`}>{locale === 'en' ? 'Company research room' : '进入公司研究室'} →</Link>
      </div>
      <DecisionSummary
        profile={profile}
        contentCompleteness={contentCompleteness}
        contentCompleted={contentCompleted}
        contentTotal={contentTotal}
        reviewReadiness={reviewReadiness}
        reviewCompleted={reviewCompleted}
        reviewTotal={reviewTotal}
        alerts={alerts}
        quoteStatus={quoteStatus}
        onSave={openFirstGap}
        onEditAnchors={() => setAnchorEditorOpen(true)}
      />

      <ResearchSopCard />

      <div className="mt-10 grid min-w-0 gap-8 lg:grid-cols-[220px_minmax(0,1fr)] xl:gap-12">
        <aside className="min-w-0 overflow-x-auto border-b border-themed pb-3 lg:sticky lg:top-20 lg:self-start lg:overflow-visible lg:border-b-0 lg:pb-0">
          <p className="mb-3 px-3 text-xs font-medium uppercase text-muted">{t("dossier.directory")}</p>
          <ResearchNavigation items={orderedSections.map((section) => ({ key: section.key, label: t(SECTION_COPY[section.key].title), complete: isComplete(section) }))} />
        </aside>
        <div className="min-w-0" aria-label={t("dossier.companyFundamentalsAria")}>
          {orderedSections.map((section) => {
            const editing = editingSectionKey === section.key;
            const sectionSop: ResearchSectionSop = {
              goal: t(SECTION_SOP_COPY[section.key].goal),
              ai: t(SECTION_COPY[section.key].prompt),
              finish: t(SECTION_SOP_COPY[section.key].finish),
              nextCheck: t(SECTION_SOP_COPY[section.key].nextCheck),
            };
            return (
              <ResearchSectionCard key={section.key} section={section} title={t(SECTION_COPY[section.key].title)} prompt={t(SECTION_COPY[section.key].prompt)} sop={sectionSop} mode={editing ? "edit" : "read"} onEdit={() => { setPasteReadySectionKey(null); setEditingSectionKey(section.key); }} onAskAi={() => openAiPrompt(section.key)}>
                {editing && <ResearchSectionEditor section={section} onSave={(update) => saveSection(section, update)} onCancel={() => { setEditingSectionKey(null); setPasteReadySectionKey(null); }} autoFocusSummary={pasteReadySectionKey === section.key} />}
              </ResearchSectionCard>
            );
          })}
          <PriceVolumeObservation observation={priceVolume?.observation || null} status={(priceStatus === "stale" ? "ready" : priceStatus) as ObservationStatus} />
          <QuantStrategyPanel stockId={profile.stock_id} />
          <ResearchSupportPanel profile={profile} onChange={setProfile} />
        </div>
      </div>
      {aiSectionKey && (
        <ResearchAiPromptDialog
          title={t(SECTION_COPY[aiSectionKey].title)}
          initialPrompt={aiPrompt}
          onClose={() => setAiSectionKey(null)}
          onUsePrompt={openPasteEditor}
        />
      )}
      {anchorEditorOpen && (
        <DecisionAnchorEditor
          stock={profile.stock}
          observation={priceVolume?.observation || null}
          onClose={() => setAnchorEditorOpen(false)}
          onSaved={(stock) => setProfile((current) => current ? { ...current, stock } : current)}
        />
      )}
    </div>
  );
}

export default function WatchlistDetailView({ stockId }: { stockId: number }) {
  return <AuthGuard><DetailContent stockId={stockId} /></AuthGuard>;
}
