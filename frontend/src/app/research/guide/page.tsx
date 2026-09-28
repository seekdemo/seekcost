"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { api } from "@/lib/api";
import type { WatchlistStock } from "@/lib/types";
import type { GuideDraft } from "@/lib/researchGuide";
import s from "./guide.module.css";

function Picker() {
  const [stocks, setStocks] = useState<WatchlistStock[]>([]);
  const [drafts, setDrafts] = useState<GuideDraft[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listWatchStocks(), api.listResearchGuides()])
      .then(([items, guides]) => {
        if (!cancelled) {
          setStocks(items as unknown as WatchlistStock[]);
          setDrafts(guides);
          setError("");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);
  const shown = stocks
    .filter((stock) =>
      `${stock.symbol} ${stock.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(drafts.some((d) => d.stock_id === b.id)) -
        Number(drafts.some((d) => d.stock_id === a.id)),
    );
  return (
    <div className={s.shell}>
      <Link href="/research" className={s.muted}>
        ← 研究资料库
      </Link>
      <header className={s.hero}>
        <h1>公司研究</h1>
        <p className={s.muted}>选一家公司，继续理解它的生意与基本面。</p>
      </header>
      <div className={s.toolbar}>
        <p className={s.muted}>{stocks.length} 家公司 · 已有研究优先</p>
        <label>
          <span className="sr-only">搜索公司</span>
          <input
            className={s.input}
            placeholder="搜索代码或公司名称"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {loading ? (
        <p role="status">正在加载你的研究清单…</p>
      ) : error ? (
        <div className={s.error} role="alert">
          {error}
          <button
            className={s.button}
            onClick={() => {
              setLoading(true);
              setRetry((v) => v + 1);
            }}
          >
            重试
          </button>
        </div>
      ) : !stocks.length ? (
        <div>
          <h2>从一家你感兴趣的公司开始</h2>
          <p className={s.muted}>先将公司加入股票池，再回来研究它如何赚钱。</p>
          <Link className={s.button} href="/watchlist">
            前往股票池
          </Link>
        </div>
      ) : (
        <div className={s.grid}>
          {shown.map((stock) => {
            const draft = drafts.find((d) => d.stock_id === stock.id);
            return (
              <Link
                className={s.card}
                href={`/research/guide/${stock.id}`}
                key={stock.id}
              >
                <span className={s.stockSymbol}>{stock.symbol}</span>
                <div className={s.stockTitle}>
                  <h2>{stock.name}</h2>
                  <p>
                    {draft
                      ? `${Object.values(draft.answers).filter((a) => a?.text || a?.uncertainty).length} 个问题有记录`
                      : stock.sector || "尚未开始"}
                  </p>
                </div>
                <span className={s.stockAction}>
                  {draft ? "继续" : "开始"} →
                </span>
              </Link>
            );
          })}
        </div>
      )}
      {!loading && !error && stocks.length > 0 && !shown.length && (
        <p className={s.muted}>未找到匹配公司，试试其他名称或代码。</p>
      )}
      <p className={s.footnote}>支持引导与自主两种方式，研究记录仅自己可见。</p>
    </div>
  );
}
export default function GuidePicker() {
  return (
    <AuthGuard>
      <Picker />
    </AuthGuard>
  );
}
