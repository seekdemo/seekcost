// 市场 → 货币映射
const MARKET_CURRENCY: Record<string, string> = {
  us: "USD", cn: "CNY", hk: "HKD", crypto: "USD", other: "USD",
};

// 货币 → 符号映射
const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: "\u00a5", USD: "$", HKD: "HK$", EUR: "\u20ac", GBP: "\u00a3", JPY: "\u00a5",
};

// 货币 → 显示名称映射
const CURRENCY_LABEL: Record<string, string> = {
  CNY: "人民币", USD: "美元", HKD: "港币", EUR: "欧元", GBP: "英镑", JPY: "日元",
};

/** 根据市场获取货币代码 */
export function marketCurrency(market?: string): string {
  return MARKET_CURRENCY[market || "other"] || "USD";
}

/** 根据市场获取货币符号 */
export function marketSymbol(market?: string): string {
  const cur = marketCurrency(market);
  return CURRENCY_SYMBOL[cur] || "$";
}

/** Resolve a brokerage-cash currency from symbols such as IBKR-HKD-CASH. */
export function cashSymbol(symbol?: string): string {
  const currency = symbol?.match(/^IBKR-([A-Z]{3})-CASH$/i)?.[1]?.toUpperCase();
  return CURRENCY_SYMBOL[currency || "USD"] || "$";
}

/** 获取货币符号 */
export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOL[currency] || "$";
}

/** 格式化带货币符号的金额 */
export function fmtMoney(amount: number, market?: string): string {
  const sym = marketSymbol(market);
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = amount < 0 ? "-" : "";
  return `${sign}${sym}${formatted}`;
}

/** 将市场对应货币金额转换为 CNY */
export function convertToCNY(amount: number, market: string, rates: Record<string, number>): number {
  const currency = marketCurrency(market);
  const rate = rates[currency] ?? 1;
  return amount * rate;
}

/** 将 CNY 金额转换为目标货币 */
export function convertFromCNY(amountCNY: number, targetCurrency: string, rates: Record<string, number>): number {
  if (targetCurrency === "CNY") return amountCNY;
  const rate = rates[targetCurrency] ?? 1;
  return rate > 0 ? amountCNY / rate : amountCNY;
}

/** 格式化指定货币的金额 */
export function fmtCurrency(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency] || "$";
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = amount < 0 ? "-" : "";
  return `${sign}${sym}${formatted}`;
}

/** 格式化 CNY 金额 */
export function fmtCNY(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = amount < 0 ? "-" : "";
  return `${sign}\u00a5${formatted}`;
}

export { CURRENCY_SYMBOL, MARKET_CURRENCY, CURRENCY_LABEL };
