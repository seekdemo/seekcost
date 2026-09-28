import {
  thinkingPrompt,
  type GuideAnswer,
  type questions,
} from "@/lib/researchGuide";
import type { ResearchEvidenceItem } from "@/lib/types";
import GuideEvidence from "./GuideEvidence";
import s from "./guide.module.css";

export default function GuideQuestion({
  question: q,
  answer,
  existing,
  busy,
  mode,
  onChange,
}: {
  question: (typeof questions)[number];
  answer: GuideAnswer;
  existing: ResearchEvidenceItem[];
  busy: boolean;
  mode: "guided" | "independent";
  onChange: (patch: Partial<GuideAnswer>) => void;
}) {
  return (
    <fieldset
      disabled={busy}
      className={s.question}
      id={`guide-question-${q.key}`}
      tabIndex={-1}
    >
      <legend className="sr-only">{q.title}</legend>
      <div className={s.questionHeading}>
        <h2>{q.question}</h2>
        <p className={s.muted}>{q.hint}</p>
      </div>
      <label className={s.label} htmlFor={`${q.key}-answer`}>
        我的理解
      </label>
      <textarea
        id={`${q.key}-answer`}
        className={s.input}
        rows={5}
        maxLength={6000}
        value={answer.text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="写下你的理解，也可以先记录一个问题。"
      />
      <div className={s.answerMeta}>
        <label htmlFor={`${q.key}-status`} className="sr-only">
          当前状态
        </label>
        <select
          id={`${q.key}-status`}
          className={s.statusSelect}
          value={answer.status}
          onChange={(e) =>
            onChange({ status: e.target.value as GuideAnswer["status"] })
          }
        >
          <option value="thinking">还在思考</option>
          <option value="answered">已记录想法</option>
          <option value="unknown">暂不确定</option>
        </select>
        <span className={s.status}>不需要急着得出结论</span>
      </div>
      <details className={s.disclosure}>
        <summary>
          疑问与反证 <span>{answer.uncertainty ? "已记录" : "选填"}</span>
        </summary>
        <label className={s.label} htmlFor={`${q.key}-unknown`}>
          {q.key === "judgment"
            ? "什么会让我改变想法？下次核实什么？"
            : "反面理由 / 还需要核实什么？"}
        </label>
        <textarea
          id={`${q.key}-unknown`}
          className={s.input}
          rows={3}
          maxLength={3000}
          value={answer.uncertainty}
          onChange={(e) => onChange({ uncertainty: e.target.value })}
          placeholder="哪些地方还不确定？什么证据会改变你的想法？"
        />
      </details>
      <GuideEvidence
        id={q.key}
        items={answer.evidence}
        existing={existing}
        hint={q.evidenceHint}
        onChange={(evidence) => onChange({ evidence })}
      />
      <details className={s.disclosure}>
        <summary>
          研究提示 <span>按需查看</span>
        </summary>
        <div className={s.hintContent}>
          <p>{q.explanation}</p>
          <p>
            {mode === "guided" ? thinkingPrompt(answer, q.counter) : q.counter}
          </p>
          <small>预设研究提示，不是 AI 结论或能力评分。</small>
        </div>
      </details>
    </fieldset>
  );
}
