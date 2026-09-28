"use client";

import { useState, useCallback, Fragment } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { parseIBKRActivityStatement } from "@/lib/ibkrParser";
import type { IBKRPreviewResponse, IBKRParsedRow, IBKRConfirmResponse, IBKROpenPosition } from "@/lib/types";
import AuthGuard from "@/components/AuthGuard";
import { useI18n } from "@/components/I18nProvider";

type Step = "upload" | "preview" | "result";

export default function IBKRImportPage() {
  return <AuthGuard><IBKRImportContent /></AuthGuard>;
}

function IBKRImportContent() {
  const { t, localeTag } = useI18n();
  const formatNumber = (value: number) => value.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const zoneOptions = { active: t("import.zoneActive"), base: t("import.zoneBase"), invest: t("import.zoneInvest") };
  const categoryOptions = { stock: t("import.categoryStock"), etf: t("import.categoryEtf"), crypto: t("import.categoryCrypto") };
  const [step, setStep] = useState<Step>("upload");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [preview, setPreview] = useState<IBKRPreviewResponse | null>(null);
  const [zone, setZone] = useState("active");
  const [category, setCategory] = useState("stock");
  const [skipDup, setSkipDup] = useState(true);
  const [result, setResult] = useState<IBKRConfirmResponse | null>(null);
  const [showDups, setShowDups] = useState(false);
  const [showCashFlows, setShowCashFlows] = useState(false);
  const [showPositions, setShowPositions] = useState(false);

  // 上传并解析
  const handleUpload = useCallback(async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const parsed = await parseIBKRActivityStatement(file);
      const res = await api.ibkrPreviewParsed(parsed);
      setPreview(res);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("import.uploadFailed"));
    }
    setUploading(false);
  }, [t]);

  // 确认导入
  const handleConfirm = useCallback(async () => {
    if (!preview) return;
    setError("");
    setLoading(true);
    try {
      const res = await api.ibkrConfirm({
        session_id: preview.session_id,
        zone,
        category,
        skip_duplicates: skipDup,
      });
      setResult(res);
      setStep("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("import.importFailed"));
    }
    setLoading(false);
  }, [preview, zone, category, skipDup, t]);

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">{t("import.eyebrow")}</p>
          <h1 className="page-title">{t("import.title")}</h1>
          <p className="page-description">{t("import.description")}</p>
        </div>
      </header>

      {/* 步骤指示 */}
      <div className="grid grid-cols-3 gap-2 rounded-[var(--radius-md)] border border-themed bg-surface p-2 sm:flex sm:items-center">
        {([
          { key: "upload" as Step, label: t("import.upload") },
          { key: "preview" as Step, label: t("import.preview") },
          { key: "result" as Step, label: t("import.result") },
        ]).map((s, i, arr) => {
          const idx = arr.findIndex((x) => x.key === step);
          return (
            <div key={s.key} className="flex min-w-0 items-center justify-center gap-2 sm:justify-start">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                i <= idx ? "bg-accent text-on-accent" : "bg-surface border border-themed text-muted"
              }`}>
                {i < idx ? "✓" : i + 1}
              </div>
              <span className={`truncate text-xs sm:text-sm ${i <= idx ? "text-primary" : "text-muted"}`}>{s.label}</span>
              {i < arr.length - 1 && <span className="mx-1 hidden text-muted sm:inline">→</span>}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={() => setError("")} className="ml-4 underline">{t("trade.close")}</button>
        </div>
      )}

      {/* Step 1: 上传 */}
      {step === "upload" && <UploadStep uploading={uploading} onUpload={handleUpload} />}

      {/* Step 2: 预览确认 */}
      {step === "preview" && preview && (
        <div className="space-y-4">
          {/* 统计概览 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t("import.totalRows")} value={preview.total_rows} />
            <StatCard label={t("import.stockTrades")} value={preview.trade_rows} accent />
            <StatCard label={t("import.skippedRows")} value={preview.skipped_rows} />
            <StatCard label={t("import.duplicates")} value={preview.duplicate_rows} warn={preview.duplicate_rows > 0} />
          </div>

          {/* 资产信息 */}
          <div className="rounded-xl bg-surface border border-themed p-4 space-y-2">
            <div className="flex flex-wrap gap-4 text-sm">
              {preview.new_assets.length > 0 && (
                <div>
                  <span className="text-muted">{t("import.newAssets")}</span>
                  <span className="text-info font-medium">{preview.new_assets.join(", ")}</span>
                </div>
              )}
              {preview.existing_assets.length > 0 && (
                <div>
                  <span className="text-muted">{t("import.existingAssets")}</span>
                  <span className="text-blue-400 font-medium">{preview.existing_assets.join(", ")}</span>
                </div>
              )}
            </div>
          </div>

          {/* 存取款记录 */}
          {preview.cash_flows && preview.cash_flows.length > 0 && (
            <div className="rounded-xl bg-surface border border-themed overflow-hidden">
              <div className="px-4 py-3 border-b border-themed flex items-center justify-between">
                <h3 className="text-sm font-semibold text-blue-400">
                  {t("import.cashFlows", { count: preview.cash_flows.length })}
                  <span className="ml-3 text-xs font-normal text-muted">
                    {t("import.deposits")} <span className="text-info">{formatNumber(preview.total_deposits)}</span>
                    {preview.total_withdrawals !== 0 && (
                      <> | {t("import.withdrawals")} <span className="text-warn">{formatNumber(Math.abs(preview.total_withdrawals))}</span></>
                    )}
                  </span>
                </h3>
                <button onClick={() => setShowCashFlows(!showCashFlows)}
                  className="text-xs text-accent hover:underline">
                  {t(showCashFlows ? "import.collapse" : "import.expand")}
                </button>
              </div>
              {showCashFlows && (
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface-alt">
                      <tr className="text-left text-xs text-muted">
                        <th className="px-3 py-2">{t("import.date")}</th>
                        <th className="px-3 py-2">{t("import.currency")}</th>
                        <th className="px-3 py-2">{t("import.recordDescription")}</th>
                        <th className="px-3 py-2 text-right">{t("import.amount")}</th>
                        <th className="px-3 py-2">{t("import.type")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.cash_flows.map((cf, i) => (
                        <tr key={i} className="border-t border-themed">
                          <td className="px-3 py-2 text-muted whitespace-nowrap text-xs">{cf.date}</td>
                          <td className="px-3 py-2 text-primary">{cf.currency}</td>
                          <td className="px-3 py-2 text-secondary">{cf.description}</td>
                          <td className={`px-3 py-2 text-right font-medium ${cf.amount >= 0 ? "text-info" : "text-warn"}`}>
                            {cf.amount >= 0 ? "+" : ""}{formatNumber(cf.amount)}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${
                              cf.flow_type === "deposit" ? "bg-info-soft" : "bg-warn-soft"
                            }`}>
                              {t(cf.flow_type === "deposit" ? "import.deposit" : "import.withdrawal")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="px-4 py-2 border-t border-themed text-xs text-muted">
                {t("import.cashFlowNote")}
              </div>
            </div>
          )}

          {/* IBKR 股票现金资产 */}
          {preview.cash_balances && preview.cash_balances.length > 0 && (
            <div className="rounded-xl bg-surface border border-themed overflow-hidden">
              <div className="px-4 py-3 border-b border-themed">
                <h3 className="text-sm font-semibold text-brand">{t("import.brokerCash")}</h3>
                <p className="mt-1 text-xs text-muted">{t("import.brokerCashDescription")}</p>
              </div>
              <div className="grid gap-2 p-3 sm:grid-cols-2">
                {preview.cash_balances.map((balance) => (
                  <div key={balance.currency} className="rounded-lg border border-themed bg-surface-alt px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary">IBKR {balance.currency} {t("cash.title")}</span>
                      <span className="text-sm font-bold text-brand tabular-nums">
                        {formatNumber(balance.ending_cash)}
                      </span>
                    </div>
                    {balance.settled_cash !== null && (
                      <p className="mt-1 text-[10px] text-muted">
                        {t("import.settledCash")} {formatNumber(balance.settled_cash)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* IBKR 持仓与损益概要 */}
          {preview.open_positions && preview.open_positions.length > 0 && (
            <div className="rounded-xl bg-surface border border-themed overflow-hidden">
              <div className="px-4 py-3 border-b border-themed">
                <h3 className="text-sm font-semibold text-purple-400">
                  {t("import.positionSummary")}
                </h3>
                <div className="flex flex-wrap gap-4 mt-2 text-xs">
                  <span className="text-muted">{t("import.costBasis")} <span className="text-primary font-medium">${formatNumber(preview.ibkr_total_cost_basis)}</span></span>
                  <span className="text-muted">{t("import.marketValue")} <span className="text-primary font-medium">${formatNumber(preview.ibkr_total_market_value)}</span></span>
                  <span className="text-muted">{t("import.unrealizedPnl")} <span className={preview.ibkr_total_unrealized_pnl >= 0 ? "text-up font-medium" : "text-down font-medium"}>${formatNumber(preview.ibkr_total_unrealized_pnl)}</span></span>
                  <span className="text-muted">{t("import.realizedPnl")} <span className={preview.ibkr_realized_pnl >= 0 ? "text-up font-medium" : "text-down font-medium"}>${formatNumber(preview.ibkr_realized_pnl)}</span></span>
                </div>
              </div>
              <div className="px-4 py-2 border-b border-themed flex items-center justify-between">
                <span className="text-xs text-muted">{t("import.openPositions", { count: preview.open_positions.length })}</span>
                <button onClick={() => setShowPositions(!showPositions)}
                  className="text-xs text-accent hover:underline">
                  {t(showPositions ? "import.collapse" : "import.expand")}
                </button>
              </div>
              {showPositions && (
                <PositionsTable positions={preview.open_positions} productNames={preview.product_names || {}} />
              )}
              <div className="px-4 py-2 border-t border-themed text-xs text-muted">
                {t("import.costCorrection")}
              </div>
            </div>
          )}

          {/* 设置 */}
          <div className="rounded-xl bg-surface border border-themed p-4">
            <h3 className="text-sm font-semibold text-primary mb-3">{t("import.settings")}</h3>
            <div className="flex flex-wrap gap-4">
              <label className="text-sm text-muted">
                {t("import.newAssetZone")}
                <select value={zone} onChange={(e) => setZone(e.target.value)}
                  className="ml-2 rounded bg-surface-alt border border-themed px-2 py-1 text-primary text-sm">
                  {Object.entries(zoneOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm text-muted">
                {t("import.assetCategory")}
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="ml-2 rounded bg-surface-alt border border-themed px-2 py-1 text-primary text-sm">
                  {Object.entries(categoryOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)}
                  className="rounded" />
                {t("import.skipDuplicates")}
              </label>
            </div>
          </div>

          {/* 新交易列表 */}
          {preview.rows.length > 0 && (
            <div className="rounded-xl bg-surface border border-themed overflow-hidden">
              <div className="px-4 py-3 border-b border-themed flex items-center justify-between">
                <h3 className="text-sm font-semibold text-primary">
                  {t("import.pendingTrades", { count: preview.rows.length })}
                </h3>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <TradeTable rows={preview.rows} productNames={preview.product_names || {}} />
              </div>
            </div>
          )}

          {/* 重复记录 */}
          {preview.duplicates.length > 0 && (
            <div className="rounded-xl bg-surface border border-themed overflow-hidden">
              <div className="px-4 py-3 border-b border-themed flex items-center justify-between">
                <h3 className="text-sm font-semibold text-yellow-400">
                  {t("import.duplicateList", { count: preview.duplicates.length })}
                </h3>
                <button onClick={() => setShowDups(!showDups)}
                  className="text-xs text-accent hover:underline">
                  {t(showDups ? "import.collapse" : "import.expand")}
                </button>
              </div>
              {showDups && (
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <TradeTable rows={preview.duplicates} isDup productNames={preview.product_names || {}} />
                </div>
              )}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <button onClick={() => { setStep("upload"); setPreview(null); }}
              className="rounded-lg border border-themed px-5 py-2.5 text-sm text-muted hover:bg-surface-alt transition">
              {t("import.reupload")}
            </button>
            <button onClick={handleConfirm} disabled={loading || preview.rows.length === 0}
              className="rounded-lg bg-accent bg-accent-hover px-6 py-2.5 text-sm font-semibold text-on-accent transition disabled:opacity-50">
              {loading ? t("import.importing") : t("import.confirm", { count: preview.rows.length })}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: 结果 */}
      {step === "result" && result && <ResultStep result={result} onReset={() => { setStep("upload"); setPreview(null); setResult(null); }} />}
    </div>
  );
}

// ── 上传组件 ──
function UploadStep({ uploading, onUpload }: { uploading: boolean; onUpload: (file: File) => void }) {
  const { t } = useI18n();
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-12 text-center transition ${
        dragOver ? "border-accent bg-accent/5" : "border-themed bg-surface"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onUpload(f); }}
    >
      <div className="text-4xl mb-4">📊</div>
      <p className="text-primary font-semibold mb-2">{t("import.uploadTitle")}</p>
      <p className="text-sm text-muted mb-4">{t("import.dropHint")}</p>
      <label className="inline-block cursor-pointer rounded-lg bg-accent bg-accent-hover px-6 py-2.5 text-sm font-semibold text-on-accent transition">
        {uploading ? t("import.parsing") : t("import.chooseCsv")}
        <input type="file" accept=".csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
          disabled={uploading} />
      </label>
      <div className="mt-6 space-y-1 text-xs text-muted">
        <p>{t("import.fileScope")}</p>
        <p>{t("import.exportPath")}</p>
        <p>{t("import.parseScope")}</p>
        <p>{t("import.dedupeScope")}</p>
      </div>
    </div>
  );
}

// ── 统计卡片 ──
function StatCard({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-surface border border-themed p-3 text-center">
      <div className={`text-2xl font-bold ${warn ? "text-yellow-400" : accent ? "text-accent" : "text-primary"}`}>{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
    </div>
  );
}

// ── 交易表格（活动报表格式）──
function TradeTable({ rows, isDup, productNames }: { rows: IBKRParsedRow[]; isDup?: boolean; productNames: Record<string, string> }) {
  const { t } = useI18n();
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-surface-alt">
        <tr className="text-left text-xs text-muted">
          <th className="px-3 py-2">{t("import.time")}</th>
          <th className="px-3 py-2">{t("import.symbol")}</th>
          <th className="px-3 py-2">{t("import.side")}</th>
          <th className="px-3 py-2 text-right">{t("import.quantity")}</th>
          <th className="px-3 py-2 text-right">{t("import.price")}</th>
          <th className="px-3 py-2 text-right">{t("import.closePrice")}</th>
          <th className="px-3 py-2 text-right">{t("import.commission")}</th>
          <th className="px-3 py-2 text-right">{t("import.realizedPnl")}</th>
          <th className="px-3 py-2">{t("import.type")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={`border-t border-themed ${isDup ? "opacity-60" : ""}`}>
            <td className="px-3 py-2 text-muted whitespace-nowrap text-xs">{r.datetime_str}</td>
            <td className="px-3 py-2">
              <div className="font-medium text-primary">{r.symbol}</div>
              {productNames[r.symbol] && (
                <div className="text-xs text-muted truncate max-w-[120px]" title={productNames[r.symbol]}>{productNames[r.symbol]}</div>
              )}
            </td>
            <td className="px-3 py-2">
              <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${
                r.tx_type === "buy" ? "bg-up-soft" : "bg-down-soft"
              }`}>
                {t(r.tx_type === "buy" ? "import.buy" : "import.sell")}
              </span>
            </td>
            <td className="px-3 py-2 text-right text-primary">{r.quantity}</td>
            <td className="px-3 py-2 text-right text-primary">${r.price.toFixed(2)}</td>
            <td className="px-3 py-2 text-right text-muted">${r.close_price.toFixed(2)}</td>
            <td className="px-3 py-2 text-right text-muted">${r.commission.toFixed(2)}</td>
            <td className={`px-3 py-2 text-right font-medium ${
              r.realized_pnl > 0 ? "text-up" : r.realized_pnl < 0 ? "text-down" : "text-muted"
            }`}>
              {r.realized_pnl !== 0 ? `${r.realized_pnl.toFixed(2)}` : "-"}
            </td>
            <td className="px-3 py-2 text-muted text-xs">{r.trade_codes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── 结果 ──
function ResultStep({ result, onReset }: { result: IBKRConfirmResponse; onReset: () => void }) {
  const { t } = useI18n();
  const hasImportedSomething = result.imported_count > 0 || result.cash_assets_synced > 0;
  return (
    <div className="rounded-xl bg-surface border border-themed p-6 text-center space-y-4">
      <div className="text-5xl">{hasImportedSomething ? "🎉" : "⚠️"}</div>
      <h2 className="text-xl font-bold text-primary">
        {t(hasImportedSomething ? "import.completed" : "import.nothingImported")}
      </h2>
      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto sm:grid-cols-4">
        <StatCard label={t("import.imported")} value={result.imported_count} accent />
        <StatCard label={t("import.createdAssets")} value={result.new_assets_created} />
        <StatCard label={t("import.cashSynced")} value={result.cash_assets_synced} />
        <StatCard label={t("import.skippedDuplicates")} value={result.duplicate_count} />
      </div>
      {result.errors.length > 0 && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 p-3 text-sm text-red-300 text-left max-w-md mx-auto">
          {result.errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}
      <div className="flex gap-3 justify-center pt-2">
        <button onClick={onReset}
          className="rounded-lg border border-themed px-5 py-2.5 text-sm text-muted hover:bg-surface-alt transition">
          {t("import.continue")}
        </button>
        <Link href="/assets"
          className="rounded-lg bg-accent bg-accent-hover px-6 py-2.5 text-sm font-semibold text-on-accent transition">
          {t("import.viewAssets")}
        </Link>
      </div>
    </div>
  );
}

// ── 持仓表格（含 Lot 批次展开）──
function PositionsTable({ positions, productNames }: { positions: IBKROpenPosition[]; productNames: Record<string, string> }) {
  const { t, localeTag } = useI18n();
  const formatNumber = (value: number) => value.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());

  const toggleExpand = (idx: number) => {
    setExpandedIdx(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-alt">
          <tr className="text-left text-xs text-muted">
            <th className="px-3 py-2 w-5"></th>
            <th className="px-3 py-2">{t("import.symbol")}</th>
            <th className="px-3 py-2 text-right">{t("import.position")}</th>
            <th className="px-3 py-2 text-right">{t("import.averageCost")}</th>
            <th className="px-3 py-2 text-right">{t("import.costBasis")}</th>
            <th className="px-3 py-2 text-right">{t("import.closePrice")}</th>
            <th className="px-3 py-2 text-right">{t("import.marketValue")}</th>
            <th className="px-3 py-2 text-right">{t("import.unrealizedPnl")}</th>
            <th className="px-3 py-2 text-right">{t("import.pnlPercent")}</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => {
            const pnlPct = p.cost_basis !== 0 ? (p.unrealized_pnl / p.cost_basis * 100) : 0;
            const hasLots = p.lots && p.lots.length > 0;
            const isExpanded = expandedIdx.has(i);
            return (
              <Fragment key={i}>
                <tr className="border-t border-themed hover:bg-surface-alt/50 cursor-pointer" onClick={() => hasLots && toggleExpand(i)}>
                  <td className="px-3 py-2 text-xs text-muted">
                    {hasLots && <span className="inline-block transition-transform" style={{transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)"}}>▶</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-primary">{p.symbol}</div>
                    {productNames[p.symbol] && (
                      <div className="text-xs text-muted truncate max-w-[140px]" title={productNames[p.symbol]}>{productNames[p.symbol]}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-primary">{p.quantity}</td>
                  <td className="px-3 py-2 text-right text-muted">${p.cost_price.toFixed(4)}</td>
                  <td className="px-3 py-2 text-right text-primary">${formatNumber(p.cost_basis)}</td>
                  <td className="px-3 py-2 text-right text-muted">${p.close_price.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-primary">${formatNumber(p.market_value)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${p.unrealized_pnl >= 0 ? "text-up" : "text-down"}`}>
                    ${formatNumber(p.unrealized_pnl)}
                  </td>
                  <td className={`px-3 py-2 text-right text-xs font-medium ${pnlPct >= 0 ? "text-up" : "text-down"}`}>
                    {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                  </td>
                </tr>
                {hasLots && isExpanded && p.lots.map((lot, li) => {
                  const lotPnlPct = lot.cost_basis !== 0 ? (lot.unrealized_pnl / lot.cost_basis * 100) : 0;
                  return (
                    <tr key={`${i}-lot-${li}`} className="bg-surface-alt/30 text-xs">
                      <td className="px-3 py-1.5"></td>
                      <td className="px-3 py-1.5 text-muted pl-6">{lot.open_datetime}</td>
                      <td className="px-3 py-1.5 text-right text-secondary">{lot.quantity}</td>
                      <td className="px-3 py-1.5 text-right text-muted">${lot.cost_price.toFixed(4)}</td>
                      <td className="px-3 py-1.5 text-right text-secondary">${formatNumber(lot.cost_basis)}</td>
                      <td className="px-3 py-1.5 text-right text-muted">${lot.close_price.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right text-secondary">${formatNumber(lot.market_value)}</td>
                      <td className={`px-3 py-1.5 text-right ${lot.unrealized_pnl >= 0 ? "text-up" : "text-down"}`}>
                        ${formatNumber(lot.unrealized_pnl)}
                      </td>
                      <td className={`px-3 py-1.5 text-right ${lotPnlPct >= 0 ? "text-up" : "text-down"}`}>
                        {lotPnlPct >= 0 ? "+" : ""}{lotPnlPct.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
