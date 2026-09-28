import Link from "next/link";
import {
  blankAnswer,
  questions,
  safeSourceUrl,
  type GuideDraft,
} from "@/lib/researchGuide";
import s from "./guide.module.css";

export default function GuidePreview({
  draft,
  busy,
  dirty,
  confirmed,
  onConfirm,
  onPublish,
  onEdit,
}: {
  draft: GuideDraft;
  busy: boolean;
  dirty: boolean;
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  onPublish: () => void;
  onEdit: (step: number) => void;
}) {
  const saved =
    !dirty && draft.published_version === draft.version && draft.note_id;
  return (
    <section className={s.previewCard}>
      <header>
        <h2>我的判断卡</h2>
        <p className={s.muted}>
          保留当前理解与未知。确认后存入私有资料库，不覆盖旧版本。
        </p>
      </header>
      {questions.map((q, index) => {
        const answer = draft.answers[q.key] || blankAnswer();
        return (
          <section className={s.previewSection} key={q.key}>
            <div className={s.previewTitle}>
              <h3>{q.title}</h3>
              <button
                className={s.textButton}
                disabled={busy}
                onClick={() => onEdit(index)}
                aria-label={`返回修改：${q.title}`}
              >
                修改
              </button>
            </div>
            <p className={answer.text ? s.preview : s.muted}>
              {answer.text || "尚未研究 / 暂不确定"}
            </p>
            {answer.status === "unknown" && (
              <span className={s.status}>待验证</span>
            )}
            {answer.uncertainty && (
              <p className={`${s.preview} ${s.unknownText}`}>
                待验证：{answer.uncertainty}
              </p>
            )}
            {answer.evidence.length > 0 && (
              <details className={s.disclosure}>
                <summary>
                  查看证据 <span>{answer.evidence.length} 条</span>
                </summary>
                {answer.evidence.map((e, i) => (
                  <div className={s.source} key={i}>
                    <strong>{e.title}</strong>
                    <p className={s.status}>{e.period || "未注明期间"}</p>
                    <p className={s.preview}>{e.excerpt}</p>
                    {safeSourceUrl(e.url) && (
                      <a
                        href={safeSourceUrl(e.url)!}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        打开来源 ↗
                      </a>
                    )}
                  </div>
                ))}
              </details>
            )}
          </section>
        );
      })}
      <label className={s.confirm}>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || !!saved}
          onChange={(e) => onConfirm(e.target.checked)}
        />
        <span>我已检查，这是我的个人判断；未核实的内容仍需验证。</span>
      </label>
      <div className={s.footer}>
        {saved ? (
          <Link
            className={`${s.button} ${s.primary}`}
            href={`/research/${draft.note_id}`}
          >
            查看已保存的判断卡 →
          </Link>
        ) : (
          <button
            className={`${s.button} ${s.primary}`}
            disabled={!confirmed || busy}
            onClick={onPublish}
          >
            确认并保存私有判断卡
          </button>
        )}
      </div>
    </section>
  );
}
