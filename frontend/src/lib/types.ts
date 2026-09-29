// ---- 用户 ----
export interface UserProfile {
  id: number;
  username: string;
  nickname: string;
  theme: string;
  default_currency: string;
  nav_items: string[] | null;
  avatar_url: string | null;
  created_at: string | null;
}

// ---- Investment tool directory ----
export type InvestmentToolCategory = "research" | "data" | "quant" | "backtest" | "automation" | "execution" | "journal" | "other";
export type InvestmentToolPricing = "free" | "freemium" | "paid" | "open_source" | "unknown";

export interface InvestmentTool {
  icon_url?: string | null;
  id: number;
  user_id: number;
  name: string;
  url: string;
  description: string;
  category: InvestmentToolCategory;
  pricing: InvestmentToolPricing;
  tags: string[];
  source_url: string | null;
  starred: boolean;
  created_at: string;
  updated_at: string;
}

export interface InvestmentToolWrite {
  icon_url?: string | null;
  name: string;
  url: string;
  description: string;
  category: InvestmentToolCategory;
  pricing: InvestmentToolPricing;
  tags: string[];
  source_url: string | null;
  starred: boolean;
}

// ---- Auditable quant plugins ----
export type QuantSignal =
  | "entry_breakout"
  | "entry_pullback"
  | "risk_exit"
  | "hold_trend"
  | "trend_warning"
  | "watch"
  | "needs_qualification"
  | "not_eligible"
  | "insufficient_data"
  | "provider_error"
  | "volume_observation"
  | "anchor_strike_zone"
  | "anchor_fair_zone"
  | "anchor_target_zone"
  | "anchor_risk"
  | "market_baseline_deviation"
  | "anchor_watch";

export interface QuantStrategyParameters {
  volume_multiplier?: number;
  break_buffer_pct?: number;
  hard_stop_pct?: number;
  recovery_sessions?: number;
  pullback_max_bias_pct?: number;
  trend_lookback?: number;
  lookback_sessions?: number;
  anchor_proximity_pct?: number;
  resistance_proximity_pct?: number;
  baseline_deviation_pct?: number;
  ma5_upper_atr?: number;
  ma5_lower_atr?: number;
  risk_buffer_pct?: number;
}

export interface QuantStrategy {
  strategy_key: string;
  name: string;
  strategy_version: string;
  enabled: boolean;
  parameters: QuantStrategyParameters;
  disclaimer: string;
  data_boundary: string;
  updated_at: string | null;
}

export interface QuantQualification {
  stock_id: number;
  historical_low: boolean | null;
  valuation_low: boolean | null;
  attention_low: boolean | null;
  note: string;
  complete: boolean;
  qualified: boolean;
  updated_at: string | null;
}

export interface QuantSignalMetrics {
  bar_count?: number;
  close?: number | null;
  volume?: number | null;
  ma5?: number | null;
  volume_ma5?: number | null;
  volume_ratio?: number | null;
  latest_volume?: number | null;
  prior_average_volume?: number | null;
  volume_ratio_3d?: number | null;
  prior_volumes?: number[];
  volume_ratios?: Array<number | null>;
  ma5_bias_pct?: number | null;
  cost_basis?: number | null;
  hard_stop_price?: number | null;
  ma5_break_price?: number | null;
  latest_three_below_or_equal_ma5?: boolean | null;
  current_ma5_rising?: boolean | null;
  prior_trend_sessions?: number;
  prior_ma5_steps_rising?: boolean | null;
  previous_close?: number | null;
  strike_price?: number | null;
  fair_price?: number | null;
  target_price?: number | null;
  ma5_rising?: boolean | null;
  ma60?: number | null;
  atr14?: number | null;
  vwap20?: number | null;
  vwap60?: number | null;
  support60?: number | null;
  resistance20?: number | null;
  resistance60?: number | null;
  ma5_risk_line?: number | null;
  ma5_pullback_lower?: number | null;
  ma5_pullback_upper?: number | null;
  strike_plus_2atr?: number | null;
  fair_price_gap_pct?: number | null;
  vwap20_gap_pct?: number | null;
  vwap60_gap_pct?: number | null;
  ma60_gap_pct?: number | null;
  reference_code?: string | null;
  reference_price?: number | null;
  reference_gap_pct?: number | null;
}

export interface QuantSignalSnapshot {
  id: number;
  stock_id: number;
  strategy_key: string;
  strategy_version: string;
  signal: QuantSignal;
  reason_codes: string[];
  metrics: QuantSignalMetrics;
  bar_date: string | null;
  source: string;
  execution_timing: string | null;
  error_code: string | null;
  evaluated_at: string;
}

export interface QuantStrategyStock {
  stock_id: number;
  symbol: string;
  name: string;
  stage: "radar" | "conviction" | "strike";
  market: string;
  has_position: boolean;
  qualification: QuantQualification;
  latest_snapshot: QuantSignalSnapshot | null;
}

// ---- 个人研究 ----
export type ResearchKind = "quick" | "company" | "thesis" | "decision" | "review";
export type ResearchStatus = "draft" | "active" | "validated" | "invalidated" | "archived";
export type ResearchEntityType = "watch_stock" | "asset" | "trade_plan" | "transaction";

export interface ResearchLink {
  id?: number;
  entity_type: ResearchEntityType;
  entity_id: number;
}

export interface ResearchNote {
  id: number;
  user_id: number;
  title: string;
  content: string;
  format: "markdown" | "rich";
  visibility: "private";
  kind: ResearchKind;
  status: ResearchStatus;
  confidence: number | null;
  next_review_at: string | null;
  starred: boolean;
  cover_image_url: string | null;
  cover_color: string | null;
  allow_comments: boolean;
  stock_symbols: string[];
  knowledge_tags: string[];
  tags: string[];
  series: string | null;
  series_id: number | null;
  links: ResearchLink[];
  comment_count: number;
  created_at: string;
  updated_at: string;
}

export type ResearchWrite = Partial<Omit<ResearchNote, "id" | "user_id" | "comment_count" | "created_at" | "updated_at">> & {
  title?: string;
  content?: string;
  created_at?: string;
};

export interface ResearchAuthor {
  id: number;
  nickname: string;
  avatar_url: string | null;
}

export interface ResearchTopic {
  id: number;
  user_id: number;
  name: string;
  description: string;
  visibility: "private";
  starred: boolean;
  note_count: number;
  created_at: string;
  updated_at: string;
  author: ResearchAuthor;
}

export type ResearchTopicWrite = Partial<Pick<ResearchTopic, "name" | "description" | "starred">>;

export interface ResearchCommentReaction {
  emoji: string;
  count: number;
  reacted: boolean;
}

export interface ResearchComment {
  id: number;
  note_id: number;
  user_id: number;
  parent_id: number | null;
  reply_to_user_id: number | null;
  reply_to_author: ResearchAuthor | null;
  content: string;
  quote_text: string | null;
  quote_prefix: string | null;
  quote_suffix: string | null;
  start_offset: number | null;
  end_offset: number | null;
  block_id: string | null;
  anchor_status: string;
  reactions: ResearchCommentReaction[];
  created_at: string;
  updated_at: string;
  author: ResearchAuthor;
}

export type QuantCockpitLevel = "risk" | "trigger" | "change" | "data_issue" | "normal" | "unscanned";
export type QuantCockpitDisposition = "entry" | "watch" | "extended" | "risk" | "data_issue";

export interface QuantCockpitEvidence {
  strategy_key: string;
  signal: QuantSignal;
  previous_signal: QuantSignal | null;
  changed: boolean;
  level: Exclude<QuantCockpitLevel, "unscanned">;
  reason_codes: string[];
  bar_date: string | null;
  evaluated_at: string | null;
  source: string;
  error_code: string | null;
  close: number | null;
  reference_code: string | null;
  reference_price: number | null;
  reference_gap_pct: number | null;
  ma5_bias_pct: number | null;
  ma60_gap_pct: number | null;
  volume_ratio_3d: number | null;
  unusual_volume: boolean;
}

export interface QuantCockpitStock {
  stock_id: number;
  symbol: string;
  name: string;
  market: string;
  stage: "radar" | "conviction" | "strike";
  has_position: boolean;
  level: QuantCockpitLevel;
  changed: boolean;
  has_risk: boolean;
  has_trigger: boolean;
  has_data_issue: boolean;
  has_entry: boolean;
  has_extended: boolean;
  disposition: QuantCockpitDisposition;
  decision_reason: string;
  next_step: string;
  confirmation_count: number;
  headline: QuantCockpitEvidence | null;
  signals: QuantCockpitEvidence[];
}

export interface QuantCockpitStrategy {
  strategy_key: string;
  scanned_count: number;
  total_count: number;
  trigger_count: number;
  risk_count: number;
  change_count: number;
  data_issue_count: number;
  last_bar_date: string | null;
  last_evaluated_at: string | null;
}

export interface QuantCockpitMarketSession {
  market: string;
  bar_date: string | null;
  scanned_count: number;
  total_count: number;
}

export interface QuantCockpit {
  available_strategy_count: number;
  enabled_strategy_count: number;
  watchlist_count: number;
  scanned_stock_count: number;
  last_evaluated_at: string | null;
  volume_attention_threshold: number;
  summary: {
    entry_count: number;
    watch_count: number;
    extended_count: number;
    risk_count: number;
    trigger_count: number;
    change_count: number;
    data_issue_count: number;
    data_incomplete_count: number;
    unscanned_count: number;
  };
  market_sessions: QuantCockpitMarketSession[];
  strategies: QuantCockpitStrategy[];
  priority_items: QuantCockpitStock[];
  stocks: QuantCockpitStock[];
}

export type IntradayPreviewStatus = "pending_close";
export type IntradayPreviewWarning =
  | "quiet"
  | "near_position_stop"
  | "near_risk_line"
  | "near_strike"
  | "near_fair_value"
  | "near_target"
  | "unusual_volume"
  | "data_unavailable"
  | "not_requested";
export type IntradayPreviewSeverity = "critical" | "warning" | "watch" | "neutral" | "info";

export interface IntradayPreviewEvidence {
  current_price: number | null;
  cumulative_volume?: number | null;
  volume_ratio_3d?: number | null;
  volume_threshold?: number | null;
  ma5?: number | null;
  ma5_risk_line?: number | null;
  strike_price?: number | null;
  fair_price?: number | null;
  target_price?: number | null;
  price_gap_to_strike_pct?: number | null;
  price_gap_to_fair_pct?: number | null;
  price_gap_to_target_pct?: number | null;
  position_stop_price?: number | null;
}

export interface IntradayPreviewItem {
  stock_id: number;
  symbol: string;
  name: string;
  market: string;
  current_price: number | null;
  status: IntradayPreviewStatus;
  warning_code: IntradayPreviewWarning;
  severity: IntradayPreviewSeverity;
  is_provisional: true;
  session: string | null;
  evidence: IntradayPreviewEvidence;
  error_code: string | null;
  provider_message?: string;
}

export interface IntradayPreview {
  generated_at: string | null;
  is_market_open: boolean;
  items: IntradayPreviewItem[];
  provider_errors: number;
  requested_count: number;
  total_count: number;
  refreshing: boolean;
  cached_at: string | null;
  refresh_started_at: string | null;
  refresh_error: string | null;
}

export interface WorkbenchOverview {
  generated_at: string;
  volume_watch?: {
    threshold: number;
    items: Array<{
      stock_id: number; symbol: string; name: string; ratio: number;
      latest_volume: number; previous_volume: number; bar_date: string;
    }>;
    scanned_count: number;
    total_count: number;
    last_evaluated_at: string | null;
  };
  strike_candidates: Array<{ id: number; symbol: string; name: string; current_price: number; strike_price: number }>;
  upcoming_events: Array<{ stock_id: number; symbol: string; title: string; date: string; days: number }>;
  due_research: Array<{ id: number; title: string; kind: ResearchKind; status: ResearchStatus; next_review_at: string }>;
  stale_stocks: Array<{ id: number; symbol: string; name: string; updated_at: string }>;
  incomplete_stocks: Array<{ id: number; symbol: string; name: string; missing: string[] }>;
  active_plans: Array<{ id: number; asset_id: number; symbol: string; name: string; updated_at: string }>;
  unreviewed_transactions: Array<{ id: number; asset_id: number; symbol: string; name: string; tx_type: string; created_at: string }>;
  quant_cockpit?: QuantCockpit;
  capital?: {
    actual_investment: number;
    planned_investment: number;
    cash_accounts: Array<{ name: string; balance: number; currency: string }>;
  };
  watchlist_summary?: {
    total: number;
    radar: number;
    conviction: number;
    strike: number;
  };
  quant_monitoring?: {
    enabled: boolean;
    watchlist_count: number;
    scanned_count: number;
    matches_count: number;
    attention_count: number;
    last_evaluated_at: string | null;
    signals: Array<{
      stock_id: number;
      symbol: string;
      name: string;
      strategy_key: string;
      signal: QuantSignal;
      reason_codes: string[];
      bar_date: string | null;
      evaluated_at: string | null;
    }>;
  };
}

export type EarningsStatus = "estimated" | "confirmed" | "reported";
export type EarningsSource = "manual" | "yahoo" | "eastmoney";

export interface EarningsEvent {
  id: number;
  user_id: number;
  stock_id: number;
  symbol: string;
  name: string;
  event_date: string;
  fiscal_period: string;
  status: EarningsStatus;
  note: string;
  source: EarningsSource;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EarningsSyncResult {
  checked: number;
  created: number;
  updated: number;
  unchanged: number;
  manual_protected: number;
  unavailable: number;
  skipped: number;
  provider_errors: string[];
}

export interface WatchlistClassificationGroupPreview {
  key: string;
  source_filename: string;
  suggested_name: string;
  row_count: number;
  matched_count: number;
  unmatched_count: number;
  already_assigned_count: number;
  sample_symbols: string[];
}

export interface WatchlistClassificationPreview {
  session_id: string;
  file_count: number;
  group_count: number;
  matched_stock_count: number;
  unmatched_count: number;
  groups: WatchlistClassificationGroupPreview[];
  unmatched_symbols: string[];
}

export interface WatchlistClassificationSelection {
  key: string;
  label: string;
  selected: boolean;
}

export interface WatchlistClassificationApplyResult {
  updated_count: number;
  assignments_added: number;
  unchanged_count: number;
  items: Record<string, unknown>[];
}

export type KRange = "1mo" | "3mo" | "6mo" | "1y";
export type WatchResearchSectionKey =
  | "company_overview"
  | "industry_moat"
  | "growth_financials"
  | "risks_invalidation"
  | "valuation_decision";

export interface ResearchEvidenceItem {
  label: string;
  value: unknown;
  source: string | null;
  url: string | null;
  excerpt: string | null;
  as_of: string | null;
}

export interface ResearchQuestionItem {
  question: string;
  status: "open" | "validated" | "discarded";
  answer: string;
}

export interface WatchResearchSection {
  id: number;
  user_id: number;
  stock_id: number;
  key: WatchResearchSectionKey;
  summary: string;
  evidence: ResearchEvidenceItem[];
  open_questions: ResearchQuestionItem[];
  reviewed_at: string | null;
  next_review_at: string | null;
  review_note: string;
  created_at: string;
  updated_at: string;
}

export type WatchResearchSectionUpdate = Partial<Pick<
  WatchResearchSection,
  "summary" | "evidence" | "open_questions" | "reviewed_at" | "next_review_at" | "review_note"
>>;

export interface WatchlistStock {
  id: number;
  user_id: number;
  symbol: string;
  name: string;
  stage: "radar" | "conviction" | "strike";
  sector: string;
  industries: string[];
  concepts: string[];
  inspiration: string;
  entry_reason: string;
  business_summary: string;
  growth_drivers: string;
  fundamental_risks: string;
  fundamental_metrics: Array<Record<string, unknown>>;
  thesis: string;
  invalidation: string;
  current_price: number;
  price_change: number | null;
  price_change_pct: number | null;
  price_session: string;
  fair_price: number;
  strike_price: number;
  target_price: number;
  planned_capital: number;
  tranches: number;
  first_entry_drop: number;
  add_on_drop: number;
  notes: string;
  milestones: Array<Record<string, unknown>>;
  created_at: string;
  updated_at: string;
}

export interface WatchlistMemo {
  id: number;
  user_id: number;
  stock_id: number;
  content: string;
  pinned: boolean;
  converted_note_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface LinkedResearchSummary {
  id: number;
  title: string;
  kind: ResearchKind;
  status: ResearchStatus;
  starred: boolean;
  updated_at: string;
}

export interface WatchlistResearchProfile {
  stock_id: number;
  stock: WatchlistStock;
  research_sections: WatchResearchSection[];
  memos: WatchlistMemo[];
  linked_research: LinkedResearchSummary[];
}

export interface DailyBar {
  date: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceVolumeObservation {
  ma5?: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  annualized_volatility: number | null;
  atr14: number | null;
  max_drawdown: number | null;
  relative_volume20: number | null;
  vwap20?: number | null;
  vwap60?: number | null;
  support20?: number | null;
  resistance20?: number | null;
  support60: number | null;
  resistance60: number | null;
  trend_basis: string | null;
  volume_basis: string | null;
  volatility_basis: string | null;
  drawdown_basis: string | null;
  position_basis: string | null;
  divergence_basis: string | null;
}

export interface MovingAveragePoint {
  date: number | string;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  ma250: number | null;
}

export interface PriceRiskAssessment {
  status: "clear" | "triggered" | "insufficient";
  version: string;
  sample_count: number;
  as_of: number | string | null;
  rules: { code: "peak_decline" | "atr_ratio" | "support_break"; value: number | null; threshold: number | null; triggered: boolean | null }[];
}

export interface PriceVolumeResponse {
  symbol: string;
  market: string;
  range: KRange;
  currency: string;
  exchange_timezone: string;
  items: DailyBar[];
  moving_averages: MovingAveragePoint[];
  observation: PriceVolumeObservation;
  risk_assessment?: PriceRiskAssessment | null;
  data_quality: "complete" | "partial" | "empty";
  source: string;
  as_of: string | null;
}

// ---- 枚举 ----
export type AssetZone = "active" | "base" | "invest";
export type AssetCategory =
  | "stock" | "etf" | "crypto"
  | "deposit" | "bond_fund" | "pension"
  | "gold" | "collectible" | "real_estate"
  | "course" | "tool" | "traffic" | "other_invest";
export type TransactionType = "buy" | "sell" | "t_trade";
export type AllocationType = "self_offset" | "cross_save" | "to_harbor";
export type TxStatus = "holding" | "partial_sold" | "cleared";
export type AssetMarket = "us" | "cn" | "hk" | "crypto" | "cash" | "other";

// ---- 标签 ----
export interface Tag {
  id: number;
  name: string;
  color: string;
  created_at: string;
  asset_count: number;
}

export interface TagBrief {
  id: number;
  name: string;
  color: string;
}

// ---- 资产 ----
export interface Asset {
  id: number;
  symbol: string;
  name: string;
  zone: AssetZone;
  category: AssetCategory;
  broker_cost: number;
  mental_cost: number;
  quantity: number;
  current_price: number;
  price_session: string;  // pre_market/regular/post_market/closed
  total_invested: number;
  total_cashed: number;
  total_realized_pnl: number;
  total_recovered: number;
  is_zero_cost: boolean;
  planned_investment: number;
  actual_investment: number;
  planned_includes_invested: boolean;
  market: AssetMarket;
  is_cash: boolean;
  sort_order: number;
  pinned: boolean;
  archived: boolean;
  archived_note: string | null;
  created_at: string;
  updated_at: string;
  tags: TagBrief[];
}

// ---- 交易记录 ----
export interface ProfitAllocationOut {
  id: number;
  allocation_type: AllocationType;
  amount: number;
  target_asset_id: number | null;
  created_at: string;
}

export interface SellBatchItemOut {
  id: number;
  buy_tx_id: number;
  quantity: number;
}

export interface TransactionRecord {
  id: number;
  tx_type: TransactionType;
  price: number;
  quantity: number;
  fee: number;
  realized_profit: number;
  sold_quantity: number;
  status: TxStatus;
  source_tx_id: number | null;
  note: string | null;
  created_at: string;
  allocations: ProfitAllocationOut[];
  batch_items: SellBatchItemOut[];
}

export interface AssetIBKRLot {
  open_datetime: string;
  quantity: number;
  cost_price: number;
  cost_basis: number;
  close_price: number;
  market_value: number;
  unrealized_pnl: number;
}

// ---- 资产详情 ----
export interface AssetDetail extends Asset {
  market_value: number;
  broker_pnl: number;
  mental_pnl: number;
  total_realized: number;
  zero_cost_progress: number;
  investment_summary: {
    planned_investment: number;
    actual_investment: number;
    calculated_investment: number;
    planned_includes_invested: boolean;
    effective_total: number;
    remaining_to_invest: number;
    investment_progress: number;
  };
  transactions: TransactionRecord[];
  trade_plans: TradePlan[];
  ibkr_lots: AssetIBKRLot[];
}

// ---- 交易计划 ----
export type PlanStatus = "active" | "completed" | "abandoned";

export interface TradePlan {
  id: number;
  asset_id: number;
  status: PlanStatus;
  target_position: number;
  max_position: number;
  build_low: number | null;
  build_high: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  take_profit_2: number | null;
  take_profit_3: number | null;
  support_1: number | null;
  support_2: number | null;
  resistance_1: number | null;
  resistance_2: number | null;
  buy_strategy: string | null;
  sell_strategy: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface TradePlanCreate {
  asset_id: number;
  target_position?: number;
  max_position?: number;
  build_low?: number | null;
  build_high?: number | null;
  stop_loss?: number | null;
  take_profit_1?: number | null;
  take_profit_2?: number | null;
  take_profit_3?: number | null;
  support_1?: number | null;
  support_2?: number | null;
  resistance_1?: number | null;
  resistance_2?: number | null;
  buy_strategy?: string | null;
  sell_strategy?: string | null;
  note?: string | null;
}

export interface TradePlanUpdate {
  status?: PlanStatus;
  target_position?: number;
  max_position?: number;
  build_low?: number | null;
  build_high?: number | null;
  stop_loss?: number | null;
  take_profit_1?: number | null;
  take_profit_2?: number | null;
  take_profit_3?: number | null;
  support_1?: number | null;
  support_2?: number | null;
  resistance_1?: number | null;
  resistance_2?: number | null;
  buy_strategy?: string | null;
  sell_strategy?: string | null;
  note?: string | null;
}

// ---- 交易创建 ----
export interface ProfitAllocationIn {
  allocation_type: AllocationType;
  amount: number;
  target_asset_id?: number | null;
}

export interface SellBatchItemIn {
  buy_tx_id: number;
  quantity: number;
}

export interface TransactionCreate {
  asset_id: number;
  tx_type: TransactionType;
  price: number;
  quantity: number;
  fee?: number;
  note?: string;
  batch_items?: SellBatchItemIn[];
  allocations?: ProfitAllocationIn[];
}

export interface TransactionUpdate {
  price?: number;
  quantity?: number;
  fee?: number;
  note?: string;
  allocations?: ProfitAllocationIn[];
  batch_items?: SellBatchItemIn[];
}

// ---- 仪表盘 ----
export interface AssetSummary {
  id: number;
  symbol: string;
  name: string;
  zone: string;
  market: string;
  mental_cost: number;
  broker_cost: number;
  current_price: number;
  price_session: string;
  quantity: number;
  mental_pnl: number;
  broker_pnl: number;
  zero_cost_progress: number;
}

export interface InvestSummary {
  id: number;
  symbol: string;
  name: string;
  category: string;
  market: string;
  total_invested: number;
  total_cashed: number;
  return_rate: number;
}

export interface Dashboard {
  mental_net_worth: number;
  broker_net_worth: number;
  // 新指标
  holding_cost_cny: number;      // 持仓成本
  total_invested_cny: number;    // 累计投入（旧，向后兼容）
  stock_invested_cny: number;    // 已废弃：不要再用买入交易额代表现金投入
  ibkr_deposits_cny: number;     // IBKR 累计入金
  ibkr_withdrawals_cny: number;  // IBKR 累计出金（正数）
  ibkr_net_deposit_cny: number;  // IBKR 净转入
  market_value_cny: number;      // 持仓市值
  total_realized_pnl_cny: number; // 净已实现盈亏（盈利与亏损均计入）
  unrealized_pnl_cny: number;    // 未实现浮盈
  total_pnl_cny: number;         // 总盈亏 = 已实现 + 未实现
  // 旧字段（向后兼容）
  total_recovered_cny: number;
  total_assets_cny: number;
  total_cashed_cny: number;
  default_currency: string;
  harbor: { balance: number; total_in: number; total_out: number };
  active_assets: AssetSummary[];
  base_assets: AssetSummary[];
  invest_assets: InvestSummary[];
  safety_score: number;
  zero_cost_count: number;
  exchange_rates: Record<string, number>;
}

// ---- 财务模块 ----
export interface SalaryConfig {
  id: number;
  gross_salary: number;
  pay_day: number;
  currency: string;
  country: string;
  pension_rate: number;
  medical_rate: number;
  unemployment_rate: number;
  housing_fund_rate: number;
  special_deduction: number;
  custom_tax_rate: number | null;
  custom_deductions: number | null;
  custom_brackets: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalaryPreview {
  gross: number;
  social_insurance: number;
  housing_fund: number;
  tax: number;
  net: number;
}

export interface IncomeRecord {
  id: number;
  source: string;
  gross_amount: number;
  net_amount: number;
  tax: number;
  social_insurance: number;
  housing_fund: number;
  month: string;
  note: string | null;
  is_auto: boolean;
  salary_config_id: number | null;
  created_at: string;
}

export interface LiabilityItem {
  id: number;
  name: string;
  liability_type: string;
  total_amount: number;
  remaining_amount: number;
  monthly_payment: number;
  interest_rate: number;
  start_date: string | null;
  end_date: string | null;
  profit_repaid: number;
  created_at: string;
  updated_at: string;
}

export interface NetWorthOverview {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  asset_breakdown: Record<string, number>;
  monthly_income: number;
  yearly_income: number;
  exchange_rates: Record<string, number>;
}

// ---- 现金账户 ----
export interface CashAccount {
  id: number;
  name: string;
  balance: number;
  currency: string;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortfolioSummary {
  total_cash: number;
  total_planned_investment: number;
  total_actual_investment: number;
  remaining_cash: number;
  cash_accounts: CashAccount[];
}

// ---- 交易导入 ----
export interface ImportUploadResult {
  session_id: string;
  columns: string[];
  sample_rows: Record<string, string>[];
  total_rows: number;
  detected_format?: string;  // "ibkr" 等自动检测到的格式
}

export interface ImportColumnMapping {
  symbol: string;
  name?: string | null;
  tx_type: string;
  price: string;
  quantity: string;
  fee?: string | null;
  date?: string | null;
  note?: string | null;
}

export interface ImportPreviewRow {
  row_num: number;
  symbol: string;
  name: string;
  tx_type: string;
  price: number;
  quantity: number;
  fee: number;
  date: string;
  note: string;
  is_duplicate: boolean;
  duplicate_reason: string;
  error: string;
  asset_exists: boolean;
  asset_id: number | null;
}

export interface ImportPreviewResponse {
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  duplicate_rows: number;
  new_assets: string[];
  existing_assets: string[];
  rows: ImportPreviewRow[];
  columns: string[];
  session_id: string;
}

export interface ImportConfirmResponse {
  imported_count: number;
  skipped_count: number;
  new_assets_created: number;
  errors: string[];
}

// ---- IBKR 导入（活动报表格式）----
export interface IBKRParsedRow {
  datetime_str: string;    // "2026-02-09, 12:27:40" 精确到秒
  date: string;            // "2026-02-09"
  tx_type: string;         // buy / sell
  symbol: string;
  quantity: number;
  price: number;           // 交易价格
  close_price: number;     // 收盘价格
  currency: string;
  amount: number;          // 收益
  commission: number;      // 佣金/税
  cost_basis: number;      // 成本基础
  realized_pnl: number;    // 已实现的损益
  mtm_pnl: number;         // 按市值计算的损益
  trade_codes: string;     // O/C/SL/P 等
  description: string;     // 组合描述
}

export interface IBKRCashFlow {
  date: string;
  currency: string;
  description: string;
  amount: number;
  flow_type: string;  // deposit / withdrawal
}

export interface IBKRCashBalance {
  currency: string;
  ending_cash: number;
  settled_cash: number | null;
}

export interface IBKRLot {
  open_datetime: string;   // 买入时间 "2026-02-09, 13:21:14"
  quantity: number;
  cost_price: number;      // 每股成本价
  cost_basis: number;      // 成本基础
  close_price: number;     // 收盘价格
  market_value: number;    // 市值
  unrealized_pnl: number;  // 未实现损益
}

export interface IBKROpenPosition {
  symbol: string;
  currency: string;
  quantity: number;
  multiplier: number;
  cost_price: number;
  cost_basis: number;
  close_price: number;
  market_value: number;
  unrealized_pnl: number;
  lots: IBKRLot[];         // 逐批次明细
}

export interface IBKRPreviewResponse {
  total_rows: number;
  trade_rows: number;
  skipped_rows: number;
  duplicate_rows: number;
  new_assets: string[];
  existing_assets: string[];
  rows: IBKRParsedRow[];
  duplicates: IBKRParsedRow[];
  cash_flows: IBKRCashFlow[];
  cash_balances: IBKRCashBalance[];
  total_deposits: number;
  total_withdrawals: number;
  open_positions: IBKROpenPosition[];
  ibkr_total_cost_basis: number;
  ibkr_total_market_value: number;
  ibkr_total_unrealized_pnl: number;
  ibkr_realized_pnl: number;
  product_names: Record<string, string>;  // 股票代码→全名
  session_id: string;
}

export interface IBKRParsedPreviewPayload {
  total_trade_lines: number;
  rows: IBKRParsedRow[];
  cash_flows: IBKRCashFlow[];
  cash_balances: IBKRCashBalance[];
  open_positions: IBKROpenPosition[];
  realized_by_symbol: Record<string, number>;
  product_names: Record<string, string>;
}

export interface IBKRConfirmResponse {
  imported_count: number;
  skipped_count: number;
  duplicate_count: number;
  new_assets_created: number;
  cash_assets_synced: number;
  errors: string[];
  position_discrepancies: string[];
}
