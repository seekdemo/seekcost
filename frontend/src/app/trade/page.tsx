"use client";

import { Suspense, useEffect, useId, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Asset, AssetDetail, TransactionType, AllocationType, ProfitAllocationIn, TransactionRecord, SellBatchItemIn } from "@/lib/types";
import AuthGuard from "@/components/AuthGuard";
import { useI18n } from "@/components/I18nProvider";

export default function TradePage() {
  const { t } = useI18n();
  return (
    <AuthGuard>
      <Suspense fallback={<div className="py-12 text-center text-muted animate-pulse">{t("common.loading")}</div>}>
        <TradeContent />
      </Suspense>
    </AuthGuard>
  );
}

function TradeContent() {
  const { t, localeTag } = useI18n();
  const fmt = (n: number) => n.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const searchParams = useSearchParams();
  const router = useRouter();
  const presetAsset = Number(searchParams.get("asset")) || 0;

  const [assets, setAssets] = useState<Asset[]>([]);
  const [form, setForm] = useState({
    asset_id: presetAsset, tx_type: "buy" as TransactionType,
    price: 0, quantity: 0, fee: 0, note: "",
  });
  const [allocs, setAllocs] = useState<ProfitAllocationIn[]>([]);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [batchItems, setBatchItems] = useState<SellBatchItemIn[]>([]);
  const [buyBatches, setBuyBatches] = useState<TransactionRecord[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState(false);
  const [assetRetry, setAssetRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.listAssets().then(rows => { if (!cancelled) { setAssets(rows); setAssetsError(false); } })
      .catch(() => { if (!cancelled) setAssetsError(true); })
      .finally(() => { if (!cancelled) setAssetsLoading(false); });
    return () => { cancelled = true; };
  }, [assetRetry]);

  // URL preset
  useEffect(() => {
    if (!presetAsset) return;
    const frame = window.requestAnimationFrame(() => {
      setForm(f => ({ ...f, asset_id: presetAsset }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [presetAsset]);

  const isSell = form.tx_type === "sell" || form.tx_type === "t_trade";
  const selectedAsset = assets.find((a) => a.id === form.asset_id);
  const isInvest = selectedAsset?.zone === "invest";

  // 卖出时加载该资产的未清仓买入批次
  useEffect(() => {
    let cancelled = false;
    const refreshBatches = async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (isSell && form.asset_id > 0) {
        setLoadingBatches(true);
        try {
          const detail: AssetDetail = await api.getAsset(form.asset_id);
          if (cancelled) return;
          setBuyBatches(detail.transactions.filter(
            (tx: TransactionRecord) => tx.tx_type === "buy" && tx.status !== "cleared"
          ));
        } catch {
          if (!cancelled) setBuyBatches([]);
        } finally {
          if (!cancelled) setLoadingBatches(false);
        }
      } else {
        setBuyBatches([]);
        setBatchItems([]);
      }
    };
    void refreshBatches();
    return () => { cancelled = true; };
  }, [isSell, form.asset_id]);

  const addAlloc = () => {
    setAllocs([...allocs, { allocation_type: "self_offset", amount: 0, target_asset_id: null }]);
  };
  const updateAlloc = (i: number, patch: Partial<ProfitAllocationIn>) => {
    setAllocs(allocs.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  };
  const removeAlloc = (i: number) => setAllocs(allocs.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (submitting) return;
    // 前端校验
    if (isSell && allocs.length > 0) {
      const emptyAlloc = allocs.find(a => !a.amount || a.amount <= 0);
      if (emptyAlloc) {
        setResult({ ok: false, msg: t("trade.allocationAmountRequired") });
        return;
      }
      const needTarget = allocs.find(a => a.allocation_type === "cross_save" && !a.target_asset_id);
      if (needTarget) {
        setResult({ ok: false, msg: t("trade.targetRequired") });
        return;
      }
    }
    try {
      setSubmitting(true);
      const submitForm = isInvest ? { ...form, quantity: 1 } : form;
      await api.createTransaction({
        ...submitForm,
        batch_items: isSell && batchItems.length > 0 ? batchItems : undefined,
        allocations: isSell && allocs.length > 0 ? allocs : undefined,
      });
      // 提交成功后跳转到对应资产详情页
      router.push(`/assets/${form.asset_id}`);
    } catch (e: unknown) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
      setSubmitting(false);
    }
  };

  // 预估利润（卖出时）— 有批次分配时按每个批次成本加权，否则用整体心理成本
  const estProfit = (() => {
    if (!selectedAsset || !isSell || form.price <= 0 || form.quantity <= 0) return 0;
    if (batchItems.length > 0) {
      let profit = 0;
      for (const bi of batchItems) {
        const batch = buyBatches.find(b => b.id === bi.buy_tx_id);
        if (batch && bi.quantity > 0) {
          const batchCost = batch.price + batch.fee / batch.quantity;
          profit += (form.price - batchCost) * bi.quantity;
        }
      }
      return profit - form.fee;
    }
    return (form.price - selectedAsset.mental_cost) * form.quantity - form.fee;
  })();

  return (
    <div className="page-shell page-shell--reading">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">{t("trade.eyebrow")}</p>
          <h1 className="page-title">{t("trade.title")}</h1>
          <p className="page-description">{t("trade.description")}</p>
        </div>
      </header>

      {/* 反馈条 */}
      {result && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${result.ok
          ? "border-ok bg-ok-soft"
          : "border-risk bg-risk-soft"}`}>
          {result.msg}
          <button onClick={() => setResult(null)} className="ml-4 underline">{t("trade.close")}</button>
        </div>
      )}

      {assetsLoading ? <p role="status" className="py-12 text-center text-secondary">{t("common.loading")}</p>
        : assetsError ? <div role="alert" className="ui-surface space-y-4 p-6"><p>{t("ux.loadFailed")}</p><button className="ui-button" onClick={() => { setAssetsLoading(true); setAssetRetry(v => v + 1); }}>{t("ux.retry")}</button></div>
          : assets.length === 0 ? <section className="ui-surface space-y-4 p-6 sm:p-8"><h2 className="text-lg font-semibold">{t("ux.noAssets")}</h2><p className="text-sm leading-relaxed text-secondary">{t("ux.noAssetsHint")}</p><div className="flex flex-wrap gap-3"><Link href="/assets" className="ui-button ui-button--primary">{t("ux.addAsset")}</Link><Link href="/import/ibkr" className="ui-button">{t("ux.import")}</Link></div></section>
            : <div className="space-y-5 rounded-[var(--radius-xl)] border border-themed bg-surface p-4 sm:p-6">
        {/* 选择资产 */}
        <div>
          <label htmlFor="trade-asset" className="text-xs text-muted">{t("trade.selectAsset")}</label>
          <select id="trade-asset" value={form.asset_id} onChange={(e) => {
            const aid = +e.target.value;
            const ast = assets.find(a => a.id === aid);
            setForm({ ...form, asset_id: aid, tx_type: ast?.zone === "invest" ? "buy" : form.tx_type });
          }}
            className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]">
            <option value={0}>— {t("trade.selectPlaceholder")} —</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.symbol} — {a.name} {a.zone === "invest" ? `(${t("trade.capital")} ${fmt(a.total_invested)})` : `(${fmt(a.quantity)} ${t("trade.shares")} @ ${fmt(a.mental_cost)})`}
              </option>
            ))}
          </select>
        </div>

        {/* 选中资产快照 */}
        {selectedAsset && (
          <div className={`rounded-lg border p-4 ${isInvest ? "bg-purple-900/20 border-purple-800/30" : "border-themed bg-surface-alt"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold">{selectedAsset.symbol}</span>
                <span className="text-sm text-secondary">{selectedAsset.name}</span>
                {isInvest && <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300">{t("trade.capabilityInvestment")}</span>}
              </div>
              <Link href={`/assets/${selectedAsset.id}`} className="text-xs text-accent hover:underline">
                {t("trade.viewDetails")}
              </Link>
            </div>
            {isInvest ? (
              <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted">{t("trade.totalInvested")}</span>
                  <p className="font-bold text-purple-400">${fmt(selectedAsset.total_invested)}</p>
                </div>
                <div>
                  <span className="text-muted">{t("trade.recovered")}</span>
                  <p className="font-bold text-brand">${fmt(selectedAsset.total_cashed)}</p>
                </div>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <span className="text-muted">{t("trade.position")}</span>
                  <p className="font-bold">{fmt(selectedAsset.quantity)}</p>
                </div>
                <div>
                  <span className="text-muted">{t("trade.mentalCost")}</span>
                  <p className="font-bold text-brand">{fmt(selectedAsset.mental_cost)}</p>
                </div>
                <div>
                  <span className="text-muted">{t("trade.currentPrice")}</span>
                  <p className="font-bold">{fmt(selectedAsset.current_price)}</p>
                </div>
                <div>
                  <span className="text-muted">{t("trade.marketValue")}</span>
                  <p className="font-bold">{selectedAsset.current_price > 0 ? `${fmt(selectedAsset.current_price * selectedAsset.quantity)}` : "--"}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 交易类型 — invest区不显示切换 */}
        {!isInvest && (
          <div className="flex gap-3">
            {(["buy", "sell"] as TransactionType[]).map((type) => (
              <button key={type} onClick={() => setForm({ ...form, tx_type: type })}
                className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${form.tx_type === type
                  ? (type === "buy" ? "bg-up text-white" : "bg-down text-white")
                  : "border border-themed text-secondary hover:text-primary hover:border-[var(--border-hover)]"}`}>
                {t(type === "buy" ? "review.buy" : "review.sell")}
              </button>
            ))}
          </div>
        )}

        {/* 卖出时：批次分配 (invest区不显示) */}
        {!isInvest && isSell && selectedAsset && (
            <div className="space-y-3 rounded-lg border border-themed bg-surface-alt p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-secondary">{t("trade.chooseBatches")} <span className="text-muted font-normal">({t("trade.optional")})</span></p>
              {buyBatches.length > 0 && (
                <button onClick={() => {
                  // 添加一个未选择的空分配
                  setBatchItems([...batchItems, { buy_tx_id: 0, quantity: 0 }]);
                }} className="text-xs text-accent hover:underline">+ {t("trade.addBatch")}</button>
              )}
            </div>

            {loadingBatches ? (
              <div className="text-sm text-muted animate-pulse">{t("trade.loadingBatches")}</div>
            ) : buyBatches.length === 0 ? (
              <div className="text-xs text-muted">{t("trade.noBatches")}</div>
            ) : batchItems.length === 0 ? (
              <p className="text-xs text-muted">{t("trade.weightedCostHint")}</p>
            ) : (
              <>
                {batchItems.map((bi, i) => {
                  const batch = buyBatches.find(b => b.id === bi.buy_tx_id);
                  const remaining = batch ? batch.quantity - batch.sold_quantity : 0;
                  // 可选的批次 = 尚未被其他行选择的 + 当前行已选的
                  const usedIds = batchItems.filter((_, idx) => idx !== i).map(x => x.buy_tx_id);
                  const available = buyBatches.filter(b => !usedIds.includes(b.id));
                  return (
                    <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <label className="text-xs text-muted">{t("trade.buyBatch")}</label>
                        <select value={bi.buy_tx_id || ""} onChange={(e) => {
                          const newId = +e.target.value;
                          const newBatch = buyBatches.find(b => b.id === newId);
                          const newItems = [...batchItems];
                          newItems[i] = { buy_tx_id: newId, quantity: newBatch ? newBatch.quantity - newBatch.sold_quantity : 0 };
                          setBatchItems(newItems);
                        }} className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]">
                          <option value="">{t("trade.selectBatch")}</option>
                          {available.map(b => {
                            const rem = b.quantity - b.sold_quantity;
                            return (
                              <option key={b.id} value={b.id}>
                                #{b.id} | {fmt(b.price)} × {fmt(b.quantity)} | {t("trade.remaining")} {fmt(rem)} | {new Date(b.created_at).toLocaleDateString(localeTag)}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div className="flex items-end gap-2 sm:gap-3">
                        <div className="w-28">
                          <label className="text-xs text-muted">{t("trade.sellQuantity")}</label>
                          <BatchQtyInput value={bi.quantity} max={remaining} onChange={(v) => {
                            const newItems = [...batchItems];
                            newItems[i] = { ...bi, quantity: v };
                            setBatchItems(newItems);
                          }} />
                        </div>
                        {batch && (
                          <span className="mb-2 text-[10px] text-muted whitespace-nowrap">{t("trade.available", { quantity: fmt(remaining) })}</span>
                        )}
                        <button onClick={() => setBatchItems(batchItems.filter((_, idx) => idx !== i))}
                          className="mb-2 text-xs text-red-400 hover:underline whitespace-nowrap">{t("trade.remove")}</button>
                      </div>
                    </div>
                  );
                })}
                {(() => {
                  const totalBatchQty = batchItems.reduce((s, bi) => s + bi.quantity, 0);
                  if (totalBatchQty <= 0) return null;
                  if (form.quantity <= 0) {
                    return <p className="text-xs text-muted">{t("trade.allocated", { quantity: fmt(totalBatchQty) })}</p>;
                  }
                  const diff = form.quantity - totalBatchQty;
                  return Math.abs(diff) > 0.0001 ? (
                    <p className={`text-xs ${diff > 0 ? "text-yellow-400" : "text-red-400"}`}>
                      {t(diff > 0 ? "trade.allocateMore" : "trade.overAllocated", { quantity: fmt(Math.abs(diff)) })}
                    </p>
                  ) : (
                    <p className="text-xs text-accent">{t("trade.allocationComplete")}</p>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* 价格 / 数量 / 手续费 */}
        {isInvest ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <NumInput label={t("trade.investmentAmount")} value={form.price} onChange={(v) => setForm({ ...form, price: v, quantity: 1 })} />
            <NumInput label={t("trade.fee")} value={form.fee} onChange={(v) => setForm({ ...form, fee: v })} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <NumInput label={t("trade.executionPrice")} value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
            <NumInput label={t("trade.quantity")} value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} />
            <NumInput label={t("trade.fee")} value={form.fee} onChange={(v) => setForm({ ...form, fee: v })} />
          </div>
        )}

        {/* 卖出预估利润 (invest区不显示) */}
        {!isInvest && isSell && selectedAsset && form.price > 0 && form.quantity > 0 && estProfit !== 0 && (
          <div className={`rounded-lg p-3 text-center text-sm font-bold ${estProfit >= 0
            ? "bg-up-soft" : "bg-down-soft"}`}>
            {t("trade.estimatedProfit")}: {estProfit >= 0 ? "+" : ""}{fmt(estProfit)}
          </div>
        )}

        {/* 备注 */}
        <div>
          <label className="text-xs text-muted">{t("cash.note")}</label>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary placeholder-themed outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            placeholder={t("trade.optional")} />
        </div>

        {/* 卖出时：利润分配 (invest区不显示) */}
        {!isInvest && isSell && selectedAsset && (
          <div className="space-y-3 rounded-lg border border-yellow-800 bg-yellow-900/20 p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-yellow-300">{t("trade.profitAllocation")}</p>
              <div className="flex items-center gap-3">
                {estProfit > 0 && allocs.length > 0 && (
                  <button onClick={() => updateAlloc(0, { amount: estProfit })}
                    className="text-xs text-yellow-300 hover:underline">
                    {t("trade.allProfit", { amount: fmt(estProfit) })}
                  </button>
                )}
                <button onClick={addAlloc} className="text-xs text-accent hover:underline">+ {t("trade.addAllocation")}</button>
              </div>
            </div>

            {allocs.map((a, i) => (
              <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                <div className="flex-1">
                  <label className="text-xs text-muted">{t("trade.destination")}</label>
                  <select value={a.allocation_type}
                    onChange={(e) => updateAlloc(i, { allocation_type: e.target.value as AllocationType })}
                    className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)]">
                    <option value="self_offset">{t("trade.selfOffset")}</option>
                    <option value="cross_save">{t("trade.crossSave")}</option>
                    <option value="to_harbor">{t("trade.toHarbor")}</option>
                  </select>
                </div>

                {a.allocation_type === "cross_save" && (
                  <div className="flex-1">
                    <label className="text-xs text-muted">{t("trade.targetAsset")}</label>
                    <select value={a.target_asset_id ?? ""}
                      onChange={(e) => updateAlloc(i, { target_asset_id: +e.target.value || null })}
                      className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)]">
                      <option value="">{t("trade.choose")}</option>
                      {assets.filter((x) => x.id !== form.asset_id).map((x) => (
                        <option key={x.id} value={x.id}>{x.symbol} — {x.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <div className="w-28">
                    <AllocAmountInput label={t("trade.amount")} value={a.amount} onChange={(v) => updateAlloc(i, { amount: v })} />
                  </div>

                  <button onClick={() => removeAlloc(i)} className="mb-2 text-xs text-red-400 hover:underline whitespace-nowrap">{t("trade.remove")}</button>
                </div>
              </div>
            ))}

            {allocs.length === 0 && (
              <p className="text-xs text-muted">{t("trade.noAllocationHint")}</p>
            )}
          </div>
        )}

        <button onClick={submit} disabled={submitting || !form.asset_id || form.price <= 0 || (!isInvest && form.quantity <= 0)}
          className={`w-full rounded-lg py-3 font-semibold text-on-accent transition shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none ${isInvest ? "bg-purple-600 hover:bg-purple-500 shadow-purple-600/20" : "bg-accent bg-accent-hover shadow-[var(--accent)]/20"}`}>
          {submitting ? t("ux.saving") : isInvest ? t("trade.confirmInvestment") : t("trade.submit")}
        </button>
      </div>}
    </div>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = useId();
  const [raw, setRaw] = useState(value ? String(value) : "");

  // 外部value变化时同步（如提交后重置）
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setRaw(value ? String(value) : ""));
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return (
    <div>
      <label htmlFor={id} className="text-xs text-muted">{label}</label>
      <input id={id} type="number" step="any" value={raw}
        onChange={(e) => {
          const v = e.target.value;
          setRaw(v);
          const num = parseFloat(v);
          if (!isNaN(num)) onChange(num);
          else if (v === "" || v === "-") onChange(0);
        }}
        placeholder="0"
        className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary placeholder-themed outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
    </div>
  );
}

function AllocAmountInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = useId();
  const [raw, setRaw] = useState(value ? String(value) : "");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setRaw(value ? String(value) : ""));
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return (
    <>
      <label htmlFor={id} className="text-xs text-muted">{label}</label>
      <input id={id} type="text" inputMode="decimal" value={raw}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" || /^-?\d*\.?\d*$/.test(v)) {
            setRaw(v);
            const num = parseFloat(v);
            if (!isNaN(num)) onChange(num);
            else if (v === "" || v === "-") onChange(0);
          }
        }}
        className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary placeholder-themed outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]" />
    </>
  );
}

function BatchQtyInput({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  const [raw, setRaw] = useState(value ? String(value) : "");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setRaw(value ? String(value) : ""));
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return (
    <input type="number" step="any" value={raw}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || /^\d*\.?\d*$/.test(v)) {
          setRaw(v);
          const num = parseFloat(v);
          if (!isNaN(num)) onChange(Math.min(num, max));
          else if (v === "") onChange(0);
        }
      }}
      placeholder="0"
      className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary placeholder-themed outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
  );
}
