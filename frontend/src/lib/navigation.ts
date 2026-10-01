export type ProductArea = "workbench" | "portfolio" | "decision" | "tools";

export const NAV_ITEMS = [
  { href: "/", labelKey: "nav.workbench", area: "workbench" },
  { href: "/portfolio", labelKey: "nav.portfolio", area: "portfolio" },
  { href: "/decision", labelKey: "nav.decision", area: "decision" },
  { href: "/tools", labelKey: "nav.tools", area: "tools" },
] as const;

export const OPTIONAL_NAV_ITEMS: typeof NAV_ITEMS[number][] = [];
export const DEFAULT_NAV_ITEMS = NAV_ITEMS.map((item) => item.href);
export const USER_UPDATED_EVENT = "seekcost:user-updated";

export const REMINDER_NAV: readonly { href: string; labelKey: string }[] = [
  { href: "/alerts", labelKey: "nav.priceRules" },
  { href: "/quant", labelKey: "nav.quantStrategies" },
  { href: "/watchlist/earnings", labelKey: "watchlist.earningsTitle" },
  { href: "/notifications", labelKey: "nav.notificationRecords" },
];

export function reminderDestinationForPath(pathname: string) {
  return REMINDER_NAV.find(item => pathname === item.href || pathname.startsWith(`${item.href}/`));
}

export const SECTION_NAV: Record<Exclude<ProductArea, "workbench">, readonly { href: string; labelKey: string }[]> = {
  portfolio: [
    { href: "/portfolio", labelKey: "nav.portfolioOverview" },
    { href: "/assets", labelKey: "nav.positionsLots" },
    { href: "/trade", labelKey: "nav.transactions" },
    { href: "/import/ibkr", labelKey: "nav.ibkrImport" },
  ],
  decision: [
    { href: "/decision", labelKey: "nav.thinking" },
    { href: "/watchlist", labelKey: "nav.watchlist" },
    { href: "/research", labelKey: "nav.researchNotes" },
    { href: "/alerts", labelKey: "nav.reminders" },
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
  if (reminderDestinationForPath(pathname)) return href === "/alerts";
  if (href === "/research" && pathname.startsWith("/notes")) return true;
  if (href === "/portfolio" && pathname === "/dashboard") return true;
  const moreSpecific = Object.values(SECTION_NAV).flat().some((item) =>
    item.href !== href && item.href.startsWith(`${href}/`) &&
    (pathname === item.href || pathname.startsWith(`${item.href}/`)));
  if (moreSpecific) return false;
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

/** Old preferences stored page-level paths, so keep the current default until the user saves this new menu. */
export function normalizeNavItems(items: string[] | null | undefined) {
  if (!items?.length) return [...DEFAULT_NAV_ITEMS];
  if (items.some((href) => !DEFAULT_NAV_ITEMS.some((defaultHref) => defaultHref === href))) return [...DEFAULT_NAV_ITEMS];
  return [...new Set(items)];
}
