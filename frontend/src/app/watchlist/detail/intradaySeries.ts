export interface IntradayPoint { timestamp: number; price: number; volume?: number | null }

export function normalizeIntradayPoints(points: IntradayPoint[]): IntradayPoint[] {
  return Array.from(new Map(points.filter(point => Number.isFinite(point.timestamp) && Number.isFinite(point.price) && point.price > 0).map(point => {
    const normalized = point.volume === undefined ? point : { ...point, volume: typeof point.volume === "number" && Number.isFinite(point.volume) && point.volume >= 0 ? point.volume : null };
    return [point.timestamp, normalized] as const;
  })).values()).sort((a, b) => a.timestamp - b.timestamp);
}

export function nearestIntradayIndex(points: IntradayPoint[], timestamp: number): number {
  if (!points.length) return -1;
  let nearest = 0;
  points.forEach((point, index) => {
    if (Math.abs(point.timestamp - timestamp) < Math.abs(points[nearest].timestamp - timestamp)) nearest = index;
  });
  return nearest;
}

export function inferIntradayMarket(symbol: string, sector: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (normalized.endsWith("-USD") || /crypto/i.test(sector)) return "crypto";
  if (/\.HK$|^\d{4,5}$/.test(normalized)) return "hk";
  if (/\.(SS|SH|SZ|BJ)$|^\d{6}$/.test(normalized)) return "cn";
  if (normalized.endsWith(".TW")) return "tw";
  return "us";
}
