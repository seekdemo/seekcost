"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import { api } from "@/lib/api";
import type { EarningsEvent, EarningsSource, EarningsStatus } from "@/lib/types";
import { useI18n } from "@/components/I18nProvider";

type StockOption = { id: number; symbol: string; name: string };

const STATUS_OPTIONS: EarningsStatus[] = ["estimated", "confirmed", "reported"];
const statusClasses: Record<EarningsStatus, string> = {
  estimated: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  confirmed: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  reported: "border-ok bg-ok-soft",
};
const sourceClasses: Record<EarningsSource, string> = {
  manual: "border-themed bg-page/45 text-muted",
  yahoo: "border-sky-400/20 bg-sky-400/[0.07] text-sky-200",
  eastmoney: "border-rose-400/20 bg-rose-400/[0.07] text-rose-200",
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthStart(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function shiftMonth(key: string, amount: number) {
  const next = monthStart(key);
  next.setMonth(next.getMonth() + amount);
  return monthKey(next);
}

function calendarDays(key: string) {
  const first = monthStart(key);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function daysFromToday(value: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parseDate(value).getTime() - today.getTime()) / 86400000);
}

function formatDay(value: string, locale: string) {
  return parseDate(value).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function formatFullDay(value: string, locale: string) {
  return parseDate(value).toLocaleDateString(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatMonth(key: string, locale: string) {
  return monthStart(key).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

function emptyForm(stockId = "") {
  return { stockId, eventDate: dateKey(new Date()), fiscalPeriod: "", status: "estimated" as EarningsStatus, note: "" };
}

export default function EarningsCalendarPage() {
  return <AuthGuard><EarningsCalendarContent /></AuthGuard>;
}

function EarningsCalendarContent() {
  const { t, localeTag } = useI18n();
  const [events, setEvents] = useState<EarningsEvent[]>([]);
  const [stocks, setStocks] = useState<StockOption[]>([]);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [form, setForm] = useState(() => emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [eventRows, stockRows] = await Promise.all([api.listEarnings(), api.listWatchStocks()]);
      setEvents(eventRows);
      const options = stockRows
        .map((stock) => ({ id: Number(stock.id), symbol: String(stock.symbol || ""), name: String(stock.name || stock.symbol || "") }))
        .filter((stock) => Number.isFinite(stock.id))
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
      setStocks(options);
      setForm((current) => current.stockId || !options[0] ? current : { ...current, stockId: String(options[0].id) });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("watchlist.earningsLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // The initial fetch synchronizes the calendar with the server-owned source of truth.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!expandedDate) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>('[aria-labelledby="earnings-day-title"]');
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedDate(null);
      if (event.key === "Tab" && dialog) {
        const controls = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = previousOverflow; previousFocus?.focus({ preventScroll: true }); };
  }, [expandedDate]);

  const days = useMemo(() => calendarDays(month), [month]);
  const monthEvents = useMemo(() => events.filter((event) => event.event_date.slice(0, 7) === month), [events, month]);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, EarningsEvent[]>();
    monthEvents.forEach((event) => grouped.set(event.event_date, [...(grouped.get(event.event_date) || []), event]));
    return grouped;
  }, [monthEvents]);
  const upcoming = useMemo(() => {
    return events
      .filter((event) => daysFromToday(event.event_date) >= 0 && event.status !== "reported")
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
      .slice(0, 8);
  }, [events]);
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === editingId) || null,
    [editingId, events],
  );
  const expandedEvents = useMemo(
    () => expandedDate ? (eventsByDate.get(expandedDate) || []) : [],
    [eventsByDate, expandedDate],
  );

  const sourceLabel = (source: EarningsSource | undefined) => {
    const normalized = source || "manual";
    return t(`watchlist.earningsSource${normalized[0].toUpperCase()}${normalized.slice(1)}`);
  };

  const startCreate = (eventDate = dateKey(new Date())) => {
    setEditingId(null);
    setForm(emptyForm(form.stockId || (stocks[0] ? String(stocks[0].id) : "")));
    setForm((current) => ({ ...current, eventDate }));
    setMessage("");
    window.requestAnimationFrame(() => document.getElementById("earnings-editor")?.scrollIntoView({ block: "start" }));
  };

  const startEdit = (event: EarningsEvent) => {
    setEditingId(event.id);
    setForm({ stockId: String(event.stock_id), eventDate: event.event_date.slice(0, 10), fiscalPeriod: event.fiscal_period, status: event.status, note: event.note });
    setMessage("");
    window.requestAnimationFrame(() => document.getElementById("earnings-editor")?.scrollIntoView({ block: "start" }));
  };

  const save = async () => {
    if (!form.stockId || !form.eventDate) return;
    setSaving(true);
    setError("");
    try {
      const payload = { event_date: form.eventDate, fiscal_period: form.fiscalPeriod.trim(), status: form.status, note: form.note.trim() };
      if (editingId) {
        const updated = await api.updateEarnings(editingId, payload);
        setEvents((current) => current.map((event) => event.id === editingId ? updated : event));
        setMessage(t("watchlist.earningsSaved"));
      } else {
        const created = await api.createEarnings({ ...payload, stock_id: Number(form.stockId) });
        setEvents((current) => [...current, created]);
        setMessage(t("watchlist.earningsCreated"));
      }
      setEditingId(null);
      setForm(emptyForm(form.stockId));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("watchlist.earningsSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (event: EarningsEvent) => {
    if (!window.confirm(t("watchlist.earningsDeleteConfirm", { symbol: event.symbol }))) return;
    try {
      await api.deleteEarnings(event.id);
      setEvents((current) => current.filter((item) => item.id !== event.id));
      if (editingId === event.id) {
        setEditingId(null);
        setForm(emptyForm(form.stockId));
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("watchlist.earningsDeleteFailed"));
    }
  };

  const syncDates = async () => {
    setSyncing(true);
    setError("");
    setMessage("");
    try {
      const result = await api.syncEarnings();
      await load();
      const summary = t("watchlist.earningsSyncSummary", {
        checked: result.checked,
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        protected: result.manual_protected,
        unavailable: result.unavailable,
        skipped: result.skipped,
      });
      setMessage(result.provider_errors.length > 0 ? `${summary} ${t("watchlist.earningsSyncPartial")}` : summary);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : t("watchlist.earningsSyncFailed"));
    } finally {
      setSyncing(false);
    }
  };

  const dayNames = [
    t("watchlist.earningsMon"), t("watchlist.earningsTue"), t("watchlist.earningsWed"),
    t("watchlist.earningsThu"), t("watchlist.earningsFri"), t("watchlist.earningsSat"), t("watchlist.earningsSun"),
  ];

  return (
    <main className="page-shell page-shell--wide min-h-[calc(100vh-112px)]">
      <header className="page-header">
        <div>
          <Link href="/watchlist" className="mb-3 inline-flex items-center gap-1 text-xs text-muted transition hover:text-accent">← {t("watchlist.back")}</Link>
          <p className="page-eyebrow">{t("watchlist.earningsEyebrow")}</p>
          <h1 className="page-title">{t("watchlist.earningsTitle")}</h1>
          <p className="page-description max-w-2xl">{t("watchlist.earningsDescription")}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button type="button" onClick={() => void syncDates()} disabled={syncing || stocks.length === 0} className="ui-button w-full gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            <span aria-hidden="true" className={syncing ? "animate-spin" : ""}>↻</span>
            {syncing ? t("watchlist.earningsSyncing") : t("watchlist.earningsSync")}
          </button>
          <button type="button" onClick={() => startCreate()} className="ui-button ui-button--primary w-full sm:w-auto">{t("watchlist.earningsAdd")}</button>
        </div>
      </header>

      {(message || error) && <div className={`inline-notice ${error ? "inline-notice--warning" : "inline-notice--success"}`}>{error || message}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 rounded-[var(--radius-xl)] border border-themed bg-surface/65 p-3 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setMonth((current) => shiftMonth(current, -1))} className="icon-button" aria-label={t("watchlist.earningsPreviousMonth")} title={t("watchlist.earningsPreviousMonth")}>←</button>
              <h2 className="min-w-[150px] text-center text-base font-semibold text-primary sm:min-w-[190px]">{formatMonth(month, localeTag)}</h2>
              <button type="button" onClick={() => setMonth((current) => shiftMonth(current, 1))} className="icon-button" aria-label={t("watchlist.earningsNextMonth")} title={t("watchlist.earningsNextMonth")}>→</button>
            </div>
            <button type="button" onClick={() => setMonth(monthKey(new Date()))} className="rounded-md border border-themed px-3 py-1.5 text-xs text-secondary transition hover:border-[var(--border-hover)] hover:text-primary">{t("watchlist.earningsToday")}</button>
          </div>

          <div className="grid grid-cols-7 border-b border-l border-themed">
            {dayNames.map((day) => <div key={day} className="border-r border-t border-themed px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-muted sm:px-2 sm:text-xs">{day}</div>)}
            {days.map((day) => {
              const key = dateKey(day);
              const dayEvents = eventsByDate.get(key) || [];
              const inMonth = monthKey(day) === month;
              const isToday = key === dateKey(new Date());
              const fullDate = formatFullDay(key, localeTag);
              return (
                <div key={key} className={`group relative min-h-[72px] border-r border-t border-themed p-1 text-left transition hover:bg-surface-hover sm:min-h-[118px] sm:p-2 ${inMonth ? "bg-surface/35" : "bg-page/25"}`}>
                  <button type="button" onClick={() => startCreate(key)} className="absolute inset-0 z-0 cursor-pointer" aria-label={t("watchlist.earningsAddOnDate", { date: fullDate })} />
                  <span className={`pointer-events-none relative z-10 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${isToday ? "bg-accent font-semibold text-on-accent" : inMonth ? "text-secondary" : "text-muted/50"}`}>{day.getDate()}</span>
                  {dayEvents.length > 0 && <button type="button" onClick={() => setExpandedDate(key)} className="relative z-10 flex w-full items-center justify-center rounded bg-[var(--accent-bg)] text-xs font-semibold text-accent sm:hidden" aria-label={t("watchlist.earningsMoreAria", { count: dayEvents.length, date: fullDate })}>● {dayEvents.length}</button>}
                  <span className="relative z-10 mt-1 hidden space-y-1 sm:block">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button type="button" key={event.id} onClick={() => startEdit(event)} className={`block w-full truncate rounded border px-1.5 py-1 text-left text-[10px] leading-tight ${statusClasses[event.status]}`} title={`${event.symbol} · ${event.fiscal_period || t("watchlist.earningsPeriodUnset")}`}>
                        <strong className="font-semibold">{event.symbol}</strong>{event.fiscal_period ? ` · ${event.fiscal_period}` : ""}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <button type="button" onClick={() => setExpandedDate(key)} className="block w-full rounded px-1 py-0.5 text-left text-[10px] font-medium text-muted transition hover:bg-surface-hover hover:text-primary" aria-label={t("watchlist.earningsMoreAria", { count: dayEvents.length, date: fullDate })}>
                        +{dayEvents.length - 3} {t("watchlist.earningsMore")}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">{t("watchlist.earningsCalendarHint")}</p>
        </section>

        <aside className="space-y-5">
          <section className="rounded-[var(--radius-xl)] border border-themed bg-surface/65 p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted">{t("watchlist.earningsUpcomingEyebrow")}</p>
                <h2 className="mt-1 text-base font-semibold text-primary">{t("watchlist.earningsUpcoming")}</h2>
              </div>
              <span className="rounded-full bg-accent-bg px-2 py-1 text-xs font-medium text-accent">{upcoming.length}</span>
            </div>
            {upcoming.length === 0 ? <p className="text-sm leading-6 text-muted">{t("watchlist.earningsNoUpcoming")}</p> : (
              <div className="space-y-2">
                {upcoming.map((event) => {
                  const daysAway = daysFromToday(event.event_date);
                  return (
                    <button key={event.id} type="button" onClick={() => { setMonth(event.event_date.slice(0, 7)); startEdit(event); }} className="w-full rounded-lg border border-themed bg-page/35 p-3 text-left transition hover:border-[var(--border-hover)] hover:bg-surface-hover">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0"><strong className="block truncate text-sm text-primary">{event.symbol}</strong><span className="block truncate text-xs text-muted">{event.name}</span></span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] ${statusClasses[event.status]}`}>{t(`watchlist.earningsStatus${event.status[0].toUpperCase()}${event.status.slice(1)}`)}</span>
                          <span className={`rounded border px-1.5 py-0.5 text-[9px] ${sourceClasses[event.source || "manual"]}`}>{sourceLabel(event.source)}</span>
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="text-secondary">{formatDay(event.event_date, localeTag)}{event.fiscal_period ? ` · ${event.fiscal_period}` : ""}</span><span className={daysAway <= 7 ? "font-semibold text-amber-300" : "text-muted"}>{daysAway === 0 ? t("watchlist.earningsTodayLabel") : t("watchlist.earningsInDays", { count: daysAway })}</span></div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section id="earnings-editor" className="rounded-[var(--radius-xl)] border border-themed bg-surface/65 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-primary">{editingId ? t("watchlist.earningsEdit") : t("watchlist.earningsAdd")}</h2>{editingId && <button type="button" onClick={() => startCreate()} className="text-xs text-muted hover:text-primary">{t("watchlist.earningsNew")}</button>}</div>
            {selectedEvent && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-themed bg-page/35 px-3 py-2 text-[11px] text-muted">
                <span className={`rounded border px-1.5 py-0.5 ${sourceClasses[selectedEvent.source || "manual"]}`}>{sourceLabel(selectedEvent.source)}</span>
                {selectedEvent.synced_at && <span>{t("watchlist.earningsSyncedAt", { date: new Date(selectedEvent.synced_at).toLocaleString(localeTag, { dateStyle: "medium", timeStyle: "short" }) })}</span>}
              </div>
            )}
            {stocks.length === 0 ? <p className="text-sm leading-6 text-muted">{t("watchlist.earningsNoStocks")}</p> : (
              <div className="space-y-3">
                <label className="block"><span className="field-label">{t("watchlist.earningsStock")}</span><select value={form.stockId} disabled={Boolean(editingId)} onChange={(event) => setForm({ ...form, stockId: event.target.value })} className="field-input"><option value="">{t("watchlist.earningsSelectStock")}</option>{stocks.map((stock) => <option key={stock.id} value={stock.id}>{stock.symbol} · {stock.name}</option>)}</select></label>
                <label className="block"><span className="field-label">{t("watchlist.earningsDate")}</span><input type="date" value={form.eventDate} onChange={(event) => setForm({ ...form, eventDate: event.target.value })} className="field-input" /></label>
                <label className="block"><span className="field-label">{t("watchlist.earningsPeriod")}</span><input value={form.fiscalPeriod} onChange={(event) => setForm({ ...form, fiscalPeriod: event.target.value })} placeholder={t("watchlist.earningsPeriodPlaceholder")} className="field-input" /></label>
                <label className="block"><span className="field-label">{t("watchlist.earningsStatus")}</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as EarningsStatus })} className="field-input">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{t(`watchlist.earningsStatus${status[0].toUpperCase()}${status.slice(1)}`)}</option>)}</select></label>
                <label className="block"><span className="field-label">{t("watchlist.earningsNote")}</span><textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={3} placeholder={t("watchlist.earningsNotePlaceholder")} className="field-input resize-y leading-6" /></label>
                <div className="flex gap-2 pt-1"><button type="button" onClick={save} disabled={saving || !form.stockId || !form.eventDate} className="ui-button flex-1 disabled:cursor-not-allowed disabled:opacity-50">{saving ? t("watchlist.earningsSaving") : t("watchlist.earningsSave")}</button>{editingId && <button type="button" onClick={() => { const event = events.find((item) => item.id === editingId); if (event) void remove(event); }} className="rounded-md border border-red-400/25 px-3 py-2 text-sm text-red-200 transition hover:bg-red-400/10">{t("watchlist.earningsDelete")}</button>}</div>
              </div>
            )}
          </section>
        </aside>
      </div>
      {loading && <p className="mt-4 text-center text-xs text-muted">{t("watchlist.earningsLoading")}</p>}
      {expandedDate && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center sm:p-6">
          <button type="button" onClick={() => setExpandedDate(null)} className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" aria-label={t("watchlist.earningsCloseDay")} />
          <section role="dialog" aria-modal="true" aria-labelledby="earnings-day-title" className="relative z-10 max-h-[min(78vh,620px)] w-full max-w-lg overflow-hidden rounded-lg border border-themed bg-surface shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-themed px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-xs text-muted">{formatFullDay(expandedDate, localeTag)}</p>
                <h2 id="earnings-day-title" className="mt-1 text-base font-semibold text-primary">{t("watchlist.earningsDayTitle", { count: expandedEvents.length })}</h2>
              </div>
              <button type="button" onClick={() => setExpandedDate(null)} className="icon-button shrink-0" aria-label={t("watchlist.earningsCloseDay")} title={t("watchlist.earningsCloseDay")}>×</button>
            </header>
            <div className="max-h-[min(56vh,440px)] space-y-2 overflow-y-auto p-3 sm:p-4">
              {expandedEvents.map((event) => (
                <button key={event.id} type="button" onClick={() => { setExpandedDate(null); startEdit(event); }} className="flex w-full items-center justify-between gap-3 rounded-md border border-themed bg-page/35 p-3 text-left transition hover:border-[var(--border-hover)] hover:bg-surface-hover">
                  <span className="min-w-0"><strong className="block truncate text-sm text-primary">{event.symbol} · {event.name}</strong><span className="mt-1 block truncate text-xs text-muted">{event.fiscal_period || t("watchlist.earningsPeriodUnset")}</span></span>
                  <span className="flex shrink-0 flex-col items-end gap-1"><span className={`rounded border px-1.5 py-0.5 text-[10px] ${statusClasses[event.status]}`}>{t(`watchlist.earningsStatus${event.status[0].toUpperCase()}${event.status.slice(1)}`)}</span><span className={`rounded border px-1.5 py-0.5 text-[9px] ${sourceClasses[event.source || "manual"]}`}>{sourceLabel(event.source)}</span></span>
                </button>
              ))}
            </div>
            <footer className="border-t border-themed p-3 sm:px-4">
              <button type="button" onClick={() => { const date = expandedDate; setExpandedDate(null); startCreate(date); }} className="ui-button ui-button--primary w-full">{t("watchlist.earningsAddOnDate", { date: formatDay(expandedDate, localeTag) })}</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
