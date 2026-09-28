import type { InvestmentToolCategory, InvestmentToolPricing } from "@/lib/types";

export const TOOL_CATEGORIES: Array<{
  value: InvestmentToolCategory;
  labelKey: string;
  tone: string;
  coverTone: string;
}> = [
  { value: "research", labelKey: "tools.categoryResearch", tone: "border-brand bg-brand-soft", coverTone: "bg-[#2a2f63] text-[#e7e9ff]" },
  { value: "data", labelKey: "tools.categoryData", tone: "border-sky-400/25 bg-sky-400/10 text-sky-300", coverTone: "bg-[#243d4b] text-[#e1eef4]" },
  { value: "quant", labelKey: "tools.categoryQuant", tone: "border-violet-400/25 bg-violet-400/10 text-violet-300", coverTone: "bg-[#39344b] text-[#ece8f5]" },
  { value: "backtest", labelKey: "tools.categoryBacktest", tone: "border-amber-400/25 bg-amber-400/10 text-amber-300", coverTone: "bg-[#493d2c] text-[#f3eadb]" },
  { value: "automation", labelKey: "tools.categoryAutomation", tone: "border-cyan-400/25 bg-cyan-400/10 text-cyan-300", coverTone: "bg-[#234247] text-[#dff1f2]" },
  { value: "execution", labelKey: "tools.categoryExecution", tone: "border-rose-400/25 bg-rose-400/10 text-rose-300", coverTone: "bg-[#493239] text-[#f5e6ea]" },
  { value: "journal", labelKey: "tools.categoryJournal", tone: "border-blue-400/25 bg-blue-400/10 text-blue-300", coverTone: "bg-[#283d53] text-[#e4edf7]" },
  { value: "other", labelKey: "tools.categoryOther", tone: "border-themed bg-surface-alt text-secondary", coverTone: "bg-[#363b40] text-[#edf0f2]" },
];

export const TOOL_PRICING: Array<{ value: InvestmentToolPricing; labelKey: string }> = [
  { value: "unknown", labelKey: "tools.pricingUnknown" },
  { value: "free", labelKey: "tools.pricingFree" },
  { value: "freemium", labelKey: "tools.pricingFreemium" },
  { value: "paid", labelKey: "tools.pricingPaid" },
  { value: "open_source", labelKey: "tools.pricingOpenSource" },
];

export function categoryConfig(value: InvestmentToolCategory) {
  return TOOL_CATEGORIES.find((item) => item.value === value) || TOOL_CATEGORIES.at(-1)!;
}

export function pricingLabelKey(value: InvestmentToolPricing) {
  return TOOL_PRICING.find((item) => item.value === value)?.labelKey || "tools.pricingUnknown";
}
