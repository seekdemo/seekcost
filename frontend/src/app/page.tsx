"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import { useI18n } from "@/components/I18nProvider";
import { InlineNotice, PageHeader, PageShell } from "@/components/ui/Page";
import QuantCockpit from "@/app/workbench/QuantCockpit";
import IntradayPreview from "@/app/workbench/IntradayPreview";
import { api } from "@/lib/api";
import type { IntradayPreview as IntradayPreviewData, WorkbenchOverview } from "@/lib/types";

const empty: WorkbenchOverview = {
  generated_at: "", strike_candidates: [], upcoming_events: [], due_research: [], stale_stocks: [],
  incomplete_stocks: [], active_plans: [], unreviewed_transactions: [],
  quant_monitoring: { enabled: false, watchlist_count: 0, scanned_count: 0, matches_count: 0, attention_count: 0, last_evaluated_at: null, signals: [] },
  capital: { actual_investment: 0, planned_investment: 0, cash_accounts: [] },
  watchlist_summary: { total: 0, radar: 0, conviction: 0, strike: 0 },
};

const INTRADAY_POLL_INTERVAL_MS = 2_000;
const INTRADAY_REQUEST_DEADLINE_MS = 30_000;

export default function Home() {
  return <AuthGuard><Workbench /></AuthGuard>;
}

function Workbench() {
  const { t, localeTag } = useI18n();
  const [data, setData] = useState<WorkbenchOverview>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [intraday, setIntraday] = useState<IntradayPreviewData | null>(null);
  const [intradayLoading, setIntradayLoading] = useState(true);
  const [intradayError, setIntradayError] = useState("");
  const [intradayPollingTimedOut, setIntradayPollingTimedOut] = useState(false);
  const [intradayRequesting, setIntradayRequesting] = useState(false);
  const intradayRequestRef = useRef<AbortController | null>(null);
  const intradayPollTimerRef = useRef<number | null>(null);
  const intradayDeadlineRef = useRef<number | null>(null);
  const intradayDeadlineTimerRef = useRef<number | null>(null);
  const intradayGenerationRef = useRef(0);
  const runIntradayRequestRef = useRef<(refresh: boolean, generation: number) => void>(() => {});
  const hasIntradayDataRef = useRef(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api.getWorkbenchOverview()
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : t("cockpit.noEvaluation")))
      .finally(() => setLoading(false));
  }, [t]);

  const clearIntradayTimers = useCallback(() => {
    if (intradayPollTimerRef.current != null) window.clearTimeout(intradayPollTimerRef.current);
    if (intradayDeadlineTimerRef.current != null) window.clearTimeout(intradayDeadlineTimerRef.current);
    intradayPollTimerRef.current = null;
    intradayDeadlineTimerRef.current = null;
  }, []);

  const finishIntradayGeneration = useCallback((generation: number) => {
    if (generation !== intradayGenerationRef.current) return;
    clearIntradayTimers();
    intradayDeadlineRef.current = null;
    setIntradayRequesting(false);
  }, [clearIntradayTimers]);

  const expireIntradayGeneration = useCallback((generation: number) => {
    if (generation !== intradayGenerationRef.current) return;
    clearIntradayTimers();
    intradayDeadlineRef.current = null;
    intradayGenerationRef.current += 1;
    const request = intradayRequestRef.current;
    intradayRequestRef.current = null;
    request?.abort();
    setIntradayLoading(false);
    setIntradayRequesting(false);
    setIntradayPollingTimedOut(true);
    setIntradayError(t("intraday.requestTimeout"));
  }, [clearIntradayTimers, t]);

  const runIntradayRequest = useCallback((refresh: boolean, generation: number) => {
    if (generation !== intradayGenerationRef.current || intradayRequestRef.current) return;
    const controller = new AbortController();
    intradayRequestRef.current = controller;
    if (!hasIntradayDataRef.current) setIntradayLoading(true);
    api.getWorkbenchIntradayPreview(refresh, controller.signal)
      .then((preview) => {
        if (generation !== intradayGenerationRef.current) return;
        const deadline = intradayDeadlineRef.current;
        if (deadline == null || Date.now() >= deadline) {
          expireIntradayGeneration(generation);
          return;
        }
        hasIntradayDataRef.current = true;
        setIntradayPollingTimedOut(false);
        setIntraday(preview);
        if (!preview.refreshing) {
          finishIntradayGeneration(generation);
          return;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          expireIntradayGeneration(generation);
          return;
        }
        intradayPollTimerRef.current = window.setTimeout(() => {
          intradayPollTimerRef.current = null;
          runIntradayRequestRef.current(false, generation);
        }, Math.min(INTRADAY_POLL_INTERVAL_MS, remaining));
      })
      .catch((reason) => {
        if (generation !== intradayGenerationRef.current || controller.signal.aborted) return;
        setIntradayError(reason instanceof Error ? reason.message : t("intraday.noData"));
        finishIntradayGeneration(generation);
        setIntradayPollingTimedOut(true);
      })
      .finally(() => {
        if (intradayRequestRef.current === controller) intradayRequestRef.current = null;
        if (generation === intradayGenerationRef.current && !controller.signal.aborted) setIntradayLoading(false);
      });
  }, [expireIntradayGeneration, finishIntradayGeneration, t]);

  useEffect(() => {
    runIntradayRequestRef.current = runIntradayRequest;
  }, [runIntradayRequest]);

  const loadIntraday = useCallback((refresh = false) => {
    if (intradayRequestRef.current) return;
    clearIntradayTimers();
    intradayDeadlineRef.current = null;
    const generation = intradayGenerationRef.current + 1;
    intradayGenerationRef.current = generation;
    const deadline = Date.now() + INTRADAY_REQUEST_DEADLINE_MS;
    intradayDeadlineRef.current = deadline;
    setIntradayPollingTimedOut(false);
    setIntradayRequesting(true);
    setIntradayError("");
    if (!hasIntradayDataRef.current) setIntradayLoading(true);
    intradayDeadlineTimerRef.current = window.setTimeout(
      () => expireIntradayGeneration(generation),
      INTRADAY_REQUEST_DEADLINE_MS,
    );
    runIntradayRequestRef.current(refresh, generation);
  }, [clearIntradayTimers, expireIntradayGeneration]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    const previewFrame = window.requestAnimationFrame(() => void loadIntraday());
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(previewFrame);
      clearIntradayTimers();
      intradayDeadlineRef.current = null;
      intradayGenerationRef.current += 1;
      intradayRequestRef.current?.abort();
      intradayRequestRef.current = null;
    };
  }, [clearIntradayTimers, load, loadIntraday]);

  const cockpit = data.quant_cockpit;
  const evaluated = cockpit?.last_evaluated_at
    ? new Intl.DateTimeFormat(localeTag, { dateStyle: "medium", timeStyle: "short" }).format(new Date(cockpit.last_evaluated_at))
    : t("cockpit.noEvaluation");

  return (
    <PageShell width="wide" className="quant-cockpit-page">
      <PageHeader
        eyebrow={t("cockpit.eyebrow")}
        title={t("cockpit.title")}
        description={t("cockpit.description")}
        actions={<>
          <button type="button" className="ui-button" onClick={load} disabled={loading}>{loading ? t("cockpit.refreshing") : t("cockpit.refresh")}</button>
          <Link href="/quant" className="ui-button">{t("cockpit.manageStrategies")}</Link>
          <Link href="/watchlist" className="ui-button ui-button--primary">{t("cockpit.openWatchlist")}</Link>
        </>}
      />
      {error && <InlineNotice tone="warning">{error}</InlineNotice>}
      {intradayError && <InlineNotice tone="warning">{intradayError}</InlineNotice>}
      <IntradayPreview data={intraday} loading={intradayLoading} refreshing={intradayRequesting || (Boolean(intraday?.refreshing) && !intradayPollingTimedOut)} onRefresh={() => loadIntraday(true)} t={t} localeTag={localeTag} />
      {loading && !cockpit ? <div className="quant-cockpit-loading" aria-label={t("common.loading")}><span /><span /><span /></div> : cockpit ? <QuantCockpit cockpit={cockpit} t={t} localeTag={localeTag} /> : null}
      <footer className="workspace-footnote"><p>{t("cockpit.private")} · {t("cockpit.lastEvaluated", { date: evaluated })}</p><p>{t("intraday.description")}</p></footer>
    </PageShell>
  );
}
