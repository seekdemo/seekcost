"use client";

import { useI18n } from "@/components/I18nProvider";
import type { MovingAveragePoint } from "@/lib/types";

export type MovingAveragePeriod = 5 | 10 | 20 | 60 | 120 | 250;
export type MovingAverageKey = "ma5" | "ma10" | "ma20" | "ma60" | "ma120" | "ma250";

export const MOVING_AVERAGES: ReadonlyArray<{
  period: MovingAveragePeriod;
  key: MovingAverageKey;
  color: string;
}> = [
  { period: 5, key: "ma5", color: "#D4A72C" },
  { period: 10, key: "ma10", color: "#4F86C6" },
  { period: 20, key: "ma20", color: "#8B72BE" },
  { period: 60, key: "ma60", color: "#D07A32" },
  { period: 120, key: "ma120", color: "#B76E79" },
  { period: 250, key: "ma250", color: "#2F9C95" },
];

export default function MovingAverageLegend({
  activePoint,
  enabledPeriods,
  onToggle,
}: {
  activePoint: MovingAveragePoint | null;
  enabledPeriods: ReadonlySet<MovingAveragePeriod>;
  onToggle: (period: MovingAveragePeriod) => void;
}) {
  const { localeTag, t } = useI18n();

  return (
    <div className="mb-2 grid grid-cols-3 gap-1 sm:flex sm:flex-wrap" role="group" aria-label={t("dossier.movingAverages")}>
      {MOVING_AVERAGES.map(({ period, key, color }) => {
        const enabled = enabledPeriods.has(period);
        const rawValue = activePoint?.[key];
        const value = rawValue == null
          ? "--"
          : rawValue.toLocaleString(localeTag, { maximumFractionDigits: 2 });
        return (
          <button
            key={period}
            type="button"
            aria-label={`MA${period} ${rawValue == null ? t("dossier.averageUnavailable") : value}`}
            aria-pressed={enabled}
            onClick={() => onToggle(period)}
            className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs transition ${enabled ? "border-themed bg-surface text-primary" : "border-transparent bg-transparent text-muted hover:text-primary"}`}
          >
            <span className="h-0.5 w-4 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
            <span className="font-semibold">MA{period}</span>
            <span className="hidden tabular-nums text-muted sm:inline">{value}</span>
          </button>
        );
      })}
    </div>
  );
}
