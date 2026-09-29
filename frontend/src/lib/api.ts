import { getToken, clearAuth } from "./auth";
import type { KRange, UserProfile, WatchResearchSectionKey, WatchResearchSectionUpdate } from "./types";

const BASE = "/api/v1";
let authRedirecting = false;

/**
 * 非关键的挂载期请求（通知未读数、管理员探测）延迟到页面资源流静默后再发出。
 * 开发环境 Next/Turbopack 冷编译会在首屏挂载后触发一次（甚至两次）整页重载：
 * 旧文档里过早发出的请求会随卸载被浏览器记为 net::ERR_ABORTED 红错。
 * 重载会重启 JS 上下文，所以在“最终文档”里观察资源条目数连续稳定即代表重载已结束；
 * 不同宿主（自动化/扩展）下重载时机不同，固定延时不可靠，必须用自适应静默判定。
 * 生产环境没有编译重载，只做极短退让。
 */
export function whenPageQuiet(): Promise<void> {
  return new Promise(resolve => {
    if (typeof window === "undefined") { resolve(); return; }
    if (process.env.NODE_ENV !== "development") { window.setTimeout(resolve, 150); return; }
    const started = performance.now();
    let stableSince = 0;
    let lastCount = -1;
    const tick = () => {
      const count = performance.getEntriesByType("resource").length;
      const now = performance.now();
      stableSince = count === lastCount ? (stableSince || now) : 0;
      lastCount = count;
      if ((stableSince && now - stableSince >= 900) || now - started >= 5000) return resolve();
      window.setTimeout(tick, 250);
    };
    const begin = () => window.setTimeout(tick, 300);
    if (document.readyState === "complete") begin();
    else window.addEventListener("load", begin, { once: true });
  });
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { headers, ...opts });

  if (res.status === 401) {
    clearAuth();
    // 并发请求同时 401 时只跳转一次，避免重复卸载页面中止其他在途请求（net::ERR_ABORTED）
    if (typeof window !== "undefined" && !authRedirecting) {
      authRedirecting = true;
      window.location.href = "/login";
    }
    throw new Error("未登录");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    const msg = typeof detail === "string"
      ? detail
      : Array.isArray(detail)
        ? detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ")
        : res.statusText;
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listResearchGuides: () => request<import('./researchGuide').GuideDraft[]>('/research-guides'),
  getResearchGuide: (id: number) => request<import('./researchGuide').GuideDraft>(`/research-guides/${id}`),
  saveResearchGuide: (id: number, draft: Pick<import('./researchGuide').GuideDraft, 'version' | 'step' | 'mode' | 'answers'>) => request<import('./researchGuide').GuideDraft>(`/research-guides/${id}`, { method: 'PUT', body: JSON.stringify(draft) }),
  publishResearchGuide: (id: number, version: number) => request<import('./researchGuide').GuideDraft>(`/research-guides/${id}/publish`, { method: 'POST', body: JSON.stringify({version, confirmed: true}) }),
  adminMe: () => request<{ username: string; role: string }>("/admin/me"),
  contentDraft: (locale: import("./siteContent").ContentLocale) => request<import("./siteContent").ContentDraft>(`/admin/content/about?locale=${locale}`),
  saveContentDraft: (locale: import("./siteContent").ContentLocale, version: number, content: import("./siteContent").AboutCopy) => request<import("./siteContent").ContentDraft>(`/admin/content/about?locale=${locale}`, { method: "PUT", body: JSON.stringify({version, content}) }),
  publishContent: (locale: import("./siteContent").ContentLocale, version: number) => request<import("./siteContent").ContentDraft>(`/admin/content/about/publish?locale=${locale}`, { method: "POST", body: JSON.stringify({version}) }),
  contentAudit: () => request<import("./siteContent").ContentAudit[]>("/admin/content/audit"),
  alertRules: () => request<import("./alerts").AlertRule[]>("/alerts/rules"),
  createAlertRule: (data: import("./alerts").AlertRuleWrite) => request<import("./alerts").AlertRule>("/alerts/rules", { method: "POST", body: JSON.stringify(data) }),
  updateAlertRule: (id: number, data: import("./alerts").AlertRuleWrite) => request<import("./alerts").AlertRule>(`/alerts/rules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAlertRule: (id: number) => request<void>(`/alerts/rules/${id}`, { method: "DELETE" }),
  alertInbox: (unread = false, before?: number, limit = 30) => request<import("./alerts").AlertInbox>(`/alerts/notifications?unread=${unread}&limit=${limit}${before ? `&before=${before}` : ""}`, { keepalive: true }),
  readAlert: (id: number) => request<{ok: boolean}>(`/alerts/notifications/${id}/read`, { method: "POST" }),
  readAllAlerts: () => request<{ok: boolean}>("/alerts/notifications/read-all", { method: "POST" }),
  intradayQuote: (symbol: string, market: string) =>
    request<import("@/components/MarketQuote").IntradayQuote>(`/prices/intraday-quote?${new URLSearchParams({ symbol, market })}`),
  // ── 认证 ──
  register: (data: { username: string; password: string; nickname?: string }) =>
    request<{ access_token: string; token_type: string }>("/auth/register", {
      method: "POST", body: JSON.stringify(data),
    }),
  login: (data: { username: string; password: string }) =>
    request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST", body: JSON.stringify(data),
    }),
  me: () => request<UserProfile>("/auth/me"),
  updateProfile: (data: { nickname?: string; theme?: string; avatar_url?: string; default_currency?: string; nav_items?: string[] }) =>
    request<UserProfile>("/auth/profile", {
      method: "PATCH", body: JSON.stringify(data),
    }),
  changePassword: (data: { old_password: string; new_password: string }) =>
    request<{ message: string }>("/auth/change-password", {
      method: "POST", body: JSON.stringify(data),
    }),

  // ── Investment tool directory ──
  listInvestmentTools: () =>
    request<import("./types").InvestmentTool[]>("/tools"),
  createInvestmentTool: (data: import("./types").InvestmentToolWrite) =>
    request<import("./types").InvestmentTool>("/tools", { method: "POST", body: JSON.stringify(data) }),
  updateInvestmentTool: (id: number, data: Partial<import("./types").InvestmentToolWrite>) =>
    request<import("./types").InvestmentTool>(`/tools/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteInvestmentTool: (id: number) =>
    request<void>(`/tools/${id}`, { method: "DELETE" }),

  // ── Auditable quant plugins ──
  listQuantStrategies: () =>
    request<import("./types").QuantStrategy[]>("/quant-strategies"),
  updateQuantStrategy: (strategyKey: string, enabled: boolean) =>
    request<import("./types").QuantStrategy>(`/quant-strategies/${strategyKey}`, {
      method: "PATCH", body: JSON.stringify({ enabled }),
    }),
  listQuantStrategyStocks: (strategyKey: string) =>
    request<import("./types").QuantStrategyStock[]>(`/quant-strategies/${strategyKey}/stocks`),
  scanQuantStock: (strategyKey: string, stockId: number) =>
    request<import("./types").QuantSignalSnapshot>(
      `/quant-strategies/${strategyKey}/stocks/${stockId}/scan`,
      { method: "POST" },
    ),

  // ── 资产 ──
  listAssets: (zone?: string, includeArchived?: boolean) => {
    const params = new URLSearchParams();
    if (zone) params.set("zone", zone);
    if (includeArchived) params.set("include_archived", "true");
    const qs = params.toString();
    return request<import("./types").Asset[]>(`/assets${qs ? `?${qs}` : ""}`);
  },
  getAsset: (id: number) =>
    request<import("./types").AssetDetail>(`/assets/${id}`),
  createAsset: (data: Record<string, unknown>) =>
    request<import("./types").Asset>("/assets", { method: "POST", body: JSON.stringify(data) }),
  updateAsset: (id: number, data: Record<string, unknown>) =>
    request<import("./types").Asset>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteAsset: (id: number) =>
    request<void>(`/assets/${id}`, { method: "DELETE" }),
  reorderAssets: (items: { id: number; sort_order: number }[]) =>
    request<{ message: string }>("/assets/reorder", { method: "POST", body: JSON.stringify({ items }) }),
  togglePin: (id: number, pinned: boolean) =>
    request<import("./types").Asset>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify({ pinned }) }),
  archiveAsset: (id: number, note?: string) =>
    request<import("./types").Asset>(`/assets/${id}/archive`, { method: "POST", body: JSON.stringify({ note: note || null }) }),
  unarchiveAsset: (id: number) =>
    request<import("./types").Asset>(`/assets/${id}/unarchive`, { method: "POST" }),
  refreshPrices: () =>
    request<{ updated_count: number; prices: Record<string, number>; sessions: Record<string, string>; error: string | null; message: string | null }>("/prices/refresh", { method: "POST" }),
  refreshWatchlistPrices: (items: { symbol: string; market: string }[]) =>
    request<{ updated_count: number; prices: Record<string, number>; sessions: Record<string, string>; changes?: Record<string, number>; change_pcts?: Record<string, number>; error: string | null; message: string | null }>("/prices/quotes", {
      method: "POST", body: JSON.stringify({ items }),
    }),
  searchSymbols: (q: string) =>
    request<{ items: { symbol: string; name: string; exchange: string; type: string; market: string }[] }>(
      `/prices/search?q=${encodeURIComponent(q)}`
    ),
  getDailyBars: (symbol: string, market: string, range: KRange = "6mo") =>
    request<{
      symbol: string;
      market: string;
      range: string;
      currency: string;
      exchange_timezone: string;
      items: { date: number; open: number; high: number; low: number; close: number; volume: number }[];
    }>(`/prices/daily-bars?symbol=${encodeURIComponent(symbol)}&market=${encodeURIComponent(market)}&range=${encodeURIComponent(range)}`),
  getPriceVolume: (stockId: number, market: string, range: KRange = "6mo") =>
    request<import("./types").PriceVolumeResponse>(
      `/prices/price-volume?stock_id=${stockId}&market=${encodeURIComponent(market)}&range=${encodeURIComponent(range)}`
    ),

  // ── 数据管理 ──
  resetData: () =>
    request<{ deleted_assets: number; deleted_transactions: number; message: string }>("/data/reset", { method: "POST", body: JSON.stringify({ confirm: "RESET" }) }),

  // ── 交易 ──
  createTransaction: (data: import("./types").TransactionCreate) =>
    request<unknown>("/transactions", { method: "POST", body: JSON.stringify(data) }),
  updateTransaction: (id: number, data: import("./types").TransactionUpdate) =>
    request<unknown>(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTransaction: (id: number) =>
    request<void>(`/transactions/${id}`, { method: "DELETE" }),

  // ── 仪表盘 ──
  getDashboard: () => request<import("./types").Dashboard>("/dashboard"),

  // ── 汇率 ──
  getExchangeRates: () =>
    request<{ base: string; rates: Record<string, number> }>("/exchange-rates"),
  convertCurrency: (amount: number, from: string, to: string) =>
    request<{ amount: number; from: string; to: string; rate: number; converted: number }>(
      `/exchange-rates/convert?amount=${amount}&from_cur=${from}&to_cur=${to}`
    ),
  refreshExchangeRates: () =>
    request<{ message: string; rates: Record<string, number> }>("/exchange-rates/refresh", { method: "POST" }),

  // ── 交易计划 ──
  createTradePlan: (data: import("./types").TradePlanCreate) =>
    request<import("./types").TradePlan>("/trade-plans", { method: "POST", body: JSON.stringify(data) }),
  updateTradePlan: (id: number, data: import("./types").TradePlanUpdate) =>
    request<import("./types").TradePlan>(`/trade-plans/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTradePlan: (id: number) =>
    request<void>(`/trade-plans/${id}`, { method: "DELETE" }),

  // ── 财务管理 ──
  getSalaryConfig: () =>
    request<import("./types").SalaryConfig | null>("/finance/salary"),
  createSalaryConfig: (data: Record<string, unknown>) =>
    request<import("./types").SalaryConfig>("/finance/salary", { method: "POST", body: JSON.stringify(data) }),
  updateSalaryConfig: (id: number, data: Record<string, unknown>) =>
    request<import("./types").SalaryConfig>(`/finance/salary/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  previewSalary: (data: Record<string, unknown>) =>
    request<import("./types").SalaryPreview>("/finance/salary/preview", { method: "POST", body: JSON.stringify(data) }),

  listIncome: (year?: number) =>
    request<import("./types").IncomeRecord[]>(`/finance/income${year ? `?year=${year}` : ""}`),
  createIncome: (data: Record<string, unknown>) =>
    request<import("./types").IncomeRecord>("/finance/income", { method: "POST", body: JSON.stringify(data) }),
  deleteIncome: (id: number) =>
    request<void>(`/finance/income/${id}`, { method: "DELETE" }),
  autoGenerateIncome: (month: string) =>
    request<import("./types").IncomeRecord>(`/finance/income/auto-generate?month=${month}`, { method: "POST" }),

  listLiabilities: () =>
    request<import("./types").LiabilityItem[]>("/finance/liabilities"),
  createLiability: (data: Record<string, unknown>) =>
    request<import("./types").LiabilityItem>("/finance/liabilities", { method: "POST", body: JSON.stringify(data) }),
  updateLiability: (id: number, data: Record<string, unknown>) =>
    request<import("./types").LiabilityItem>(`/finance/liabilities/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteLiability: (id: number) =>
    request<void>(`/finance/liabilities/${id}`, { method: "DELETE" }),

  getNetWorth: () =>
    request<import("./types").NetWorthOverview>("/finance/net-worth"),

  // ── 现金账户 ──
  listCashAccounts: () =>
    request<import("./types").CashAccount[]>("/cash-accounts"),
  createCashAccount: (data: Record<string, unknown>) =>
    request<import("./types").CashAccount>("/cash-accounts", { method: "POST", body: JSON.stringify(data) }),
  updateCashAccount: (id: number, data: Record<string, unknown>) =>
    request<import("./types").CashAccount>(`/cash-accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCashAccount: (id: number) =>
    request<void>(`/cash-accounts/${id}`, { method: "DELETE" }),
  adjustCashBalance: (id: number, amount: number, note?: string) =>
    request<import("./types").CashAccount>(`/cash-accounts/${id}/adjust-balance`, {
      method: "POST", body: JSON.stringify({ amount, note }),
    }),
  getPortfolioSummary: () =>
    request<import("./types").PortfolioSummary>("/cash-accounts/portfolio/summary"),

  // ── 资产资金规划 ──
  updatePlannedInvestment: (assetId: number, plannedAmount: number, includesInvested: boolean = true) =>
    request<import("./types").Asset>(`/assets/${assetId}/planned-investment`, {
      method: "PATCH", body: JSON.stringify({ planned_amount: plannedAmount, includes_invested: includesInvested }),
    }),
  getAssetInvestmentSummary: (assetId: number) =>
    request<Record<string, number>>(`/assets/${assetId}/investment-summary`),

  // ── 股票池 / 研究库 ──
  listWatchStocks: () =>
    request<Record<string, unknown>[]>("/watchlist/stocks"),
  getWatchlistResearchProfile: (stockId: number) =>
    request<import("./types").WatchlistResearchProfile>(`/watchlist/stocks/${stockId}/research-profile`),
  getWatchStockQuote: (stockId: number) =>
    request<{ stock_id: number; symbol: string; market: string; price: number; session: string; fetched_at: string }>(
      `/watchlist/stocks/${stockId}/quote`,
    ),
  updateWatchResearchSection: (
    stockId: number,
    key: WatchResearchSectionKey,
    data: WatchResearchSectionUpdate,
  ) => request<import("./types").WatchResearchSection>(
    `/watchlist/stocks/${stockId}/research-sections/${encodeURIComponent(key)}`,
    { method: "PATCH", body: JSON.stringify(data) },
  ),
  createWatchStock: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>("/watchlist/stocks", { method: "POST", body: JSON.stringify(data) }),
  bulkImportWatchStocks: (items: Record<string, unknown>[]) =>
    request<{ imported: number; skipped: number; items: Record<string, unknown>[] }>("/watchlist/stocks/bulk-import", {
      method: "POST", body: JSON.stringify({ items }),
    }),
  updateWatchStock: (id: string | number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/watchlist/stocks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteWatchStock: (id: string | number) =>
    request<void>(`/watchlist/stocks/${id}`, { method: "DELETE" }),
  previewWatchlistClassification: async (files: File[]): Promise<import("./types").WatchlistClassificationPreview> => {
    const token = (await import("./auth")).getToken();
    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    const response = await fetch(`${BASE}/watchlist/classification/preview`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(typeof error.detail === "string" ? error.detail : response.statusText);
    }
    return response.json();
  },
  applyWatchlistClassification: (sessionId: string, groups: import("./types").WatchlistClassificationSelection[]) =>
    request<import("./types").WatchlistClassificationApplyResult>("/watchlist/classification/apply", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, groups }),
    }),
  listEarnings: (fromDate?: string, toDate?: string) => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    const qs = params.toString();
    return request<import("./types").EarningsEvent[]>(`/watchlist/earnings${qs ? `?${qs}` : ""}`);
  },
  createEarnings: (data: { stock_id: number; event_date: string; fiscal_period?: string; status?: import("./types").EarningsStatus; note?: string }) =>
    request<import("./types").EarningsEvent>("/watchlist/earnings", { method: "POST", body: JSON.stringify(data) }),
  updateEarnings: (id: number, data: { event_date?: string; fiscal_period?: string; status?: import("./types").EarningsStatus; note?: string }) =>
    request<import("./types").EarningsEvent>(`/watchlist/earnings/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteEarnings: (id: number) =>
    request<void>(`/watchlist/earnings/${id}`, { method: "DELETE" }),
  syncEarnings: () =>
    request<import("./types").EarningsSyncResult>("/watchlist/earnings/sync", { method: "POST" }),

  listNotes: (filters?: {
    kind?: import("./types").ResearchKind;
    status?: import("./types").ResearchStatus;
    starred?: boolean;
    stock_id?: number;
    series_id?: number;
    tag?: string;
    due_before?: string;
    sort?: "updated_at" | "created_at" | "review_due";
    order?: "asc" | "desc";
  }) => {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
    });
    return request<import("./types").ResearchNote[]>(`/notes${params.size ? `?${params}` : ""}`);
  },
  getNote: (id: string | number) =>
    request<import("./types").ResearchNote>(`/notes/${id}`),
  createNote: (data: import("./types").ResearchWrite) =>
    request<import("./types").ResearchNote>("/notes", { method: "POST", body: JSON.stringify(data) }),
  updateNote: (id: string | number, data: import("./types").ResearchWrite) =>
    request<import("./types").ResearchNote>(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteNote: (id: string | number) =>
    request<void>(`/notes/${id}`, { method: "DELETE" }),
  listNoteFavorites: () =>
    request<{ note_ids: number[]; series: string[] }>("/notes/favorites"),
  favoriteNote: (id: string | number) =>
    request<void>(`/notes/favorites/${id}`, { method: "POST" }),
  unfavoriteNote: (id: string | number) =>
    request<void>(`/notes/favorites/${id}`, { method: "DELETE" }),
  favoriteNoteSeries: (series: string) =>
    request<void>("/notes/series/favorite", { method: "POST", body: JSON.stringify({ series }) }),
  unfavoriteNoteSeries: (series: string) =>
    request<void>("/notes/series/favorite", { method: "DELETE", body: JSON.stringify({ series }) }),
  listNoteSeries: () =>
    request<import("./types").ResearchTopic[]>("/notes/series"),
  getNoteSeries: (id: string | number) =>
    request<import("./types").ResearchTopic>(`/notes/series/${id}`),
  listNotesInSeries: (id: string | number) =>
    request<import("./types").ResearchNote[]>(`/notes/series/${id}/notes`),
  createNoteSeries: (data: import("./types").ResearchTopicWrite) =>
    request<import("./types").ResearchTopic>("/notes/series", { method: "POST", body: JSON.stringify(data) }),
  updateNoteSeries: (id: string | number, data: import("./types").ResearchTopicWrite) =>
    request<import("./types").ResearchTopic>(`/notes/series/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteNoteSeries: (id: string | number) =>
    request<void>(`/notes/series/${id}`, { method: "DELETE" }),
  listNoteComments: (noteId: string | number) =>
    request<import("./types").ResearchComment[]>(`/notes/${noteId}/comments`),
  createNoteComment: (
    noteId: string | number,
    content: string,
    parentId?: string | number | null,
    anchor?: { quoteText: string; quotePrefix: string; quoteSuffix: string; startOffset: number; endOffset: number; blockId?: string },
  ) =>
    request<import("./types").ResearchComment>(`/notes/${noteId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        content,
        parent_id: parentId ? Number(parentId) : null,
        quote_text: anchor?.quoteText,
        quote_prefix: anchor?.quotePrefix,
        quote_suffix: anchor?.quoteSuffix,
        start_offset: anchor?.startOffset,
        end_offset: anchor?.endOffset,
        block_id: anchor?.blockId,
      }),
    }),
  deleteNoteComment: (commentId: string | number) =>
    request<void>(`/notes/comments/${commentId}`, { method: "DELETE" }),
  addNoteCommentReaction: (commentId: string | number, emoji: string) =>
    request<import("./types").ResearchCommentReaction[]>(`/notes/comments/${commentId}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) }),
  removeNoteCommentReaction: (commentId: string | number, emoji: string) =>
    request<import("./types").ResearchCommentReaction[]>(`/notes/comments/${commentId}/reactions`, { method: "DELETE", body: JSON.stringify({ emoji }) }),

  // ── 投资工作台 ──
  getWorkbenchOverview: () =>
    request<import("./types").WorkbenchOverview>("/workbench/overview"),
  updateVolumeWatchSetting: (threshold: number) =>
    request<{ threshold: number }>("/workbench/volume-watch", { method: "PATCH", body: JSON.stringify({ threshold }) }),
  getWorkbenchIntradayPreview: (refresh = false, signal?: AbortSignal) =>
    request<import("./types").IntradayPreview>(`/workbench/intraday-preview${refresh ? "?refresh=true" : ""}`, { signal }),

  listStockMemos: (stockId?: string | number) =>
    request<Record<string, unknown>[]>(`/watchlist/memos${stockId ? `?stock_id=${stockId}` : ""}`),
  createStockMemo: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>("/watchlist/memos", { method: "POST", body: JSON.stringify(data) }),
  updateStockMemo: (id: string | number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/watchlist/memos/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteStockMemo: (id: string | number) =>
    request<void>(`/watchlist/memos/${id}`, { method: "DELETE" }),
  convertStockMemoToNote: (id: string | number) =>
    request<import("./types").ResearchNote>(`/watchlist/memos/${id}/convert-to-note`, { method: "POST" }),

  // ── 标签 ──
  listTags: () =>
    request<import("./types").Tag[]>("/tags"),
  createTag: (data: { name: string; color?: string }) =>
    request<import("./types").Tag>("/tags", { method: "POST", body: JSON.stringify(data) }),
  updateTag: (id: number, data: { name?: string; color?: string }) =>
    request<import("./types").Tag>(`/tags/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTag: (id: number) =>
    request<void>(`/tags/${id}`, { method: "DELETE" }),
  addTagToAsset: (tagId: number, assetId: number) =>
    request<{ message: string }>(`/tags/${tagId}/assets/${assetId}`, { method: "POST" }),
  removeTagFromAsset: (tagId: number, assetId: number) =>
    request<{ message: string }>(`/tags/${tagId}/assets/${assetId}`, { method: "DELETE" }),

  // ── 交易导入 ──
  uploadImportCSV: async (file: File): Promise<import("./types").ImportUploadResult> => {
    const token = (await import("./auth")).getToken();
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/import/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err.detail === "string" ? err.detail : res.statusText);
    }
    return res.json();
  },
  previewImport: (sessionId: string, body: {
    mapping: import("./types").ImportColumnMapping;
    zone?: string; category?: string;
    date_format?: string; buy_keyword?: string; sell_keyword?: string;
  }) =>
    request<import("./types").ImportPreviewResponse>(
      `/import/preview?session_id=${sessionId}`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  confirmImport: (body: {
    session_id: string; skip_duplicates?: boolean;
    skip_errors?: boolean; selected_rows?: number[] | null;
  }) =>
    request<import("./types").ImportConfirmResponse>("/import/confirm", {
      method: "POST", body: JSON.stringify(body),
    }),
  downloadImportTemplate: () => `${BASE}/import/template`,

  // ── IBKR 导入 ──
  ibkrPreview: async (file: File): Promise<import("./types").IBKRPreviewResponse> => {
    const token = (await import("./auth")).getToken();
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/import/ibkr/preview`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err.detail === "string" ? err.detail : res.statusText);
    }
    return res.json();
  },
  ibkrPreviewParsed: (body: import("./types").IBKRParsedPreviewPayload) =>
    request<import("./types").IBKRPreviewResponse>("/import/ibkr/preview-parsed", {
      method: "POST", body: JSON.stringify(body),
    }),
  ibkrConfirm: (body: {
    session_id: string; zone?: string; category?: string;
    skip_duplicates?: boolean; selected_indices?: number[] | null;
  }) =>
    request<import("./types").IBKRConfirmResponse>("/import/ibkr/confirm", {
      method: "POST", body: JSON.stringify(body),
    }),

};
