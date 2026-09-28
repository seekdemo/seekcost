export type AlertSide = "both" | "above" | "below";
export interface AlertRuleWrite {
  stock_id: number | null; scope: "single" | "watchlist"; name: string; period: number; tolerance: number;
  side: AlertSide; cooldown_minutes: number; enabled: boolean;
}
export interface AlertEvidence {
  price: number; sma: number; gap_pct: number; period: number; tolerance: number;
  side: AlertSide; quote_at: number; sma_through: string; currency: string; source: string;
}
export interface AlertRule extends AlertRuleWrite {
  id: number; symbol: string; stock_name: string; status: string;
  checked_at: string | null; last_triggered_at: string | null; evidence: AlertEvidence | null;
  target_count?: number; checked_count?: number; inside_count?: number; unavailable_count?: number;
}
export interface AlertNotification {
  id: number; stock_id: number | null; rule_name: string; symbol: string;
  evidence: AlertEvidence; created_at: string; read_at: string | null;
}
export interface AlertInbox { items: AlertNotification[]; unread_count: number; next_cursor: number | null }
export const ALERT_INBOX_CHANGED = "seekcost:alert-inbox-changed";
export function alertStatus(status: string, zh: boolean) {
  const labels: Record<string, [string, string]> = {
    pending: ["等待首次检测", "Awaiting first check"], inside: ["已进入关注范围", "Within attention range"],
    watching: ["按标的独立检测", "Checking each stock independently"],
    outside: ["等待进入范围", "Waiting for entry"], stale: ["行情过期 / 休市，暂不检测", "Stale quote / market closed"],
    market_closed: ["非正常交易时段，暂不检测", "Outside regular session · skipped"],
    provider_error: ["行情暂不可用，自动重试", "Provider unavailable · retrying"],
    insufficient_data: ["历史交易日不足", "Insufficient daily history"], invalid_data: ["数据不完整，暂不检测", "Incomplete data · skipped"],
  };
  return labels[status]?.[zh ? 0 : 1] ?? status;
}
export function alertBand(side: AlertSide, tolerance: number, zh: boolean) {
  return side === "both" ? `${zh ? "上下" : "±"} ${tolerance}%` : `${side === "above" ? (zh ? "上方" : "above") : (zh ? "下方" : "below")} 0–${tolerance}%`;
}
