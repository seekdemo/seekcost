"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { api } from "@/lib/api";
import type { WatchlistResearchProfile } from "@/lib/types";
import {
  blankAnswer,
  questions,
  safeSourceUrl,
  type GuideDraft,
  type GuideAnswer,
  type GuideKey,
} from "@/lib/researchGuide";
import GuideQuestion from "./GuideQuestion";
import GuidePreview from "./GuidePreview";
import s from "./guide.module.css";

const fingerprint = (draft: GuideDraft) =>
  JSON.stringify({
    step: draft.step,
    mode: draft.mode,
    answers: draft.answers,
  });

function Room({ stockId }: { stockId: number }) {
  const [draft, setDraft] = useState<GuideDraft | null>(null);
  const [profile, setProfile] = useState<WatchlistResearchProfile | null>(null);
  const [baseline, setBaseline] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [retry, setRetry] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const heading = useRef<HTMLDivElement>(null);
  const dirty = !!draft && fingerprint(draft) !== baseline;
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getResearchGuide(stockId),
      api.getWatchlistResearchProfile(stockId),
    ])
      .then(([next, company]) => {
        if (!cancelled) {
          setDraft(next);
          setBaseline(fingerprint(next));
          setProfile(company);
          setError("");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [stockId, retry]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const click = (event: MouseEvent) => {
      const a = (event.target as Element).closest("a");
      if (
        a &&
        a.target !== "_blank" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.defaultPrevented
      ) {
        if (!window.confirm("还有未保存的研究内容，确定离开吗？")) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
  function change(key: GuideKey, patch: Partial<GuideAnswer>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            answers: {
              ...current.answers,
              [key]: { ...(current.answers[key] || blankAnswer()), ...patch },
            },
          }
        : null,
    );
    setConfirmed(false);
  }
  async function save(next: GuideDraft): Promise<GuideDraft | null> {
    for (const a of Object.values(next.answers)) {
      for (const e of a?.evidence || []) {
        if (!e.title.trim() || (e.url && !safeSourceUrl(e.url))) {
          setError(
            "请补全证据名称，并使用完整的 HTTP(S) 链接；不需要的空证据可以移除。",
          );
          return null;
        }
      }
    }
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await api.saveResearchGuide(stockId, {
        version: next.version,
        step: next.step,
        mode: next.mode,
        answers: next.answers,
      });
      setDraft(saved);
      setBaseline(fingerprint(saved));
      return saved;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "保存失败，当前文字仍保留，请重试",
      );
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function navigate(step: number) {
    if (!draft) return;
    const next = { ...draft, step };
    const saved = await save(next);
    if (saved) {
      setConfirmed(false);
      if (step < 6)
        setExpanded((current) => ({ ...current, [questions[step].key]: true }));
      requestAnimationFrame(() => {
        const target =
          step < 6
            ? document.getElementById(`guide-question-${questions[step].key}`)
            : heading.current;
        target?.focus();
        target?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    }
  }
  async function publish() {
    if (!draft || !confirmed || lock.current) return;
    let saved = draft;
    if (dirty || draft.version === 0) {
      const result = await save(draft);
      if (!result) return;
      saved = result;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api.publishResearchGuide(stockId, saved.version);
      setDraft(result);
      setBaseline(fingerprint(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : "判断卡保存失败，请重试");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function download() {
    if (!draft) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-${stockId}-draft.json`;
    a.target = "_blank";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!draft || !profile)
    return (
      <div className={s.shell}>
        <Link href="/research/guide">← 公司研究室</Link>
        {error ? (
          <div role="alert" className={`${s.error} mt-8`}>
            {error}
            <button
              className={s.button}
              onClick={() => {
                setError("");
                setRetry((v) => v + 1);
              }}
            >
              重新加载
            </button>
          </div>
        ) : (
          <p className="mt-8" role="status">
            正在打开你的研究记录…
          </p>
        )}
      </div>
    );
  const evidence = profile.research_sections.flatMap(
    (section) => section.evidence,
  );
  const preview = draft.step === 6;
  const status = busy
    ? "正在保存…"
    : dirty
      ? "有未保存的修改"
      : draft.version
        ? "已保存到账号"
        : "尚未保存";
  function editor(index: number) {
    const q = questions[index];
    return (
      <GuideQuestion
        key={q.key}
        question={q}
        answer={draft!.answers[q.key] || blankAnswer()}
        existing={evidence}
        mode={draft!.mode}
        busy={busy}
        onChange={(patch) => change(q.key, patch)}
      />
    );
  }
  return (
    <div className={s.shell}>
      <div className={s.breadcrumb}>
        <Link href="/research/guide">← 公司研究</Link>
        <Link href={"/watchlist/" + stockId}>公司档案 ↗</Link>
      </div>
      <header className={s.roomHeader}>
        <div className={s.companyTitle}>
          <h1>{profile.stock.name}</h1>
          <span>{profile.stock.symbol}</span>
        </div>
        <div className={s.modes} aria-label="研究方式">
          <button
            disabled={busy}
            aria-pressed={draft.mode === "guided"}
            onClick={() => {
              setDraft({ ...draft, mode: "guided" });
              setConfirmed(false);
            }}
          >
            引导研究
          </button>
          <button
            disabled={busy}
            aria-pressed={draft.mode === "independent"}
            onClick={() => {
              setDraft({ ...draft, mode: "independent" });
              setConfirmed(false);
            }}
          >
            自主研究
          </button>
        </div>
      </header>
      {error && (
        <div className={s.error} role="alert">
          {error}
          <button className={s.textButton} onClick={download}>
            下载草稿，保留当前文字
          </button>
        </div>
      )}
      <div className={s.mobilePicker}>
        <label htmlFor="guide-step">研究问题</label>
        <select
          id="guide-step"
          value={draft.step}
          disabled={busy}
          onChange={(event) => void navigate(Number(event.target.value))}
        >
          {questions.map((q, index) => (
            <option key={q.key} value={index}>
              {index + 1} / 6 · {q.title}
            </option>
          ))}
          <option value={6}>我的判断卡</option>
        </select>
      </div>
      <div className={s.room}>
        <nav className={s.steps} aria-label="研究问题">
          <p className={s.navLabel}>研究目录</p>
          {questions.map((q, index) => (
            <button
              key={q.key}
              disabled={busy}
              aria-current={
                !preview && draft.step === index ? "step" : undefined
              }
              onClick={() => void navigate(index)}
            >
              <span className={s.stepNumber}>{index + 1}</span>
              {q.title}
              <span
                className={s.stepDot}
                aria-label={draft.answers[q.key]?.text ? "已有记录" : "未记录"}
              >
                {draft.answers[q.key]?.text ? "·" : ""}
              </span>
            </button>
          ))}
          <button
            disabled={busy}
            aria-current={preview ? "step" : undefined}
            onClick={() => void navigate(6)}
          >
            我的判断卡 ↗
          </button>
        </nav>
        <div className={s.workspace}>
          <div className="sr-only" ref={heading} tabIndex={-1}>
            {preview ? "检查并确认判断卡" : "研究编辑区"}
          </div>
          {preview ? (
            <GuidePreview
              draft={draft}
              busy={busy}
              dirty={dirty}
              confirmed={confirmed}
              onConfirm={setConfirmed}
              onPublish={() => void publish()}
              onEdit={(step) => void navigate(step)}
            />
          ) : (
            <>
              {draft.mode === "guided" ? (
                editor(draft.step)
              ) : (
                <div className={s.chapters}>
                  <p className={s.sectionIntro}>按需展开，不必依次填写。</p>
                  {questions.map((q, index) => (
                    <details
                      className={s.chapter}
                      key={q.key}
                      open={expanded[q.key] ?? draft.step === index}
                      onToggle={(event) => {
                        const open = event.currentTarget.open;
                        setExpanded((current) =>
                          current[q.key] === open
                            ? current
                            : { ...current, [q.key]: open },
                        );
                      }}
                    >
                      <summary>
                        <span className={s.stepNumber}>{index + 1}</span>
                        <strong>{q.title}</strong>
                        <span className={s.chapterState}>
                          {draft.answers[q.key]?.text ? "已有记录" : "待研究"}
                        </span>
                      </summary>
                      {editor(index)}
                    </details>
                  ))}
                </div>
              )}
              <div className={s.footer}>
                <div className={s.saveGroup}>
                  <span role="status" className={s.status}>
                    {status}
                  </span>
                  <button
                    className={s.button}
                    disabled={busy || (!dirty && draft.version > 0)}
                    onClick={() => void save(draft)}
                  >
                    保存进度
                  </button>
                </div>
                <button
                  className={s.button + " " + s.primary}
                  disabled={busy}
                  onClick={() =>
                    void navigate(
                      draft.mode === "independent" ? 6 : draft.step + 1,
                    )
                  }
                >
                  {draft.mode === "independent" || draft.step === 5
                    ? "检查我的判断卡"
                    : "保存并继续 →"}
                </button>
              </div>
            </>
          )}
          <p className={s.footnote}>仅个人研究，非投资建议。资料需自行核实。</p>
        </div>
      </div>
    </div>
  );
}
export default function GuideRoom({ stockId }: { stockId: number }) {
  return (
    <AuthGuard>
      <Room stockId={stockId} />
    </AuthGuard>
  );
}
