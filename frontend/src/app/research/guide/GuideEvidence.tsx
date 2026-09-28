import type { GuideEvidence as Evidence } from "@/lib/researchGuide";
import { safeSourceUrl } from "@/lib/researchGuide";
import type { ResearchEvidenceItem } from "@/lib/types";
import s from "./guide.module.css";

export default function GuideEvidence({
  items,
  onChange,
  existing,
  hint,
  id,
}: {
  items: Evidence[];
  onChange: (items: Evidence[]) => void;
  existing: ResearchEvidenceItem[];
  hint: string;
  id: string;
}) {
  function edit(index: number, field: keyof Evidence, value: string) {
    onChange(
      items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    );
  }
  return (
    <details className={s.evidence}>
      <summary>证据与资料 · {items.length} 条已记录</summary>
      <p className={`${s.muted} mt-3`}>{hint}</p>
      <p className={s.status}>
        来源由你记录，平台不自动核实。没有资料时可以先保留问题，不需要编造数据。
      </p>
      {items.map((item, index) => (
        <div className={s.source} key={index}>
          <label className={s.label} htmlFor={`${id}-source-${index}`}>
            来源名称（必填）
          </label>
          <input
            id={`${id}-source-${index}`}
            className={s.input}
            value={item.title}
            maxLength={200}
            onChange={(e) => edit(index, "title", e.target.value)}
            placeholder="例如：2025 年年报，第 12 页"
          />
          <label className={s.label} htmlFor={`${id}-url-${index}`}>
            来源链接
          </label>
          <input
            id={`${id}-url-${index}`}
            className={s.input}
            type="url"
            value={item.url}
            maxLength={2000}
            onChange={(e) => edit(index, "url", e.target.value)}
            placeholder="https://…"
          />
          <label className={s.label} htmlFor={`${id}-period-${index}`}>
            财报期间 / 数据口径
          </label>
          <input
            id={`${id}-period-${index}`}
            className={s.input}
            value={item.period}
            maxLength={100}
            onChange={(e) => edit(index, "period", e.target.value)}
            placeholder="例如：2025 财年，百万美元，GAAP"
          />
          <label className={s.label} htmlFor={`${id}-excerpt-${index}`}>
            相关摘录或数据
          </label>
          <textarea
            id={`${id}-excerpt-${index}`}
            className={s.input}
            rows={3}
            value={item.excerpt}
            maxLength={3000}
            onChange={(e) => edit(index, "excerpt", e.target.value)}
            placeholder="记录支持或反对你判断的内容"
          />
          <div className={s.actions}>
            {safeSourceUrl(item.url) && (
              <a
                href={safeSourceUrl(item.url)!}
                target="_blank"
                rel="noopener noreferrer"
              >
                打开来源 ↗
              </a>
            )}
            <button
              type="button"
              className={s.button}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              移除此证据
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className={`${s.button} mt-4`}
        disabled={items.length >= 8}
        onClick={() =>
          onChange([...items, { title: "", url: "", period: "", excerpt: "" }])
        }
      >
        ＋ 添加证据
      </button>
      {existing.length > 0 && (
        <details className="mt-5">
          <summary>查看已有公司档案中的资料</summary>
          <p className={s.status}>
            以下是已有个人记录，不代表平台核实或最新财报。
          </p>
          {existing.slice(0, 12).map((item, index) => (
            <div className={s.source} key={index}>
              <strong>{item.label || item.source || "未命名资料"}</strong>
              <p className={s.muted}>
                {item.excerpt || String(item.value ?? "")}
              </p>
              {safeSourceUrl(item.url) && (
                <a
                  href={safeSourceUrl(item.url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  查看原链接 ↗
                </a>
              )}
              <button
                type="button"
                className={`${s.button} mt-3`}
                disabled={items.length >= 8}
                onClick={() =>
                  onChange([
                    ...items,
                    {
                      title: (
                        item.label ||
                        item.source ||
                        "已有档案资料"
                      ).slice(0, 200),
                      url: (safeSourceUrl(item.url) || "").slice(0, 2000),
                      period: (item.as_of || "").slice(0, 100),
                      excerpt: (item.excerpt || String(item.value ?? "")).slice(
                        0,
                        3000,
                      ),
                    },
                  ])
                }
              >
                引用到当前问题
              </button>
            </div>
          ))}
        </details>
      )}
    </details>
  );
}
