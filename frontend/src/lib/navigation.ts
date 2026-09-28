export type ProductArea = "workbench" | "portfolio" | "decision" | "tools";

export const NAV_ITEMS = [
  { href: "/", labelKey: "nav.workbench", area: "workbench", required: true },
  { href: "/portfolio", labelKey: "nav.portfolio", area: "portfolio", required: true },
  { href: "/decision", labelKey: "nav.decision", area: "decision", required: true },
  { href: "/tools", labelKey: "nav.tools", area: "tools", required: true },
] as const;

export const OPTIONAL_NAV_ITEMS: typeof NAV_ITEMS[number][] = [];
export const DEFAULT_NAV_ITEMS = NAV_ITEMS.map((item) => item.href);
export const USER_UPDATED_EVENT = "seekcost:user-updated";

export const SECTION_NAV: Record<Exclude<ProductArea, "workbench">, readonly { href: string; labelKey: string }[]> = {
  portfolio: [
    { href: "/portfolio", labelKey: "nav.portfolioOverview" },
    { href: "/assets", labelKey: "nav.positionsLots" },
    { href: "/trade", labelKey: "nav.transactions" },
    { href: "/import/ibkr", labelKey: "nav.ibkrImport" },
    { href: "/finance", labelKey: "ux.finance" },
  ],
  decision: [
    { href: "/decision", labelKey: "nav.decisionOverview" },
    { href: "/watchlist", labelKey: "nav.candidates" },
    { href: "/quant", labelKey: "nav.quantStrategies" },
    { href: "/alerts", labelKey: "ux.alerts" },
    { href: "/watchlist/earnings", labelKey: "watchlist.earningsTitle" },
    { href: "/research", labelKey: "nav.decisionRecords" },
    { href: "/research/new", labelKey: "nav.recordDecision" },
  ],
  tools: [
    { href: "/tools", labelKey: "nav.tools" },
  ],
};

const AREA_PATHS: Record<ProductArea, readonly string[]> = {
  workbench: ["/"],
  portfolio: ["/portfolio", "/assets", "/dashboard", "/trade", "/import", "/finance"],
  decision: ["/decision", "/watchlist", "/quant", "/alerts", "/notifications", "/research", "/notes"],
  tools: ["/tools"],
};

export function productAreaForPath(pathname: string): ProductArea | null {
  if (pathname === "/") return "workbench";
  for (const area of ["portfolio", "decision", "tools"] as const) {
    if (AREA_PATHS[area].some((path) => pathname === path || pathname.startsWith(`${path}/`))) return area;
  }
  return null;
}

export function isProductNavActive(pathname: string, href: string) {
  const item = NAV_ITEMS.find((candidate) => candidate.href === href);
  return item ? productAreaForPath(pathname) === item.area : pathname === href;
}

export function isSectionNavActive(pathname: string, href: string) {
  if (href === "/research" && pathname.startsWith("/notes")) return true;
  if (href === "/portfolio" && pathname === "/dashboard") return true;
  const moreSpecific = Object.values(SECTION_NAV).flat().some((item) =>
    item.href !== href && item.href.startsWith(`${href}/`) &&
    (pathname === item.href || pathname.startsWith(`${item.href}/`)));
  if (moreSpecific) return false;
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

/**
 * 旧版允许用户选择大量一级模块。当前版本收敛为四个固定产品区域，历史设置仍保留在
 * 用户数据中，但不再影响主导航，避免升级后出现缺失入口。
 */
export function normalizeNavItems(items: string[] | null | undefined) {
  void items;
  return [...DEFAULT_NAV_ITEMS];
}
